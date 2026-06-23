#!/usr/bin/env python3
"""
Corpus extraction script: mines historical email send data from Source xlsx files.
Extracts subjects, value tips, occasions, puns, and body paragraphs per brand.
"""

import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

# Brand mapping
BRAND_MAPPING = {
    "BraGoddess Email Content.xlsx": "bra_goddess",
    "GentsLux Email Content.xlsx": "gents_lux",
    "LuxFitting Email Content.xlsx": "lux_fitting",
    "SantaFare Email Content.xlsx": "santa_fare",
}

# Filter out Vietnamese design-note rows
FILTER_KEYWORDS = [
    "Ảnh", "ảnh", "CTA riêng", "thiết kế", "Banner", "Body Part", "Designer note",
    "Product Image", "Featured Product", "Subject", "Preheader", "Theme", "Body"
]

# Value tips markers (case-insensitive)
VALUE_TIP_PATTERNS = [
    r"#Tip\b", r"#QuickTip\b", r"#Hack\b", r"#HemmingHack\b",
    r"Did you know\b", r"fun fact\b", r"Quick fact\b"
]

# Occasions: holidays and date markers
OCCASION_KEYWORDS = [
    "National", "International", "Day",
    "Christmas", "Easter", "Halloween", "Mother's Day", "Father's Day",
    "Valentine's Day", "New Year", "Thanksgiving", "Independence Day"
]

# Pun patterns (common wordplay)
PUN_PATTERNS = [
    r"tea-riffic",
    r"brew-tiful",
    r"spook-tacular",
    r"grand-eur|grand-stand",
]

def is_design_note(text):
    """Check if text is a design note or UI label that should be filtered."""
    return any(keyword in text for keyword in FILTER_KEYWORDS)

def classify_value_tip(text):
    """Check if text is a value tip."""
    for pattern in VALUE_TIP_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False

def classify_occasion(text):
    """Check if text mentions an occasion or holiday."""
    return any(keyword in text for keyword in OCCASION_KEYWORDS)

def classify_pun(text):
    """Check if text contains wordplay/puns."""
    # Check for specific wordplay patterns
    for pattern in PUN_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False

def is_substantive(text):
    """Check if text is substantive body copy (≥20 chars, not UI label)."""
    return len(text.strip()) >= 20 and not is_design_note(text)

