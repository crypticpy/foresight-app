/**
 * Export state shape, return contract, and module-level constants
 * shared by the export hook and its sub-modules.
 *
 * @module hooks/useExportWithProgress/state
 */

import type {
  ExportFormat,
  ExportStatus,
} from "../../components/ExportProgressModal";

/** Gamma exports typically take 30-90 seconds. */
export const GAMMA_ESTIMATED_TIME = 60;

/** Poll interval for progress simulation, in ms. */
export const POLL_INTERVAL = 2000;

export interface ExportState {
  isExporting: boolean;
  showModal: boolean;
  status: ExportStatus;
  format: ExportFormat | null;
  progress: number;
  statusMessage: string;
  errorMessage: string | null;
  downloadUrl: string | null;
  filename: string | null;
  itemName: string | null;
  isGammaPowered: boolean;
  estimatedTimeSeconds: number;
}

export const initialState: ExportState = {
  isExporting: false,
  showModal: false,
  status: "preparing",
  format: null,
  progress: 0,
  statusMessage: "",
  errorMessage: null,
  downloadUrl: null,
  filename: null,
  itemName: null,
  isGammaPowered: false,
  estimatedTimeSeconds: GAMMA_ESTIMATED_TIME,
};

export interface UseExportWithProgressReturn {
  state: ExportState;
  exportBrief: (
    workstreamId: string,
    cardId: string,
    format: ExportFormat,
    itemName?: string,
    version?: number,
  ) => Promise<void>;
  exportCard: (
    cardId: string,
    format: ExportFormat,
    itemName?: string,
  ) => Promise<void>;
  closeModal: () => void;
  retryExport: () => void;
  downloadExport: () => void;
}
