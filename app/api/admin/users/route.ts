import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireAdmin, supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET — list all user profiles (admin only).
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { data, error } = await supabaseAdmin()
      .from("profiles")
      .select("id, email, status, is_admin, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ users: data });
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

// POST { userId, status: 'active'|'inactive'|'pending' } — approve / activate / deactivate.
export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin(req);
    const { userId, status } = (await req.json()) as { userId?: string; status?: string };
    if (!userId || !["active", "inactive", "pending"].includes(status || "")) {
      throw new HttpError(400, "userId and a valid status are required");
    }
    if (userId === me.userId && status !== "active") {
      throw new HttpError(400, "You can't deactivate your own admin account");
    }

    const admin = supabaseAdmin();
    const { error } = await admin.from("profiles").update({ status }).eq("id", userId);
    if (error) throw new HttpError(500, error.message);

    // Enforce at the auth layer too: ban/unban and confirm email on activation.
    try {
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: status === "inactive" ? "876000h" : "none",
        ...(status === "active" ? { email_confirm: true } : {}),
      });
    } catch {
      /* non-fatal: profile status still gates the app */
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
