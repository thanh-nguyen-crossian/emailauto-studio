import { NextRequest, NextResponse } from "next/server";
import { runAnalysisBridge, type AnalysisBridgeError } from "@/lib/analysisBridge";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    await requireActiveUser(req);
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  try {
    const data = await runAnalysisBridge("reports");
    return NextResponse.json(data);
  } catch (err) {
    const e = err as AnalysisBridgeError;
    return NextResponse.json({ error: e.message }, { status: e.status || 502 });
  }
}
