/**
 * HowItWorks — interactive scrollytelling page that walks demo audiences
 * through every subsystem of Foresight, with live widgets pulling real data.
 *
 * The page is decomposed into a directory of focused sub-components; this
 * file is the thin composer that wires them together with the section
 * copy and the anchor-nav.
 */

import { Link } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  CheckCircle,
  Compass,
  FileText,
  Layers,
  MessageSquare,
  Network,
  Radio,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

import { Section } from "./_shared";
import type { AnchorItem } from "./helpers";
import { ScrollProgressBar } from "./ScrollProgressBar";
import { StickyAnchorNav } from "./StickyAnchorNav";
import { SpeedMetric } from "./SpeedMetric";
import { StatStrip } from "./StatStrip";
import { PipelineDiagram } from "./PipelineDiagram";
import { CardAnatomy } from "./CardAnatomy";
import { ClusterScatter } from "./ClusterScatter";
import { HybridSearchDemo } from "./HybridSearchDemo";
import { PatternIllustration } from "./PatternIllustration";
import { ChatAgentTools } from "./ChatAgentTools";
import { BriefIllustration } from "./BriefIllustration";
import { WorkstreamIllustration } from "./WorkstreamIllustration";
import { WhatWeDontClaim } from "./WhatWeDontClaim";

const ANCHOR_NAV: AnchorItem[] = [
  { id: "discovery", label: "Discovery" },
  { id: "cards", label: "Cards" },
  { id: "similarity", label: "Similarity" },
  { id: "search", label: "Hybrid search" },
  { id: "patterns", label: "Patterns" },
  { id: "chat", label: "Chat agent" },
  { id: "briefs", label: "Briefs" },
  { id: "workstreams", label: "Workstreams" },
];

