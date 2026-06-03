"use client";

import { supabase } from "./supabase";

export type UserStatus = "pending" | "active" | "inactive";
export interface Profile {
  status: UserStatus;
  is_admin: boolean;
}

/** The signed-in user's profile (status + admin flag). Null if not signed in. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: u } = await supabase().auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase().from("profiles").select("status,is_admin").eq("id", u.user.id).single();
  return (data as Profile) ?? { status: "pending", is_admin: false };
}

/** Current session access token, for calling admin API routes. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
