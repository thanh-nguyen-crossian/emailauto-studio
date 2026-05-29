"""
kpi_compute — Computes canonical KPIs from a SendGrid weekly CSV export.

Metrics computed (in priority order):
  1. cbh_delivered  — CBH / delivered (MPP-immune revenue proxy)
  2. access_delivered — clicks / delivered (MPP-immune)
  3. open_delivered  — opens / delivered (MPP-inflated, tracked for reference)
  4. optout_rate     — optouts / delivered
  5. spam_rate       — spam_reports / delivered

+Yahoo detection: Open/Delivered < 0.32 flags the send as a Yahoo-appended blast.
"""

import json
from pathlib import Path
from typing import Any

import pandas as pd


MARGIN_PROXY = 0.35  # fallback gross margin if CBH not provided
YAHOO_THRESHOLD = 0.32  # Open/Delivered below this = likely +Yahoo send

REQUIRED_COLS = {
    "brand", "send_date", "campaign_name",
    "delivered", "opens", "clicks", "orders", "revenue",
    "optouts", "spam_reports",
}
OPTIONAL_COLS = {"cbh"}  # gross profit; computed from revenue × margin if absent


def load_export(path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["send_date"])
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing required columns: {missing}")
    if "cbh" not in df.columns:
        df["cbh"] = df["revenue"] * MARGIN_PROXY
    df["brand"] = df["brand"].str.strip()
    df["campaign_name"] = df["campaign_name"].str.strip()
    return df


def _safe_rate(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return (numerator / denominator.replace(0, pd.NA)).round(4)


def compute_kpis(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["cbh_delivered"] = _safe_rate(df["cbh"], df["delivered"])
    df["access_delivered"] = _safe_rate(df["clicks"], df["delivered"])
    df["open_delivered"] = _safe_rate(df["opens"], df["delivered"])
    df["optout_rate"] = _safe_rate(df["optouts"], df["delivered"])
    df["spam_rate"] = _safe_rate(df["spam_reports"], df["delivered"])
    df["yahoo_flag"] = df["open_delivered"] < YAHOO_THRESHOLD
    return df


def build_report(df: pd.DataFrame, week_ending: str) -> dict[str, Any]:
    kpi_df = compute_kpis(df)
    brands: dict[str, Any] = {}

    for brand, group in kpi_df.groupby("brand"):
        sends = []
        for _, row in group.sort_values("send_date").iterrows():
            sends.append({
                "date": row["send_date"].strftime("%Y-%m-%d"),
                "campaign": row["campaign_name"],
                "delivered": int(row["delivered"]),
                "cbh_delivered": float(row["cbh_delivered"]) if pd.notna(row["cbh_delivered"]) else None,
                "access_delivered": float(row["access_delivered"]) if pd.notna(row["access_delivered"]) else None,
                "open_delivered": float(row["open_delivered"]) if pd.notna(row["open_delivered"]) else None,
                "optout_rate": float(row["optout_rate"]) if pd.notna(row["optout_rate"]) else None,
                "spam_rate": float(row["spam_rate"]) if pd.notna(row["spam_rate"]) else None,
                "yahoo_flag": bool(row["yahoo_flag"]),
                "notes": "Yahoo-appended send: metrics suppressed ~40-60%" if row["yahoo_flag"] else None,
            })

        valid = group[~group["yahoo_flag"]]
        best_idx = valid["cbh_delivered"].idxmax() if not valid.empty else None
        worst_idx = valid["cbh_delivered"].idxmin() if not valid.empty else None

        brands[brand] = {
            "sends": sends,
            "week_summary": {
                "avg_cbh_delivered": round(float(valid["cbh_delivered"].mean()), 4) if not valid.empty else None,
                "avg_access_delivered": round(float(valid["access_delivered"].mean()), 4) if not valid.empty else None,
                "total_delivered": int(group["delivered"].sum()),
                "yahoo_send_count": int(group["yahoo_flag"].sum()),
                "best_send": kpi_df.loc[best_idx, "campaign_name"] if best_idx is not None else None,
                "worst_send": kpi_df.loc[worst_idx, "campaign_name"] if worst_idx is not None else None,
            },
        }

    return {"week_ending": week_ending, "brands": brands}


def run(csv_path: str | Path, week_ending: str, output_path: str | Path | None = None) -> dict[str, Any]:
    df = load_export(csv_path)
    report = build_report(df, week_ending)
    if output_path:
        Path(output_path).write_text(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: kpi_compute.py <csv_path> <week_ending YYYY-MM-DD> [output.json]")
        sys.exit(1)
    result = run(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print(json.dumps(result, indent=2))
