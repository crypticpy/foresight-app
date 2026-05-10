/**
 * Public types for the AssetsTab subtree. Re-exported from the directory
 * barrel so existing imports (`{ Asset, AssetType, AssetsTabProps }`)
 * keep working.
 *
 * @module components/CardDetail/AssetsTab/types
 */

export type AssetType = "brief" | "research" | "pdf_export" | "pptx_export";

export interface Asset {
  id: string;
  type: AssetType;
  title: string;
  created_at: string;
  version?: number;
  file_size?: number;
  download_count?: number;
  ai_generated?: boolean;
  ai_model?: string;
  status?: "ready" | "generating" | "failed";
  download_url?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetsTabProps {
  cardId: string;
  workstreamId?: string;
  assets: Asset[];
  isLoading?: boolean;
  error?: string | null;
  onDownload?: (asset: Asset) => void;
  onRegenerate?: (assetType: AssetType) => void;
  onViewDetails?: (asset: Asset) => void;
  onRefresh?: () => void;
}
