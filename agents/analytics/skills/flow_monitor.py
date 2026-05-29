"""
flow_monitor — Computes Welcome and Winback flow health metrics.

Detects:
  - MPP stop-condition suppression in Welcome flow
  - Winback/campaign overlap (customers receiving both simultaneously)
  - Flow completion rates vs. healthy thresholds

Inputs: flow step export CSVs from SendGrid
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd


MPP_RATE = 0.49  # estimated Apple Mail MPP fraction of subscriber base


@dataclass
class FlowThresholds:
    email2_reach_warning: float = 0.45
    email2_reach_critical: float = 0.30
    completion_warning: float = 0.20
    completion_critical: float = 0.12
    reengagement_warning: float = 0.10
    reengagement_critical: float = 0.05
    overlap_warning: float = 0.01
    overlap_critical: float = 0.10


THRESHOLDS = FlowThresholds()


def _status(value: float, warning: float, critical: float, higher_is_better: bool = True) -> str:
    if higher_is_better:
        if value >= warning:
            return "healthy"
        if value >= critical:
            return "WARNING"
        return "CRITICAL"
    else:
        if value <= warning:
            return "healthy"
        if value <= critical:
            return "WARNING"
        return "CRITICAL"


def analyze_welcome_flow(df: pd.DataFrame) -> dict[str, Any]:
    """
    df columns: customer_id, email_step (1/2/3), opened, clicked, purchased, received
    """
    total_enrolled = df[df["email_step"] == 1]["customer_id"].nunique()
    if total_enrolled == 0:
        return {"error": "No Welcome flow data"}

    e1 = df[df["email_step"] == 1]
    e2 = df[df["email_step"] == 2]
    e3 = df[df["email_step"] == 3]

    e1_opens = e1["opened"].sum()
    e1_clicks = e1["clicked"].sum()
    e2_received = e2["customer_id"].nunique()
    e3_received = e3["customer_id"].nunique()

    completed = df[df["clicked"] | df["purchased"]]["customer_id"].nunique()

    email1_open_rate = round(e1_opens / total_enrolled, 4)
    email1_click_rate = round(e1_clicks / total_enrolled, 4)
    email2_reach_rate = round(e2_received / total_enrolled, 4)
    email3_reach_rate = round(e3_received / total_enrolled, 4)
    completion_rate = round(completed / total_enrolled, 4)

    # If email2_reach is much lower than (1 - click_rate), MPP is likely stopping the flow
    expected_e2_reach = 1.0 - email1_click_rate
    mpp_gap = max(0, expected_e2_reach - email2_reach_rate)
    mpp_suppression_est = round(min(mpp_gap, MPP_RATE), 4)

    e2_status = _status(email2_reach_rate, THRESHOLDS.email2_reach_warning, THRESHOLDS.email2_reach_critical)
    comp_status = _status(completion_rate, THRESHOLDS.completion_warning, THRESHOLDS.completion_critical)

    broken = email2_reach_rate < (expected_e2_reach - 0.10)
    status_msg = (
        "BROKEN — stop condition likely firing on MPP open (Apple bot triggers 'opened' for ~49% of subscribers)"
        if broken else comp_status
    )
    fix = (
        "Change Email 1 stop condition from 'on open' to 'on click OR purchase' in SendGrid flow editor. "
        "Expected impact: ~49% more subscribers reach Email 2, roughly doubling welcome flow revenue."
        if broken else None
    )

    return {
        "email1_open_rate": email1_open_rate,
        "email1_click_rate": email1_click_rate,
        "email2_reach_rate": email2_reach_rate,
        "email3_reach_rate": email3_reach_rate,
        "flow_completion_rate": completion_rate,
        "mpp_suppression_estimate": mpp_suppression_est,
        "email2_status": e2_status,
        "completion_status": comp_status,
        "status": status_msg,
        "fix_required": fix,
    }


def analyze_winback_flow(
    winback_df: pd.DataFrame,
    campaign_df: pd.DataFrame,
) -> dict[str, Any]:
    """
    winback_df: columns customer_id, day_in_flow, clicked, purchased
    campaign_df: columns customer_id, send_date (customers who received a campaign this week)
    """
    active = set(winback_df["customer_id"].unique())
    campaign_recipients = set(campaign_df["customer_id"].unique())

    overlap = active & campaign_recipients
    overlap_rate = round(len(overlap) / len(active), 4) if active else 0.0

    reengaged = winback_df[winback_df["clicked"] | winback_df["purchased"]]["customer_id"].nunique()
    reengagement_rate = round(reengaged / len(active), 4) if active else 0.0

    overlap_status = _status(overlap_rate, THRESHOLDS.overlap_warning, THRESHOLDS.overlap_critical, higher_is_better=False)
    reengagement_status = _status(reengagement_rate, THRESHOLDS.reengagement_warning, THRESHOLDS.reengagement_critical)

    overlap_fix = (
        "Add suppression rule in SendGrid: customers in segment 'active_winback' are excluded from weekly campaign sends. "
        "Conflicting messages ('new arrivals!' vs 'we miss you') dilute winback urgency."
        if overlap_rate > 0 else None
    )

    return {
        "active_customers": len(active),
        "reengagement_rate": reengagement_rate,
        "winback_in_campaign_overlap": overlap_rate,
        "reengagement_status": reengagement_status,
        "overlap_status": overlap_status,
        "status": f"{overlap_status} — {round(overlap_rate * 100, 1)}% of winback customers also receiving weekly campaigns" if overlap_rate > 0 else reengagement_status,
        "fix_required": overlap_fix,
    }


def run(
    welcome_csv: str | Path,
    winback_csv: str | Path,
    campaign_csv: str | Path,
    brand: str,
    week_ending: str,
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    welcome_df = pd.read_csv(welcome_csv)
    winback_df = pd.read_csv(winback_csv)
    campaign_df = pd.read_csv(campaign_csv)

    result = {
        "week_ending": week_ending,
        "brand": brand,
        "welcome_flow": analyze_welcome_flow(welcome_df),
        "winback_flow": analyze_winback_flow(winback_df, campaign_df),
    }
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 6:
        print("Usage: flow_monitor.py <welcome.csv> <winback.csv> <campaign.csv> <brand> <week_ending> [output.json]")
        sys.exit(1)
    result = run(*sys.argv[1:6], sys.argv[6] if len(sys.argv) > 6 else None)
    print(json.dumps(result, indent=2))
