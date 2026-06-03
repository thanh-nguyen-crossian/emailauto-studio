"use client";

import type { GenBrief } from "@/lib/briefgen";

// Renders the generated designer brief (combined with the copy) and offers a markdown download.
export function BriefView({ brief, onDownload }: { brief: GenBrief; onDownload: () => void }) {
  const cd = brief.creative_direction || ({} as GenBrief["creative_direction"]);
  const hc = cd.hook_contract || ({} as GenBrief["creative_direction"]["hook_contract"]);
  const banner = brief.banner || ({} as GenBrief["banner"]);
  const qc = brief.quality_checks || ({} as GenBrief["quality_checks"]);

  const Row = ({ k, v }: { k: string; v?: string }) => (
    <div className="flex gap-2 text-sm py-0.5">
      <span className="text-[var(--muted)] w-32 shrink-0">{k}</span>
      <span className="flex-1">{v || "—"}</span>
    </div>
  );

  const riskColor = (v?: string) =>
    /high/i.test(v || "") ? "var(--bad)" : /med/i.test(v || "") ? "var(--warn)" : "var(--ok)";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">
          Designer brief generated alongside the copy — creative direction, visual guidance, and self-QA.
        </p>
        <button onClick={onDownload} className="btn-ghost">⬇️ Download brief (.md)</button>
      </div>

      <Card title="Creative direction">
        <div className="flex flex-wrap gap-2 mb-2">
          <Tag label={`Angle: ${cd.angle || "—"}`} />
          <Tag label={`Framework: ${cd.framework || "—"}`} />
        </div>
        <Row k="Flow" v={cd.flow} />
        <Row k="Differentiator" v={cd.differentiator} />
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          <div className="text-xs font-semibold text-[var(--accent)] mb-1">Hook Contract</div>
          <Row k="Segment" v={hc.segment_insight} />
          <Row k="Emotion" v={hc.emotion} />
          <Row k="Hero product" v={hc.hero_product} />
          <Row k="Proof / price" v={hc.proof_or_price} />
          <Row k="Urgency" v={hc.urgency} />
          <Row k="Avoid" v={hc.avoid_rule} />
        </div>
      </Card>

      <Card title="Theme (visual brief)">
        <p className="text-sm leading-relaxed">{brief.theme || "—"}</p>
      </Card>

      <Card title="Banner">
        {banner.logo_stars && <div className="text-xs text-[var(--muted)] mb-1">{banner.logo_stars}</div>}
        <div className="text-sm font-bold whitespace-pre-line">{banner.main_text || "—"}</div>
        {banner.sub_text && <div className="text-sm text-[var(--muted)] mt-1">{banner.sub_text}</div>}
        {banner.image_guidance && (
          <div className="mt-2 rounded bg-[var(--surface-2)] border border-[var(--border)] p-2 text-xs">
            <span className="text-[var(--accent)] font-semibold">📷 Image: </span>
            {banner.image_guidance}
          </div>
        )}
        {banner.review_quote && <div className="text-xs italic text-[var(--muted)] mt-2 border-l-2 border-[var(--border)] pl-2">{banner.review_quote}</div>}
        {banner.cta && <div className="mt-2 text-sm"><span className="text-[var(--muted)]">CTA: </span><strong style={{ color: "var(--accent)" }}>{banner.cta}</strong></div>}
      </Card>

      <Card title={`Product blocks (${(brief.products || []).length})`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(brief.products || []).map((p, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm">{p.name}</div>
                {p.popup_badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--accent-2)] text-[var(--accent-2)]">{p.popup_badge}</span>}
              </div>
              <div className="text-xs font-bold text-[var(--accent)] mt-1">{p.main_text}</div>
              {p.sub_text && <div className="text-xs text-[var(--muted)] mt-1">{p.sub_text}</div>}
              {(p.usps || []).map((u, j) => (
                <div key={j} className="text-xs mt-0.5">+ {u}</div>
              ))}
              {p.review && <div className="text-xs italic text-[var(--muted)] mt-1">{p.review}</div>}
              {p.cta && <div className="text-xs mt-1"><strong style={{ color: "var(--accent)" }}>{p.cta}</strong></div>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Self-QA (model)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <QC k="Click reason" v={qc.click_reason} />
          <QC k="Hook alignment" v={qc.hook_alignment} />
          <QC k="Proof safety" v={qc.proof_safety} />
          <QC k="Spam risk" v={qc.spam_risk} color={riskColor(qc.spam_risk)} />
          <QC k="Opt-out risk" v={qc.optout_risk} color={riskColor(qc.optout_risk)} />
          <QC k="First 200px" v={qc.first_200px} />
          <QC k="Inline link" v={qc.inline_link_plan} />
          <QC k="Layout risk" v={qc.layout_risk} />
          <QC k="Photo watchout" v={qc.photo_watchout} />
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="text-xs px-2.5 py-1 rounded-full border border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent)] font-medium">
      {label}
    </span>
  );
}

function QC({ k, v, color }: { k: string; v?: string; color?: string }) {
  return (
    <div className="rounded bg-[var(--surface-2)] border border-[var(--border)] p-2">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: color || "var(--muted)" }}>{k}</div>
      <div className="text-xs mt-0.5">{v || "—"}</div>
    </div>
  );
}

