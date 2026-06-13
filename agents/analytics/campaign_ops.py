"""Campaign operations planning derived from local EmailAuto metrics.

The output is intentionally deterministic: reports and brief-generator prompts
can use it without requiring an LLM call.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import mean
from typing import Any


BRAND_DISPLAY = {
    "bragoddess": "BraGoddess",
    "gentslux": "GentsLux",
    "luxfitting": "LuxFitting",
    "santafare": "SantaFare",
}

BRAND_DOMAINS = {
    "bragoddess": "bragoddess.com",
    "gentslux": "gentslux.com",
    "luxfitting": "luxfitting.com",
    "santafare": "santafare.com",
}

BRAND_LIMITS = {
    "bragoddess": {"optout": 0.0045, "spam": 0.00035, "min_access": 0.0080},
    "gentslux": {"optout": 0.0045, "spam": 0.00035, "min_access": 0.0100},
    "luxfitting": {"optout": 0.0035, "spam": 0.00030, "min_access": 0.0080},
    "santafare": {"optout": 0.0060, "spam": 0.00035, "min_access": 0.0075},
}

DEFAULT_EXCLUSIONS = [
    "Exclude recent purchasers from the last 7 days unless the send is post-purchase care.",
    "Exclude hard bounces, global unsubscribes, spam reporters, and suppression-list contacts.",
    "Throttle chronic non-clickers before increasing frequency.",
]


def _float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _latest_month(data: dict[str, Any]) -> dict[str, Any]:
    monthly = data.get("monthly") or []
    return monthly[-1] if monthly else {}


def _best_content_type(data: dict[str, Any]) -> dict[str, Any]:
    content_types = data.get("content_types") or []
    if not content_types:
        return {}
    return max(content_types, key=lambda item: _float(item.get("avg_access_rate")))


def _segment_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    return list(data.get("segments") or [])


def _segment_name(row: dict[str, Any]) -> str:
    return str(row.get("segment") or "All active buyers").strip()


def _recommended_includes(data: dict[str, Any]) -> list[str]:
    rows = sorted(
        _segment_rows(data),
        key=lambda row: (_float(row.get("avg_access_rate")), _float(row.get("avg_cbh_1k"))),
        reverse=True,
    )
    includes = [
        _segment_name(row)
        for row in rows
        if _float(row.get("avg_access_rate")) > 0
    ][:3]
    return includes or ["A,B,C,D engaged buyers"]


def _recommended_excludes(data: dict[str, Any]) -> list[str]:
    excludes = list(DEFAULT_EXCLUSIONS)
    f_segments = [
        _segment_name(row)
        for row in _segment_rows(data)
        if "F" in _segment_name(row)
    ]
    if f_segments:
        excludes.append("Limit F-segment sends unless the angle is explicit reactivation.")
    return excludes


def _page_rows_for_brand(page_performance: list[dict[str, Any]], brand: str) -> list[dict[str, Any]]:
    domain = BRAND_DOMAINS.get(brand, "")
    rows = []
    for row in page_performance:
        row_domain = str(row.get("cta_url_domain") or "").lower()
        row_url = str(row.get("page_url") or "").lower()
        if domain and (domain in row_domain or domain in row_url):
            rows.append(row)
    return rows


def _page_signal(page_rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not page_rows:
        return {
            "sample_size": 0,
            "avg_purchase_per_access": None,
            "best_page": "",
            "best_page_purchase_per_access": None,
        }

    rates = []
    best = None
    best_rate = -1.0
    for row in page_rows:
        access = _float(row.get("stats_access"))
        purchase = _float(row.get("stats_purchase"))
        if access <= 0:
            continue
        rate = purchase / access
        rates.append(rate)
        if rate > best_rate and purchase >= 5:
            best = row
            best_rate = rate

    return {
        "sample_size": len(page_rows),
        "avg_purchase_per_access": round(mean(rates), 4) if rates else None,
        "best_page": str((best or {}).get("page_url") or ""),
        "best_page_purchase_per_access": round(best_rate, 4) if best else None,
    }


def _readiness_status(brand: str, latest: dict[str, Any]) -> tuple[str, list[str]]:
    limits = BRAND_LIMITS.get(brand, {})
    reasons = []

    access_rate = _float(latest.get("access_rate"))
    optout_rate = _float(latest.get("optout_rate"))
    spam_rate = _float(latest.get("spam_rate"))

    if access_rate and access_rate < limits.get("min_access", 0):
        reasons.append("Access rate below brand guardrail; tighten audience and click reason.")
    if optout_rate and optout_rate > limits.get("optout", 1):
        reasons.append("Optout pressure is high; lower frequency or narrow segment.")
    if spam_rate and spam_rate > limits.get("spam", 1):
        reasons.append("Spam pressure is high; avoid urgency-heavy copy and clean sender cadence.")

    if len(reasons) >= 2:
        return "needs_review", reasons
    if reasons:
        return "watch", reasons
    return "ready", ["Metrics are within operational guardrails."]


def _automation_steps(brand: str, latest: dict[str, Any]) -> list[dict[str, str]]:
    display = BRAND_DISPLAY.get(brand, brand)
    access_rate = _float(latest.get("access_rate"))
    optout_rate = _float(latest.get("optout_rate"))
    return [
        {
            "step": "pre_send",
            "action": f"Build {display} audience from include filters, then apply suppression rules.",
            "owner": "crm",
        },
        {
            "step": "post_click_24h",
            "action": "Tag clickers by hero product and route them to product-specific follow-up or exclusion.",
            "owner": "automation",
        },
        {
            "step": "no_click_72h",
            "action": "Hold non-clickers from repeat offer copy; only retarget with a new angle.",
            "owner": "content",
        },
        {
            "step": "risk_review",
            "action": (
                "Pause expansion if access rate stays below "
                f"{access_rate:.2%} or optout exceeds {optout_rate:.2%} on the next send."
            ),
            "owner": "growth",
        },
    ]


def build_campaign_ops_plan(metrics: dict[str, Any]) -> dict[str, Any]:
    """Build a CRM/automation-style plan from EmailAuto metric snapshots."""

    brands = metrics.get("brands", {})
    page_performance = metrics.get("page_performance", [])
    brand_plans = {}
    status_counts: dict[str, int] = defaultdict(int)

    for brand, data in brands.items():
        latest = _latest_month(data)
        best_content = _best_content_type(data)
        readiness, reasons = _readiness_status(brand, latest)
        status_counts[readiness] += 1

        page_rows = _page_rows_for_brand(page_performance, brand)
        page_signal = _page_signal(page_rows)

        brand_plans[brand] = {
            "brand": BRAND_DISPLAY.get(brand, brand),
            "readiness": readiness,
            "readiness_reasons": reasons,
            "audience_filter": {
                "include": _recommended_includes(data),
                "exclude": _recommended_excludes(data),
                "tags_to_apply": [
                    f"rmkt:{brand}:clicked:{{hero_product}}",
                    f"rmkt:{brand}:no_click:72h",
                    f"rmkt:{brand}:risk_hold",
                ],
            },
            "content_route": {
                "recommended_type": best_content.get("type", "Use strongest recent winner"),
                "avg_access_rate": _float(best_content.get("avg_access_rate")),
                "reason": "Prioritize historical access rate before expanding send volume.",
            },
            "automation_steps": _automation_steps(brand, latest),
            "measurement_plan": {
                "primary": "Access/Delivered",
                "secondary": ["PO/Access", "Optout/Delivered", "Spam/Delivered"],
                "guardrail": BRAND_LIMITS.get(brand, {}),
                "page_signal": page_signal,
            },
        }

    return {
        "source": "local EmailAuto metrics",
        "portfolio_status": dict(status_counts),
        "principles": [
            "Keep audience ownership in the local data model.",
            "Use tags/custom fields for click/no-click lifecycle state.",
            "Separate campaign creation from suppression and follow-up automation.",
            "Treat provider delivery, inbox, optout, and spam events as operational inputs.",
        ],
        "brands": brand_plans,
    }
