# Workflow and Performance Insights - 2026-06-04

## Scope

This note covers the current EmailAuto Studio workflow, the legacy `email-brief-generator` workflow, the six Page performance CSVs from November 2025 through April 2026, and the product-price audit against live product landing pages.

Related local sources reviewed:

- `docs/email-brief-generator.html`
- `docs/email-brief-generator.local.example.js`
- `docs/email-brief-generator.local.js` was treated as private because it contains local secrets.
- `docs/superpowers/specs/2026-06-02-email-brief-generator-design.md`
- `docs/superpowers/plans/2026-06-03-email-brief-generator.md`
- `docs/email-template-analysis.md`
- `docs/email-performance-analysis.md`
- `docs/optimization-roadmap.md`
- `Source/Page performance November 2025.csv` through `Source/Page performance April 2026.csv`

External model docs checked:

- OpenAI models: https://platform.openai.com/docs/models
- Anthropic Claude models: https://platform.claude.com/docs/en/about-claude/models/overview
- Gemini models: https://ai.google.dev/gemini-api/docs/models

## Implemented Workflow Changes

1. Step 2 offer is now composable, not mutually exclusive.
   The discount or price-point component is independent from the shipping component, so an email can carry both `70% O.F.F` and `Free Shipping $35+`.

2. Step 3 product prices were audited against live landing pages.
   The Page performance CSVs do not include price fields. They include product URLs, product names, versions, funnel metrics, revenue, and cost. Product prices were therefore checked from live landing pages. Ambiguous content-version pages sometimes returned sparse shells or unrelated repeated low prices, so only clearly visible canonical product prices were applied.

3. AI model choice is now user-selectable by option.
   Option A and Option B can use different providers and models. The server routes to Claude, Gemini, or ChatGPT/OpenAI using environment variables rather than storing user-pasted keys in code.

4. Legacy prompt rules were folded into the project.
   The app now carries the brief-generator playbook rules, hook contract, A/B contrast retry, performance context, brand color governance, product-count warnings, spam/weak-copy checks, supplied-proof constraints, and product price/offer visibility checks.

5. Final HTML output is editable with formatting controls.
   The preview output can be switched into an HTML editor with toolbar actions for bold, italic, underline, color, highlight, text links, button links, headings, lists, centering, line breaks, and tag stripping.

## Price Audit Notes

The most important price fixes were applied in `lib/config/brands.ts`. Examples:

- BraGoddess: Posy Bra $19.99, SonaShape $19.99, ZipLacy $24.99, Moona Bra $14.99, RosyLift $22.99, EvaGlow Bra $19.99.
- GentsLux: JettJeans $32.99, IcyShorts $18.98, FlexCamo $29.99, TimelessFlex $24.99, TactiShirt $22.95.
- LuxFitting: StretchActive $24.99, Icy Shorts $16.98, EllaFlow $29.99, LinenGlam $32.99, EllaEase $34.99.
- SantaFare: Pouchic $8.97, TimelessMark $8.95, BygoneMark $9.95, Snowflake $8.99.

Where landing pages rendered as a shell or produced suspicious generic prices, the old catalog value was left unchanged instead of injecting a false price.

## Six-Month Page Funnel

Clean CSV rows analyzed: 1,101 product-page rows.

Overall from November 2025 through April 2026:

| Metric | Value |
| --- | ---: |
| Access | 487,087 |
| View | 421,890 |
| Add to cart | 86,202 |
| Init checkout | 63,410 |
| Checkout | 52,147 |
| Purchase | 43,846 |
| Revenue | $1,978,817 |
| Cost | $709,922 |
| View / access | 86.61% |
| Add to cart / access | 17.70% |
| Init checkout / access | 13.02% |
| Checkout / access | 10.71% |
| Purchase / access | 9.00% |
| Purchase / checkout | 84.08% |
| Revenue / access | $4.06 |
| AOV | $45.13 |
| ROAS | 2.79 |

The page funnel is not the main bottleneck once people reach checkout. Purchase / checkout is 84.08%, which is strong. The larger opportunity is upstream: cleaner clicks, better hero-product matching, and more exact offer-price alignment before the first CTA.

## Monthly Trend

| Month | Access | Purchase | Purchase / access | Revenue / access | ROAS | AOV |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nov 2025 | 101,292 | 8,244 | 8.14% | $3.51 | 2.73 | $43.17 |
| Dec 2025 | 88,211 | 7,235 | 8.20% | $3.57 | 2.49 | $43.50 |
| Jan 2026 | 71,711 | 5,880 | 8.20% | $3.67 | 2.86 | $44.74 |
| Feb 2026 | 56,930 | 4,764 | 8.37% | $3.84 | 2.88 | $45.84 |
| Mar 2026 | 81,358 | 8,820 | 10.84% | $5.01 | 2.86 | $46.18 |
| Apr 2026 | 87,585 | 8,903 | 10.16% | $4.79 | 2.93 | $47.11 |

