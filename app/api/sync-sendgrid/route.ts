import { NextRequest, NextResponse } from "next/server";
import { createDesign } from "@/lib/sendgrid";
import { cleanForTemplate } from "@/lib/cleanEmail";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    await requireActiveUser(req);
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, html, subject, overrideQualityGate } = (body || {}) as { name?: string; html?: string; subject?: string; overrideQualityGate?: boolean };
  if (!name || !html) {
    return NextResponse.json({ error: "name and html are required" }, { status: 400 });
  }

  const clean = cleanForTemplate(html);
  if (clean.blocking.length && !overrideQualityGate) {
    return NextResponse.json({
      error: "Pre-send quality gate blocked SendGrid Design sync. Fix blockers or override intentionally.",
      blocking: clean.blocking,
      warnings: clean.warnings,
      info: clean.info,
      originalBytes: clean.originalBytes,
      cleanedBytes: clean.cleanedBytes,
    }, { status: 422 });
  }

  try {
    const design = await createDesign({ name, html: clean.html, subject: subject || name });
    return NextResponse.json({
      ...design,
      blocking: clean.blocking,
      warnings: clean.warnings,
      info: clean.info,
      originalBytes: clean.originalBytes,
      cleanedBytes: clean.cleanedBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    // 401/403 from SendGrid (bad key / missing Marketing scope) surface as 502 with the message.
    const status = message.includes("SENDGRID_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message, blocking: clean.blocking, warnings: clean.warnings }, { status });
  }
}
