# Analytics Agent

Ingests SendGrid export data, detects performance anomalies, and generates weekly insight reports via Claude API.

## Planned Inputs
- Weekly SendGrid exports (CSV/JSON) placed in `../../data/raw/`

## Planned Outputs
- Processed KPI tables in `../../data/processed/`
- Anomaly alerts (Slack webhook / email)
- Weekly narrative report (Slack / email / file)

## Key Metrics Tracked
- `access/delivered` — MPP-immune click rate (NOT access/open)
- `cbh_per_1k` — revenue efficiency
- `optout_rate` and `spam_rate`
- RFM segment migration (Loyal → At Risk customer count weekly)
- Welcome flow completion rate
- Winback re-engagement rate

## Key Files to Build
- `performance_analyzer.py` — KPI computation + rolling baseline
- `anomaly_detector.py` — flags >2σ deviations per metric per brand
- `report_generator.py` — Claude API narrative generation
- `prompts/` — LLM prompts for analysis interpretation

## Dependencies
- `pandas`, `numpy`
- `anthropic` Python SDK
- Slack webhook or SMTP for output
