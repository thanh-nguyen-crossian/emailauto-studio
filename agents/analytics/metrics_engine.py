import statistics

BRAND_BENCHMARKS = {
    "bragoddess": {
        "best_content_type": "Tips & Education",
        "best_cbh_1k": 8.25,
        "overused_type": "Sale/Promotion",
        "overused_cbh_1k": 6.78,
    },
    "gentslux": {
        "best_content_type": "Customer Reviews",
        "best_cbh_1k": 9.51,
        "overused_type": "Sale/Promotion",
        "overused_cbh_1k": 6.68,
    },
    "luxfitting": {
        "best_content_type": "Birthday/Occasion",
        "best_cbh_1k": 5.95,
        "overused_type": "Tips & Education",
        "overused_cbh_1k": 4.09,
    },
    "santafare": {
        "best_content_type": "Gift Guide",
        "best_cbh_1k": 5.18,
        "overused_type": "Sale/Promotion",
        "overused_cbh_1k": 3.21,
    },
}


def detect_anomalies(brands: dict) -> list[dict]:
    """Return a list of anomaly dicts for all brands.

    Each anomaly has: brand, metric, severity ("high"|"medium"), and
    metric-specific fields for the analyst to explain.
    """
    anomalies = []

    for brand, data in brands.items():
        monthly = data.get("monthly", [])

        # --- CBH monthly pace check ---
        target = data.get("target", {})
        ytd = float(target.get("ytd_2026") or 0)
        required_monthly = float(target.get("required_monthly") or 0)
        if required_monthly > 0 and ytd > 0:
            months_2026 = [m for m in monthly if str(m.get("year", "")) == "2026"]
            months_elapsed = len(months_2026)
            if months_elapsed > 0:
                monthly_pace = ytd / months_elapsed
                if monthly_pace < required_monthly * 0.8:
                    anomalies.append({
                        "brand": brand,
                        "metric": "cbh_monthly_pace",
                        "current": round(monthly_pace, 0),
                        "required": round(required_monthly, 0),
                        "gap_pct": round((monthly_pace - required_monthly) / required_monthly * 100, 1),
                        "severity": "high",
                    })

        # --- Optout rate spike check ---
        if len(monthly) >= 5:
            optout_history = [float(m.get("optout_rate") or 0) for m in monthly[:-1]]
            current_optout = float(monthly[-1].get("optout_rate") or 0)
            window = optout_history[-8:] if len(optout_history) >= 8 else optout_history
            if window and current_optout > 0:
                baseline = statistics.mean(window)
                if baseline > 0 and current_optout > baseline * 1.5:
                    anomalies.append({
                        "brand": brand,
                        "metric": "optout_rate",
                        "current_pct": round(current_optout * 100, 3),
                        "baseline_pct": round(baseline * 100, 3),
                        "severity": "high" if current_optout > baseline * 2 else "medium",
                    })

        # --- Content type mismatch ---
        benchmarks = BRAND_BENCHMARKS.get(brand, {})
        best_type = benchmarks.get("best_content_type", "")
        overused_type = benchmarks.get("overused_type", "")
        content_types = data.get("content_types", [])
        if content_types and best_type and overused_type:
            best = next((ct for ct in content_types if ct.get("type") == best_type), None)
            overused = next((ct for ct in content_types if ct.get("type") == overused_type), None)
            if best and overused:
                best_sends = int(best.get("n_sends") or 0)
                overused_sends = int(overused.get("n_sends") or 0)
                total = best_sends + overused_sends
                if total > 0 and best_sends / total < 0.2:
                    anomalies.append({
                        "brand": brand,
                        "metric": "content_type_mismatch",
                        "best_type": best_type,
                        "best_cbh_1k": float(best.get("avg_cbh_1k") or 0),
                        "best_sends": best_sends,
                        "overused_type": overused_type,
                        "overused_cbh_1k": float(overused.get("avg_cbh_1k") or 0),
                        "overused_sends": overused_sends,
                        "severity": "medium",
                    })

        # --- F-segment share ---
        segments = data.get("segments", [])
        if segments:
            f_sends = sum(
                int(s.get("n_sends") or 0)
                for s in segments
                if "F" in str(s.get("segment", ""))
            )
            total_sends = sum(int(s.get("n_sends") or 0) for s in segments)
            if total_sends > 0 and f_sends / total_sends > 0.15:
                anomalies.append({
                    "brand": brand,
                    "metric": "f_segment_share",
                    "f_sends": f_sends,
                    "total_sends": total_sends,
                    "f_share_pct": round(f_sends / total_sends * 100, 1),
                    "severity": "medium",
                })

    return anomalies
