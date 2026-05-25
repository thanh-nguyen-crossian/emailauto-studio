# Email Performance Insights & Optimization Roadmap
_Generated: 2026-05-25 | Data range: Jan 2025 – May 2026_

---

## Executive Summary

The email program is in a paradoxical state: **opens are rising, clicks are falling, but revenue per click is climbing**. CBH/1K improved from 59.64 → 70.36 (+18%), yet access rate fell from 17.21% → 13.32% (-23%). This means the funnel is narrowing at the click stage, but those who do click convert and spend more. The core opportunity is to recover the lost clickers without diluting the quality of engagement.

Three compounding forces drive access rate decline:
1. **Apple Mail Privacy Protection (MPP)** inflates open counts for ~49% of subscribers → denominator grows while actual clickers stay flat → access/open rate looks worse than reality
2. **Email body-copy misalignment** — subject lines are working (open rate up), but body copy is not delivering on the promise
3. **List fatigue** — optout increasing while spam decreasing; customers are choosing soft exit (unsubscribe) over hard exit (spam), a sign of mild disengagement, not hostility

---

## Key Metrics Snapshot

### BraGoddess (primary brand, largest volume)

| Metric | 2025 Median | 2026 Median | Δ | Signal |
|---|---|---|---|---|
| Open Rate | 33.65% | 36.01% | +2.36pp | ✅ Improving |
| Access Rate | 17.21% | 13.32% | -3.89pp | ❌ Degrading |
| View Rate | 94.73% | 92.99% | -1.74pp | → Flat |
| Init Checkout Rate | 10.10% | 14.29% | +4.19pp | ✅✅ Strong |
| Checkout Rate | 69.67% | 72.17% | +2.5pp | ✅ Improving |
| Conv Rate (PO/Co) | 95.14% | 94.97% | -0.17pp | → Flat |
| AOV | $36.04 | $38.64 | +$2.60 | ✅ Improving |
| **CBH/1K** | **59.64** | **70.36** | **+17.9%** | **✅✅ Strong** |

### Email-Level Access Rate Decline (BraGoddess)

| Email | 2025 | 2026 | Δ |
|---|---|---|---|
| Email 1 (Welcome) | 19.99% | 14.03% | -5.96pp |
| Email 2 | 19.69% | 14.70% | -4.99pp |
| Email 3 | 11.45% | 8.87% | -2.58pp |

---

## Customer Base Insights

### Volume + LTV Correlation
Customers receiving 100+ emails have **36% higher LTV** ($94.72 vs $69.66) and **3.3× higher repeat rate** (41.2% vs 12.6%) compared to those receiving 0 emails. Every additional engaged customer in the high-frequency tier is worth ~$25 more in lifetime revenue.

### RFM Segment Opportunity Map

| Segment | Customers | Avg LTV | Priority |
|---|---|---|---|
| Champions | 219,540 | $134.58 | Retain + upsell |
| At Risk | 260,151 | $80.03 | **Urgent rescue** — high LTV slipping |
| Loyal | 356,844 | $78.55 | Deepen relationship |
| Lost Champions | 241,932 | $68.65 | Winback investment-worthy |
| Potential Loyalists | 264,821 | $54.45 | Nurture to Loyal |
| Need Attention | 279,082 | $52.24 | Re-engage |
| New Customers | 237,262 | $56.42 | Onboard well |
| Lost | 297,302 | $50.97 | Low-cost reactivation only |

**Critical gap**: At Risk (260K customers, $80 LTV) is higher LTV than Loyal. These are recent high-spenders who stopped engaging. This is the single highest-ROI segment to target.

### Product Line LTV

| Product | Customers | Avg LTV | Return Rate |
|---|---|---|---|
| Pant | 855,584 | **$87.98** | 9.7% |
| Panties | 60,346 | $66.26 | 6.7% |
| Bra | 964,438 | $61.51 | 12.0% |
| Accessories | 271,322 | $49.90 | 4.5% |

Pants buyers have 43% higher LTV than bra buyers. Cross-sell from bra to pants is the highest-LTV upgrade path.

---

## Root Cause Analysis: Access Rate Decline

### Cause 1: Apple MPP Inflates Open Denominator
~49% of subscribers use Apple Mail. MPP pre-fetches email open pixels, inflating opens without real engagement. Since access rate = access/open, a rising open rate with flat actual clicks = declining access rate metric. **The actual problem may be 40-50% less severe than the metric shows.**

**Fix**: Recalculate access rate as access/delivered (not access/open) for MPP-immune measurement. This is Access/Delivered — already tracked in the XLSX as a separate column.

### Cause 2: Email Body Not Delivering on Subject Line Promise
Open rate up = subject lines are compelling. Access rate down = body copy isn't translating interest to action. The disconnect is in the email body.

**Pattern**: Email 1 has the worst drop (-5.96pp). This is the email with highest open rates (54%) — high expectation set by subject line, not delivered in body.

**Fix**: Redesign Email 1 body to have a single, prominent CTA above the fold. The current layout (hero → intro → product row) buries the CTA.

### Cause 3: Bot Link Scanning (Partially Identified)
Tech team has identified bot link scanning as a partial cause. Bots click links in emails before they reach the inbox (for security scanning), inflating "access" counts in earlier periods, then platforms got better at filtering — making recent data look lower.

This is actually good news — some of the "decline" is false. Focus on genuine human engagement signals instead.

### Cause 4: List Maturity / Fatigue
The list is aging. Average 30.3 emails sent per customer. Customers in the 26-50 emails bucket have 24.3% repeat rate vs 18.7% for 1-10 emails, suggesting there's a clear engagement curve. The curve flattens and eventually reverses for over-messaged customers.

---