March and April are the structural improvement period. Purchase / access moves from an 8.14%-8.37% band to 10.84% and 10.16%. Revenue / access also moves from $3.51-$3.84 to $5.01 and $4.79.

## Brand Read

| Brand | Access | Purchase | Revenue | Purchase / access | Revenue / access | ROAS | AOV |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BraGoddess | 239,632 | 23,460 | $902,396 | 9.79% | $3.77 | 3.11 | $38.47 |
| GentsLux | 167,867 | 13,399 | $766,250 | 7.98% | $4.56 | 2.44 | $57.19 |
| LuxFitting | 47,042 | 4,142 | $213,644 | 8.80% | $4.54 | 2.60 | $51.58 |
| SantaFare | 32,546 | 2,845 | $96,527 | 8.74% | $2.97 | 4.05 | $33.93 |

BraGoddess is the volume engine and has the best large-brand conversion rate. GentsLux has weaker purchase / access but strong AOV and revenue / access, so good product selection matters more than raw click volume. LuxFitting is smaller but has high-quality winners. SantaFare has the best ROAS but is seasonal and deteriorates sharply after holiday relevance fades.

## Brand By Month

BraGoddess:

- Nov: 9.15% purchase / access, $3.42 revenue / access.
- Dec: 9.29%, $3.48.
- Jan: 9.31%, $3.55.
- Feb: 9.82%, $3.76.
- Mar: 11.01%, $4.29.
- Apr: 10.13%, $4.06.

GentsLux:

- Nov: 5.81%, $3.38.
- Dec: 6.90%, $3.91.
- Jan: 6.91%, $4.10.
- Feb: 7.34%, $4.32.
- Mar: 10.95%, $6.15.
- Apr: 10.04%, $5.62.

LuxFitting:

- Nov: 8.18%, $4.04.
- Dec: 6.76%, $3.42.
- Jan: 7.59%, $3.82.
- Feb: 6.81%, $3.48.
- Mar: 12.01%, $6.30.
- Apr: 11.29%, $6.07.

SantaFare:

- Nov: 12.05%, $4.15.
- Dec: 9.24%, $2.96.
- Jan: 7.70%, $2.69.
- Feb: 6.93%, $2.47.
- Mar: 5.81%, $2.02.
- Apr: 3.24%, $0.90.

SantaFare should not be treated like the other three always-on brands. Its decline is seasonal and clear.

## Product Winners

Top revenue products:

| Product | Access | Purchase | Revenue | Purchase / access | Revenue / access |
| --- | ---: | ---: | ---: | ---: | ---: |
| BraGoddess - Daisy Bra 3 | 47,903 | 5,516 | $194,004 | 11.51% | $4.05 |
| GentsLux - JettJeans3 | 33,349 | 3,280 | $191,044 | 9.84% | $5.73 |
| GentsLux - FlexCamo3 | 25,208 | 2,319 | $142,402 | 9.20% | $5.65 |
| LuxFitting - StretchActive3 | 9,822 | 1,452 | $76,466 | 14.78% | $7.79 |
| BraGoddess - Bustella | 18,187 | 1,688 | $63,575 | 9.28% | $3.50 |
| GentsLux - TimelessFlex | 11,700 | 1,143 | $59,772 | 9.77% | $5.11 |
| BraGoddess - LushFitting3 | 15,608 | 1,371 | $56,091 | 8.78% | $3.59 |
| BraGoddess - Moona Bra 2 | 13,869 | 1,567 | $52,446 | 11.30% | $3.78 |
| GentsLux - Icy Shorts | 9,255 | 990 | $48,861 | 10.70% | $5.28 |
| BraGoddess - ZipLacy | 10,559 | 1,220 | $48,666 | 11.55% | $4.61 |

Top conversion products with at least 500 access:

| Product | Access | Purchase | Purchase / access | Revenue / access |
| --- | ---: | ---: | ---: | ---: |
| LuxFitting - Icy Shorts | 3,133 | 511 | 16.31% | $7.45 |
| LuxFitting - StretchActive3 | 9,822 | 1,452 | 14.78% | $7.79 |
| SantaFare - BygoneMark | 4,469 | 629 | 14.07% | $5.96 |
| SantaFare - Pouchic2 | 7,399 | 917 | 12.39% | $4.08 |
| GentsLux - StretchMotions | 2,427 | 291 | 11.99% | $7.45 |
| BraGoddess - Posy Bra | 8,734 | 1,019 | 11.67% | $4.81 |
| BraGoddess - ZipLacy | 10,559 | 1,220 | 11.55% | $4.61 |
| BraGoddess - Daisy Bra 3 | 47,903 | 5,516 | 11.51% | $4.05 |
| LuxFitting - SoftyGrace | 3,384 | 388 | 11.47% | $6.15 |
| BraGoddess - CurvyLace | 2,382 | 271 | 11.38% | $5.10 |

