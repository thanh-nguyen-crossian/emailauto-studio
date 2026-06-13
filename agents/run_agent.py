#!/usr/bin/env python3
"""Email Analytics Agent — CLI entry point.

Usage:
  .venv/bin/python3 agents/run_agent.py
  .venv/bin/python3 agents/run_agent.py --brand bragoddess
"""
import json
import sys
import argparse
import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from agents.analytics.data_reader import build_metrics
from agents.analytics.metrics_engine import detect_anomalies
from agents.analytics.campaign_ops import build_campaign_ops_plan
from agents.analytics.solution_engine import build_solution_plan
from agents.analytics.analyst import analyze, build_deterministic_analysis
from agents.analytics.report_generator import generate_report


@contextmanager
def _temporary_ai_env(provider: str | None = None, model: str | None = None):
    previous = {
        "AI_PROVIDER": os.environ.get("AI_PROVIDER"),
        "AI_MODEL": os.environ.get("AI_MODEL"),
    }
    try:
        if provider:
            os.environ["AI_PROVIDER"] = provider
        if model:
            os.environ["AI_MODEL"] = model
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _print(enabled: bool, message: str = "") -> None:
    if enabled:
        print(message)


def run_analysis(
    *,
    use_ai: bool = True,
    provider: str | None = None,
    model: str | None = None,
    selected_sources: list[str] | None = None,
    selected_sheets: list[str] | None = None,
    start_month: str | None = None,
    end_month: str | None = None,
    quiet: bool = False,
) -> dict:
    should_print = not quiet
    _print(should_print, "📊 EmailAuto Analytics Agent")
    _print(should_print, "─" * 40)

    _print(should_print, "  [1/4] Reading source data...")
    metrics = build_metrics(
        selected_sources=selected_sources,
        selected_sheets=selected_sheets,
        start_month=start_month,
        end_month=end_month,
    )
    total_sends = sum(len(d["sends"]) for d in metrics["brands"].values())
    _print(should_print, f"        {total_sends} sends loaded across 4 brands")
    if start_month or end_month:
        _print(should_print, f"        Timeline: {start_month or 'start'} to {end_month or 'latest'}")

    _print(should_print, "  [2/4] Detecting anomalies...")
    metrics["anomalies"] = detect_anomalies(metrics["brands"])
    metrics["campaign_ops"] = build_campaign_ops_plan(metrics)
    metrics["solutions"] = build_solution_plan(metrics)
    high = sum(1 for a in metrics["anomalies"] if a["severity"] == "high")
    medium = sum(1 for a in metrics["anomalies"] if a["severity"] == "medium")
    _print(should_print, f"        {high} high, {medium} medium anomalies found")
    _print(should_print, f"        {len(metrics['solutions'].get('solutions', []))} solution experiments generated")

    ai_error = ""
    ai_status = "deterministic"
    if use_ai:
        selected_provider = provider or os.environ.get("AI_PROVIDER", "claude")
        _print(should_print, f"  [3/4] Calling {selected_provider} API for analysis...")
        try:
            with _temporary_ai_env(provider, model):
                analysis = analyze(metrics)
            ai_status = selected_provider
            _print(should_print, f"        {len(analysis.get('recommendations', []))} recommendations generated")
        except Exception as exc:  # UI/CLI should still produce a usable report.
            ai_error = str(exc)
            analysis = build_deterministic_analysis(metrics, note=ai_error)
            ai_status = "deterministic_fallback"
            _print(should_print, f"        AI unavailable; using deterministic fallback ({ai_error[:90]})")
    else:
        _print(should_print, "  [3/4] Building deterministic analysis...")
        analysis = build_deterministic_analysis(metrics)
        _print(should_print, f"        {len(analysis.get('recommendations', []))} recommendations generated")

    _print(should_print, "  [4/4] Generating HTML report...")
    today = datetime.now().strftime("%Y-%m-%d")
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    report_dir = ROOT / "docs" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"{stamp}-email-report.html"
    generate_report(metrics, analysis, report_path)
    _print(should_print, f"        Saved: {report_path.relative_to(ROOT)}")

    # Build Gmail summary (read by the skill's Gmail MCP step)
    bg_target = metrics["brands"]["bragoddess"]["target"]
    ytd = float(bg_target.get("ytd_2026") or 0)
    target_val = float(bg_target.get("target_2026") or 0)
    pace_pct = f"{round(ytd / target_val * 100)}%" if target_val else "N/A"

    summary = {
        "report_path": str(report_path),
        "report_date": today,
        "executive_summary": analysis.get("executive_summary", []),
        "top_recommendations": analysis.get("recommendations", [])[:3],
        "solution_priorities": metrics.get("solutions", {}).get("portfolio_priorities", []),
        "solutions": metrics.get("solutions", {}).get("solutions", [])[:8],
        "campaign_ops": metrics.get("campaign_ops", {}),
        "anomaly_count": len(metrics["anomalies"]),
        "high_severity_count": high,
        "bg_pace_pct": pace_pct,
        "ai_status": ai_status,
        "ai_error": ai_error,
        "total_sends": total_sends,
        "report_url": f"/reports/{report_path.name}",
        "analysis_scope": metrics.get("analysis_scope", {}),
    }
    summary_path = report_dir / f"{stamp}-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))

    _print(should_print)
    _print(should_print, "✅ Done!")
    _print(should_print, f"   Report:  {report_path.relative_to(ROOT)}")
    _print(should_print, f"   BG pace: {pace_pct} of 2026 target")
    _print(should_print, f"   Anomalies: {len(metrics['anomalies'])} ({high} high)")
    _print(should_print)
    _print(should_print, "Next step: review the generated report and convert approved actions into briefs.")

    return summary


def main(argv: list[str] | None = None) -> dict:
    parser = argparse.ArgumentParser(description="Run the EmailAuto analytics agent.")
    parser.add_argument("--no-ai", action="store_true", help="Skip external AI and use deterministic local analysis.")
    parser.add_argument("--provider", choices=["claude", "gemini", "openai"], help="AI provider override.")
    parser.add_argument("--model", help="AI model override for the selected provider.")
    parser.add_argument("--source", action="append", dest="sources", help="Source key to include. Repeatable.")
    parser.add_argument("--sheet", action="append", dest="sheets", help="RMKT workbook sheet to include as context. Repeatable.")
    parser.add_argument("--start", dest="start_month", help="Start month in YYYY-MM format.")
    parser.add_argument("--end", dest="end_month", help="End month in YYYY-MM format.")
    args = parser.parse_args(argv)
    return run_analysis(
        use_ai=not args.no_ai,
        provider=args.provider,
        model=args.model,
        selected_sources=args.sources,
        selected_sheets=args.sheets,
        start_month=args.start_month,
        end_month=args.end_month,
    )


if __name__ == "__main__":
    main()
