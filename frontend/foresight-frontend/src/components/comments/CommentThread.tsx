/**
 * Reddit-style comment thread used on signals (global) and inside
 * workstreams. Supports top-level posts + one level of replies, inline
 * edit (within the 15-min window the backend enforces) and soft-delete by
 * the author or a workstream manager.
 *
 * Backed by `/api/v1/comments*` (routers/comments.py). The router is gated
 * by `FORESIGHT_ENABLE_COLLABORATION`; when the flag is off we catch the
 * resulting 404 (CommentsDisabledError) and render a graceful empty state
 * instead of an error toast.
 *
 * @module components/comments/CommentThread
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Pencil, Trash2, CornerDownRight } from "lucide-react";

import { useAuthContext } from "../../hooks/useAuthContext";
import { getAuthToken } from "../../lib/auth";
import {
  COMMENT_REACTIONS,
  CommentsDisabledError,
  createComment,
  deleteComment,
  listComments,
  toggleCommentReaction,
  updateComment,
  type CommentItem,
  type CommentReactionEmoji,
  type CommentTargetType,
} from "../../lib/comments-api";
import { cn } from "../../lib/utils";

interface CommentThreadProps {
  targetType: CommentTargetType;
  targetId: string;
  workstreamId?: string;
  canComment: boolean;
  /** Visible label above the composer — varies by target type. */
  title?: string;
  /** Empty-state hint shown when there are no comments yet. */
  emptyHint?: string;
}

