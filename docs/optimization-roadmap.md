# Email Optimization Roadmap — 3-Tier Action Plan
_Generated: 2026-05-25_

---

## TIER 1 — Easy Wins
_No additional APIs or dependencies. Changes to copy, flow settings, or metric definitions only._

---

### T1-01: Fix the Access Rate Metric (MPP-Immune Measurement)
**Problem**: Access Rate = Access/Open is broken. ~49% of opens are Apple MPP bots. Open denominator inflates while real clickers stay flat.
**Fix**: Use `Access/Delivered` as the primary access rate metric. This is already tracked in the XLSX. Reframe all reporting around this number.
**Expected impact**: The "decline" will appear ~40-50% less severe. More importantly, decisions stop being distorted by a broken denominator.
**Effort**: 1 hour (change dashboard definitions, update reporting templates)

---

### T1-02: Single CTA Above the Fold in Email 1
**Problem**: Email 1 has the worst access rate drop (-5.96pp). Customers open at 54% (strong) but don't click. The hero image + intro paragraph delays the CTA.
**Fix**: Move primary CTA button to within the first visible scroll zone (above the hero or overlaid on it). Reduce introductory text in Email 1 to 1 sentence. Lead with product + offer, not brand story.
**Test**: A/B test current layout vs. CTA-first layout for 2 weeks.
**Expected impact**: +2-4pp access rate on Email 1. At current BraGoddess volume (~6M delivered/month), +3pp access = +180K additional clicks/month.

---

### T1-03: Fix Welcome Flow Stop Condition
**Problem**: Welcome flow stops when customer opens Email 1. Apple MPP triggers "open" for ~49% of customers without real engagement. Customers never receive Emails 2 and 3 and miss the conversion opportunity.
**Fix**: Change stop condition from "on open" to "on click OR purchase." This is a single flow setting change in SendGrid.
**Expected impact**: ~49% more customers will progress to Email 2 and Email 3. If Email 2 converts at its current rate, this roughly doubles welcome flow revenue.
**Effort**: 15 minutes in SendGrid flow editor.

---

### T1-04: Suppress Weekly Campaigns During Active Winback Flow
**Problem**: Customers in the 60-81 day winback sequence also receive weekly campaigns. The winback says "we miss you" while a campaign says "new arrivals this week" — conflicting signals that dilute urgency.
**Fix**: Add suppression rule: customers in active Winback flow are excluded from weekly campaigns.
**Expected impact**: Improved winback open and click rates. Reduced optout from over-messaged inactive customers.
**Effort**: 30 minutes (segment exclusion in SendGrid).

---

### T1-05: Escalating Anniversary Email Incentives
**Problem**: Anniversary emails are one of the highest-intent touch points (customers expect to be rewarded) but current rewards are flat.
**Fix**:
- Year 1: 10% off next order
- Year 2: Free shipping on any order
- Year 3: Early access to new product launches (48hr before public)
- Year 4: VIP status designation + dedicated support
- Year 5: Mystery gift with next order
**Expected impact**: Anniversary flow is low-volume but high-converting. Escalating rewards increase repeat purchase rate among Loyal and Champions segments.
**Effort**: 2-3 hours (update email copy per year).

---

### T1-06: Expand 6-Month Refresh from 1 to 3 Emails (BraGoddess Only)
**Problem**: The 6-month refresh is a single email. Customers who don't open it miss the re-engagement entirely.
**Fix**: Expand to 3-email series over 8 days. Email 1: product update. Email 2: +3 days if not clicked, social proof/reviews. Email 3: +5 days if not clicked, urgency + soft discount.
**Expected impact**: ~2-3x the conversion volume from this flow. Low risk since it's a low-frequency touch point.
**Effort**: 4 hours (write 2 additional emails + configure flow).

---

### T1-07: Implement Group Unsubscribe (Not Global)
**Problem**: When a customer unsubscribes from BraGoddess, they are globally unsubscribed from all domains. This eliminates future revenue opportunities across all brands.
**Fix**: Implement domain-level unsubscribe: opt-out from BraGoddess = opt-out from BraGoddess only. Customer remains reachable via GentsLux, LuxFitting, SantaFare.
**Expected impact**: Recover an estimated 10-15% of currently lost contacts. With 2.15M customers and industry average ~20% cumulative optout, this could recover 40-60K deliverable contacts.
**Effort**: 2-4 hours (SendGrid group unsubscribe configuration + compliance check for CAN-SPAM/GDPR).

