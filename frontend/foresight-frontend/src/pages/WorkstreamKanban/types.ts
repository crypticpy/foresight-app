/**
 * Shared types for the WorkstreamKanban page. Currently the only page-local
 * type is the toast-notification shape; everything card/board related is
 * imported from `../../components/kanban`.
 *
 * @module pages/WorkstreamKanban/types
 */

export interface ToastNotification {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export type ToastType = ToastNotification["type"];
