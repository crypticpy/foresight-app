import { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  createComment,
  listComments,
  toggleCommentReaction,
  type CommentItem,
} from "../../lib/comments-api";

interface CommentThreadProps {
  targetType: string;
  targetId: string;
  workstreamId?: string;
  canComment: boolean;
}

const reactions = [
  ["thumbs_up", "Like"],
  ["target", "Target"],
  ["flag", "Flag"],
  ["check", "Check"],
  ["question", "Question"],
] as const;

export function CommentThread({
  targetType,
  targetId,
  workstreamId,
  canComment,
}: CommentThreadProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }, []);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      setComments(
        await listComments(token, targetType, targetId, workstreamId),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load comments");
    }
  }, [getToken, targetId, targetType, workstreamId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const token = await getToken();
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
      setError(err instanceof Error ? err.message : "Unable to post comment");
    }
  };

  const react = async (commentId: string, emoji: string) => {
    const token = await getToken();
    if (!token) return;
    try {
      setError(null);
      await toggleCommentReaction(token, commentId, emoji);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update reaction",
      );
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <MessageSquare className="h-4 w-4" />
        Comments
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-3">
        {comments.map((comment) => (
          <article
            key={comment.id}
            className="rounded border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {comment.author_display_name || "Collaborator"}
              </span>
              <time className="text-xs text-slate-500">
                {new Date(comment.created_at).toLocaleString()}
              </time>
            </div>
            {comment.body_html ? (
              <div
                className="prose prose-sm max-w-none text-slate-700 dark:prose-invert dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: comment.body_html }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {comment.body_markdown}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {reactions.map(([emoji, label]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(comment.id, emoji)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                  title={label}
                >
                  {label} {comment.reactions[emoji] || 0}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {canComment && (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-[90px] w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Add a comment"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded bg-brand-blue px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!body.trim()}
          >
            Comment
          </button>
        </div>
      )}
    </section>
  );
}
