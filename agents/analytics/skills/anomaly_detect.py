"""
anomaly_detect — Flags metric deviations >2σ from a brand's 4-week rolling baseline.

Inputs:
  - current_report: dict output from kpi_compute.build_report()
  - baseline_reports: list of up to 4 prior weekly report dicts (oldest first)

Outputs:
  - anomaly report dict (see anomaly_detect.md for schema)
"""

import json
from pathlib import Path
from typing import Any

import numpy as np


SIGMA_THRESHOLD = 2.0
SPARSE_SIGMA_THRESHOLD = 1.5  # used when < 4 weeks of history
MIN_HISTORY_WEEKS = 4

METRICS = ["cbh_delivered", "access_delivered", "optout_rate", "spam_rate"]

SEVERITY_CRITICAL = "CRITICAL"
SEVERITY_WARNING = "WARNING"
SEVERITY_INFO = "INFO"

BRAND_HEALTH_ORDER = [SEVERITY_CRITICAL, SEVERITY_WARNING, SEVERITY_INFO, "healthy"]


def _load_report(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def _extract_brand_metric_series(reports: list[dict], brand: str, metric: str) -> list[float]:
    values = []
    for report in reports:
        brand_data = report.get("brands", {}).get(brand, {})
        for send in brand_data.get("sends", []):
            if not send.get("yahoo_flag") and send.get(metric) is not None:
                values.append(send[metric])
    return values


def _detect_duplicate_send_type(sends: list[dict]) -> list[dict]:
    """Flag sends of the same content category within 14 days."""
    import re
    from datetime import datetime, timedelta

    TYPE_PATTERNS = [
        (r"birthday|b-day|bday", "birthday"),
        (r"year.?end|year.?in.?review", "year_end"),
        (r"winter 20\d\d", "seasonal_winter"),
        (r"easter", "seasonal_easter"),
        (r"black.?friday", "seasonal_bfriday"),
    ]

    flags = []
    typed_sends = []
    for send in sends:
        name_lower = send["campaign"].lower()
        matched_type = None
        for pattern, label in TYPE_PATTERNS:
            if re.search(pattern, name_lower):
                matched_type = label
                break
        if matched_type:
            typed_sends.append((send["date"], matched_type, send["campaign"]))

    for i, (date_a, type_a, name_a) in enumerate(typed_sends):
        for date_b, type_b, name_b in typed_sends[i + 1:]:
            if type_a == type_b:
                delta = abs((
                    __import__("datetime").date.fromisoformat(date_b) -
                    __import__("datetime").date.fromisoformat(date_a)
                ).days)
                if delta <= 14:
                    flags.append({
                        "type": type_a,
                        "sends": [name_a, name_b],
                        "days_apart": delta,
                    })
    return flags


def _classify_cause(brand: str, metric: str, z_score: float, send: dict) -> tuple[str, str]:
    if send.get("yahoo_flag"):
        return (
            "+Yahoo segment appended; CBH suppression expected (40-60% below core baseline)",
            "Exclude +Yahoo from this metric's baseline. Only use for proven major sale events.",
        )
    name_lower = send["campaign"].lower()
    if "year" in name_lower and ("end" in name_lower or "review" in name_lower):
        return (
            "Year-end reflective content has no purchase trigger; historically weakest content type across all brands",
            "Replace with 'New Year Preview' or curated bestsellers with forward-looking offer.",
        )
    if brand == "SantaFare" and metric == "cbh_delivered":
        return (
            "SantaFare off-season send; product category has no seasonal relevance outside Nov–Jan",
            "Consider pausing SantaFare sends Mar–Oct or routing customers to their 2nd-most-purchased brand.",
        )
    return (
        f"Metric below {abs(z_score):.1f}σ threshold; investigate list segment quality and content relevance",
        "Review segmentation, subject line, and body copy for this send. Compare to top performer from same month.",
    )


def detect_anomalies(
    current_report: dict,
    baseline_reports: list[dict],
) -> dict[str, Any]:
    week_ending = current_report["week_ending"]
    anomalies = []
    brand_health: dict[str, str] = {}
    sparse = len(baseline_reports) < MIN_HISTORY_WEEKS
    threshold = SPARSE_SIGMA_THRESHOLD if sparse else SIGMA_THRESHOLD

    for brand, brand_data in current_report["brands"].items():
        sends = brand_data.get("sends", [])
        worst_severity = "healthy"

        # Duplicate send type check
        dup_flags = _detect_duplicate_send_type(sends)
        for dup in dup_flags:
            anomalies.append({
                "brand": brand,
                "metric": "send_frequency",
                "campaign": " + ".join(dup["sends"]),
                "current_value": dup["days_apart"],
                "baseline_mean": 14,
                "baseline_std": 0,
                "z_score": None,
                "severity": SEVERITY_WARNING,
                "likely_cause": f"Two '{dup['type']}' sends {dup['days_apart']} days apart; 2nd send typically suppressed 40-84%",
                "recommended_action": "Space same-type sends >14 days apart. Do not repeat identical content type within 2 weeks.",
            })
            if BRAND_HEALTH_ORDER.index(SEVERITY_WARNING) < BRAND_HEALTH_ORDER.index(worst_severity):
                worst_severity = SEVERITY_WARNING

        for metric in METRICS:
            baseline_series = _extract_brand_metric_series(baseline_reports, brand, metric)
            if len(baseline_series) < 2:
                continue
            baseline_mean = float(np.mean(baseline_series))
            baseline_std = float(np.std(baseline_series))
            if baseline_std == 0:
                continue

            for send in sends:
                val = send.get(metric)
                if val is None:
                    continue
                z = (val - baseline_mean) / baseline_std
                if abs(z) < threshold:
                    continue

                severity = SEVERITY_CRITICAL if abs(z) >= 3.0 else SEVERITY_WARNING if abs(z) >= 2.0 else SEVERITY_INFO
                if brand == "SantaFare" and val < 0.0010 and metric == "cbh_delivered":
                    severity = SEVERITY_CRITICAL

                cause, action = _classify_cause(brand, metric, z, send)
                anomalies.append({
                    "brand": brand,
                    "metric": metric,
                    "campaign": send["campaign"],
                    "current_value": round(val, 4),
                    "baseline_mean": round(baseline_mean, 4),
                    "baseline_std": round(baseline_std, 4),
                    "z_score": round(z, 2),
                    "severity": severity,
                    "likely_cause": cause,
                    "recommended_action": action,
                })
                if BRAND_HEALTH_ORDER.index(severity) < BRAND_HEALTH_ORDER.index(worst_severity):
                    worst_severity = severity

        brand_health[brand] = worst_severity

    anomalies.sort(key=lambda a: BRAND_HEALTH_ORDER.index(a["severity"]))
    return {"week_ending": week_ending, "anomalies": anomalies, "brand_health": brand_health}


def run(
    current_path: str | Path,
    baseline_paths: list[str | Path],
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    current = _load_report(current_path)
    baselines = [_load_report(p) for p in baseline_paths]
    result = detect_anomalies(current, baselines)
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: anomaly_detect.py <current.json> <baseline1.json> [baseline2.json ...] [--out output.json]")
        sys.exit(1)
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        idx = args.index("--out")
        out = args[idx + 1]
        args = args[:idx]
    result = run(args[0], args[1:], out)
    print(json.dumps(result, indent=2))
