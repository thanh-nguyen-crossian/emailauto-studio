#!/usr/bin/env python3
"""Local web UI for the EmailAuto analytics tool."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from agents.run_agent import run_analysis
from agents.analytics.data_reader import (
    MASTER_PLAN_PATH,
    read_analysis_timeline_bounds,
    workbook_sheet_catalog,
)

DOCS_DIR = ROOT / "docs"
REPORT_DIR = DOCS_DIR / "reports"
SOURCE_DIR = ROOT / "Source"
UI_FILE = DOCS_DIR / "email-analysis-tool.html"
RUN_LOCK = threading.Lock()


def _json_default(value):
    if isinstance(value, Path):
        return str(value)
    return str(value)


def _write_json(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    raw = json.dumps(payload, indent=2, default=_json_default).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def _safe_child(parent: Path, child: str) -> Path | None:
    target = (parent / unquote(child)).resolve()
    try:
        target.relative_to(parent.resolve())
    except ValueError:
        return None
    return target


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _list_reports() -> list[dict]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    summaries = sorted(REPORT_DIR.glob("*-summary.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    reports = []
    seen = set()

    for summary_path in summaries:
        summary = _read_json(summary_path)
        report_name = Path(str(summary.get("report_path") or "")).name
        if not report_name:
            report_name = summary_path.name.replace("-summary.json", "-email-report.html")
        report_path = REPORT_DIR / report_name
        seen.add(report_name)
        reports.append({
            "summary_file": summary_path.name,
            "report_file": report_name,
            "report_url": f"/reports/{report_name}",
            "created_at": summary_path.stat().st_mtime,
            "exists": report_path.exists(),
            "summary": summary,
        })

    for report_path in sorted(REPORT_DIR.glob("*.html"), key=lambda p: p.stat().st_mtime, reverse=True):
        if report_path.name in seen:
            continue
        reports.append({
            "summary_file": "",
            "report_file": report_path.name,
            "report_url": f"/reports/{report_path.name}",
            "created_at": report_path.stat().st_mtime,
            "exists": True,
            "summary": {},
        })

    return reports


def _source_status() -> dict:
    page_files = sorted(SOURCE_DIR.glob("Page performance *.csv"))
    failed_templates = sorted((SOURCE_DIR / "FailedEmailTemps").glob("*.eml"))
    win_templates = sorted((SOURCE_DIR / "WinEmailTemps").glob("*.eml"))

    keys = {
        "claude": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "gemini": bool(os.environ.get("GEMINI_API_KEY")),
        "openai": bool(os.environ.get("OPENAI_API_KEY")),
    }

    master_exists = MASTER_PLAN_PATH.exists()
    source_options = [
        {
            "key": "master_plan",
            "label": "RMKT Master Plan.xlsx",
            "exists": master_exists,
            "recommended": True,
            "description": "Canonical workbook source.",
        },
        {
            "key": "page_performance",
            "label": "Page performance CSVs",
            "exists": bool(page_files),
            "recommended": False,
            "description": "Optional landing-page/product signal.",
        },
        {
            "key": "template_examples",
            "label": "Win/failed email templates",
            "exists": bool(failed_templates or win_templates),
            "recommended": False,
            "description": "Optional creative context.",
        },
    ]

    return {
        "source_dir": str(SOURCE_DIR),
        "source_options": source_options,
        "required_files": [{"name": MASTER_PLAN_PATH.name, "exists": master_exists}],
        "workbook_sheets": workbook_sheet_catalog() if master_exists else [],
        "timeline_bounds": read_analysis_timeline_bounds() if master_exists else {},
        "page_performance_months": [
            path.stem.replace("Page performance ", "")
            for path in page_files
        ],
        "page_performance_count": len(page_files),
        "failed_template_count": len(failed_templates),
        "win_template_count": len(win_templates),
        "reports": _list_reports()[:12],
        "default_provider": os.environ.get("AI_PROVIDER", "claude"),
        "default_model": os.environ.get("AI_MODEL", ""),
        "api_keys_configured": keys,
    }


class EmailAnalysisHandler(BaseHTTPRequestHandler):
    server_version = "EmailAutoAnalysisUI/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[email-ui] " + fmt % args + "\n")

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in {"/", "/analysis", "/email-analysis-tool.html"}:
            self._serve_file(UI_FILE)
            return
        if path == "/api/status":
            _write_json(self, _source_status())
            return
        if path == "/api/reports":
            _write_json(self, {"reports": _list_reports()})
            return
        if path.startswith("/reports/"):
            target = _safe_child(REPORT_DIR, path.removeprefix("/reports/"))
            if target and target.exists() and target.is_file():
                self._serve_file(target)
                return
            self.send_error(404, "Report not found")
            return
        if path.startswith("/docs/"):
            target = _safe_child(DOCS_DIR, path.removeprefix("/docs/"))
            if target and target.exists() and target.is_file():
                self._serve_file(target)
                return
            self.send_error(404, "Document not found")
            return
        self.send_error(404, "Not found")

    def do_HEAD(self) -> None:
        path = urlparse(self.path).path
        if path in {"/", "/analysis", "/email-analysis-tool.html"}:
            self._serve_file(UI_FILE, send_body=False)
            return
        if path in {"/api/status", "/api/reports"}:
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path.startswith("/reports/"):
            target = _safe_child(REPORT_DIR, path.removeprefix("/reports/"))
            if target and target.exists() and target.is_file():
                self._serve_file(target, send_body=False)
                return
            self.send_error(404, "Report not found")
            return
        if path.startswith("/docs/"):
            target = _safe_child(DOCS_DIR, path.removeprefix("/docs/"))
            if target and target.exists() and target.is_file():
                self._serve_file(target, send_body=False)
                return
            self.send_error(404, "Document not found")
            return
        self.send_error(404, "Not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/run":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            _write_json(self, {"error": "Invalid JSON payload."}, status=400)
            return

        mode = str(payload.get("mode") or "deterministic").lower()
        provider = str(payload.get("provider") or "").lower() or None
        model = str(payload.get("model") or "").strip() or None
        sources = payload.get("sources") or ["master_plan"]
        sheets = payload.get("sheets") or []
        timeline = payload.get("timeline") or {}
        start_month = str(timeline.get("start_month") or "").strip() or None
        end_month = str(timeline.get("end_month") or "").strip() or None
        use_ai = mode == "ai"

        if use_ai and provider not in {"claude", "gemini", "openai"}:
            _write_json(self, {"error": "Provider must be claude, gemini, or openai."}, status=400)
            return
        if not isinstance(sources, list) or not all(isinstance(item, str) for item in sources):
            _write_json(self, {"error": "Sources must be a list of source keys."}, status=400)
            return
        if not isinstance(sheets, list) or not all(isinstance(item, str) for item in sheets):
            _write_json(self, {"error": "Sheets must be a list of workbook sheet names."}, status=400)
            return

        if not RUN_LOCK.acquire(blocking=False):
            _write_json(self, {"error": "An analysis run is already in progress."}, status=409)
            return

        try:
            summary = run_analysis(
                use_ai=use_ai,
                provider=provider,
                model=model,
                selected_sources=sources,
                selected_sheets=sheets,
                start_month=start_month,
                end_month=end_month,
                quiet=True,
            )
            _write_json(self, {
                "ok": True,
                "summary": summary,
                "reports": _list_reports()[:12],
            })
        except Exception as exc:
            _write_json(self, {
                "ok": False,
                "error": str(exc),
                "trace": traceback.format_exc(limit=4),
            }, status=500)
        finally:
            RUN_LOCK.release()

    def _serve_file(self, path: Path, *, send_body: bool = True) -> None:
        try:
            raw = path.read_bytes()
        except OSError:
            self.send_error(404, "File not found")
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif path.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"
        elif path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if send_body:
            self.wfile.write(raw)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Serve the EmailAuto analysis UI.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind. Default: 127.0.0.1")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind. Default: 8765")
    args = parser.parse_args(argv)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), EmailAnalysisHandler)
    print(f"EmailAuto analysis UI: http://{args.host}:{args.port}/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
