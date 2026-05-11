/**
 * AssetsTab — chronological history of generated assets for a card
 * (executive briefs, deep-research reports, PDF/PPTX exports).
 *
 * Features: type filter, search, grouped-by-date list, per-row download
 * + view-details affordances.
 *
 * @module components/CardDetail/AssetsTab
 */

import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AssetCard } from "./AssetCard";
import { AssetsToolbar } from "./AssetsToolbar";
import { ASSET_TYPE_CONFIG, formatDate } from "./constants";
import { EmptyState, ErrorState, LoadingState } from "./States";
import type { Asset, AssetsTabProps, AssetType } from "./types";

export type { Asset, AssetType, AssetsTabProps } from "./types";

export function AssetsTab({
  cardId: _cardId,
  workstreamId: _workstreamId,
  assets,
  isLoading = false,
  error = null,
  onDownload,
  onRegenerate: _onRegenerate,
  onViewDetails,
  onRefresh,
}: AssetsTabProps) {
  const [filterType, setFilterType] = useState<AssetType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (filterType !== "all") {
      result = result.filter((a) => a.type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.type.toLowerCase().includes(query),
      );
    }

    result.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return result;
  }, [assets, filterType, searchQuery]);

  const groupedAssets = useMemo(() => {
    const groups: Record<string, Asset[]> = {};
    filteredAssets.forEach((asset) => {
      const date = formatDate(asset.created_at);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date]!.push(asset);
    });
    return groups;
  }, [filteredAssets]);

  const handleFilterChange = useCallback((type: AssetType | "all") => {
    setFilterType(type);
    setShowFilters(false);
  }, []);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRefresh={onRefresh} />;
  if (assets.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <AssetsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterType={filterType}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onFilterChange={handleFilterChange}
        onRefresh={onRefresh}
      />

      <p className="text-sm text-gray-500 dark:text-gray-400">
        {filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""}
        {filterType !== "all" &&
          ` • Filtered by ${ASSET_TYPE_CONFIG[filterType].label}`}
      </p>

      {Object.entries(groupedAssets).map(([date, dateAssets]) => (
        <div key={date} className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900 py-1">
            {date}
          </h3>
          <div className="space-y-2">
            {dateAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDownload={onDownload}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        </div>
      ))}

      {filteredAssets.length === 0 && assets.length > 0 && (
        <div className="text-center py-8">
          <Search className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">
            No assets match your search
          </p>
        </div>
      )}
    </div>
  );
}

export default AssetsTab;
