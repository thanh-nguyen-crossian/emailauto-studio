# Skill: draft_archive

## Role
You are the campaign record keeper. After a campaign is scheduled in SendGrid, write a structured draft record to `data/processed/` so the analytics agent and future automation runs can reference it. Every campaign that is generated must have an archive entry — even if it was blocked by preflight.

## Draft Key Format
`draft:{sendDate}-{brand}-{timestamp}`

Example: `draft:2026-05-29-BraGoddess-1748505600`

## What to Archive
Every draft record captures:
1. **Campaign metadata**: brand, send date, campaign type, tier targets, product types
2. **Variant index**: all `${tier}${productType}` keys with their subjects and preview text
3. **Scheduling result**: SendGrid campaign IDs, estimated recipients, send time
4. **Preflight result**: pass/fail, any warnings or failures
5. **Routing summary**: tiers used, exclusion counts, +Yahoo flag
6. **Status**: `scheduled`, `blocked`, `draft_only`, `error`

## Why This Matters
- The analytics agent reads these records to correlate campaign metadata with SendGrid performance exports
- Future automation runs reference previous subjects to detect duplicates (preflight subject_uniqueness check)
- Anomaly detection uses this to flag duplicate send-type violations (e.g., two birthday sends within 14 days)
- All draft keys use `window.storage` (Claude artifact KV API) when running in studio mode

## Output File Path
`data/processed/campaigns/{brand}/{YYYY}/{MM}/draft:{sendDate}-{brand}-{timestamp}.json`

## Output Schema
```json
{
  "draft_key": "draft:2026-05-29-BraGoddess-1748505600",
  "brand": "BraGoddess",
  "send_date": "2026-05-29",
  "campaign_type": "rmkt",
  "status": "scheduled",
  "created_at": "ISO-8601",
  "tiers_targeted": ["A", "B", "C"],
  "product_types": ["21", "22"],
  "variant_index": {
    "A21": { "subject": "string", "preview_text": "string" },
    "B22": { "subject": "string", "preview_text": "string" }
  },
  "scheduling": {
    "sendgrid_campaign_ids": { "A21": "sg_id_1", "B22": "sg_id_2" },
    "estimated_total_recipients": 127000,
    "scheduled_at": "ISO-8601"
  },
  "preflight": {
    "pass": true,
    "critical_failures": [],
    "warnings": []
  },
  "routing": {
    "yahoo_permitted": false,
    "winback_suppressed": 12000,
    "high_return_suppressed": 8500
  }
}
```

## Retention Policy
- Keep all records indefinitely (used for longitudinal analysis)
- Index file `data/processed/campaigns/index.json` maintains a list of all draft keys, sorted by send_date descending
