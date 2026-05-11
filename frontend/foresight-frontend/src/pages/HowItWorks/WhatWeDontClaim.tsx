/**
 * "Honest limits" section that closes the page with what Foresight is _not_:
 * not a forecaster, not real-time, etc.
 *
 * @module pages/HowItWorks/WhatWeDontClaim
 */

export function WhatWeDontClaim() {
  const items = [
    "Not a forecasting model. Foresight surfaces and structures signals — humans decide what they mean.",
    "Not real-time below ~5 minutes. The discovery worker is on a steady cadence, not a millisecond firehose.",
    "Deduplication is conservative. Two cards on near-identical topics can occasionally coexist; analysts can merge them.",
    "Citations come from public sources. We don't ingest paywalled content unless the city has a license.",
    "The chat agent's writes are reversible (follow / pin / unpin) — it never deletes, never publishes externally.",
  ];
  return (
    <section className="py-16 md:py-20 bg-gray-50 dark:bg-dark-surface-deep border-t border-gray-200 dark:border-gray-700">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Honest limits
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6">
          What Foresight isn't.
        </h2>
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it}
              className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            >
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
