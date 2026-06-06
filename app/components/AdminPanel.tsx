"use client";

import { useCallback, useEffect, useState } from "react";
import { accessToken } from "@/lib/profile";

interface AdminUser {
  id: string;
  email: string | null;
  status: "pending" | "active" | "inactive";
  is_admin: boolean;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "#f5c451",
  active: "#3ecf8e",
  inactive: "#ff6b6b",
};

// Full-screen in-app admin console (no separate route — reuses the loaded session).
export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setUsers(null);
      load();
    }
  }, [open, load]);

  if (!open) return null;

  async function setStatus(userId: string, status: string) {
    setBusy(userId);
    setError(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(userId: string, email: string | null) {
    const pw = window.prompt(`New password for ${email || userId} (min 6 chars):`);
    if (!pw) return;
    setBusy(userId);
    setError(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      window.alert("Password updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  const pending = (users || []).filter((u) => u.status === "pending");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Admin · Users</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Approve signups, set active/inactive, reset passwords.</p>
          </div>
          <button onClick={onClose} className="btn-ghost">Back to studio</button>
        </div>

        {error && <div className="text-sm text-[#ff6b6b] mb-4">{error}</div>}
        {pending.length > 0 && (
          <div className="mb-6 rounded-lg border border-[#f5c451] bg-[rgba(245,196,81,0.06)] p-3 text-sm">
            {pending.length} account{pending.length === 1 ? "" : "s"} awaiting approval.
          </div>
        )}

        {users === null ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--muted)] text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[var(--border)]">
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">
                      <span style={{ color: STATUS_COLOR[u.status] }}>● {u.status}</span>
                    </td>
                    <td className="p-3 text-[var(--muted)]">{u.is_admin ? "admin" : "user"}</td>
                    <td className="p-3 text-[var(--muted)]">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-end flex-wrap">
                        {u.status === "pending" && (
                          <button disabled={busy === u.id} onClick={() => setStatus(u.id, "active")} className="btn-ghost">Approve</button>
                        )}
                        {u.status === "active" && !u.is_admin && (
                          <button disabled={busy === u.id} onClick={() => setStatus(u.id, "inactive")} className="btn-ghost">Deactivate</button>
                        )}
                        {u.status === "inactive" && (
                          <button disabled={busy === u.id} onClick={() => setStatus(u.id, "active")} className="btn-ghost">Activate</button>
                        )}
                        <button disabled={busy === u.id} onClick={() => resetPassword(u.id, u.email)} className="btn-ghost">Reset password</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <style>{`
          .btn-ghost { background:var(--surface-2); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; }
          .btn-ghost:disabled { opacity:.4; cursor:not-allowed; }
        `}</style>
      </div>
    </div>
  );
}
