"""
segment_route — Maps RFM segments to campaign tiers and applies exclusion rules.

Outputs the audience configuration used by copy_generate and campaign_schedule.
"""

import json
from calendar import month_abbr
from datetime import date
from pathlib import Path
from typing import Any


TIER_MAPPING: dict[str, str] = {
    "Champions": "A",
    "Loyal": "A",
    "Potential Loyalists": "B",
    "Need Attention": "C",
    "At Risk": "D",
    "Lost Champions": "D",
    "New Customers": "B",
    "Lost": "F",
}

OFFER_CODE: dict[str, dict[str, str]] = {
    "BraGoddess": {"D": "D", "C": "S"},
    "GentsLux": {"D": "F", "C": "S"},
    "LuxFitting": {"D": "S", "C": "S"},
    "SantaFare": {"D": "S", "C": "S"},
}

SANTAFARE_OFF_SEASON_MONTHS = set(range(3, 11))  # Mar–Oct

YAHOO_PERMITTED_TYPES = {"black_friday", "valentines_peak"}

GENTSLUX_TIER_A_CAP = 155_000


def _is_santafare_off_season(brand: str, send_date: date) -> bool:
    return brand == "SantaFare" and send_date.month in SANTAFARE_OFF_SEASON_MONTHS


def route(
    brand: str,
    send_date: str | date,
    campaign_type: str,
    rfm_snapshot: dict[str, int],
    active_winback_count: int = 0,
    high_return_count: int = 0,
    yahoo_requested: bool = False,
    frequency_cap_count: int = 0,
) -> dict[str, Any]:
    if isinstance(send_date, str):
        send_date = date.fromisoformat(send_date)

    warnings: list[str] = []

    # SantaFare off-season gate
    if _is_santafare_off_season(brand, send_date):
        warnings.append(
            f"SantaFare off-season ({month_abbr[send_date.month]}): reducing to birthday-trigger only. "
            "Generic sends Mar–Oct have CBH/Del near zero. Use seasonal calendar Nov–Jan for regular sends."
        )
        return {
            "brand": brand,
            "send_date": str(send_date),
            "tiers": {"A": {"segment": "birthday_trigger_only", "estimated_size": rfm_snapshot.get("Champions", 0)}},
            "exclusions": {"reason": "off_season", "yahoo_permitted": False},
            "total_addressable": rfm_snapshot.get("Champions", 0),
            "warnings": warnings,
        }

    # Build tier groups
    tiers: dict[str, dict[str, Any]] = {}
    for segment, count in rfm_snapshot.items():
        tier = TIER_MAPPING.get(segment)
        if not tier or tier == "F":
            continue
        if tier not in tiers:
            tiers[tier] = {"segments": [], "estimated_size": 0}
        tiers[tier]["segments"].append(segment)
        tiers[tier]["estimated_size"] += count

    # GentsLux Tier A cap
    if brand == "GentsLux" and "A" in tiers:
        raw_size = tiers["A"]["estimated_size"]
        if raw_size > GENTSLUX_TIER_A_CAP:
            tiers["A"]["estimated_size"] = GENTSLUX_TIER_A_CAP
            tiers["A"]["list_note"] = (
                f"Capped at {GENTSLUX_TIER_A_CAP:,} (concentrated high-value segment). "
                f"Original size {raw_size:,}. Data shows 4× higher CBH/Del with smaller list."
            )
            warnings.append(f"GentsLux Tier A capped at {GENTSLUX_TIER_A_CAP:,}. Full list ({raw_size:,}) only for Black Friday / proven major sales.")

    # Attach offer codes
    brand_codes = OFFER_CODE.get(brand, {})
    for tier_code, tier_data in tiers.items():
        if tier_code in brand_codes:
            tier_data["offer_code"] = brand_codes[tier_code]
        tier_data["segment"] = "+".join(tier_data.pop("segments"))

    # Yahoo gate
    yahoo_permitted = yahoo_requested and campaign_type in YAHOO_PERMITTED_TYPES
    if yahoo_requested and not yahoo_permitted:
        warnings.append(
            f"+Yahoo segment requested but campaign_type='{campaign_type}' is not in the permitted list "
            f"{sorted(YAHOO_PERMITTED_TYPES)}. +Yahoo appends suppress CBH/Del 40-60% for non-peak sends. Denied."
        )

    total = sum(t["estimated_size"] for t in tiers.values())

    return {
        "brand": brand,
        "send_date": str(send_date),
        "campaign_type": campaign_type,
        "tiers": tiers,
        "exclusions": {
            "winback_suppressed": active_winback_count,
            "high_return_suppressed": high_return_count,
            "yahoo_permitted": yahoo_permitted,
            "frequency_cap_suppressed": frequency_cap_count,
        },
        "total_addressable": total,
        "warnings": warnings,
    }


def run(input_path: str | Path, output_path: str | Path | None = None) -> dict[str, Any]:
    data = json.loads(Path(input_path).read_text())
    result = route(
        brand=data["brand"],
        send_date=data["send_date"],
        campaign_type=data.get("campaign_type", "rmkt"),
        rfm_snapshot=data["rfm_snapshot"],
        active_winback_count=data.get("active_winback_count", 0),
        high_return_count=data.get("high_return_count", 0),
        yahoo_requested=data.get("yahoo_requested", False),
        frequency_cap_count=data.get("frequency_cap_count", 0),
    )
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: segment_route.py <input.json> [output.json]")
        sys.exit(1)
    result = run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(json.dumps(result, indent=2))
