"""
copy_generate — Calls Claude API to generate email copy variants for a given brand × tier.

One API call per tier (not per variant). Returns all product-type variants for that tier
in a single JSON response keyed by ${tier}${productType}.
"""

import json
import os
import re
from pathlib import Path
from typing import Any

import anthropic


MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2048
PROMPT_PATH = Path(__file__).parent / "copy_generate.md"

SUBJECT_MAX = 50
PREVIEW_MIN = 60
PREVIEW_MAX = 90

FAIL_PATTERNS = [
    (r"don.t let .+ go to waste", "Banned subject pattern: 'don't let [X] go to waste'"),
    (r"be hurry", "Grammar error banned pattern: 'be hurry'"),
    (r"\$", "Use ð² instead of $ to avoid spam filters"),
]


def _load_system_prompt() -> str:
    return PROMPT_PATH.read_text()


def _build_user_message(brand: str, tier: str, product_types: list[str], campaign_context: dict) -> str:
    return (
        f"Generate email copy for **{brand}**, Tier **{tier}**, "
        f"product types: {product_types}.\n\n"
        f"Campaign context:\n```json\n{json.dumps(campaign_context, indent=2)}\n```\n\n"
        "Return ONLY the JSON object matching the output schema. No prose. No markdown fences."
    )


def _validate_variant(variant_key: str, variant: dict) -> list[str]:
    issues = []
    subject = variant.get("subject", "")
    preview = variant.get("preview_text", "")

    if len(subject) > SUBJECT_MAX:
        issues.append(f"{variant_key}: subject too long ({len(subject)} chars, max {SUBJECT_MAX})")
    if not (PREVIEW_MIN <= len(preview) <= PREVIEW_MAX):
        issues.append(f"{variant_key}: preview_text length {len(preview)} outside [{PREVIEW_MIN}–{PREVIEW_MAX}]")

    for pattern, msg in FAIL_PATTERNS:
        if re.search(pattern, subject, re.IGNORECASE):
            issues.append(f"{variant_key}: {msg}")
        if re.search(pattern, preview, re.IGNORECASE):
            issues.append(f"{variant_key}: preview — {msg}")

    return issues


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


def generate_copy(
    brand: str,
    tier: str,
    product_types: list[str],
    campaign_context: dict,
    api_key: str | None = None,
) -> dict[str, Any]:
    client = anthropic.Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])

    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=_load_system_prompt(),
        messages=[{
            "role": "user",
            "content": _build_user_message(brand, tier, product_types, campaign_context),
        }],
    )

    raw = message.content[0].text
    cleaned = _strip_fences(raw)

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude returned non-JSON for {brand} Tier {tier}: {e}\n---\n{cleaned}") from e

    # Validate all variants
    validation_errors = []
    for key, variant in result.get("variants", {}).items():
        validation_errors.extend(_validate_variant(key, variant))

    if validation_errors:
        result["_validation_warnings"] = validation_errors

    return result


def generate_all_tiers(
    brand: str,
    tiers: list[str],
    product_types: list[str],
    campaign_context: dict,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Generate copy for all tiers. One API call per tier."""
    all_variants: dict[str, Any] = {}
    validation_warnings: list[str] = []

    for tier in tiers:
        result = generate_copy(brand, tier, product_types, campaign_context, api_key)
        all_variants.update(result.get("variants", {}))
        validation_warnings.extend(result.get("_validation_warnings", []))

    return {
        "brand": brand,
        "product_types": product_types,
        "variants": all_variants,
        "_validation_warnings": validation_warnings,
    }


def run(input_path: str | Path, output_path: str | Path | None = None) -> dict[str, Any]:
    data = json.loads(Path(input_path).read_text())
    result = generate_all_tiers(
        brand=data["brand"],
        tiers=data["tiers"],
        product_types=data["product_types"],
        campaign_context=data.get("campaign_context", {}),
    )
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: copy_generate.py <input.json> [output.json]")
        sys.exit(1)
    result = run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(json.dumps(result, indent=2))
