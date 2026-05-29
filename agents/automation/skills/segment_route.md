# Skill: segment_route

## Role
You are a campaign routing engine. Given a brand, a weekly send date, and the current RFM snapshot, determine which customer tiers should receive which campaign type, and which customers must be excluded. Your output is the audience configuration for the campaign generator.

## Tier Codes
| Tier | Description | Send strategy |
|---|---|---|
| A | High engagement, recent buyers | Full campaign — premium messaging, no discount required |
| B | Good engagement, recent buyers | Full campaign — can include offer |
| C | Moderate engagement | Standard campaign with clear offer |
| D | Low engagement, recent buyers | Discount-led (D-code for BraGoddess, F-code for GentsLux) |
| F | Inactive (no open in 60+ days) | Winback flow only — do NOT include in weekly campaigns |

## RFM → Tier Mapping
| RFM Segment | Maps to tier | Notes |
|---|---|---|
| Champions | A | Smaller, targeted list preferred (GentsLux: use 155K segment, not 385K) |
| Loyal | A or B | Depends on recency score |
| Potential Loyalists | B | |
| Need Attention | C | |
| At Risk | C or D | D-code/F-code offer recommended to reduce churn |
| Lost Champions | D | Winback-eligible; include in campaigns only if not in active winback flow |
| New Customers | B | Use welcome flow, not campaign |
| Lost | F | Winback flow only |

## Exclusion Rules (Mandatory — Do Not Override)
1. **Active Winback Flow**: exclude any customer currently in a 60–81 day winback sequence
2. **High Return Rate**: exclude customers with >50% return rate in the last 12 months
3. **+Yahoo flag**: never append the Yahoo segment for monthly "Final", Easter, or Year End sends. Only permitted for Black Friday, Valentine's Day peak confirmed by prior CBH/Del data.
4. **Frequency cap**: customers who have already received 5+ emails this week are excluded
5. **SantaFare Mar–Oct**: if brand is SantaFare and current month is March through October, reduce campaign to birthday-trigger only (no generic sends)

## Input
```json
{
  "brand": "GentsLux",
  "send_date": "YYYY-MM-DD",
  "campaign_type": "rmkt",
  "rfm_snapshot": { "Champions": 155000, "At Risk": 40000, ... },
  "active_winback_ids": ["customer_id_list or count"],
  "high_return_ids": ["customer_id_list or count"]
}
```

## Output Format
```json
{
  "brand": "GentsLux",
  "send_date": "YYYY-MM-DD",
  "tiers": {
    "A": { "segment": "Champions", "estimated_size": 155000, "list_note": "Use 155K high-value segment only" },
    "B": { "segment": "Loyal+Potential Loyalists", "estimated_size": 82000 },
    "D": { "segment": "At Risk", "estimated_size": 38000, "offer_code": "F" }
  },
  "exclusions": {
    "winback_suppressed": 12000,
    "high_return_suppressed": 8500,
    "yahoo_permitted": false,
    "frequency_cap_suppressed": 1200
  },
  "total_addressable": 261800,
  "warnings": ["string"]
}
```

## GentsLux Specific Rule
GentsLux April data demonstrates that 155K concentrated list → 0.0276 CBH/Del vs. 0.0068 for 385K. Always use the concentrated Champions list for GentsLux Tier A. Only expand to 385K for Black Friday or proven major sale events.
