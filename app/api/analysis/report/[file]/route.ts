import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest, context: { params: Promise<{ file: string }> }) {
  try {
    await requireActiveUser(req);
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  const { file } = await context.params;
  const safeName = path.basename(file || "");
  if (!safeName.endsWith(".html")) {
    return NextResponse.json({ error: "Report file must be an HTML report." }, { status: 400 });
  }

  const reportDir = path.join(process.cwd(), "docs", "reports");
  const reportPath = path.join(reportDir, safeName);
  if (!reportPath.startsWith(reportDir)) {
    return NextResponse.json({ error: "Invalid report path." }, { status: 400 });
  }

  try {
    const html = await readFile(reportPath, "utf8");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
}