export default function HowItWorks() {
  return (
    <div className="bg-brand-faded-white dark:bg-brand-dark-blue min-h-screen">
      <ScrollProgressBar />
      <StickyAnchorNav items={ANCHOR_NAV} />
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-blue via-brand-blue/95 to-brand-green text-white">
        <div className="absolute inset-0 opacity-20">
          <svg
            viewBox="0 0 800 400"
            className="w-full h-full"
            aria-hidden="true"
          >
            {Array.from({ length: 40 }).map((_, i) => {
              const cx = (i * 73) % 800;
              const cy = (i * 41) % 400;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={2}
                  fill="white"
                  opacity={0.6}
                />
              );
            })}
            {Array.from({ length: 30 }).map((_, i) => {
              const x1 = (i * 73) % 800;
              const y1 = (i * 41) % 400;
              const x2 = ((i + 1) * 73) % 800;
              const y2 = ((i + 1) * 41) % 400;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="white"
                  strokeOpacity={0.15}
                />
              );
            })}
          </svg>
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
              Behind the scenes
            </span>
            <SpeedMetric />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 max-w-4xl leading-tight">
            How Foresight finds tomorrow's questions today.
          </h1>
          <p className="text-lg md:text-xl text-white/85 max-w-3xl leading-relaxed">
            A guided tour of every system that turns the firehose of public
            information into the strategic signals, patterns, and briefs
            powering Austin's planning. Live demos included.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#discovery"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-brand-blue font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              Start the tour
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/ask"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              Try the chat agent
              <Sparkles className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <StatStrip />

      {/* Sections */}
      <Section
        id="discovery"
        eyebrow="Step 1"
        title="The discovery pipeline runs continuously."
        intro="Foresight pulls in thousands of new items every week from RSS feeds, NewsAPI, and curated municipal sources. Every item is triaged, embedded, classified, and scored — automatically — so analysts never start from a blank page."
        icon={<Compass className="h-4 w-4" />}
        techNote="Stack: Python worker process, OpenAI embeddings (text-embedding-ada-002, 1536 dims), GPT-5.4-mini for classification & scoring, pgvector for similarity, Supabase Postgres for storage. Triage drops ~70% of items before any LLM cost."
      >
        <PipelineDiagram />
      </Section>

      <Section
        id="cards"
        eyebrow="Step 2"
        title="Cards are atomic intelligence units."
        intro="Each card represents a single trend, technology, or issue — with one URL, one slug, and a versioned history. Multiple articles dedup into the same card so the team tracks the topic, not the news cycle."
        icon={<Radio className="h-4 w-4" />}
        alternate
      >
        <CardAnatomy />
      </Section>

      <Section
        id="similarity"
        eyebrow="Step 3"
        title="Semantic similarity, not keyword matching."
        intro="Every card lives in a 1,536-dimensional vector space. Topics that mean the same thing land near each other — even when they share no words. New items above a 0.92 similarity threshold merge into the existing card as additional sources."
        icon={<Network className="h-4 w-4" />}
        techNote="pgvector ivfflat index on a 1536-dim embedding column. Similarity uses cosine distance. The 0.92 dedup threshold was tuned against a labeled set of municipal-tech articles to balance precision (don't merge unrelated topics) and recall (don't fragment one trend across five cards)."
      >
        <ClusterScatter />
      </Section>

      <Section
        id="search"
        eyebrow="Step 4 — Live demo"
        title="Hybrid search: keyword and meaning, fused."
        intro="Pure keyword search misses paraphrases. Pure semantic search drifts off-topic. Foresight runs both in parallel and fuses them with Reciprocal Rank Fusion — then an LLM reranker picks the final order. Try a query and watch all three rankings appear side by side."
        icon={<Search className="h-4 w-4" />}
        alternate
        techNote="Postgres tsvector full-text search + pgvector cosine similarity. RRF score: Σ 1/(k + rank), k=60. Top fused results are then reranked by GPT-5.4-mini against the user's intent before being passed to GPT-5.5 for synthesis."
      >
        <HybridSearchDemo />
      </Section>

      <Section
        id="patterns"
        eyebrow="Step 5"
        title="Patterns: what weak signals add up to."
        intro="The most valuable insights aren't in any single article. They're in the convergence of three or four. A scheduled job clusters cards across pillars, asks GPT-5.5 to find the cross-cutting story, and writes it back as a pattern card with an opportunity statement."
        icon={<Brain className="h-4 w-4" />}
      >
        <PatternIllustration />
      </Section>

      <Section
        id="chat"
        eyebrow="Step 6"
        title="The chat agent has tools — and uses them."
        intro="Ask Foresight isn't a wrapper around a chatbot. It's a tool-using agent backed by GPT-5.5 (via the OpenAI Responses API) with hybrid-search retrieval, citations from the library, and a curated set of read and write tools. It defaults to your current scope (signal, workstream, or global) but can broaden when you ask."
        icon={<MessageSquare className="h-4 w-4" />}
        alternate
        techNote="System prompt enforces citation discipline; per-message budget caps tool calls (8) and web searches (2) to keep latency in check. Write tools (follow / pin) are reversible by design — the agent never takes destructive actions."
      >
        <ChatAgentTools />
      </Section>

      <Section
        id="briefs"
        eyebrow="Step 7"
        title="From question to executive-ready brief."
        intro="When a signal warrants deeper investigation, Foresight orchestrates a focused research run, drafts a structured brief, then renders a polished PowerPoint with AI-generated imagery — all from a single click."
        icon={<FileText className="h-4 w-4" />}
      >
        <BriefIllustration />
      </Section>

      <Section
        id="workstreams"
        eyebrow="Step 8"
        title="Workstreams close the loop."
        intro="Discovery without ownership is just noise. Workstreams turn signals into projects — kanban-tracked, briefable, and connected back to the discovery pipeline so the system knows what each analyst cares about."
        icon={<Layers className="h-4 w-4" />}
        alternate
      >
        <WorkstreamIllustration />
      </Section>

      <WhatWeDontClaim />

      {/* CTA */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-brand-blue via-brand-blue/90 to-brand-green text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Zap className="h-10 w-10 mx-auto mb-4" />
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Now go try it.
          </h2>
          <p className="text-lg text-white/85 max-w-2xl mx-auto mb-8 leading-relaxed">
            Every system above is wired up and live in this app. Pick a starting
            point — the rest reveals itself.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/ask"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-brand-blue font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Ask Foresight
            </Link>
            <Link
              to="/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              <Compass className="h-4 w-4" />
              Open Discover
            </Link>
            <Link
              to="/signals"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              <Radio className="h-4 w-4" />
              Browse Signals
            </Link>
            <Link
              to="/patterns"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 backdrop-blur text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/30"
            >
              <Brain className="h-4 w-4" />
              See Patterns
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-white/70">
            <CheckCircle className="h-4 w-4" />
            <span>
              Built for the City of Austin's strategic horizon-scanning team.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
