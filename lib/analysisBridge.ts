import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

export type AnalysisBridgeCommand = "status" | "reports" | "run";

export interface AnalysisBridgeError extends Error {
  status?: number;
  stderr?: string;
  stdout?: string;
}

const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;

function remoteAnalysisUrl(): string {
  return (process.env.EMAILSTUDIO_ANALYSIS_URL || "").replace(/\/+$/, "");
}

async function runRemoteAnalysisBridge<T>(command: AnalysisBridgeCommand, input?: unknown, timeoutMs = 25_000): Promise<T> {
  const base = remoteAnalysisUrl();
  const endpoint = command === "run" ? "/api/run" : command === "reports" ? "/api/reports" : "/api/status";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: command === "run" ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: command === "run" ? JSON.stringify(input || {}) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Analysis service returned HTTP ${res.status}`) as AnalysisBridgeError;
      err.status = res.status;
      throw err;
    }
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      const timeout = new Error("Analysis service timed out.") as AnalysisBridgeError;
      timeout.status = 504;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function hostedLocalAnalysisDisabled<T>(command: AnalysisBridgeCommand): T | null {
  const isVercel = process.env.VERCEL === "1";
  const localEnabled = process.env.EMAILSTUDIO_LOCAL_ANALYSIS === "on";
  if (!isVercel || localEnabled || remoteAnalysisUrl()) return null;
  if (command === "status") {
    return {
      ok: false,
      dependency_error: "Performance analysis is local/sidecar-only on Vercel. Set EMAILSTUDIO_ANALYSIS_URL to a hosted analysis service to enable it in production.",
      source_options: [],
      required_files: [],
      workbook_sheets: [],
      timeline_bounds: {},
      page_performance_count: 0,
      failed_template_count: 0,
      win_template_count: 0,
      reports: [],
      api_keys_configured: {
        claude: Boolean(process.env.ANTHROPIC_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
      },
    } as T;
  }
  if (command === "reports") return { reports: [] } as T;
  const err = new Error("Performance analysis is not enabled on this Vercel deployment. Configure EMAILSTUDIO_ANALYSIS_URL or run analysis locally.") as AnalysisBridgeError;
  err.status = 501;
  throw err;
}

function pythonBin(): string {
  const local = path.join(process.cwd(), ".venv", "bin", "python");
  return existsSync(local) ? local : "python3";
}

function bridgeScript(): string {
  return path.join(process.cwd(), "agents", "analysis_bridge.py");
}

export function runAnalysisBridge<T>(
  command: AnalysisBridgeCommand,
  input?: unknown,
  timeoutMs = command === "run" ? 290_000 : 25_000
): Promise<T> {
  if (remoteAnalysisUrl()) return runRemoteAnalysisBridge<T>(command, input, timeoutMs);
  const disabled = hostedLocalAnalysisDisabled<T>(command);
  if (disabled) return Promise.resolve(disabled);

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), [bridgeScript(), command], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const fail = (message: string, status = 502): void => {
      const err = new Error(message) as AnalysisBridgeError;
      err.status = status;
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    };

    timer = setTimeout(() => {
      child.kill("SIGTERM");
      done(() => fail("Analysis timed out. Narrow the date range, use deterministic mode, or choose a faster AI model.", 504));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        done(() => fail("Analysis output was too large to return safely.", 502));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        done(() => fail("Analysis error output was too large to return safely.", 502));
      }
    });
    child.on("error", (err) => {
      done(() => fail(err.message, 502));
    });
    child.on("close", (code) => {
      if (settled) return;
      done(() => {
        const raw = stdout.trim();
        let parsed: unknown;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          fail(stderr.trim() || raw || "Analysis bridge returned invalid JSON.", 502);
          return;
        }
        if (code !== 0) {
          const payload = parsed as { error?: string };
          fail(payload.error || stderr.trim() || "Analysis bridge failed.", 502);
          return;
        }
        resolve(parsed as T);
      });
    });

    child.stdin.end(input ? JSON.stringify(input) : "");
  });
}
