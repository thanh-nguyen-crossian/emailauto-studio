import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

SYSTEM_PROMPT = """You are an email marketing analyst for a 4-brand DTC operation.

Domain knowledge (use this, do not re-derive it):
- BraGoddess best content type: Tips & Education (8.25 CBH/1K). Overused: Sale/Promotion (6.78, 75+ sends).
- GentsLux best: Customer Reviews (9.51 CBH/1K). Overused: Sale/Promotion (6.68).
- LuxFitting best: Birthday/Occasion (5.95 CBH/1K).
- SantaFare best: Gift Guide (5.18 CBH/1K).
- F-segment sends (A,B,C,D,F) average 28% open rate vs 42% for A,B,C,D only.
- Apple MPP inflates ~49% of opens. Access/Delivered is the true engagement metric.
- Welcome flow stop-condition is broken: it stops on open (bot-triggered), not on click.
- All 4 brands are significantly below their 2026 annual CBH targets.
- When deterministic "solutions" are supplied, use them as the source of truth for root cause, experiment design, and guardrails.

2026 required monthly CBH to hit annual target:
- BraGoddess: 79,494/month | GentsLux: 36,221/month
- LuxFitting: 10,193/month | SantaFare: 2,689/month

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON. Schema:
{
  "executive_summary": ["insight 1 (max 25 words)", "insight 2", "insight 3"],
  "anomalies_explained": [
    {
      "brand": "bragoddess",
      "metric": "cbh_monthly_pace",
      "explanation": "One sentence explaining why this is happening.",
      "recommended_action": "One sentence on what to do this week."
    }
  ],
  "recommendations": [
    {
      "priority": 1,
      "action": "Short imperative action title",
      "expected_impact": "Quantified expected outcome",
      "effort": "low",
      "rationale": "One sentence why this is the top priority now."
    }
  ],
  "campaign_suggestions": [
    {
      "brand": "bragoddess",
      "recommended_content_type": "Tips & Education",
      "reasoning": "One sentence."
    }
  ]
}"""


def _build_context(metrics: dict) -> dict:
    return {
        "today": metrics["generated_at"][:10],
        "brands": {
            brand: {
                "recent_monthly": data["monthly"][-6:],
                "content_types": data["content_types"],
                "segments": data["segments"],
                "kpi": data["kpi"],
                "target": data["target"],
                "factor_table": data["factor_table"],
            }
            for brand, data in metrics["brands"].items()
        },
        "anomalies_detected": metrics.get("anomalies", []),
        "campaign_ops": metrics.get("campaign_ops", {}),
        "solutions": metrics.get("solutions", {}),
    }


def _parse_response(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)


def _brand_display(slug: str) -> str:
    return {
        "bragoddess": "BraGoddess",
        "gentslux": "GentsLux",
        "luxfitting": "LuxFitting",
        "santafare": "SantaFare",
    }.get(slug, slug)


def _latest_month(data: dict) -> dict:
    monthly = data.get("monthly") or []
    return monthly[-1] if monthly else {}


def _format_pct(value: object, digits: int = 2) -> str:
    try:
        return f"{float(value) * 100:.{digits}f}%"
    except (TypeError, ValueError):
        return "n/a"


def _explain_anomaly(anomaly: dict) -> dict:
    brand = anomaly.get("brand", "")
    metric = anomaly.get("metric", "")

    if metric == "cbh_monthly_pace":
        explanation = (
            f"{_brand_display(brand)} is pacing below the monthly CBH needed for the 2026 target."
        )
        action = "Prioritize the next high-access content route and protect optout/spam guardrails."
    elif metric == "optout_rate":
        explanation = (
            f"{_brand_display(brand)} optout rate is above recent baseline, which points to audience or message pressure."
        )
        action = "Suppress low-intent cohorts and use a calmer CTA before expanding volume."
    elif metric == "content_type_mismatch":
        explanation = (
            f"{_brand_display(brand)} is underusing {anomaly.get('best_type')} while leaning on a weaker route."
        )
        action = f"Run the next campaign on {anomaly.get('best_type')} with a first-screen click reason."
    elif metric == "f_segment_share":
        explanation = (
            f"{_brand_display(brand)} sends include too much F-segment volume, lowering access quality."
        )
        action = "Hold F-segment volume unless the offer is explicitly a winback or clearance send."
    else:
        explanation = f"{_brand_display(brand)} has a flagged performance issue."
        action = "Review the flagged metric before the next send."

    return {
        "brand": brand,
        "metric": metric,
        "explanation": explanation,
        "recommended_action": action,
    }


