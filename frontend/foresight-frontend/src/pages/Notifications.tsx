import { useEffect, useState } from "react";
import { getAuthToken } from "../lib/auth";
import {
  listNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "../lib/notifications-api";

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = async () => {
    const token = await getAuthToken();
    if (!token) return;
    setItems(await listNotifications(token));
  };

  useEffect(() => {
    load();
  }, []);

  const markAll = async () => {
    const token = await getAuthToken();
    if (!token) return;
    await markNotificationsRead(token);
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Notifications
        </h1>
        <button
          type="button"
          onClick={markAll}
          className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
        >
          Mark All Read
        </button>
      </div>
      <div className="divide-y divide-slate-100 rounded border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
        {items.map((item) => (
          <div key={item.id} className="px-5 py-4">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {item.kind.replace("_", " ")}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(item.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-5 py-8 text-sm text-slate-500">No notifications.</p>
        )}
      </div>
    </div>
  );
}
