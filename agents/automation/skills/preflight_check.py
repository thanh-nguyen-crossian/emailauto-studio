"""
preflight_check — Pre-send quality gate for email copy variants.

Returns a pass/fail report. Campaigns with any critical_failures are blocked.
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


SUBJECT_MAX = 50
PREVIEW_MIN = 60
PREVIEW_MAX = 90

BRAND_COLOR_RANGES: dict[str, tuple[int, int, int, int, int, int]] = {
    # (r_min, r_max, g_min, g_max, b_min, b_max) — simplified range for hue check
    # Stored as (min_hex_int, max_hex_int) for quick comparison
}

BANNED_SUBJECT_PATTERNS = [
    (r"don.t let .+ go to waste", "Banned pattern: 'don't let [X] go to waste' — most overused fail pattern"),
    (r"\bbe hurry\b", "Grammar error: 'be hurry' — destroys premium brand trust"),
    (r"\bBe Hurry\b", "Grammar error: 'Be Hurry' — destroys premium brand trust"),
    (r"(?<!\w)\$(?!\w)", "Literal $ sign — use ð² to avoid spam filters"),
]

YEAR_END_PATTERN = re.compile(r"year.?(end|in.?review)", re.IGNORECASE)
VARIANT_KEY_PATTERN = re.compile(r"^[A-DF][0-9]{1,3}$")
SLUG_INVALID_PATTERN = re.compile(r"[^a-z0-9_-]")

MULTI_HOOK_MARKERS = [
    (r"(?:spring|summer|fall|winter|christmas|easter|halloween|thanksgiving)", "seasonal"),
    (r"ð²\d|[0-9]+%", "price/discount"),
    (r"birthday|b-day|bday|🎂", "birthday"),
    (r"3…2…1|countdown|\d+\s*hours?\s*left|ends? (at )?midnight", "countdown"),
]


@dataclass
class CheckResult:
    variant: str
    check: str
    value: str
    issue: str
    severity: str  # "critical" or "warning"


def _hex_to_int(hex_str: str) -> int | None:
    clean = hex_str.lstrip("#").strip()
    if len(clean) == 6 and all(c in "0123456789abcdefABCDEF" for c in clean):
        return int(clean, 16)
    return None


def check_variant(
    key: str,
    variant: dict,
    brand: str,
    prev_subject: str | None = None,
    accent_color: str | None = None,
) -> list[CheckResult]:
    results = []

    def fail(check: str, value: str, issue: str) -> None:
        results.append(CheckResult(key, check, value, issue, "critical"))

    def warn(check: str, value: str, issue: str) -> None:
        results.append(CheckResult(key, check, value, issue, "warning"))

    subject = variant.get("subject", "")
    preview = variant.get("preview_text", "")
    products = variant.get("products", [])

    # --- Critical checks ---

    if len(subject) > SUBJECT_MAX:
        fail("subject_length", subject, f"Subject is {len(subject)} chars (max {SUBJECT_MAX})")

    if not (PREVIEW_MIN <= len(preview) <= PREVIEW_MAX):
        fail("preview_length", preview, f"Preview is {len(preview)} chars (must be {PREVIEW_MIN}–{PREVIEW_MAX})")

    for pattern, msg in BANNED_SUBJECT_PATTERNS:
        if re.search(pattern, subject, re.IGNORECASE):
            fail("banned_pattern", subject, msg)
        if re.search(pattern, preview, re.IGNORECASE):
            fail("banned_pattern_preview", preview, f"Preview: {msg}")

    if not VARIANT_KEY_PATTERN.match(key):
        fail("variant_key_format", key, f"Key '{key}' must match ${{tier}}${{productType}} e.g. A21, B22")

    for product in products:
        slug = product.get("slug", "")
        if SLUG_INVALID_PATTERN.search(slug):
            fail("product_slug", slug, f"Slug '{slug}' contains invalid chars — must be lowercase a-z, 0-9, _ or -")

    # Check for PLACEHOLDER in any URL-like field
    for field_name, value in variant.items():
        if isinstance(value, str) and "PLACEHOLDER" in value:
            fail("placeholder_url", value, f"Field '{field_name}' contains 'PLACEHOLDER' — replace with real URL before send")

    # --- Warning checks ---

    if prev_subject and subject.strip().lower() == prev_subject.strip().lower():
        warn("subject_uniqueness", subject, "Subject is identical to previous send — recycled subjects signal no personalization effort")

    if preview and subject and preview.lower().startswith(subject.lower()[:20]):
        warn("preview_repeats_subject", preview, "Preview starts with the same phrase as the subject — wasted preheader space")

    # Multi-hook detection
    matched_hooks = []
    for pattern, label in MULTI_HOOK_MARKERS:
        if re.search(pattern, subject, re.IGNORECASE):
            matched_hooks.append(label)
    if len(matched_hooks) > 1:
        warn("multiple_hooks", subject, f"Subject contains {len(matched_hooks)} concurrent hooks ({', '.join(matched_hooks)}). Single-focus subjects outperform multi-hook.")

    if len(products) > 6:
        warn("product_count", str(len(products)), f"{len(products)} products listed. Max 6 recommended (4 for SantaFare). 7+ creates overcrowded layout with orphaned final row.")

    if brand == "SantaFare" and len(products) > 4:
        warn("santafare_product_count", str(len(products)), "SantaFare WIN data shows 4-product layouts outperform 6-product layouts. Reduce to 4.")

    return results


def run_preflight(
    brand: str,
    send_date: str,
    variants: dict[str, dict],
    campaign_name: str = "",
    prev_subjects: dict[str, str] | None = None,
) -> dict[str, Any]:
    all_results: list[CheckResult] = []

    # Year-end content warning at campaign level
    if YEAR_END_PATTERN.search(campaign_name):
        all_results.append(CheckResult(
            "campaign", "year_end_content", campaign_name,
            "Year End / Year in Review content is the lowest-performing type across all brands. "
            "Replace with 'New Year Preview' or curated bestsellers with forward-looking offer.",
            "warning",
        ))

    for key, variant in variants.items():
        prev_subj = (prev_subjects or {}).get(key)
        results = check_variant(key, variant, brand, prev_subj)
        all_results.extend(results)

    critical = [r for r in all_results if r.severity == "critical"]
    warnings = [r for r in all_results if r.severity == "warning"]
    passed = len(critical) == 0

    return {
        "pass": passed,
        "brand": brand,
        "send_date": send_date,
        "critical_failures": [
            {"variant": r.variant, "check": r.check, "value": r.value, "issue": r.issue}
            for r in critical
        ],
        "warnings": [
            {"variant": r.variant, "check": r.check, "value": r.value, "issue": r.issue}
            for r in warnings
        ],
        "summary": (
            f"{'PASSED' if passed else 'BLOCKED'}: "
            f"{len(critical)} critical failure{'s' if len(critical) != 1 else ''}, "
            f"{len(warnings)} warning{'s' if len(warnings) != 1 else ''}."
            + ("" if passed else " Campaign BLOCKED pending fix.")
        ),
    }


def run(input_path: str | Path, output_path: str | Path | None = None) -> dict[str, Any]:
    data = json.loads(Path(input_path).read_text())
    result = run_preflight(
        brand=data["brand"],
        send_date=data.get("send_date", ""),
        variants=data["variants"],
        campaign_name=data.get("campaign_name", ""),
        prev_subjects=data.get("prev_subjects"),
    )
    if output_path:
        Path(output_path).write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: preflight_check.py <input.json> [output.json]")
        sys.exit(1)
    result = run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(json.dumps(result, indent=2))
