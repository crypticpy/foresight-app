/**
 * LLM audit detail modal — full redacted payload for a single LLM event
 * plus, when the event has a conversation, the surrounding chat replay
 * (messages + LLM events interleaved on a timeline).
 *
 * @module pages/AdminConsole/modals/LlmAuditDetailModal
 */

import { Loader2, X } from "lucide-react";

import {
  type LlmAuditEventDetail,
  type LlmAuditReplayMessage,
  type LlmAuditReplayResponse,
} from "../../../lib/admin-api";
import { formatDate, formatMoney, StatusPill } from "../helpers";

export function LlmAuditDetailModal({
  detail,
  loading,
  replay,
  replayLoading,
  onClose,
}: {
  detail: LlmAuditEventDetail;
  loading: boolean;
  replay: LlmAuditReplayResponse | null;
  replayLoading: boolean;
  onClose: () => void;
}) {
  // detail.created_at is undefined on the placeholder we set while loading.
  const ready = !loading && Boolean(detail.created_at);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-dark-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              LLM event
            </h2>
            <p className="mt-1 font-mono text-xs text-gray-500">{detail.id}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surface-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!ready && (
          <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading event…
          </div>
        )}

        {ready && (
          <div className="space-y-4 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs uppercase text-gray-400">When</dt>
                <dd className="text-gray-900 dark:text-white">
                  {formatDate(detail.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-400">Operation</dt>
                <dd className="font-mono text-xs text-gray-900 dark:text-white">
                  {detail.operation || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-400">Model</dt>
                <dd className="font-mono text-xs text-gray-900 dark:text-white">
                  {detail.model || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-400">Status</dt>
                <dd>
                  <StatusPill status={detail.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-400">Tokens</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detail.total_tokens ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-400">Cost</dt>
                <dd className="text-gray-900 dark:text-white">
                  {detail.estimated_cost_usd != null
                    ? formatMoney(detail.estimated_cost_usd)
                    : "—"}
                </dd>
              </div>
            </dl>

            {detail.redaction_flags && detail.redaction_flags.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-900/20">
                <span className="font-medium text-amber-800 dark:text-amber-300">
                  Redactions:
                </span>{" "}
                <span className="text-amber-700 dark:text-amber-200">
                  {detail.redaction_flags.join(", ")}
                </span>
              </div>
            )}

            {detail.prompt_excerpt != null ? (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase text-gray-400">
                  Prompt (redacted)
                </h3>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-dark-surface-elevated dark:text-gray-100">
                  {detail.prompt_excerpt}
                </pre>
              </div>
            ) : (
              <p className="text-xs italic text-gray-500">
                No prompt captured. Enable FORESIGHT_AUDIT_LLM_CONTENT in
                Settings to start capturing redacted prompt/response excerpts on
                future calls.
              </p>
            )}

            {detail.response_excerpt != null && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase text-gray-400">
                  Response (redacted)
                </h3>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-dark-surface-elevated dark:text-gray-100">
                  {detail.response_excerpt}
                </pre>
              </div>
            )}

            {detail.tool_calls && detail.tool_calls.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase text-gray-400">
                  Tool calls
                </h3>
                <div className="space-y-2">
                  {detail.tool_calls.map((call, idx) => {
                    const name =
                      typeof call.name === "string" ? call.name : "unknown";
                    const args =
                      typeof call.arguments === "string"
                        ? call.arguments
                        : null;
                    return (
                      <div
                        key={idx}
                        className="rounded-md border border-gray-200 p-2 dark:border-gray-700"
                      >
                        <div className="font-mono text-xs text-gray-900 dark:text-white">
                          {name}
                        </div>
                        {args ? (
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-800 dark:bg-dark-surface-elevated dark:text-gray-100">
                            {args}
                          </pre>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {detail.conversation_id && (
              <ReplayTimeline
                conversationId={detail.conversation_id}
                replay={replay}
                loading={replayLoading}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReplayTimeline({
  conversationId,
  replay,
  loading,
}: {
  conversationId: string;
  replay: LlmAuditReplayResponse | null;
  loading: boolean;
}) {
  return (
    <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase text-gray-400">
          Conversation replay
        </h3>
        {replay ? (
          <span className="text-xs text-gray-500">
            {replay.message_count} messages · {replay.llm_event_count} LLM calls
          </span>
        ) : null}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading replay…
        </div>
      )}
      {!loading && !replay && (
        <p className="text-xs text-gray-500">
          No replay available for conversation{" "}
          <span className="font-mono">{conversationId}</span>.
        </p>
      )}
      {replay && (
        <>
          <dl className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
            <div>
              <dt className="text-gray-400">Title</dt>
              <dd className="text-gray-900 dark:text-white">
                {replay.conversation.title || "Untitled"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Scope</dt>
              <dd className="font-mono text-gray-900 dark:text-white">
                {replay.conversation.scope}
                {replay.conversation.scope_id
                  ? ` · ${replay.conversation.scope_id.slice(0, 8)}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Started</dt>
              <dd className="text-gray-900 dark:text-white">
                {formatDate(replay.conversation.created_at)}
              </dd>
            </div>
          </dl>
          <ol className="space-y-2">
            {replay.timeline.map((item, idx) => (
              <li key={idx}>
                {item.kind === "message" ? (
                  <ReplayMessageRow
                    message={item.data as LlmAuditReplayMessage}
                  />
                ) : (
                  <ReplayEventRow event={item.data as LlmAuditEventDetail} />
                )}
              </li>
            ))}
            {replay.timeline.length === 0 && (
              <li className="text-xs text-gray-500">
                Conversation has no recorded turns yet.
              </li>
            )}
          </ol>
        </>
      )}
    </div>
  );
}

function ReplayMessageRow({ message }: { message: LlmAuditReplayMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`rounded-md border p-2 text-xs ${
        isUser
          ? "border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface-elevated"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`font-mono text-[10px] uppercase ${
            isUser ? "text-brand-blue dark:text-brand-blue/80" : "text-gray-500"
          }`}
        >
          {message.role}
        </span>
        <span className="text-[10px] text-gray-400">
          {formatDate(message.created_at)}
        </span>
      </div>
      <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">
        {message.content}
      </div>
      {message.tokens_used != null || message.model ? (
        <div className="mt-1 text-[10px] text-gray-500">
          {message.model ? (
            <span className="font-mono">{message.model}</span>
          ) : null}
          {message.tokens_used != null
            ? ` · ${message.tokens_used} tokens`
            : ""}
        </div>
      ) : null}
    </div>
  );
}

function ReplayEventRow({ event }: { event: LlmAuditEventDetail }) {
  return (
    <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 text-xs dark:border-gray-600 dark:bg-dark-surface">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase text-gray-500">
          llm · {event.operation || "—"}
        </span>
        <span className="text-[10px] text-gray-400">
          {formatDate(event.created_at)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-600 dark:text-gray-300">
        <span className="font-mono">{event.model || "—"}</span>
        <StatusPill status={event.status} />
        <span>{event.total_tokens ?? "—"} tokens</span>
        <span>
          {event.estimated_cost_usd != null
            ? formatMoney(event.estimated_cost_usd)
            : "—"}
        </span>
        {event.latency_ms != null ? <span>{event.latency_ms}ms</span> : null}
      </div>
    </div>
  );
}
