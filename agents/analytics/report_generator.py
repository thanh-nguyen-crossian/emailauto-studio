from pathlib import Path
from datetime import datetime
from html import escape


def _severity_color(severity: str) -> str:
    return {"high": "#dc2626", "medium": "#d97706"}.get(severity, "#6b7280")


def _pace_bar(ytd: float, target: float) -> str:
    if not target:
        return ""
    pct = min(round(ytd / target * 100, 1), 100)
    color = "#16a34a" if pct >= 80 else "#d97706" if pct >= 50 else "#dc2626"
    return (
        f'<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%">'
        f'<div style="background:{color};width:{pct}%;height:100%;border-radius:4px"></div>'
        f'</div><small style="color:{color}">{pct}% of annual target</small>'
    )


def _render_analysis_scope(metrics: dict) -> str:
    scope = metrics.get("analysis_scope") or {}
    if not scope:
        return ""
    sources = ", ".join(scope.get("sources") or ["master_plan"])
    sheets = scope.get("sheets") or []
    sheet_text = ", ".join(str(sheet) for sheet in sheets[:8])
    if len(sheets) > 8:
        sheet_text += f" + {len(sheets) - 8} more"
    timeline = f"{scope.get('start_month') or 'start'} to {scope.get('end_month') or 'latest'}"
    return f"""
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px">
      <div class="card" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc">
        <strong>Sources</strong><br><span style="color:#4b5563;font-size:13px">{escape(sources)}</span>
      </div>
      <div class="card" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc">
        <strong>Timeline</strong><br><span style="color:#4b5563;font-size:13px">{escape(timeline)}</span>
      </div>
      <div class="card" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc">
        <strong>Workbook Sheets</strong><br><span style="color:#4b5563;font-size:13px">{escape(sheet_text or 'All available sheets')}</span>
      </div>
    </div>"""


def _render_campaign_ops(metrics: dict) -> str:
    campaign_ops = metrics.get("campaign_ops") or {}
    brands = campaign_ops.get("brands") or {}
    if not brands:
        return '<p style="color:#6b7280">Campaign operations plan not generated.</p>'

    status_color = {
        "ready": "#16a34a",
        "watch": "#d97706",
        "needs_review": "#dc2626",
    }
    cards = ""
    for slug, plan in brands.items():
        color = status_color.get(plan.get("readiness"), "#6b7280")
        audience = plan.get("audience_filter", {})
        content = plan.get("content_route", {})
        measurement = plan.get("measurement_plan", {})
        page = measurement.get("page_signal", {})
        steps = plan.get("automation_steps", [])[:3]

        include = "<br>".join(escape(str(item)) for item in audience.get("include", [])[:3])
        exclude = "<br>".join(escape(str(item)) for item in audience.get("exclude", [])[:3])
        tags = "<br>".join(escape(str(item)) for item in audience.get("tags_to_apply", [])[:3])
        reasons = "<br>".join(escape(str(item)) for item in plan.get("readiness_reasons", [])[:3])
        step_html = "".join(
            f'<li><strong>{escape(str(step.get("step", "")))}</strong>: '
            f'{escape(str(step.get("action", "")))}</li>'
            for step in steps
        )

        avg_page = page.get("avg_purchase_per_access")
        page_text = (
            f'{avg_page:.1%} avg PO/access across {page.get("sample_size", 0)} page rows'
            if isinstance(avg_page, (float, int))
            else f'{page.get("sample_size", 0)} page rows'
        )

        cards += f"""
        <div class="card" style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
            <strong style="font-size:15px">{escape(str(plan.get("brand", slug)))}</strong>
            <span style="border:1px solid {color};color:{color};border-radius:999px;padding:2px 8px;font-size:12px">
              {escape(str(plan.get("readiness", "review")).replace("_", " ").upper())}
            </span>
          </div>
          <p style="margin:6px 0;color:#4b5563;font-size:13px">{reasons}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;line-height:1.5">
            <div><strong>Include</strong><br>{include}</div>
            <div><strong>Exclude</strong><br>{exclude}</div>
            <div><strong>Tags</strong><br>{tags}</div>
            <div><strong>Content Route</strong><br>{escape(str(content.get("recommended_type", "")))} @ {float(content.get("avg_access_rate") or 0):.2%} access</div>
          </div>
          <div style="margin-top:10px;font-size:12px">
            <strong>Automation</strong>
            <ul style="margin:4px 0 0 18px">{step_html}</ul>
          </div>
          <p style="margin:8px 0 0;color:#6b7280;font-size:12px">Page signal: {escape(page_text)}</p>
        </div>"""

    principles = "".join(
        f"<li>{escape(str(item))}</li>"
        for item in campaign_ops.get("principles", [])
    )
    return f"""
    <div style="margin-bottom:12px">
      <strong>Operating principles</strong>
      <ul style="line-height:1.7;margin-top:6px">{principles}</ul>
    </div>
    {cards}
    """


