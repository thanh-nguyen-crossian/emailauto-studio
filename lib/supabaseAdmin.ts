import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SERVICE ROLE / secret key. Bypasses RLS — never import
// this into a client component. Used only by /api/admin/* routes after verifying the caller is
// an admin.

let _admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY (or URL) not set");
  if (!_admin) {
    _admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return _admin;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Verify the request comes from an active admin. Returns the admin's user id. */
export async function requireAdmin(req: Request): Promise<{ userId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Missing auth token");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session");

  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin, status")
    .eq("id", data.user.id)
    .single();

  if (!profile?.is_admin || profile.status !== "active") {
    throw new HttpError(403, "Admin access required");
  }
  return { userId: data.user.id };
}

/**
 * Require an active, signed-in user (any role) for paid/sensitive routes
 * (AI generation, SendGrid sync). If Supabase isn't configured (local dev without keys),
 * returns null so local development still works.
 */
export async function requireActiveUser(req: Request): Promise<{ userId: string } | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null; // not configured → local dev, no gate
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Sign in required");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session");

  const { data: profile } = await admin.from("profiles").select("status").eq("id", data.user.id).single();
  if (profile?.status !== "active") throw new HttpError(403, "Account not active");
  return { userId: data.user.id };
}