/** Plain-markdown export of a brief. */
export function briefToMarkdown(brief: GenBrief, title: string): string {
  const cd = brief.creative_direction || ({} as GenBrief["creative_direction"]);
  const hc = cd.hook_contract || ({} as GenBrief["creative_direction"]["hook_contract"]);
  const b = brief.banner || ({} as GenBrief["banner"]);
  const qc = brief.quality_checks || ({} as GenBrief["quality_checks"]);
  const lines = [
    `# Designer Brief — ${title}`,
    ``,
    `## Creative Direction`,
    `- Angle: ${cd.angle || ""}`,
    `- Framework: ${cd.framework || ""}`,
    `- Flow: ${cd.flow || ""}`,
    `- Differentiator: ${cd.differentiator || ""}`,
    ``,
    `### Hook Contract`,
    `- Segment insight: ${hc.segment_insight || ""}`,
    `- Emotion: ${hc.emotion || ""}`,
    `- Hero product: ${hc.hero_product || ""}`,
    `- Proof/price: ${hc.proof_or_price || ""}`,
    `- Urgency: ${hc.urgency || ""}`,
    `- Avoid: ${hc.avoid_rule || ""}`,
    ``,
    `## Theme`,
    brief.theme || "",
    ``,
    `## Banner`,
    `- Logo/stars: ${b.logo_stars || ""}`,
    `- Main: ${b.main_text || ""}`,
    `- Sub: ${b.sub_text || ""}`,
    `- Image: ${b.image_guidance || ""}`,
    `- Review: ${b.review_quote || ""}`,
    `- CTA: ${b.cta || ""}`,
    ``,
    `## Product blocks`,
    ...(brief.products || []).flatMap((p) => [
      `### ${p.name}`,
      `- Badge: ${p.popup_badge || ""}`,
      `- Main: ${p.main_text || ""}`,
      `- Sub: ${p.sub_text || ""}`,
      ...(p.usps || []).map((u) => `- USP: ${u}`),
      `- Review: ${p.review || ""}`,
      `- CTA: ${p.cta || ""}`,
      ``,
    ]),
    `## Self-QA`,
    `- Click reason: ${qc.click_reason || ""}`,
    `- Hook alignment: ${qc.hook_alignment || ""}`,
    `- Proof safety: ${qc.proof_safety || ""}`,
    `- Spam risk: ${qc.spam_risk || ""}`,
    `- Opt-out risk: ${qc.optout_risk || ""}`,
    `- First 200px: ${qc.first_200px || ""}`,
    `- Inline link: ${qc.inline_link_plan || ""}`,
    `- Layout risk: ${qc.layout_risk || ""}`,
    `- Photo watchout: ${qc.photo_watchout || ""}`,
  ];
  return lines.join("\n");
}