def _render_solution_plan(metrics: dict) -> str:
    plan = metrics.get("solutions") or {}
    solutions = plan.get("solutions") or []
    if not solutions:
        return '<p style="color:#16a34a">No urgent solution experiments generated.</p>'

    severity_color = {
        "high": "#dc2626",
        "medium": "#d97706",
        "watch": "#6b7280",
    }
    priorities = "".join(
        f"<li>{escape(str(item))}</li>"
        for item in plan.get("portfolio_priorities", [])
    )
    cards = ""
    for item in solutions[:8]:
        color = severity_color.get(item.get("severity"), "#6b7280")
        experiment = item.get("experiment", {})
        evidence = "".join(
            f"<li>{escape(str(point))}</li>"
            for point in item.get("evidence", [])[:3]
        )
        guards = " · ".join(str(g) for g in experiment.get("guardrails", []))
        cards += f"""
        <div class="card" style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
            <strong style="font-size:15px">{escape(str(item.get("brand", "")))}</strong>
            <span style="border:1px solid {color};color:{color};border-radius:999px;padding:2px 8px;font-size:12px">
              {escape(str(item.get("severity", "watch")).upper())} · {escape(str(item.get("category", ""))).replace("_", " ")}
            </span>
          </div>
          <p style="margin:6px 0;color:#111827"><strong>Problem:</strong> {escape(str(item.get("problem", "")))}</p>
          <p style="margin:4px 0;color:#4b5563"><strong>Root cause:</strong> {escape(str(item.get("root_cause", "")))}</p>
          <ul style="margin:6px 0 8px 18px;color:#4b5563;font-size:13px">{evidence}</ul>
          <p style="margin:4px 0;color:#111827"><strong>Solution:</strong> {escape(str(item.get("solution", "")))}</p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:9px 10px;margin-top:8px;font-size:12px;line-height:1.55">
            <strong>{escape(str(experiment.get("name", "Experiment")))}</strong><br>
            {escape(str(experiment.get("hypothesis", "")))}<br>
            <span style="color:#6b7280">Primary: {escape(str(experiment.get("primary_metric", "Access/Delivered")))} · Guardrails: {escape(guards)}</span><br>
            <span style="color:#16a34a">{escape(str(experiment.get("success_rule", "")))}</span>
          </div>
          <p style="margin:8px 0 0;color:#6b7280;font-size:12px">Owner: {escape(str(item.get("owner", "")))} · Timing: {escape(str(item.get("timeframe", "")))} · Fallback: {escape(str(item.get("fallback_if_fail", "")))}</p>
        </div>"""

    return f"""
    <div style="margin-bottom:12px">
      <strong>Portfolio priorities</strong>
      <ul style="line-height:1.7;margin-top:6px">{priorities}</ul>
    </div>
    {cards}
    """


