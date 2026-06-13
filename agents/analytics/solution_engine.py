"""Deterministic performance-to-solution planning for EmailAuto.

The LLM analyst is useful for narrative, but CTR/access and list-health fixes
need a stable decision layer that always returns evidence, action, test design,
and guardrails.
"""

from __future__ import annotations

from statistics import mean
from typing import Any

from agents.analytics.campaign_ops import BRAND_DISPLAY, BRAND_DOMAINS, BRAND_LIMITS


DEFAULT_GUARDRAILS = ["Optout/Delivered", "Spam/Delivered"]


def _float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _pct(value: Any) -> str:
    return f"{_float(value):.2%}"


def _display(brand: str) -> str:
    return BRAND_DISPLAY.get(brand, brand)


def _latest_month(data: dict[str, Any]) -> dict[str, Any]:
    monthly = data.get("monthly") or []
    return monthly[-1] if monthly else {}


def _recommended_content_type(data: dict[str, Any]) -> dict[str, Any]:
    content_types = sorted(
        data.get("content_types") or [],
        key=lambda item: _float(item.get("avg_access_rate")),
        reverse=True,
    )
    if not content_types:
        return {}

    top = content_types[0]
    top_access = _float(top.get("avg_access_rate"))
    top_name = str(top.get("type") or "").lower()
    sale_like = "sale" in top_name or "promotion" in top_name
    if not sale_like:
        return top

    near_access = [
        item for item in content_types[1:]
        if _float(item.get("avg_access_rate")) >= top_access * 0.9
    ]
    if not near_access:
        return top
    return max(near_access, key=lambda item: _float(item.get("avg_cbh_1k")))


def _brand_anomalies(metrics: dict[str, Any], brand: str, metric_name: str | None = None) -> list[dict[str, Any]]:
    rows = [
        item for item in metrics.get("anomalies", [])
        if item.get("brand") == brand
    ]
    if metric_name:
        rows = [item for item in rows if item.get("metric") == metric_name]
    return rows


def _page_rows(metrics: dict[str, Any], brand: str) -> list[dict[str, Any]]:
    domain = BRAND_DOMAINS.get(brand, "")
    rows = []
    for row in metrics.get("page_performance", []):
        row_domain = str(row.get("cta_url_domain") or "").lower()
        row_url = str(row.get("page_url") or "").lower()
        if domain and (domain in row_domain or domain in row_url):
            rows.append(row)
    return rows


def _page_signal(metrics: dict[str, Any], brand: str) -> dict[str, Any]:
    rows = _page_rows(metrics, brand)
    rates = []
    best = None
    best_rate = -1.0

    for row in rows:
        access = _float(row.get("stats_access"))
        purchase = _float(row.get("stats_purchase"))
        if access <= 0:
            continue
        rate = purchase / access
        rates.append(rate)
        if purchase >= 5 and rate > best_rate:
            best = row
            best_rate = rate

    return {
        "sample_size": len(rows),
        "avg_purchase_per_access": round(mean(rates), 4) if rates else None,
        "best_page": str((best or {}).get("page_url") or ""),
        "best_page_purchase_per_access": round(best_rate, 4) if best else None,
    }


def _content_gap_solution(metrics: dict[str, Any], brand: str, data: dict[str, Any]) -> dict[str, Any] | None:
    latest = _latest_month(data)
    latest_access = _float(latest.get("access_rate"))
    best = _recommended_content_type(data)
    best_access = _float(best.get("avg_access_rate"))
    mismatch = _brand_anomalies(metrics, brand, "content_type_mismatch")

    if not best or not latest_access:
        return None

    improvement_gap = best_access - latest_access
    if improvement_gap < max(0.0015, latest_access * 0.15) and not mismatch:
        return None

    best_type = str(best.get("type") or "strongest recent content type")
    evidence = [
        f"Latest Access/Delivered is {_pct(latest_access)}.",
        f"{best_type} averages {_pct(best_access)} Access/Delivered across {int(best.get('n_sends') or 0)} sends.",
    ]
    if mismatch:
        item = mismatch[0]
        evidence.append(
            f"{item.get('overused_type')} is overused: {item.get('overused_sends')} sends vs "
            f"{item.get('best_type')} at {item.get('best_sends')} sends."
        )

    return _solution(
        brand=brand,
        severity="medium" if improvement_gap < 0.004 else "high",
        category="ctr_access",
        problem=f"{_display(brand)} is leaving click intent on the table.",
        root_cause="The content route is weaker than the strongest recent access pattern, so opened emails do not create enough click intent.",
        evidence=evidence,
        solution=(
            f"Run the next send with a {best_type} route: one specific audience pain, one hero product, "
            "one visible offer/proof, and no repeated gratitude or generic sale opener."
        ),
        experiment_name=f"{_display(brand)} {best_type} access lift",
        hypothesis=(
            f"If the next send uses the {best_type} route with a single hero promise, "
            f"Access/Delivered should move toward {_pct(best_access)} without increasing optout/spam."
        ),
        owner="content",
        timeframe="next 2 sends",
        success_rule=f"Keep if Access/Delivered beats latest by at least 15% and optout/spam stay under guardrail.",
        fallback="If access does not lift, keep the same audience but change hero/product-page promise before changing send volume.",
    )