const REACTION_LABELS: Record<CommentReactionEmoji, string> = {
  thumbs_up: "Like",
  target: "Target",
  flag: "Flag",
  check: "Check",
  question: "Question",
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function CommentBody({ comment }: { comment: CommentItem }) {
  if (comment.deleted_at) {
    return (
      <p className="text-sm italic text-gray-400 dark:text-gray-500">
        Comment removed
      </p>
    );
  }
  if (comment.body_html) {
    return (
      <div
        className="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-200"
        // body_html is server-rendered from a strict markdown subset
        // (comment_service.render_markdown) — already html-escaped + a tiny
        // safe-tag allow-list.
        dangerouslySetInnerHTML={{ __html: comment.body_html }}
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
      {comment.body_markdown}
    </p>
  );
}

function ReactionRow({
  comment,
  onToggle,
}: {
  comment: CommentItem;
  onToggle: (emoji: CommentReactionEmoji) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {COMMENT_REACTIONS.map((emoji) => {
        const count = comment.reactions?.[emoji] ?? 0;
        const mine = comment.my_reactions?.includes(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs transition-colors",
              mine
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-dark-surface",
            )}
            title={REACTION_LABELS[emoji]}
          >
            {REACTION_LABELS[emoji]}
            {count > 0 && <span className="ml-1 font-semibold">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel = "Comment",
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => Promise<void> | void;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="min-h-[90px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue dark:border-gray-700 dark:bg-dark-surface dark:text-gray-100"
        placeholder={placeholder ?? "Share your perspective"}
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-surface"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || submitting}
          className="inline-flex items-center gap-2 rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-50"
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

interface CommentNodeProps {
  comment: CommentItem;
  replies: CommentItem[];
  canComment: boolean;
  currentUserId: string | null;
  isReply: boolean;
  onReply: (parentId: string, body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReact: (commentId: string, emoji: CommentReactionEmoji) => Promise<void>;
}

function CommentNode({
  comment,
  replies,
  canComment,
  currentUserId,
  isReply,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: CommentNodeProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body_markdown);

  const isAuthor = currentUserId != null && comment.author_id === currentUserId;
  const createdMs = new Date(comment.created_at).getTime();
  const canEdit =
    isAuthor && !comment.deleted_at && Date.now() - createdMs < EDIT_WINDOW_MS;
  const canDelete = isAuthor && !comment.deleted_at;

  return (
    <article
      className={cn(
        "rounded-lg border bg-white p-3 dark:bg-dark-surface",
        isReply
          ? "border-gray-100 dark:border-gray-800"
          : "border-gray-200 dark:border-gray-700",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {isReply && (
            <CornerDownRight
              className="h-3.5 w-3.5 text-gray-400"
              aria-hidden
            />
          )}
          <span className="font-medium text-gray-900 dark:text-white">
            {comment.author_display_name || "Foresight user"}
          </span>
          <time
            className="text-xs text-gray-500 dark:text-gray-400"
            dateTime={comment.created_at}
            title={new Date(comment.created_at).toLocaleString()}
          >
            {formatRelativeTime(comment.created_at)}
            {comment.edited_at && " · edited"}
          </time>
        </div>
        {(canEdit || canDelete) && !editing && (
          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setEditBody(comment.body_markdown);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-surface-elevated dark:hover:text-gray-200"
                aria-label="Edit comment"
                title="Edit (15-min window)"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                aria-label="Delete comment"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      {editing ? (
        <Composer
          value={editBody}
          onChange={setEditBody}
          onSubmit={async () => {
            await onEdit(comment.id, editBody.trim());
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          autoFocus
        />
      ) : (
        <CommentBody comment={comment} />
      )}

      {!editing && !comment.deleted_at && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <ReactionRow
            comment={comment}
            onToggle={(emoji) => onReact(comment.id, emoji)}
          />
          {canComment && !isReply && (
            <button
              type="button"
              onClick={() => setReplyOpen((v) => !v)}
              className="text-xs font-medium text-brand-blue hover:underline"
            >
              {replyOpen ? "Cancel reply" : "Reply"}
            </button>
          )}
        </div>
      )}

      {replyOpen && (
        <div className="mt-3">
          <Composer
            value={replyBody}
            onChange={setReplyBody}
            onSubmit={async () => {
              await onReply(comment.id, replyBody.trim());
              setReplyBody("");
              setReplyOpen(false);
            }}
            onCancel={() => {
              setReplyOpen(false);
              setReplyBody("");
            }}
            placeholder="Write a reply"
            submitLabel="Reply"
            autoFocus
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l-2 border-gray-100 pl-3 dark:border-gray-800">
          {replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              replies={[]}
              canComment={canComment}
              currentUserId={currentUserId}
              isReply
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
            />
          ))}
        </div>
      )}
    </article>
  );
}

export function CommentThread({
  targetType,
  targetId,
  workstreamId,
  canComment,
  title = "Discussion",
  emptyHint = "Be the first to share your perspective on this signal.",
}: CommentThreadProps) {
  const { user } = useAuthContext();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        // Unauthenticated callers can't fetch comments — bail out without
        // leaving the spinner spinning forever. Falls through to the empty
        // state, matching what the UI shows for a real empty thread.
        setComments([]);
        setError(null);
        return;
      }
      const next = await listComments(
        token,
        targetType,
        targetId,
        workstreamId,
      );
      setComments(next);
      setError(null);
      setDisabled(false);
    } catch (err) {
      if (err instanceof CommentsDisabledError) {
        setDisabled(true);
        setComments([]);
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : "Unable to load comments",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType, workstreamId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleNewComment = async () => {
    const token = await getAuthToken();
    if (!token || !body.trim()) return;
    try {
      setError(null);
      await createComment(token, {
        target_type: targetType,
        target_id: targetId,
        workstream_id: workstreamId,
        body_markdown: body.trim(),
      });
      setBody("");
      await load();
    } catch (err) {
      if (err instanceof CommentsDisabledError) {
        setDisabled(true);
      } else {
        setError(err instanceof Error ? err.message : "Unable to post comment");
      }
    }
  };

  const handleReply = async (parentId: string, replyBody: string) => {
    const token = await getAuthToken();
    if (!token || !replyBody) return;
    try {
      await createComment(token, {
        target_type: targetType,
        target_id: targetId,
        workstream_id: workstreamId,
        body_markdown: replyBody,
        parent_id: parentId,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post reply");
    }
  };

  const handleEdit = async (commentId: string, nextBody: string) => {
    if (!nextBody) return;
    const token = await getAuthToken();
    if (!token) return;
    try {
      await updateComment(token, commentId, { body_markdown: nextBody });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to edit comment");
    }
  };

  const handleDelete = async (commentId: string) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      await deleteComment(token, commentId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete comment");
    }
  };

  const handleReact = async (
    commentId: string,
    emoji: CommentReactionEmoji,
  ) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      await toggleCommentReaction(token, commentId, emoji);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update reaction",
      );
    }
  };

  // Group into top-level + replies. Deeper chains (reply-to-reply) collapse
  // to the closest visible ancestor so the UI never goes deeper than two
  // levels — keeps the thread legible on mobile while preserving order.
  const { topLevel, repliesByParent } = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.id, c] as const));
    const findVisibleAncestor = (
      id: string | null | undefined,
    ): string | null => {
      let cursor = id ?? null;
      const seen = new Set<string>();
      while (cursor && byId.has(cursor)) {
        if (seen.has(cursor)) return null;
        seen.add(cursor);
        const node = byId.get(cursor)!;
        if (!node.parent_id) return node.id;
        cursor = node.parent_id;
      }
      return null;
    };

    const top: CommentItem[] = [];
    const replies = new Map<string, CommentItem[]>();
    for (const comment of comments) {
      if (!comment.parent_id) {
        top.push(comment);
      } else {
        const anchor = findVisibleAncestor(comment.parent_id);
        if (anchor) {
          const bucket = replies.get(anchor) ?? [];
          bucket.push(comment);
          replies.set(anchor, bucket);
        }
      }
    }
    // Newest top-level first (reddit-style "new"); replies stay in
    // chronological order so a back-and-forth reads naturally.
    top.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    for (const bucket of replies.values()) {
      bucket.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    return { topLevel: top, repliesByParent: replies };
  }, [comments]);

  if (disabled) {
    return (
      <section className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center dark:border-gray-700 dark:bg-dark-surface">
        <MessageSquare className="mx-auto h-6 w-6 text-gray-400 dark:text-gray-500" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Discussion is disabled
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          An admin can enable threaded discussion by setting{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-dark-surface-elevated">
            FORESIGHT_ENABLE_COLLABORATION=true
          </code>{" "}
          on the API service.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <MessageSquare className="h-4 w-4" />
          {title}
          {comments.length > 0 && (
            <span className="text-gray-400 dark:text-gray-500">
              · {comments.length}
            </span>
          )}
        </div>
      </header>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}

      {canComment && (
        <Composer
          value={body}
          onChange={setBody}
          onSubmit={handleNewComment}
          placeholder="Share your perspective on this signal"
        />
      )}

      {loading && comments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading discussion…
        </p>
      ) : comments.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-dark-surface-deep dark:text-gray-400">
          {emptyHint}
        </p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) ?? []}
              canComment={canComment}
              currentUserId={user?.id ?? null}
              isReply={false}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReact={handleReact}
            />
          ))}
        </div>
      )}
    </section>
  );
}
