/**
 * One row in the assets list. Renders the type icon, badge, metadata
 * line, and hover-revealed Download / View-details controls.
 *
 * @module components/CardDetail/AssetsTab/AssetCard
 */

import {
  Calendar,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";

import { cn } from "../../../lib/utils";

import {
  ASSET_TYPE_CONFIG,
  formatDate,
  formatFileSize,
  formatTime,
} from "./constants";
import type { Asset } from "./types";

export interface AssetCardProps {
  asset: Asset;
  onDownload?: (asset: Asset) => void;
  onViewDetails?: (asset: Asset) => void;
}

export function AssetCard({
  asset,
  onDownload,
  onViewDetails,
}: AssetCardProps) {
  const config = ASSET_TYPE_CONFIG[asset.type];
  const Icon = config.icon;
  const isGenerating = asset.status === "generating";

  return (
    <div
      className={cn(
        "group relative p-4 rounded-lg border transition-all duration-200",
        "bg-white dark:bg-dark-surface",
        "border-gray-200 dark:border-gray-700",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:shadow-md",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 p-2.5 rounded-lg"
          style={{ backgroundColor: config.bgColor }}
        >
          {isGenerating ? (
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: config.color }}
            />
          ) : (
            <Icon className="h-5 w-5" style={{ color: config.color }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white truncate">
                {asset.title}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: config.bgColor,
                    color: config.color,
                  }}
                >
                  {config.label}
                </span>
                {asset.version && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    v{asset.version}
                  </span>
                )}
                {asset.ai_generated && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Sparkles className="h-3 w-3" />
                    AI
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onViewDetails && (
                <button
                  onClick={() => onViewDetails(asset)}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="View details"
                >
                  <ExternalLink className="h-4 w-4 text-gray-500" />
                </button>
              )}
              {onDownload && asset.status === "ready" && (
                <button
                  onClick={() => onDownload(asset)}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(asset.created_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(asset.created_at)}
            </span>
            {asset.file_size && <span>{formatFileSize(asset.file_size)}</span>}
            {asset.download_count !== undefined && asset.download_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Download className="h-3 w-3" />
                {asset.download_count}
              </span>
            )}
          </div>

          {isGenerating && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Generating...
            </div>
          )}
          {asset.status === "failed" && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
              Generation failed
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
