import { NextRequest } from "next/server";
import { HttpError, requireAdmin, supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorFromCaught, apiOk } from "@/lib/api/respond";

export const runtime = "nodejs";

// POST { userId, password } — admin sets a new password for a user.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { userId, password } = (await req.json()) as { userId?: string; password?: string };
    if (!userId || !password || password.length < 6) {
      throw new HttpError(400, "userId and a password of at least 6 characters are required");
    }
    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
    if (error) throw new HttpError(500, error.message);
    return apiOk({ ok: true });
  } catch (err) {
    return apiErrorFromCaught(err, { status: 500 });
  }
}
