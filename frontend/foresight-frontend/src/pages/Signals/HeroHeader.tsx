/**
 * Gradient banner at the top of the Signals page: title, blurb, link to the
 * how-to guide, and the "New Signal" CTA.
 *
 * @module pages/Signals/HeroHeader
 */

import { Link } from "react-router-dom";
import { BookOpen, Plus, Radio } from "lucide-react";

interface HeroHeaderProps {
  onCreateClick: () => void;
}

export function HeroHeader({ onCreateClick }: HeroHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-blue via-brand-blue/90 to-brand-green mb-8 p-8 md:p-10">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Radio className="w-7 h-7 text-white/90" />
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              My Signals
            </h1>
          </div>
          <p className="text-white/80 text-lg max-w-2xl">
            Your personal intelligence hub &mdash; followed, created, and
            workstream signals in one place.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/guide/signals"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-white/80 hover:text-white hover:bg-white/10 font-medium rounded-xl border border-white/10 transition-colors text-sm"
          >
            <BookOpen className="w-4 h-4" />
            How to use
          </Link>
          <button
            onClick={onCreateClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white font-medium rounded-xl backdrop-blur-sm border border-white/20 transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Signal
          </button>
        </div>
      </div>
    </div>
  );
}