def _access_guardrail_solution(metrics: dict[str, Any], brand: str, data: dict[str, Any]) -> dict[str, Any] | None:
    latest = _latest_month(data)
    access = _float(latest.get("access_rate"))
    min_access = BRAND_LIMITS.get(brand, {}).get("min_access", 0)
    if not access or not min_access or access >= min_access:
        return None

    page = _page_signal(metrics, brand)
    evidence = [
        f"Latest Access/Delivered is {_pct(access)} vs guardrail {_pct(min_access)}.",
        f"Open rate is {_pct(latest.get('open_rate'))}, so the problem is click motivation more than inbox visibility.",
    ]
    avg_page = page.get("avg_purchase_per_access")
    if isinstance(avg_page, (float, int)):
        evidence.append(
            f"Post-click page signal is {avg_page:.2%} PO/access across {page.get('sample_size', 0)} page rows."
        )

    return _solution(
        brand=brand,
        severity="high",
        category="ctr_access",
        problem=f"{_display(brand)} access is below the brand guardrail.",
        root_cause="The subject/banner/body promise is not sharp enough to move openers into product-page intent.",
        evidence=evidence,
        solution=(
            "Rebuild the brief around a first-scroll click reason: subject promise, banner hook, opener, "
            "inline product link, and first product block must all name the same hero benefit."
        ),
        experiment_name=f"{_display(brand)} first-scroll click reason",
        hypothesis="If the first 200px carries one concrete product promise, Access/Delivered will recover without list expansion.",
        owner="growth",
        timeframe="this week",
        success_rule=f"Keep if Access/Delivered reaches at least {_pct(min_access)} or beats the prior send by 20%.",
        fallback="If access remains low, test a different hero product from the page winners before increasing discount or frequency.",
    )


def _list_health_solution(brand: str, data: dict[str, Any]) -> dict[str, Any] | None:
    latest = _latest_month(data)
    optout = _float(latest.get("optout_rate"))
    spam = _float(latest.get("spam_rate"))
    limits = BRAND_LIMITS.get(brand, {})
    optout_limit = limits.get("optout", 1)
    spam_limit = limits.get("spam", 1)

    high_optout = optout > optout_limit
    high_spam = spam > spam_limit
    if not high_optout and not high_spam:
        return None

    evidence = [
        f"Optout/Delivered is {_pct(optout)} vs guardrail {_pct(optout_limit)}.",
        f"Spam/Delivered is {_pct(spam)} vs guardrail {_pct(spam_limit)}.",
    ]

    return _solution(
        brand=brand,
        severity="high" if high_optout and high_spam else "medium",
        category="list_health",
        problem=f"{_display(brand)} has list-health pressure.",
        root_cause="The send is asking too much of low-intent subscribers or using pressure that feels broader than the audience need.",
        evidence=evidence,
        solution=(
            "Suppress recent purchasers, spam reporters, hard bounces, chronic non-clickers, and low-fit F segments; "
            "replace urgency-heavy language with a specific product reason and one calm CTA."
        ),
        experiment_name=f"{_display(brand)} suppression and calm-CTA holdout",
        hypothesis="If low-intent recipients are held out and copy pressure drops, optout/spam should fall while access holds.",
        owner="crm",
        timeframe="next send",
        success_rule="Ship only if optout and spam are below guardrail after the next send.",
        fallback="If list-health stays high, reduce frequency for no-click cohorts before testing a new content angle.",
    )


