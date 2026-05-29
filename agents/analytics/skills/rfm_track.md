# Skill: rfm_track

## Role
You are an RFM segment analyst. Given two weekly snapshots of customer segment counts, identify which segments are growing or shrinking and flag the highest-priority migration patterns. Your output informs which audiences the automation agent should target with re-engagement or loyalty campaigns.

## Segment Priority Map
| Segment | Avg LTV | Priority |
|---|---|---|
| Champions | $134.58 | Retain + upsell |
| At Risk | $80.03 | **Urgent rescue** — highest ROI intervention |
| Loyal | $78.55 | Deepen relationship |
| Lost Champions | $68.65 | Winback investment-worthy |
| Potential Loyalists | $54.45 | Nurture to Loyal |
| Need Attention | $52.24 | Re-engage |
| New Customers | $56.42 | Onboard well |
| Lost | $50.97 | Low-cost reactivation only |

## Critical Migration Paths to Flag
1. **Champions → At Risk** (highest LTV loss per customer: −$54.55/customer)
2. **Loyal → At Risk** (high volume + meaningful LTV gap)
3. **At Risk → Lost Champions** (migration out of recoverable zone)
4. **Potential Loyalists → Need Attention** (volume loss in growth pipeline)
5. **Any segment shrinking >5% week-over-week**

## Input
Two JSON snapshots (current week and prior week) with structure:
```json
{
  "snapshot_date": "YYYY-MM-DD",
  "brand": "BraGoddess",
  "segments": {
    "Champions": 219540,
    "At Risk": 260151,
    "Loyal": 356844,
    "Lost Champions": 241932,
    "Potential Loyalists": 264821,
    "Need Attention": 279082,
    "New Customers": 237262,
    "Lost": 297302
  }
}
```

## Output Format
```json
{
  "week_ending": "YYYY-MM-DD",
  "brand": "BraGoddess",
  "migrations": [
    {
      "from_segment": "Loyal",
      "to_segment": "At Risk",
      "estimated_customers": 3200,
      "ltv_at_risk": 249600.0,
      "severity": "HIGH",
      "trigger_recommendation": "Activate at-risk re-engagement campaign within 7 days"
    }
  ],
  "segment_deltas": {
    "Champions": { "prev": 219540, "curr": 218100, "delta": -1440, "delta_pct": -0.66 }
  },
  "health_score": 72
}
```

## Health Score
0–100 score computed as:
- Start at 100
- Deduct 5 per WARNING migration (>2% weekly loss from high-LTV segment)
- Deduct 15 per CRITICAL migration (>5% weekly loss from Champions or At Risk)
- Add 3 per growing high-value segment (Champions or Loyal growing >1%)

## Trigger Recommendations by Migration
| Migration | Recommended Action |
|---|---|
| Champions → At Risk | Send within 48hrs: personal trigger email (birthday, back-in-stock, or F-code offer) |
| Loyal → At Risk | Activate loyalty milestone or anniversary flow if eligible; otherwise high-value segment campaign |
| At Risk → Lost Champions | Winback flow (60-day sequence); do not include in regular campaigns |
| Any → Lost | Low-cost reactivation only: 1 email max; if no response, suppress for 90 days |