---

### T1-08: Hard Frequency Cap (5 Emails/Week Max Per Customer)
**Problem**: Customers in multiple active flows + weekly campaigns can receive 7-10 emails per week. No global cap defined. This drives the increasing optout rate.
**Fix**: Set global cap: max 5 emails per week per customer. Priority order: (1) Cart Abandon, (2) Winback, (3) Welcome, (4) Weekly campaigns, (5) Automation flows.
**Expected impact**: Reduced optout rate. Healthier list = better deliverability long-term.
**Effort**: 1-2 hours (SendGrid frequency management).

---

### T1-09: RFM-Differentiated Subject Lines for Champions and At Risk
**Problem**: Champions ($134.58 LTV) and Lost ($50.97 LTV) receive identical subject lines. High-value customers respond to exclusivity; low-engagement customers need re-ignition.
**Fix**:
- Champions/Loyal: "Your exclusive early access →" / "As one of our best customers…"
- At Risk/Need Attention: "We saved something for you" / "It's been a while — here's 10% back"
- New Customers: onboarding-focused, educational, trust-building
**Effort**: Segment-aware subject line variants in each campaign. 1-2 hours per send.

---

### T1-10: SantaFare Off-Season Reassignment (Mar–Oct)
**Problem**: SantaFare customers receive only ~16 emails/year (Nov-Feb). For 10 months they sit idle. Average LTV potential is wasted.
**Fix**: During March–October, route SantaFare customers to their 2nd-most-recently-purchased brand domain. Tag them as "SantaFare origin" to revert in November.
**Expected impact**: 10 additional months of engagement per year. Estimated additional revenue per active SantaFare customer: +$15-30/year based on overall CBH/1K benchmarks.
**Effort**: 3-4 hours (segment tagging + routing logic).

---

## TIER 2 — Easy Setup
_Requires some configuration in existing platform (SendGrid, analytics tool) or lightweight data work. No new vendors._

---