def _seasonal_pause_solution(brand: str, data: dict[str, Any]) -> dict[str, Any] | None:
    latest = _latest_month(data)
    if brand != "santafare":
        return None
    if int(latest.get("month_num") or 0) >= 11:
        return None

    return _solution(
        brand=brand,
        severity="watch",
        category="seasonality",
        problem="SantaFare is out of its natural seasonal demand window.",
        root_cause="March performance already weakened and the plan pauses the brand until the November holiday cycle.",
        evidence=[
            f"Latest available month is {latest.get('month', 'unknown')} with Access/Delivered {_pct(latest.get('access_rate'))}.",
            f"Optout/Delivered is {_pct(latest.get('optout_rate'))}, which is high for a non-seasonal push.",
        ],
        solution="Keep SantaFare paused unless inventory or a hard gift occasion justifies a narrow, high-intent send.",
        experiment_name="SantaFare seasonal re-entry gate",
        hypothesis="If SantaFare restarts only around gift intent, access and list health should recover together.",
        owner="strategy",
        timeframe="November planning",
        success_rule="Restart only when gift-guide angle, inventory, and suppression rules are confirmed.",
        fallback="If a forced off-season send is required, cap volume to engaged buyers and use a gift/occasion angle only.",
    )


def _solution(
    *,
    brand: str,
    severity: str,
    category: str,
    problem: str,
    root_cause: str,
    evidence: list[str],
    solution: str,
    experiment_name: str,
    hypothesis: str,
    owner: str,
    timeframe: str,
    success_rule: str,
    fallback: str,
) -> dict[str, Any]:
    return {
        "brand": _display(brand),
        "brand_slug": brand,
        "severity": severity,
        "category": category,
        "problem": problem,
        "root_cause": root_cause,
        "evidence": evidence,
        "solution": solution,
        "experiment": {
            "name": experiment_name,
            "hypothesis": hypothesis,
            "primary_metric": "Access/Delivered",
            "guardrails": DEFAULT_GUARDRAILS,
            "success_rule": success_rule,
        },
        "owner": owner,
        "timeframe": timeframe,
        "fallback_if_fail": fallback,
    }


def _portfolio_priorities(solutions: list[dict[str, Any]], metrics: dict[str, Any]) -> list[str]:
    access_count = sum(1 for item in solutions if item.get("category") == "ctr_access")
    health_count = sum(1 for item in solutions if item.get("category") == "list_health")
    paused = any(item.get("category") == "seasonality" for item in solutions)
    page_rows = len(metrics.get("page_performance", []))

    priorities = []
    if access_count:
        priorities.append(
            f"Lift CTR/access first: {access_count} brand(s) need sharper click reasons before volume expansion."
        )
    if health_count:
        priorities.append(
            f"Protect list health: {health_count} brand(s) need suppression, lower-pressure copy, or frequency holds."
        )
    if page_rows:
        priorities.append(
            f"Use page signal: {page_rows} RMKT page rows show the landing page can help select hero products and click promises."
        )
    if paused:
        priorities.append("Respect seasonality: SantaFare should stay paused until a gift-intent window or narrow exception.")
    return priorities or ["No urgent solution flags; keep measuring Access/Delivered against optout and spam guardrails."]


def build_solution_plan(metrics: dict[str, Any]) -> dict[str, Any]:
    """Build a structured solution plan from local metrics and anomalies."""

    solutions: list[dict[str, Any]] = []
    for brand, data in (metrics.get("brands") or {}).items():
        candidates = [
            _access_guardrail_solution(metrics, brand, data),
            _list_health_solution(brand, data),
            _content_gap_solution(metrics, brand, data),
            _seasonal_pause_solution(brand, data),
        ]
        for item in candidates:
            if item:
                solutions.append(item)

    severity_rank = {"high": 0, "medium": 1, "watch": 2}
    solutions.sort(
        key=lambda item: (
            severity_rank.get(str(item.get("severity")), 9),
            str(item.get("brand")),
            str(item.get("category")),
        )
    )

    return {
        "source": "local EmailAuto metrics",
        "portfolio_priorities": _portfolio_priorities(solutions, metrics),
        "solutions": solutions,
    }
