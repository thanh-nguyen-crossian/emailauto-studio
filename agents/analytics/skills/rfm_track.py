"""
rfm_track — Computes week-over-week RFM segment migration and health score.

Inputs:
  - current_snapshot: dict with segment counts for current week
  - prior_snapshot:   dict with segment counts for prior week

Outputs:
  - migration report dict (see rfm_track.md for schema)
"""

import json
from pathlib import Path
from typing import Any


SEGMENT_LTV = {
    "Champions": 134.58,
    "At Risk": 80.03,
    "Loyal": 78.55,
    "Lost Champions": 68.65,
    "Potential Loyalists": 54.45,
    "Need Attention": 52.24,
    "New Customers": 56.42,
    "Lost": 50.97,
}

MIGRATION_SEVERITY = {
    ("Champions", "At Risk"): "CRITICAL",
    ("Champions", "Need Attention"): "CRITICAL",
    ("Loyal", "At Risk"): "HIGH",
    ("At Risk", "Lost Champions"): "HIGH",
    ("At Risk", "Lost"): "CRITICAL",
    ("Potential Loyalists", "Need Attention"): "MEDIUM",
    ("Loyal", "Need Attention"): "MEDIUM",
}

MIGRATION_RECOMMENDATIONS = {
    ("Champions", "At Risk"): "Send within 48hrs: personal trigger email (birthday, back-in-stock, or F-code offer for GentsLux)",
    ("Loyal", "At Risk"): "Activate loyalty milestone or anniversary flow if eligible; otherwise send to high-value segment",
    ("At Risk", "Lost Champions"): "Enroll in winback flow (60-day sequence); exclude from regular weekly campaigns",
    ("At Risk", "Lost"): "Winback flow final attempt; if no response, suppress for 90 days",
    ("Potential Loyalists", "Need Attention"): "Send 3rd-order milestone or 'we miss you' email; offer low-friction reengagement",
}


def _infer_migrations(curr: dict[str, int], prev: dict[str, int]) -> list[dict[str, Any]]:
    """
    Infer segment migrations from count deltas.
    Segments losing customers are matched to segments gaining customers
    proportionally by LTV proximity (customers likely move to adjacent LTV tiers).
    """
    gains: dict[str, int] = {}
    losses: dict[str, int] = {}

    for seg in SEGMENT_LTV:
        delta = curr.get(seg, 0) - prev.get(seg, 0)
        if delta > 0:
            gains[seg] = delta
        elif delta < 0:
            losses[seg] = abs(delta)

    migrations = []
    for from_seg, lost_count in sorted(losses.items(), key=lambda x: -SEGMENT_LTV.get(x[0], 0)):
        for to_seg, gained_count in sorted(gains.items(), key=lambda x: SEGMENT_LTV.get(x[0], 0)):
            estimated = min(lost_count, gained_count)
            if estimated == 0:
                continue
            from_ltv = SEGMENT_LTV.get(from_seg, 0)
            to_ltv = SEGMENT_LTV.get(to_seg, 0)
            if from_ltv <= to_ltv:
                continue  # only downward migrations are risks
            severity = MIGRATION_SEVERITY.get(
                (from_seg, to_seg),
                "HIGH" if from_ltv - to_ltv > 30 else "MEDIUM" if from_ltv - to_ltv > 10 else "LOW",
            )
            recommendation = MIGRATION_RECOMMENDATIONS.get(
                (from_seg, to_seg),
                f"Monitor {from_seg} → {to_seg} migration; consider re-engagement campaign within 14 days",
            )
            migrations.append({
                "from_segment": from_seg,
                "to_segment": to_seg,
                "estimated_customers": estimated,
                "ltv_at_risk": round(estimated * (from_ltv - to_ltv), 2),
                "severity": severity,
                "trigger_recommendation": recommendation,
            })
    return sorted(migrations, key=lambda m: ["CRITICAL", "HIGH", "MEDIUM", "LOW"].index(m["severity"]))


def _health_score(deltas: dict[str, dict], migrations: list[dict]) -> int:
    score = 100
    for m in migrations:
        if m["severity"] == "CRITICAL":
            score -= 15
        elif m["severity"] in ("HIGH", "MEDIUM"):
            score -= 5
    for seg, data in deltas.items():
        if seg in ("Champions", "Loyal") and data["delta_pct"] > 1.0:
            score += 3
    return max(0, min(100, score))


def compute_migration(current_snapshot: dict, prior_snapshot: dict) -> dict[str, Any]:
    curr_segs = current_snapshot["segments"]
    prev_segs = prior_snapshot["segments"]
    week_ending = current_snapshot["snapshot_date"]
    brand = current_snapshot.get("brand", "unknown")

    deltas: dict[str, dict] = {}
    for seg in SEGMENT_LTV:
        curr_val = curr_segs.get(seg, 0)
        prev_val = prev_segs.get(seg, 0)
        delta = curr_val - prev_val
        delta_pct = round((delta / prev_val * 100), 2) if prev_val > 0 else 0.0
        deltas[seg] = {"prev": prev_val, "curr": curr_val, "delta": delta, "delta_pct": delta_pct}

    migrations = _infer_migrations(curr_segs, prev_segs)
    score = _health_score(deltas, migrations)

    return {
        "week_ending": week_ending,
        "brand": brand,
        "migrations": migrations,
        "segment_deltas": deltas,
        "health_score": score,
    }


def run(
    current_path: str | Path,
    prior_path: str | Path,
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    current = json.loads(Path(current_path).read_text())
    prior = json.loads(Path(prior_path).read_text())
    result = compute_migration(current, prior)
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: rfm_track.py <current_snapshot.json> <prior_snapshot.json> [output.json]")
        sys.exit(1)
    result = run(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print(json.dumps(result, indent=2))
