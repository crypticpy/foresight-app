/**
 * Four-tile stats summary above the Signals filter bar.
 *
 * @module pages/Signals/StatsRow
 */

import type { ElementType, ReactNode } from "react";
import { Bell, Eye, Microscope, Radio } from "lucide-react";
import type { SignalStats } from "./types";

export function StatsRow({ stats }: { stats: SignalStats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatTile
        icon={Radio}
        iconBg="bg-brand-blue/10"
        iconColor="text-brand-blue"
        value={stats.total}
        label={
          <>
            Signals across{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {stats.workstream_count}
            </span>{" "}
            workstreams
          </>
        }
      />
      <StatTile
        icon={Eye}
        iconBg="bg-brand-green/10"
        iconColor="text-brand-green"
        value={
          <>
            {stats.followed_count}
            <span className="text-base font-normal text-gray-400 dark:text-gray-500">
              {" "}
              / {stats.created_count}
            </span>
          </>
        }
        label="Followed / Created"
      />
      <StatTile
        icon={Bell}
        iconBg="bg-extended-purple/10"
        iconColor="text-extended-purple"
        value={stats.updates_this_week}
        label="Updated this week"
      />
      <StatTile
        icon={Microscope}
        iconBg="bg-amber-500/10"
        iconColor="text-amber-500"
        value={stats.needs_research}
        label="Need deeper research"
      />
    </div>
  );
}

interface StatTileProps {
  icon: ElementType;
  iconBg: string;
  iconColor: string;
  value: ReactNode;
  label: ReactNode;
}

function StatTile({
  icon: Icon,
  iconBg,
  iconColor,
  value,
  label,
}: StatTileProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-5 flex items-center gap-4">
      <div className={`p-3 ${iconBg} rounded-xl`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}
