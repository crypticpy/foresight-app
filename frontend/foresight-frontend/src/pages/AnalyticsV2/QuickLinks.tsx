/**
 * Bottom-of-page navigation strip: three coloured cards linking to Discover,
 * Workstreams, and the Discovery Queue.
 *
 * @module pages/AnalyticsV2/QuickLinks
 */

import type { ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Layers, Sparkles, Target } from "lucide-react";

type Accent = "blue" | "purple" | "orange";

const ACCENT_CLASSES: Record<
  Accent,
  { iconBg: string; iconColor: string; hover: string }
> = {
  blue: {
    iconBg: "bg-brand-blue/10",
    iconColor: "text-brand-blue",
    hover: "group-hover:text-brand-blue",
  },
  purple: {
    iconBg: "bg-extended-purple/10",
    iconColor: "text-extended-purple",
    hover: "group-hover:text-extended-purple",
  },
  orange: {
    iconBg: "bg-extended-orange/10",
    iconColor: "text-extended-orange",
    hover: "group-hover:text-extended-orange",
  },
};

export function QuickLinks() {
  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <QuickLink
        to="/discover"
        icon={Target}
        accent="blue"
        title="Discover Signals"
        subtitle="Browse intelligence"
      />
      <QuickLink
        to="/workstreams"
        icon={Layers}
        accent="purple"
        title="Workstreams"
        subtitle="Manage collections"
      />
      <QuickLink
        to="/discover/queue"
        icon={Sparkles}
        accent="orange"
        title="Discovery Queue"
        subtitle="Review new signals"
      />
    </div>
  );
}

interface QuickLinkProps {
  to: string;
  icon: ElementType;
  accent: Accent;
  title: string;
  subtitle: ReactNode;
}

function QuickLink({
  to,
  icon: Icon,
  accent,
  title,
  subtitle,
}: QuickLinkProps) {
  const cls = ACCENT_CLASSES[accent];
  return (
    <Link
      to={to}
      className="flex items-center justify-between p-4 bg-white dark:bg-dark-surface rounded-lg shadow hover:shadow-md transition-shadow group"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 ${cls.iconBg} rounded-lg`}>
          <Icon className={`h-5 w-5 ${cls.iconColor}`} />
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
      </div>
      <ArrowRight
        className={`h-5 w-5 text-gray-400 ${cls.hover} group-hover:translate-x-1 transition-all duration-200`}
      />
    </Link>
  );
}
