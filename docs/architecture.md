# EmailAuto — Project Architecture
_Updated: 2026-06-09_

> Current production note: EmailAuto Studio is now a Next.js app rooted in `app/` and `lib/`.
> Several sections below describe the earlier agent/file layout and are retained as historical
> planning context. For current implementation details, use `CLAUDE.md`, `STUDIO.md`, and the
> module map in `README.md` as the source of truth.

## Overview
EmailAuto Studio is currently a Vercel-hosted Next.js application. Earlier standalone Python
agent concepts were removed from this repo so production deployment stays focused on the studio
app and its API routes.

---

## Folder Structure

```
EmailAuto/
│
├── CLAUDE.md                         # Claude Code project instructions
├── docs/
│   ├── architecture.md               # This file
│   ├── performance-insights.md       # Data analysis & root cause breakdown
│   └── optimization-roadmap.md       # 3-tier action plan
│
├── Source/                           # Raw data & performance dashboards (read-only)
│   ├── RMKT Master Plan.xlsx         # Master planning spreadsheet (36 sheets)
│   ├── rmkt_dashboard.html           # Customer LTV / RFM / product line analysis
│   ├── rmkt_email_dashboard.html     # Monthly email KPIs per brand (Jan 2025–Apr 2026)
│   ├── email-customer-journey.html   # Lifecycle flow map + proposed flows
│   ├── welcome_flow_dashboard.html   # Welcome flow performance metrics
│   └── winback_flow_dashboard.html   # Winback flow performance metrics
│
├── studio/                           # Email template studio (JSX artifact)
│   ├── email_template_studio.jsx     # Single-file React artifact for HTML generation
│   └── exports/                      # Generated HTML email variants (output)
│
├── data/
│   ├── raw/                          # Direct exports from SendGrid (CSV/JSON)
│   ├── processed/                    # Cleaned, structured data (Parquet/CSV)
│   └── schemas/                      # Field definitions & data models
│
├── configs/
│   ├── brands/                       # Per-brand config (accent colors, voice, segments)
│   │   ├── bra_goddess.json
│   │   ├── gents_lux.json
│   │   ├── lux_fitting.json
│   │   └── santa_fare.json
│   └── flows/                        # Per-flow configuration
│       ├── welcome.json
│       ├── winback.json
│       ├── cart_abandon.json
│       ├── anniversary.json
│       └── loyalty_milestone.json
│
└── tests/
    ├── ab_tests/                     # A/B test configs, variants, and results history
    └── benchmarks/                   # Performance baseline definitions per brand
```

---

## Data Flow

```
SendGrid API / Manual Export
         ↓
    data/raw/
         ↓
analytics/performance_analyzer.py
         ↓
    data/processed/
         ↓
analytics/anomaly_detector.py  ←→  analytics/report_generator.py
         ↓                                   ↓
   Slack/Email Alert                   Weekly Report
```

```
configs/brands/*.json + configs/flows/*.json
              ↓
automation/segment_router.py    ←  RFM segment from processed data
              ↓
automation/campaign_generator.py  ←  Claude API (copy generation)
              ↓
automation/flow_manager.py        →  SendGrid API (schedule + send)
              ↓
         studio/exports/           (HTML artifacts)
```

---

## Agent 1: Automation Agent

### Responsibilities
- Accept a campaign brief (brand, send date, product selection, tier targets)
- Generate email copy variants for each brand × tier × product segment
- Validate copy against per-brand voice, subject line length, spam triggers
- Schedule campaigns via SendGrid API
- Log campaign metadata to `data/processed/`

### Key Design Principles
- One Claude API call per tier (not per variant) — keeps prompts mindset-focused
- All copy in strict JSON matching `${tier}${productType}` key schema
- Markdown conventions from `CLAUDE.md` honored in all generated copy
- Pre-flight checks: hero image not placeholder, subject ≤50 chars, preview 60-90 chars

---

## Agent 2: Analytics Agent

### Responsibilities
- Ingest weekly SendGrid export data from `data/raw/`
- Compute KPIs: Access/Delivered (MPP-immune), CBH/1K, optout rate, spam rate
- Detect anomalies: >2σ deviation from 4-week rolling baseline per metric per brand
- Generate narrative insight report using Claude API
- Push report to configured output (Slack, email, or file)

### Key Metrics Tracked
- Access/Delivered (primary, MPP-immune) — not Access/Open
- CBH/1K and CBH/Delivered
- Optout rate and Spam rate (absolute and relative to baseline)
- RFM segment migration: customers moving Loyal → At Risk
- Flow-level: Welcome completion rate, Winback re-engagement rate

---

## Segment / Tier Codes (from RMKT Master Plan)

### Customer Tiers (Tệp)
| Code | Description |
|---|---|
| A | High engagement, recent buyers |
| B | Good engagement, recent buyers |
| C | Moderate engagement |
| D | Low engagement, recent buyers |
| F | Inactive (no open in 60+ days) |

### Product Type Codes
| Code | Product |
|---|---|
| 21 | Bra |
| 22 | Pant |
| 45 | Accessories |
| 8 | Panties |
| 3 | T-shirt |
| 62 | LuxFitting core |
| 71/72/73 | GentsLux products |
| 1 | SantaFare seasonal |
