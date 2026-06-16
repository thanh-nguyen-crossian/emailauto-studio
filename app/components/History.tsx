"use client";

import { useEffect, useState } from "react";
import { deleteVersion, listVersions, type SavedVersion } from "@/lib/history";

// Slide-over panel listing the signed-in user's saved generations.
export function History({
  open,
  onClose,
  onOpenVersion,
}: {
  open: boolean;
  onClose: () => void;
  onOpenVersion: (v: SavedVersion) => void;
}) {
  const [items, setItems] = useState<SavedVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setError(null);
    listVersions()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [open]);

  if (!open) return null;

  async function remove(id: string) {
    try {
      await deleteVersion(id);
      setItems((cur) => (cur ? cur.filter((x) => x.id !== id) : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <button type="button" aria-label="Close history" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="relative w-full max-w-md h-full bg-[var(--surface)] border-l border-[var(--border)] p-5 overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="history-title" className="text-lg font-semibold">History</h2>
          <button onClick={onClose} aria-label="Close history" className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>
        {error && <div className="text-xs text-[var(--bad)] mb-3">{error}</div>}
        {items === null && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
        {items && items.length === 0 && (
          <div className="text-sm text-[var(--muted)]">No saved versions yet. Generate a campaign and Save it on the Export step.</div>
        )}
        <ul className="flex flex-col gap-2">
          {items?.map((v) => {
            const segs = v.data?.segments?.length || 0;
            const opts = (v.data?.options?.a ? 1 : 0) + (v.data?.options?.b ? 1 : 0);
            const variants = segs * (opts || 1);
            return (
              <li key={v.id} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm truncate">{v.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {variants} variant{variants === 1 ? "" : "s"} ·{" "}
                      {new Date(v.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => onOpenVersion(v)} className="btn-ghost">Open</button>
                    <button onClick={() => remove(v.id)} className="btn-ghost">Delete</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