These should become the default hero and support pools in the generator unless the user provides a strong seasonal/product reason to override.

## Product Risks

Low conversion products with at least 500 access:

- Zero-purchase rows: BraGoddess BreezyBloom2, BraGoddess CushyCurves, GentsLux HunkyWear3, GentsLux SlimBoxers2, GentsLux VentyFlex2.
- GentsLux FlexRover: 2.18% purchase / access.
- LuxFitting EaseTrousers: 2.57%.
- BraGoddess Glamorette 3: 3.09%.
- BraGoddess DoveLoom: 3.23%.
- GentsLux GlideActive: 3.60%.
- LuxFitting FlexCozy: 3.80%.
- GentsLux GlidePants2: 3.97%.
- SantaFare WinkKey: 4.73%.

Workflow implication: the product selector should warn when one of these is chosen as a hero and require a reason such as new page version, inventory clearance, or a highly matched segment.

## Page Version Clues

High-performing page versions with at least 300 access:

- LuxFitting SoftyGrace B, winter concept and sale added to variants: 46.69% purchase / access on 347 access.
- GentsLux EaseTactic B, fall/winter theme and no percent-off in variants: 34.37% on 1,027 access.
- GentsLux FlexCamo B, small-waist clear-stock version: 32.48% on 4,027 access.
- GentsLux OldenEase B, enhanced USPs: 30.74% on 732 access.
- BraGoddess LunaHug B, expanded sizing: 28.88% on 1,011 access.
- LuxFitting StretchActive A, focused visual: 14.39% on 9,569 access.

This does not prove randomized A/B causality, but it is strong directional evidence. Focused visual presentation, sizing clarity, variant clarity, and concrete clearance/stock positioning outperform generic page refreshes.

## Workflow Improvement Ideas

1. Add a product intelligence gate to Step 3.
   Show "recommended hero", "support pool", and "avoid unless justified" based on CSV performance. If the user selects a low-CVR hero, require a short reason and inject that reason into the prompt.

2. Add a weekly price freshness audit.
   Use canonical landing pages, cache the extracted price, and flag ambiguous pages for manual review. Do not trust content-version pages that render shells or unrelated embedded prices.

3. Store provider/model performance after each campaign.
   The app now records provider/model in output. Next step is to connect that to downstream performance so Claude/Gemini/ChatGPT choices become measurable, not preference-based.

4. Add a pre-send quality score threshold.
   Prevent SendGrid sync unless blocking warnings are resolved: missing price/offer in product blocks, same Option A/B angle, weak CTA, unsupplied proof, too many products, or SantaFare off-season send.

5. Turn performance context into a signed preflight.
   The user can already edit context. Add a small "why this send should work" field: hero reason, audience reason, offer reason. Feed that into prompt and history.

6. Promote March/April mechanics into default guidance.
   For GentsLux and LuxFitting especially, March/April page performance suggests stronger segment discipline and focused hero matching. The generator should bias toward those winners unless overridden.

7. Add send-result ingestion.
   Pull SendGrid opens, clicks, unsubscribe, template ID, segment, hero product, offer, and model into one table. Recompute best hero pools and avoid lists monthly.

8. Add rich module editing, not only HTML source editing.
   Current output editing is useful for final fixes. The next level is editable modules: subject/preheader, hero banner, body, product blocks, CTA buttons, and per-segment overrides with undo.

9. Add model cost and latency estimates.
   The selector should show expected cost tier and let the user decide whether Option B should use a cheaper exploration model or a premium challenger model.

10. Keep secrets server-side only.
   The pasted API keys are exposed and should be rotated. Production should use Vercel/server environment variables only. Do not store API keys in client-side history or committed files.

## Recommended Operating Rhythm

Weekly:

- Refresh prices from live product pages.
- Review low-CVR product alerts.
- Update the recommended hero/support pools.

Per campaign:

- Pick one promise.
- Choose one hero from the recommended pool unless there is a written exception.
- Stack offer components intentionally: discount or price point plus free shipping when true.
- Generate A/B with different angle and framework.
- Resolve all blocking QA warnings before SendGrid sync.

Monthly:

- Recompute CSV performance intelligence.
- Compare provider/model output against downstream campaign results.
- Promote winning page-version notes into product selection guidance.