def generate_report(metrics: dict, analysis: dict, output_path: Path) -> None:
    """Generate a self-contained HTML report and write it to output_path."""
    today = metrics["generated_at"][:10]
    brands = metrics["brands"]
    anomalies = metrics.get("anomalies", [])
    scope_html = _render_analysis_scope(metrics)

    # ── Section 1: Anomaly Alerts ──────────────────────────────────────────
    anomaly_html = ""
    for a in anomalies:
        color = _severity_color(a["severity"])
        explained = next(
            (e for e in analysis.get("anomalies_explained", [])
             if e.get("brand") == a["brand"] and e.get("metric") == a["metric"]),
            {}
        )
        action = explained.get("recommended_action", "")
        explanation = explained.get("explanation", "")

        if a["metric"] == "cbh_monthly_pace":
            detail = f"Monthly pace: ${a['current']:,.0f} vs required ${a['required']:,.0f} ({a['gap_pct']}%)"
        elif a["metric"] == "optout_rate":
            detail = f"Optout: {a['current_pct']}% (baseline {a['baseline_pct']}%)"
        elif a["metric"] == "content_type_mismatch":
            detail = (
                f"{a['best_type']}: {a['best_sends']} sends @ {a['best_cbh_1k']} CBH/1K — "
                f"{a['overused_type']}: {a['overused_sends']} sends @ {a['overused_cbh_1k']} CBH/1K"
            )
        elif a["metric"] == "f_segment_share":
            detail = f"F-segment: {a['f_sends']}/{a['total_sends']} sends ({a['f_share_pct']}% of volume)"
        else:
            detail = str(a)

        anomaly_html += f"""
        <div style="border-left:4px solid {color};background:#fef9f0;padding:12px 16px;margin-bottom:8px;border-radius:4px">
          <strong style="color:{color}">[{a['severity'].upper()}] {a['brand'].upper()} — {a['metric'].replace('_',' ').title()}</strong><br>
          <span style="color:#374151">{detail}</span><br>
          {f'<em style="color:#6b7280">{explanation}</em><br>' if explanation else ""}
          {f'<strong style="color:#111827">Action:</strong> {action}' if action else ""}
        </div>"""

    if not anomaly_html:
        anomaly_html = '<p style="color:#16a34a">✅ No anomalies detected this period.</p>'

    # ── Section 2: CBH Target Tracker ─────────────────────────────────────
    target_rows = ""
    for slug in ["bragoddess", "gentslux", "luxfitting", "santafare"]:
        data = brands[slug]
        t = data.get("target", {})
        ytd = float(t.get("ytd_2026") or 0)
        target_val = float(t.get("target_2026") or 0)
        required = float(t.get("required_monthly") or 0)
        pace_bar = _pace_bar(ytd, target_val)
        target_rows += f"""
        <tr>
          <td style="padding:8px 12px;font-weight:600">{slug.replace('bragoddess','BraGoddess').replace('gentslux','GentsLux').replace('luxfitting','LuxFitting').replace('santafare','SantaFare')}</td>
          <td style="padding:8px 12px;text-align:right">${ytd:,.0f}</td>
          <td style="padding:8px 12px;text-align:right">${target_val:,.0f}</td>
          <td style="padding:8px 12px;text-align:right">${required:,.0f}/mo</td>
          <td style="padding:8px 12px;min-width:180px">{pace_bar}</td>
        </tr>"""

    # ── Section 3: Content Type Winners ───────────────────────────────────
    ct_html = ""
    for slug in ["bragoddess", "gentslux", "luxfitting", "santafare"]:
        display = slug.replace("bragoddess","BraGoddess").replace("gentslux","GentsLux").replace("luxfitting","LuxFitting").replace("santafare","SantaFare")
        cts = sorted(brands[slug].get("content_types", []), key=lambda x: float(x.get("avg_cbh_1k") or 0), reverse=True)
        if not cts:
            continue
        rows = "".join(
            f'<tr style="{"background:#f0fdf4" if i==0 else ""}">'
            f'<td style="padding:4px 8px">{ct.get("type","")}</td>'
            f'<td style="padding:4px 8px;text-align:right">{ct.get("avg_cbh_1k","")}</td>'
            f'<td style="padding:4px 8px;text-align:right">{ct.get("n_sends","")}</td>'
            f'</tr>'
            for i, ct in enumerate(cts[:6])
        )
        ct_html += f"""
        <div style="margin-bottom:20px">
          <h4 style="margin:0 0 6px">{display}</h4>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead><tr style="background:#f3f4f6"><th style="padding:4px 8px;text-align:left">Content Type</th><th style="padding:4px 8px;text-align:right">CBH/1K</th><th style="padding:4px 8px;text-align:right">Sends</th></tr></thead>
            <tbody>{rows}</tbody>
          </table>
        </div>"""

    # ── Section 4: Top 3 Recommendations ──────────────────────────────────
    reco_html = ""
    effort_colors = {"low": "#16a34a", "medium": "#d97706", "high": "#dc2626"}
    for r in analysis.get("recommendations", [])[:3]:
        effort_color = effort_colors.get(r.get("effort", ""), "#6b7280")
        reco_html += f"""
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong style="font-size:15px">#{r.get('priority','')} {r.get('action','')}</strong>
            <span style="font-size:12px;color:{effort_color};border:1px solid {effort_color};padding:2px 8px;border-radius:12px">{r.get('effort','').upper()} effort</span>
          </div>
          <p style="margin:4px 0;color:#4b5563">{r.get('rationale','')}</p>
          <p style="margin:4px 0;color:#16a34a;font-size:13px">Expected: {r.get('expected_impact','')}</p>
        </div>"""

    # ── Section 5: Executive Summary ──────────────────────────────────────
    exec_html = "".join(
        f'<li style="margin-bottom:6px">{b}</li>'
        for b in analysis.get("executive_summary", [])
    )

    # ── Section 6: Campaign Suggestions ───────────────────────────────────
    suggest_html = ""
    for s in analysis.get("campaign_suggestions", []):
        brand_display = s.get("brand","").replace("bragoddess","BraGoddess").replace("gentslux","GentsLux").replace("luxfitting","LuxFitting").replace("santafare","SantaFare")
        suggest_html += f"""
        <div style="padding:10px;border-left:3px solid #3b82f6;margin-bottom:8px;background:#eff6ff">
          <strong>{brand_display}</strong> → {s.get('recommended_content_type','')}
          <br><small style="color:#6b7280">{s.get('reasoning','')}</small>
        </div>"""

    # ── Section 7: Solution Plan ──────────────────────────────────────────
    solution_plan_html = _render_solution_plan(metrics)

    # ── Section 8: Campaign Operations Plan ───────────────────────────────
    campaign_ops_html = _render_campaign_ops(metrics)

    # ── Assemble full HTML ─────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EmailAuto Report — {today}</title>
