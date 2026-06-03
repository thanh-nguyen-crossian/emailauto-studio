"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client (singleton). Auth = email/password; session persists in localStorage.
// History rows are secured by Row-Level Security (each user sees only their own).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfigured(): boolean {
  return !!(URL && ANON);
}

let _client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!URL || !ANON) throw new Error("Supabase env not set (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)");
  if (!_client) _client = createClient(URL, ANON);
  return _client;
}
