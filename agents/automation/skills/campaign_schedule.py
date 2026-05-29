"""
campaign_schedule — Creates and schedules SendGrid campaigns for each copy variant.

Prerequisites:
  - preflight_check passed (pass: true)
  - segment_route output available
  - SENDGRID_API_KEY in environment
"""

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import urllib.error
import urllib.request


SENDGRID_BASE = "https://api.sendgrid.com/v3"
MAX_RETRIES = 3
RETRY_DELAY_SECS = 60

PREFERRED_SEND_DAYS = {1, 2, 3, 4}  # Mon=0, Tue=1, Wed=2, Thu=3, Fri=4
PREFERRED_HOUR = 10  # 10:00 AM local → sent as UTC offset


def _sg_request(method: str, path: str, body: dict | None, api_key: str) -> dict:
    url = f"{SENDGRID_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SECS)
                continue
            raise
    raise RuntimeError(f"SendGrid {method} {path} failed after {MAX_RETRIES} retries")


def _next_preferred_send_time(base_date: datetime) -> datetime:
    """Advance to next Tue–Fri at 10 AM if base_date falls outside preferred window."""
    dt = base_date.replace(hour=PREFERRED_HOUR, minute=0, second=0, microsecond=0)
    for _ in range(7):
        if dt.weekday() in PREFERRED_SEND_DAYS and dt > datetime.now(tz=timezone.utc) + timedelta(hours=2):
            return dt
        dt += timedelta(days=1)
    return dt


def _create_campaign(
    brand: str,
    variant_key: str,
    copy_variant: dict,
    list_id: str,
    scheduled_at: datetime,
    api_key: str,
) -> dict:
    payload = {
        "name": f"{brand} — {variant_key} — {scheduled_at.strftime('%Y-%m-%d')}",
        "subject": copy_variant["subject"],
        "send_to": {"list_ids": [list_id]},
        "ip_pool": brand.lower().replace(" ", "_"),
        "send_at": int(scheduled_at.timestamp()),
    }
    return _sg_request("POST", "/marketing/campaigns", payload, api_key)


def schedule_campaigns(
    brand: str,
    send_date: str,
    copy_payload: dict,
    route_payload: dict,
    anomaly_status: str = "healthy",
    api_key: str | None = None,
) -> dict[str, Any]:
    api_key = api_key or os.environ.get("SENDGRID_API_KEY", "")
    if not api_key:
        raise EnvironmentError("SENDGRID_API_KEY not set")

    base_dt = datetime.fromisoformat(send_date).replace(tzinfo=timezone.utc)
    scheduled_campaigns = []
    skipped = []
    warnings: list[str] = []

    if anomaly_status == "CRITICAL":
        warnings.append(
            f"Anomaly status is CRITICAL for {brand}. Delaying all sends by 24h for manual review."
        )
        base_dt += timedelta(days=1)

    send_time = _next_preferred_send_time(base_dt)
    if send_time.weekday() not in PREFERRED_SEND_DAYS:
        warnings.append(f"Requested send date {send_date} falls outside Tue–Fri window; advanced to {send_time.date()}")

    tiers = route_payload.get("tiers", {})
    variants = copy_payload.get("variants", {})

    for variant_key, copy_variant in variants.items():
        tier_code = variant_key[0]
        tier_data = tiers.get(tier_code)
        if not tier_data:
            skipped.append({"variant_key": variant_key, "reason": f"No tier routing found for tier '{tier_code}'"})
            continue

        list_id = tier_data.get("list_id")
        if not list_id:
            skipped.append({"variant_key": variant_key, "reason": "No list_id in segment_route output"})
            continue

        try:
            sg_response = _create_campaign(brand, variant_key, copy_variant, list_id, send_time, api_key)
            scheduled_campaigns.append({
                "variant_key": variant_key,
                "sendgrid_campaign_id": sg_response.get("id"),
                "list_id": list_id,
                "scheduled_at": send_time.isoformat(),
                "status": "scheduled",
                "estimated_recipients": tier_data.get("estimated_size", 0),
            })
        except Exception as e:
            skipped.append({"variant_key": variant_key, "reason": str(e)})
            warnings.append(f"Failed to create campaign for {variant_key}: {e}")

    status = "failed" if not scheduled_campaigns else ("partial" if skipped else "success")

    return {
        "brand": brand,
        "send_date": send_date,
        "status": status,
        "scheduled_campaigns": scheduled_campaigns,
        "skipped_variants": skipped,
        "warnings": warnings,
    }


def run(
    copy_path: str | Path,
    route_path: str | Path,
    send_date: str,
    brand: str,
    anomaly_status: str = "healthy",
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    copy_payload = json.loads(Path(copy_path).read_text())
    route_payload = json.loads(Path(route_path).read_text())
    result = schedule_campaigns(brand, send_date, copy_payload, route_payload, anomaly_status)
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 5:
        print("Usage: campaign_schedule.py <copy.json> <route.json> <send_date> <brand> [anomaly_status] [output.json]")
        sys.exit(1)
    result = run(*sys.argv[1:5], sys.argv[5] if len(sys.argv) > 5 else "healthy", sys.argv[6] if len(sys.argv) > 6 else None)
    print(json.dumps(result, indent=2))
