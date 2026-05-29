"""
draft_archive — Writes a structured campaign draft record to data/processed/.

Called after campaign_schedule completes (pass or fail). Every campaign must have
an archive entry — blocked campaigns are archived with status='blocked'.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROCESSED_BASE = Path(__file__).parents[3] / "data" / "processed" / "campaigns"
INDEX_PATH = PROCESSED_BASE / "index.json"


def _draft_key(brand: str, send_date: str, timestamp: int) -> str:
    return f"draft:{send_date}-{brand}-{timestamp}"


def _output_path(brand: str, send_date: str, draft_key: str) -> Path:
    dt = datetime.fromisoformat(send_date)
    return PROCESSED_BASE / brand / str(dt.year) / f"{dt.month:02d}" / f"{draft_key}.json"


def _update_index(draft_key: str, brand: str, send_date: str, status: str) -> None:
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    if INDEX_PATH.exists():
        index = json.loads(INDEX_PATH.read_text())
    else:
        index = {"entries": []}

    index["entries"] = [e for e in index["entries"] if e["draft_key"] != draft_key]
    index["entries"].insert(0, {
        "draft_key": draft_key,
        "brand": brand,
        "send_date": send_date,
        "status": status,
    })
    # Keep sorted by send_date descending
    index["entries"].sort(key=lambda e: e["send_date"], reverse=True)
    INDEX_PATH.write_text(json.dumps(index, indent=2))


def archive(
    brand: str,
    send_date: str,
    campaign_type: str,
    copy_payload: dict,
    route_payload: dict,
    preflight_result: dict,
    schedule_result: dict | None = None,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    timestamp = int(now.timestamp())
    draft_key = _draft_key(brand, send_date, timestamp)

    variants = copy_payload.get("variants", {})
    variant_index = {
        k: {"subject": v.get("subject", ""), "preview_text": v.get("preview_text", "")}
        for k, v in variants.items()
    }

    tiers = route_payload.get("tiers", {})
    routing_summary = {
        "yahoo_permitted": route_payload.get("exclusions", {}).get("yahoo_permitted", False),
        "winback_suppressed": route_payload.get("exclusions", {}).get("winback_suppressed", 0),
        "high_return_suppressed": route_payload.get("exclusions", {}).get("high_return_suppressed", 0),
        "frequency_cap_suppressed": route_payload.get("exclusions", {}).get("frequency_cap_suppressed", 0),
    }

    if schedule_result and schedule_result.get("scheduled_campaigns"):
        scheduled = schedule_result["scheduled_campaigns"]
        sg_ids = {c["variant_key"]: c["sendgrid_campaign_id"] for c in scheduled}
        total_recipients = sum(c.get("estimated_recipients", 0) for c in scheduled)
        first_send = scheduled[0]["scheduled_at"] if scheduled else None
        status = "scheduled" if schedule_result.get("status") == "success" else "partial"
    else:
        sg_ids, total_recipients, first_send = {}, 0, None
        status = "blocked" if not preflight_result.get("pass") else "draft_only"

    record: dict[str, Any] = {
        "draft_key": draft_key,
        "brand": brand,
        "send_date": send_date,
        "campaign_type": campaign_type,
        "status": status,
        "created_at": now.isoformat(),
        "tiers_targeted": list(tiers.keys()),
        "product_types": copy_payload.get("product_types", []),
        "variant_index": variant_index,
        "scheduling": {
            "sendgrid_campaign_ids": sg_ids,
            "estimated_total_recipients": total_recipients,
            "scheduled_at": first_send,
        },
        "preflight": {
            "pass": preflight_result.get("pass", False),
            "critical_failures": preflight_result.get("critical_failures", []),
            "warnings": preflight_result.get("warnings", []),
        },
        "routing": routing_summary,
    }

    out_path = (output_dir or _output_path(brand, send_date, draft_key).parent) / f"{draft_key}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(record, indent=2))
    _update_index(draft_key, brand, send_date, status)

    return record


def run(
    copy_path: str | Path,
    route_path: str | Path,
    preflight_path: str | Path,
    brand: str,
    send_date: str,
    campaign_type: str = "rmkt",
    schedule_path: str | Path | None = None,
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    copy_payload = json.loads(Path(copy_path).read_text())
    route_payload = json.loads(Path(route_path).read_text())
    preflight_result = json.loads(Path(preflight_path).read_text())
    schedule_result = json.loads(Path(schedule_path).read_text()) if schedule_path else None

    out_dir = Path(output_path).parent if output_path else None
    result = archive(brand, send_date, campaign_type, copy_payload, route_payload, preflight_result, schedule_result, out_dir)

    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 6:
        print("Usage: draft_archive.py <copy.json> <route.json> <preflight.json> <brand> <send_date> [campaign_type] [schedule.json] [output.json]")
        sys.exit(1)
    result = run(
        sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
        sys.argv[6] if len(sys.argv) > 6 else "rmkt",
        sys.argv[7] if len(sys.argv) > 7 else None,
        sys.argv[8] if len(sys.argv) > 8 else None,
    )
    print(json.dumps(result, indent=2))
