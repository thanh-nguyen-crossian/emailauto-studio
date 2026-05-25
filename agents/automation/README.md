# Automation Agent

Generates email copy variants and schedules campaigns via SendGrid API.

## Planned Inputs
- Brand (bra_goddess | gents_lux | lux_fitting | santa_fare)
- Send date
- Product selection (slugs)
- Target tiers (A/B/C/D + product type codes)

## Planned Outputs
- Email copy variants as JSON (`${tier}${productType}` keys)
- Scheduled campaigns in SendGrid
- Campaign log entry in `data/processed/`

## Key Files to Build
- `campaign_generator.py` — Claude API integration for copy generation
- `flow_manager.py` — SendGrid API scheduling
- `segment_router.py` — RFM segment routing logic
- `prompts/` — LLM prompt templates per flow type

## Dependencies
- `anthropic` Python SDK
- `sendgrid` Python SDK
- Brand configs from `../../configs/brands/`
- Flow configs from `../../configs/flows/`
