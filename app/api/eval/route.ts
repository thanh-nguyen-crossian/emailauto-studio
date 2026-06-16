import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { runGoldenSet, calibrateCorpus, runDiversityEval, checkSlop, strongBrief, type RawEmail } from "@/lib/quality/eval";

// Output-quality eval harness — a deterministic, no-cost, no-network QA endpoint.
//   GET /api/eval
// Runs the golden-set regression (strong brief must beat weak brief) and, when the .eml corpus is
// available on disk (local dev), calibrates the deliverability scorer against the team's real
// win/fail templates. No user data, no model calls, no spend → no auth guard needed.

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Decode RFC-2047 encoded-words (=?utf-8?B?..?= / =?utf-8?Q?..?=) found in Subject headers. */
function decodeMimeWords(input: string): string {
  return input.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _charset, enc, data) => {
    try {
      if (/B/i.test(enc)) return Buffer.from(data, "base64").toString("utf8");
      // Q-encoding: _ → space, =XX → byte.
      const bytes = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, "binary").toString("utf8");
    } catch {
      return data;
    }
  });
}

function extractSubject(eml: string): string {
  // Unfold the Subject header (continuation lines start with whitespace).
  const m = eml.match(/^Subject:[ \t]*((?:.*(?:\r?\n[ \t].*)*))/im);
  if (!m) return "";
  const folded = m[1].replace(/\r?\n[ \t]+/g, " ").trim();
  return decodeMimeWords(folded);
}

async function readCorpus(dir: string): Promise<RawEmail[]> {
  const entries = await fs.readdir(dir);
  const emls = entries.filter((f) => f.toLowerCase().endsWith(".eml"));
  const out: RawEmail[] = [];
  for (const file of emls) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "latin1");
      const subject = extractSubject(raw);
      if (subject) out.push({ name: file.replace(/\.eml$/i, ""), subject });
    } catch {
      // skip unreadable file
    }
  }
  return out;
}

export async function GET() {
  const golden = runGoldenSet();
  const diversity = runDiversityEval();
  const slopCheck = checkSlop(strongBrief());

  let corpus: ReturnType<typeof calibrateCorpus> | null = null;
  let corpusNote: string | undefined;
  try {
    const base = path.join(process.cwd(), "Source");
    const [win, fail] = await Promise.all([
      readCorpus(path.join(base, "WinEmailTemps")),
      readCorpus(path.join(base, "FailedEmailTemps")),
    ]);
    if (win.length && fail.length) {
      corpus = calibrateCorpus(win, fail);
    } else {
      corpusNote = "No .eml corpus found (Source/WinEmailTemps & FailedEmailTemps) — golden set only.";
    }
  } catch {
    corpusNote = "Corpus not available in this environment — golden set only.";
  }

  const pass = golden.pass && diversity.pass && (corpus ? corpus.pass : true);
  return NextResponse.json({
    pass,
    golden,
    diversity,
    slop: slopCheck,
    corpus,
    corpusNote,
    generatedAt: new Date().toISOString(),
  });
}