<style>
  @media (prefers-color-scheme: dark) {{
    body {{ background: #111827; color: #f9fafb; }}
    table {{ color: #f9fafb; }}
    th {{ background: #1f2937 !important; }}
    .card {{ background: #1f2937 !important; border-color: #374151 !important; }}
  }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 900px; margin: 0 auto; padding: 24px; color: #111827; }}
  h2 {{ font-size: 18px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 32px; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th {{ background: #f3f4f6; text-align: left; padding: 8px 12px; font-size: 13px; }}
</style>
</head>
<body>
<div style="background:#1e40af;color:white;padding:20px 24px;border-radius:8px;margin-bottom:24px">
  <h1 style="margin:0;font-size:20px">EmailAuto Weekly Report</h1>
  <p style="margin:4px 0 0;opacity:0.8">Generated: {today} | Brands: BraGoddess · GentsLux · LuxFitting · SantaFare</p>
</div>

<h2>📋 Executive Summary</h2>
{scope_html}
<ul style="line-height:1.7">{exec_html}</ul>

<h2>🚨 Anomaly Alerts ({len(anomalies)} found)</h2>
{anomaly_html}

<h2>📊 CBH Target Tracker</h2>
<table>
  <thead><tr>
    <th>Brand</th><th style="text-align:right">YTD CBH</th>
    <th style="text-align:right">2026 Target</th>
    <th style="text-align:right">Required/Month</th>
    <th>Pace</th>
  </tr></thead>
  <tbody>{target_rows}</tbody>
</table>

<h2>🏆 Content Type Performance</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">{ct_html}</div>

<h2>💡 Top Recommendations</h2>
{reco_html}

<h2>📅 Campaign Suggestions</h2>
{suggest_html}

<h2>🧭 Solution Plan</h2>
{solution_plan_html}

<h2>⚙️ Campaign Operations Plan</h2>
{campaign_ops_html}

<footer style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
  EmailAuto Analytics Agent · Report generated {today} · Data from Source/ dashboards
</footer>
</body>
</html>"""

    output_path.write_text(html, encoding="utf-8")
