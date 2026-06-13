#!/usr/bin/env python3
"""JSON bridge used by the Next.js app to call the EmailAuto analysis layer."""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

VALID_PROVIDERS = {"claude", "gemini", "openai"}
VALID_SOURCES = {"master_plan", "page_performance", "template_examples"}
SOURCE_DIR = ROOT / "Source"
REPORT_DIR = ROOT / "docs" / "reports"


def _emit(payload: dict[str, Any], status: int = 0) -> int:
    print(json.dumps(payload, default=str))
    return status


def _payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Payload must be a JSON object.")
    return data


def _str_list(value: Any, *, fallback: list[str] | None = None) -> list[str]:
    if value is None:
        return list(fallback or [])
    if not isinstance(value, list):
        raise ValueError("Expected a list of strings.")
    return [str(item).strip() for item in value if str(item).strip()]


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _list_reports() -> list[dict[str, Any]]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    summaries = sorted(REPORT_DIR.glob("*-summary.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    reports: list[dict[str, Any]] = []
    seen: set[str] = set()
    for summary_path in summaries:
        summary = _read_json(summary_path)
        report_name = Path(str(summary.get("report_path") or "")).name or summary_path.name.replace("-summary.json", "-email-report.html")
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


def _dependency_error(exc: ModuleNotFoundError) -> str:
    return f"Missing Python dependency '{exc.name}'. Run: python3 -m pip install -r requirements.txt"


def _source_status() -> dict[str, Any]:
    page_files = sorted(SOURCE_DIR.glob("Page performance *.csv"))
    failed_templates = sorted((SOURCE_DIR / "FailedEmailTemps").glob("*.eml"))
    win_templates = sorted((SOURCE_DIR / "WinEmailTemps").glob("*.eml"))
    master_path = SOURCE_DIR / "RMKT Master Plan.xlsx"
    dependency_error = ""
    workbook_sheets: list[dict[str, Any]] = []
    timeline_bounds: dict[str, Any] = {}
    try:
        from agents.analytics.data_reader import MASTER_PLAN_PATH, read_analysis_timeline_bounds, workbook_sheet_catalog

        master_path = MASTER_PLAN_PATH
        if master_path.exists():
            workbook_sheets = workbook_sheet_catalog()
            timeline_bounds = read_analysis_timeline_bounds()
    except ModuleNotFoundError as exc:
        dependency_error = _dependency_error(exc)

    return {
        "ok": not dependency_error,
        "dependency_error": dependency_error,
        "source_dir": str(SOURCE_DIR),
        "source_options": [
            {
                "key": "master_plan",
                "label": "RMKT Master Plan.xlsx",
                "exists": master_path.exists(),
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
        ],
        "required_files": [{"name": master_path.name, "exists": master_path.exists()}],
        "workbook_sheets": workbook_sheets,
        "timeline_bounds": timeline_bounds,
        "page_performance_months": [path.stem.replace("Page performance ", "") for path in page_files],
        "page_performance_count": len(page_files),
        "failed_template_count": len(failed_templates),
        "win_template_count": len(win_templates),
        "reports": _list_reports()[:12],
        "default_provider": os.environ.get("AI_PROVIDER", "claude"),
        "default_model": os.environ.get("AI_MODEL", ""),
        "api_keys_configured": {
            "claude": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "gemini": bool(os.environ.get("GEMINI_API_KEY")),
            "openai": bool(os.environ.get("OPENAI_API_KEY")),
        },
    }


def _run() -> dict[str, Any]:
    from agents.run_agent import run_analysis

    payload = _payload()
    mode = str(payload.get("mode") or "deterministic").strip().lower()
    use_ai = mode == "ai"
    provider = str(payload.get("provider") or "").strip().lower() or None
    model = str(payload.get("model") or "").strip() or None
    sources = _str_list(payload.get("sources"), fallback=["master_plan"])
    sheets = _str_list(payload.get("sheets"), fallback=[])
    timeline = payload.get("timeline") if isinstance(payload.get("timeline"), dict) else {}
    start_month = str(timeline.get("start_month") or "").strip() or None
    end_month = str(timeline.get("end_month") or "").strip() or None

    if "master_plan" not in sources:
        sources.insert(0, "master_plan")
    invalid_sources = [source for source in sources if source not in VALID_SOURCES]
    if invalid_sources:
        raise ValueError(f"Unknown analysis source(s): {', '.join(invalid_sources)}")
    if use_ai and provider not in VALID_PROVIDERS:
        raise ValueError("Provider must be claude, gemini, or openai when AI mode is selected.")

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
    return {"ok": True, "summary": summary, "reports": _list_reports()[:12]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EmailStudio analysis JSON bridge.")
    parser.add_argument("command", choices=["status", "reports", "run"])
    args = parser.parse_args(argv)

    try:
        if args.command == "status":
            return _emit(_source_status())
        if args.command == "reports":
            return _emit({"reports": _list_reports()})
        return _emit(_run())
    except Exception as exc:
        return _emit(
            {
                "ok": False,
                "error": str(exc),
                "trace": traceback.format_exc(limit=4),
            },
            status=1,
        )


if __name__ == "__main__":
    raise SystemExit(main())