def build_deterministic_analysis(metrics: dict, note: str = "") -> dict:
    """Build a complete analysis response without an external AI call.

    This keeps the analytics tool useful when API keys are not configured or
    a provider is temporarily unavailable. The schema matches SYSTEM_PROMPT.
    """
    brands = metrics.get("brands", {})
    solutions = (metrics.get("solutions") or {}).get("solutions") or []
    campaign_ops = (metrics.get("campaign_ops") or {}).get("brands") or {}
    anomalies = metrics.get("anomalies") or []

    access_rows = []
    for slug, data in brands.items():
        latest = _latest_month(data)
        access_rows.append((slug, float(latest.get("access_rate") or 0), latest))
    access_rows.sort(key=lambda row: row[1])

    weakest = access_rows[0] if access_rows else ("portfolio", 0, {})
    strongest = access_rows[-1] if access_rows else ("portfolio", 0, {})
    high_solutions = [s for s in solutions if s.get("severity") == "high"]
    health_solutions = [s for s in solutions if s.get("category") == "list_health"]

    executive_summary = [
        (
            f"{_brand_display(weakest[0])} has the weakest latest access rate "
            f"({_format_pct(weakest[1])}); fix first-screen click motivation first."
        ),
        (
            f"{_brand_display(strongest[0])} has the strongest latest access rate "
            f"({_format_pct(strongest[1])}); reuse its proof/route discipline where relevant."
        ),
        (
            f"{len(solutions)} structured experiments are ready; {len(health_solutions)} protect optout/spam before scaling volume."
        ),
    ]
    if note:
        executive_summary.append(f"AI narrative was skipped or unavailable: {note[:90]}")

    recommendations = []
    for idx, solution in enumerate(solutions[:3], start=1):
        experiment = solution.get("experiment") or {}
        recommendations.append({
            "priority": idx,
            "action": experiment.get("name") or solution.get("solution") or "Run access-rate experiment",
            "expected_impact": experiment.get("success_rule") or "Improve Access/Delivered without raising optout/spam.",
            "effort": "medium" if solution.get("severity") == "high" else "low",
            "rationale": solution.get("root_cause") or solution.get("problem") or "",
        })

    if not recommendations and high_solutions:
        for idx, solution in enumerate(high_solutions[:3], start=1):
            recommendations.append({
                "priority": idx,
                "action": solution.get("solution", "Resolve high-severity issue"),
                "expected_impact": "Recover access quality while holding list-health guardrails.",
                "effort": "medium",
                "rationale": solution.get("problem", ""),
            })

    campaign_suggestions = []
    for slug, plan in campaign_ops.items():
        route = plan.get("content_route") or {}
        campaign_suggestions.append({
            "brand": slug,
            "recommended_content_type": route.get("recommended_type") or "Review content route",
            "reasoning": (
                f"Current readiness: {plan.get('readiness', 'review')}; "
                f"target access route averages {_format_pct(route.get('avg_access_rate') or 0)}."
            ),
        })

    return {
        "executive_summary": executive_summary[:4],
        "anomalies_explained": [_explain_anomaly(a) for a in anomalies],
        "recommendations": recommendations,
        "campaign_suggestions": campaign_suggestions,
    }


def _call_claude(context: dict, model: str) -> str:
    from anthropic import Anthropic
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                f"Today is {context['today']}. Analyze this email marketing data "
                f"and return your structured analysis:\n\n"
                f"{json.dumps(context, indent=2, default=str)}"
            ),
        }],
    )
    return response.content[0].text


def _call_gemini(context: dict, model: str) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    response = client.models.generate_content(
        model=model,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            max_output_tokens=2048,
        ),
        contents=(
            f"Today is {context['today']}. Analyze this email marketing data "
            f"and return your structured analysis:\n\n"
            f"{json.dumps(context, indent=2, default=str)}"
        ),
    )
    return response.text


def _call_openai(context: dict, model: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model=model,
        max_tokens=2048,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Today is {context['today']}. Analyze this email marketing data "
                    f"and return your structured analysis:\n\n"
                    f"{json.dumps(context, indent=2, default=str)}"
                ),
            },
        ],
    )
    return response.choices[0].message.content


_PROVIDERS = {
    "claude": _call_claude,
    "gemini": _call_gemini,
    "openai": _call_openai,
}

_DEFAULT_MODELS = {
    "claude": "claude-sonnet-4-6",
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4.1-mini",
}


def analyze(metrics: dict) -> dict:
    """Call the configured AI provider and return a parsed analysis dict.

    Provider and model are read from env vars AI_PROVIDER and AI_MODEL.
    Defaults to claude / claude-sonnet-4-6 if not set.
    """
    provider = os.environ.get("AI_PROVIDER", "claude").lower()
    if provider not in _PROVIDERS:
        raise ValueError(f"Unknown AI_PROVIDER '{provider}'. Choose: {list(_PROVIDERS)}")

    model = os.environ.get("AI_MODEL", _DEFAULT_MODELS[provider])
    context = _build_context(metrics)

    raw = _PROVIDERS[provider](context, model)
    return _parse_response(raw)
