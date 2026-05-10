/**
 * Live system-stats strip pinned just below the hero. Pulls
 * `/api/v1/analytics/system-stats` and `/api/v1/pattern-insights` once on
 * mount and animates each number with `CountUp`.
 *
 * @module pages/HowItWorks/StatStrip
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Brain, Radio, Sparkles, TrendingUp } from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";
import { CountUp } from "./_shared";

interface SystemStats {
  total_cards: number;
  active_cards: number;
  cards_this_week: number;
  cards_this_month: number;
}

export function StatStrip() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [patternCount, setPatternCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        const [statsRes, patternsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/analytics/system-stats`, { headers }),
          fetch(
            `${API_BASE_URL}/api/v1/pattern-insights?status=active&limit=50`,
            { headers },
          ),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (patternsRes.ok) {
          const data = await patternsRes.json();
          setPatternCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        /* silent — page still works without live stats */
      }
    }
    load();
  }, []);

  const items = [
    {
      label: "Signal cards indexed",
      value: stats?.total_cards,
      icon: Radio,
      to: "/signals",
    },
    {
      label: "Active this month",
      value: stats?.cards_this_month,
      icon: TrendingUp,
      to: "/discover",
    },
    {
      label: "New this week",
      value: stats?.cards_this_week,
      icon: Sparkles,
      to: "/discover/queue",
    },
    {
      label: "Patterns detected",
      value: patternCount,
      icon: Brain,
      to: "/patterns",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 md:p-6">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.label}
              to={it.to}
              className="group flex flex-col items-start p-3 rounded-xl bg-gray-50 dark:bg-dark-surface-deep hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 transition-colors"
            >
              <div className="flex items-center justify-between w-full">
                <Icon className="h-4 w-4 text-brand-blue mb-2" />
                <ArrowRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand-blue group-hover:translate-x-0.5 transition-all" />
              </div>
              <CountUp
                value={it.value}
                className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {it.label}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