### T2-01: Browse Abandon Flow (2-Email Sequence)
**Trigger**: Customer visits a product page for 60+ seconds but does not add to cart.
**Flow**: Email 1 (1 hour after visit): "Still thinking about [product]?" → Email 2 (+20 hours if not clicked): "Others are looking at this too" + urgency element.
**Why it matters**: Browse-to-cart intent is higher than list-average. Industry standard conversion rate for browse abandon is 2-5% vs. ~1% for standard campaigns.
**Requires**: Behavioral tracking pixel on product pages (SendGrid's website tracking or a lightweight JS event).
**Effort**: 1-2 days.

---

### T2-02: Birthday Flow
**Trigger**: Customer's birth month (collect at opt-in form, or infer from "birth month" field).
**Flow**: 1 email on the 1st of birth month. Offer: 15% off valid for 30 days.
**Why it matters**: Birthday emails average 3× higher CTR and 5× higher revenue per email vs. standard sends. Industry open rates: 75-80%.
**Requires**: Birthday data field in customer profile. Can start collecting immediately; use existing customers' order history month as proxy.
**Effort**: 2-3 days (opt-in form update + flow build).

---

### T2-03: Loyalty Milestone Flow
**Triggers**:
- 3rd order placed
- $100 cumulative spend
- $250 cumulative spend
- $500 cumulative spend
- $1,000 cumulative spend
**Flow**: 1 email per milestone. Escalating reward: recognition → discount → free product → VIP status.
**Why it matters**: Loyalty milestones activate sunk-cost psychology. Customers who receive a milestone acknowledgment are 40% more likely to make the next purchase within 30 days (industry benchmark).
**Requires**: Custom event trigger in SendGrid or webhook from order platform.
**Effort**: 3-5 days.

---

### T2-04: Cross-Sell Campaign: Bra Buyers → Pants
**Insight**: Pants buyers have $87.98 avg LTV vs. Bra buyers at $61.51. A bra customer who also buys pants is worth 43% more.
**Fix**: Create a dedicated campaign segment: "Has bought Bra, has never bought Pants." Monthly cross-sell email highlighting top-performing pants products. Include BraGoddess-style copy + a LuxFitting or SantaFare product link.
**Requires**: Product purchase history segmentation (already partially done via tệp codes 21=Bra, 22=Pant). Cross-domain product linking.
**Effort**: 2-3 days.

---

### T2-05: High-Return-Rate Suppression or Re-education
**Insight**: 11.2% of customers (241K) have ≥50% return rate. These customers erode CBH/Delivered because they generate fulfillment and return processing costs.
**Fix**: Create suppression segment for customers with >50% return rate in last 12 months. Two strategies:
  - Option A: Suppress from campaigns entirely (preserves deliverability, reduces waste)
  - Option B: Send 1-2 "product fit guide" emails (educational content about sizing/fit) to reduce return intent
**Expected impact**: Reducing fulfilled-but-returned orders improves effective CBH/Delivered by 5-10%.
**Effort**: 1-2 days (segment build + optional email creation).

---

### T2-06: Systematic A/B Testing Program (8 Tests, Priority Queue)
Based on the 2026 initiatives already planned, the following test queue maximizes ROI:

| Priority | Test | Hypothesis |
|---|---|---|
| 1 | CTA above fold vs. current layout | Access rate +3-5pp |
| 2 | Educational content vs. pure sale | Access rate +2pp, optout -0.1pp |
| 3 | Single-product focus vs. multi-product grid | Init checkout rate +2pp |
| 4 | Animated product image vs. static | Access rate +1-2pp |
| 5 | Alternating text+image layout vs. image-heavy | View rate +2pp |
| 6 | Footer social proof (reviews) vs. no footer | Conv rate +1pp |
| 7 | 2-column vs. 3-column product grid | Click distribution |
| 8 | Long-image product photos vs. square | Access rate +1pp |

**Effort**: 2-4 hours per test setup. Run each for 2 full weeks minimum.

---

### T2-07: SendGrid AM Engagement
**Already in 2026 initiatives.** Specific asks:
- Get domain-level spam/deliverability diagnostics
- Request warm-up plan for increasing BraGoddess to 4 sends/week
- Review IP reputation score per domain
- Get recommendations for frequency cap implementation
**Effort**: 1 meeting + follow-up. Zero cost.

---

### T2-08: Store-Level LTV Optimization
**High-performing stores to study**: beeswan.com ($98.78 LTV, 1.57 avg orders), mayaloom.com ($87.71 LTV, 1.65 avg orders).
**Action**: Audit what's different — product mix? audience source? landing page? Apply learnings to lower-LTV stores.
**Low-return stores to investigate**: lynsiecharm.com (3.3% return rate, lowest of all top stores). Understand if this is product quality, audience, or category mix.
**Effort**: 1-2 days of analysis.

---

## TIER 3 — Complex Setup
_Requires significant development, new infrastructure, or multi-system integration._

---

### T3-01: AI Automation Agent (Campaign Generation + Flow Management)
**What**: An AI agent that auto-generates email copy variants (per brand, per tier, per segment) using the Claude API, schedules campaigns, and monitors performance.
**Architecture**:
```
Schedule trigger → agents/automation/campaign_generator.py
  → Claude API (copy generation per brand/tier/segment)
  → SendGrid API (create + schedule campaign)
  → agents/analytics/performance_analyzer.py (post-send monitoring)
  → Report to Slack/email
```
**Key capabilities**:
- Generate 4-brand × 4-tier × product-type variants in one run
- Auto-suggest subject line from CBH/1K performance history
- Flag underperforming campaigns before next send
**Requires**: Claude API key, SendGrid API key, Python runtime, job scheduler (cron or GitHub Actions)
**Effort**: 2-3 weeks.

---

### T3-02: AI Analytics Agent (Performance Dashboard + Anomaly Detection)
**What**: An agent that reads export data, detects anomalies (access rate drop, spam spike, CBH/1K below baseline), and generates weekly insight reports.
**Architecture**:
```
Data ingestion (data/raw/) → agents/analytics/performance_analyzer.py
  → anomaly_detector.py (flag deviations >2σ from rolling 4-week avg)
  → report_generator.py (Claude API for narrative insights)
  → Push report to Slack/email weekly
```
**Key metrics monitored**:
- Access/Delivered by brand + flow
- CBH/1K by segment
- Optout/spam rate trends
- RFM segment migration (customers moving from Loyal → At Risk)
**Requires**: Automated data export from SendGrid, Python data pipeline, Claude API, Slack webhook
**Effort**: 2-3 weeks.

---

### T3-03: AI-Powered Send-Time Optimization
**What**: Instead of fixed Tue/Wed/Thu/Fri sends, each customer receives email at their individual historically highest-engagement time.
**How**: Build an engagement time model per customer from historical open/click timestamps. Cluster customers into 6-8 send windows. Schedule each cluster separately.
**Expected impact**: Industry data shows send-time personalization improves open rates 5-10% and CTR 15-20%.
**Requires**: Historical open/click timestamp data export, ML clustering model, SendGrid scheduled send API
**Effort**: 3-4 weeks.

---

### T3-04: Email + SMS Combined Channel
**Already in 2026 SWOT initiatives (W8, T3)**. SMS can reach customers who have unsubscribed from email.
**Strategy**:
- Cart abandon: Email (1hr) → SMS (4hr if email not opened) → Email (day 5)
- Winback: Email (day 60) → SMS (day 67 if email not opened)
- Loyalty milestones: SMS first (feels more personal), then email follow-up
**Expected lift**: SMS cart abandon has 3-5× higher conversion rate vs email alone.
**Requires**: SMS platform (Klaviyo, Attentive, or Twilio), compliance (TCPA), opt-in flow update
**Effort**: 4-6 weeks.

---

### T3-05: Real-Time Dynamic Content in Email
**What**: Product images, prices, inventory status, and countdown timers update at email open time (not send time).
**Use cases**:
- Countdown timer: "Offer expires in X hours" (exact countdown at open)
- Live inventory: "Only 3 left in your size"
- Real-time product recommendations based on last website visit
**Requires**: Movable Ink, Liveclicker, or custom image rendering service
**Effort**: 3-4 weeks + ongoing cost (~$500-2000/month for service).

---

### T3-06: Predictive Churn Intervention
**What**: Identify customers moving from Loyal → At Risk BEFORE they go inactive, trigger proactive re-engagement campaign.
**Model features**: Recency of last open, recency of last click, recency of last purchase, purchase frequency trend, RFM score trajectory.
**Output**: Weekly "churn risk" list. Top 10K at-risk customers receive personalized re-engagement email with highest-converting offer for their product segment.
**Requires**: Data pipeline, scikit-learn or similar, weekly scoring job, automated campaign trigger
**Effort**: 4-6 weeks.

---

### T3-07: Cross-Domain Unified Customer Identity
**What**: The same person may shop at ellymuse.com AND comfysfit.com but is counted as two separate customers today. Merging these gives true multi-brand LTV.
**Why it matters**: If 5-10% of customers are cross-domain, their true LTV is significantly higher. This changes segment targeting and suppression logic.
**Requires**: Email-based identity resolution, probabilistic matching on address/name/IP, customer data platform (CDP)
**Effort**: 6-8 weeks.

---

## Priority Matrix

| ID | Impact | Effort | Priority |
|---|---|---|---|
| T1-02 | High | Low | 🔴 Do this week |
| T1-03 | High | Low | 🔴 Do this week |
| T1-01 | Medium | Low | 🔴 Do this week |
| T1-07 | High | Low | 🟠 This month |
| T1-08 | Medium | Low | 🟠 This month |
| T1-04 | Medium | Low | 🟠 This month |
| T2-01 | High | Medium | 🟠 This month |
| T2-03 | High | Medium | 🟡 Next quarter |
| T2-06 | High | Medium | 🟡 Next quarter |
| T3-01 | Very High | High | 🟡 Next quarter |
| T3-02 | Very High | High | 🟡 Next quarter |
| T3-03 | High | High | 🔵 H2 2026 |
| T3-04 | Very High | High | 🔵 H2 2026 |
| T3-05 | Medium | High | 🔵 H2 2026 |
| T3-06 | High | High | 🔵 H2 2026 |