def parse_shared_strings(zip_ref):
    """Extract all strings from xl/sharedStrings.xml."""
    try:
        with zip_ref.open("xl/sharedStrings.xml") as f:
            tree = ET.parse(f)
            root = tree.getroot()
            # Namespace for shared strings
            ns = {"": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            strings = []
            for si in root.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                text_parts = []
                for t in si.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"):
                    if t.text:
                        text_parts.append(t.text)
                if text_parts:
                    strings.append("".join(text_parts))
            return strings
    except KeyError:
        return []

def parse_workbook(zip_ref):
    """Extract sheet names (which are historical subjects) from xl/workbook.xml."""
    try:
        with zip_ref.open("xl/workbook.xml") as f:
            tree = ET.parse(f)
            root = tree.getroot()
            ns = {"": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            subjects = []
            for sheet in root.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet"):
                name = sheet.get("name")
                if name:
                    subjects.append(name)
            return subjects
    except KeyError:
        return []

def has_emoji(text):
    """Check if text contains emoji."""
    # Simple emoji detection: characters in specific Unicode ranges
    emoji_pattern = re.compile(
        r"["
        r"\U0001F600-\U0001F64F"  # Emoticons
        r"\U0001F300-\U0001F5FF"  # Symbols & Pictographs
        r"\U0001F680-\U0001F6FF"  # Transport & Map
        r"\U0001F700-\U0001F77F"  # Alchemical
        r"\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
        r"\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
        r"\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
        r"\U0001FA00-\U0001FA6F"  # Chess Symbols
        r"\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
        r"\U00002702-\U000027B0"
        r"\U000024C2-\U0001F251"
        r"\U0001f926-\U0001f937"
        r"\U00010000-\U0010ffff"
        r"♀-♂"
        r"☀-⭕"
        r"‍"
        r"⏏"
        r"⏩"
        r"⌚"
        r"️"  # Dingbats
        r"〰"
        r"]+"
    )
    return bool(emoji_pattern.search(text))

def classify_device_hint(text):
    """Classify subject line by device hint heuristic."""
    text_lower = text.lower()

    if any(x in text_lower for x in ["open", "wait", "finally", "reveal"]):
        return "open-loop"
    if any(x in text_lower for x in ["?", "stop", "wait", "pause"]):
        return "pattern-interrupt"
    if any(x in text_lower for x in ["lol", "haha", "fun", "playful", "laugh"]):
        return "playful-conceit"
    if any(x in text_lower for x in ["people", "love", "trending", "bestseller", "popular"]):
        return "social-proof-tease"
    if any(x in text_lower for x in ["today", "now", "limited", "ends", "24hr", "deadline"]):
        return "deadline-whisper"
    if any(x in text_lower for x in ["hi", "hey", "check", "checking"]):
        return "check-in"
    if any(x in text_lower for x in ["save", "off", "deal", "offer", "free"]):
        return "direct-offer"

    return "unknown"

def extract_from_xlsx(file_path):
    """Extract corpus from a single xlsx file."""
    try:
        with zipfile.ZipFile(file_path, "r") as zip_ref:
            # Parse shared strings (body text)
            shared_strings = parse_shared_strings(zip_ref)

            # Parse workbook (sheet names = subjects)
            subjects_list = parse_workbook(zip_ref)

        # Classify body text
        value_tips = []
        occasions = []
        puns = []
        body_paragraphs = []

        for text in shared_strings:
            if is_design_note(text):
                continue

            if classify_value_tip(text):
                value_tips.append(text)
            elif classify_occasion(text):
                occasions.append(text)
            elif classify_pun(text):
                puns.append(text)
            elif is_substantive(text):
                body_paragraphs.append(text)

        # Classify subjects
        subjects = []
        for subject_text in subjects_list:
            if subject_text and not is_design_note(subject_text):
                subject_obj = {
                    "text": subject_text,
                    "has_emoji": has_emoji(subject_text),
                    "length": len(subject_text),
                    "has_first_name": "{{first_name}}" in subject_text or "first_name" in subject_text,
                    "device_hint": classify_device_hint(subject_text)
                }
                subjects.append(subject_obj)

        return {
            "subjects": subjects,
            "value_tips": value_tips,
            "occasions": occasions,
            "puns": puns,
            "body_paragraphs": body_paragraphs,
        }
    except Exception as e:
        print(f"Error processing {file_path}: {e}", file=sys.stderr)
        return None

def main():
    # Get repo root
    repo_root = Path(__file__).parent.parent.parent
    source_dir = repo_root / "Source"
    corpus_dir = repo_root / "docs" / "corpus"

    # Ensure corpus directory exists
    corpus_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    for xlsx_filename, brand_id in BRAND_MAPPING.items():
        xlsx_path = source_dir / xlsx_filename

        if not xlsx_path.exists():
            print(f"Skipping {brand_id}: {xlsx_filename} not found", file=sys.stderr)
            continue

        print(f"Extracting {brand_id}…")

        data = extract_from_xlsx(xlsx_path)
        if data is None:
            print(f"Failed to extract {brand_id}", file=sys.stderr)
            continue

        # Build output object
        output = {
            "brand_id": brand_id,
            "extracted_at": timestamp,
            "subjects": data["subjects"],
            "value_tips": data["value_tips"],
            "occasions": data["occasions"],
            "puns": data["puns"],
            "body_paragraphs": data["body_paragraphs"],
        }

        # Write JSON
        output_path = corpus_dir / f"{brand_id}.json"
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        # Print summary
        print(f"  {brand_id}: {len(data['subjects'])} subjects, "
              f"{len(data['value_tips'])} value_tips, "
              f"{len(data['occasions'])} occasions, "
              f"{len(data['puns'])} puns, "
              f"{len(data['body_paragraphs'])} body_paragraphs")

if __name__ == "__main__":
    main()
