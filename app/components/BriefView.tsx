"use client";

import type { GenBrief, GenProductBlock } from "@/lib/briefgen";

// Renders the generated designer brief (combined with the copy) and offers a markdown download.
export function BriefView({
  brief,
  onDownload,
  onChange,
}: {
  brief: GenBrief;
  onDownload: () => void;
  onChange?: (brief: GenBrief) => void;
}) {
  const cd = brief.creative_direction || ({} as GenBrief["creative_direction"]);
  const hc = cd.hook_contract || ({} as GenBrief["creative_direction"]["hook_contract"]);
  const banner = brief.banner || ({} as GenBrief["banner"]);
  const qc = brief.quality_checks || ({} as GenBrief["quality_checks"]);
  const editable = !!onChange;

  const patch = (next: Partial<GenBrief>) => onChange?.({ ...brief, ...next });
  const patchSubject = (key: string, next: Partial<NonNullable<GenBrief["subject_lines"]>[string]>) =>
    patch({ subject_lines: { ...(brief.subject_lines || {}), [key]: { ...(brief.subject_lines?.[key] || { subject: "", preheader: "" }), ...next } } });
  const patchSubjectOption = (key: string, index: number, field: "style" | "model_hint" | "subject" | "preheader" | "shared_thread", value: string) => {
    const line = brief.subject_lines?.[key];
    if (!line) return;
    const options = [...(line.options || [])];
    options[index] = { ...(options[index] || { style: "", model_hint: "", subject: "", preheader: "", shared_thread: "" }), [field]: value };
    patchSubject(key, { options });
  };
  const patchBody = (key: string, value: string) =>
    patch({ body: { ...(brief.body || {}), [key]: value } });
  const patchDirection = (next: Partial<typeof cd>) =>
    patch({ creative_direction: { ...cd, hook_contract: hc, ...next } });
  const patchHook = (next: Partial<typeof hc>) =>
    patchDirection({ hook_contract: { ...hc, ...next } });
  const patchBanner = (next: Partial<typeof banner>) =>
    patch({ banner: { ...banner, ...next } });
  const patchQa = (field: keyof typeof qc, value: string) =>
    patch({ quality_checks: { ...qc, [field]: value } });
  const patchProduct = (index: number, next: Partial<GenProductBlock>) => {
    const products = [...(brief.products || [])];
    products[index] = { ...products[index], ...next };
    patch({ products });
  };
  const patchProductUsp = (productIndex: number, uspIndex: number, value: string) => {
    const product = (brief.products || [])[productIndex];
    if (!product) return;
    const usps = [...(product.usps || [])];
    usps[uspIndex] = value;
    patchProduct(productIndex, { usps });
  };
  const addProductUsp = (productIndex: number) => {
    const product = (brief.products || [])[productIndex];
    if (!product) return;
    patchProduct(productIndex, { usps: [...(product.usps || []), ""] });
  };

  const riskColor = (v?: string) =>
    /high/i.test(v || "") ? "var(--bad)" : /med/i.test(v || "") ? "var(--warn)" : "var(--ok)";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">
          Designer brief generated alongside the copy — editable creative direction, visual guidance, and self-QA.
        </p>
        <button onClick={onDownload} className="btn-ghost">⬇️ Download brief (.md)</button>
      </div>

      <Card title="Creative direction">
        {editable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <EditField label="Angle" value={cd.angle} onChange={(v) => patchDirection({ angle: v })} />
            <EditField label="Framework" value={cd.framework} onChange={(v) => patchDirection({ framework: v })} />
            <EditArea label="Flow" value={cd.flow} onChange={(v) => patchDirection({ flow: v })} />
            <EditArea label="Differentiator" value={cd.differentiator} onChange={(v) => patchDirection({ differentiator: v })} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              <Tag label={`Angle: ${cd.angle || "—"}`} />
              <Tag label={`Framework: ${cd.framework || "—"}`} />
            </div>
            <Row k="Flow" v={cd.flow} />
            <Row k="Differentiator" v={cd.differentiator} />
          </>
        )}
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          <div className="text-xs font-semibold text-[var(--accent)] mb-1">Hook Contract</div>
          {editable ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <EditArea label="Segment" value={hc.segment_insight} onChange={(v) => patchHook({ segment_insight: v })} />
              <EditArea label="Emotion" value={hc.emotion} onChange={(v) => patchHook({ emotion: v })} />
              <EditField label="Hero product" value={hc.hero_product} onChange={(v) => patchHook({ hero_product: v })} />
              <EditArea label="Proof / price" value={hc.proof_or_price} onChange={(v) => patchHook({ proof_or_price: v })} />
              <EditField label="Urgency" value={hc.urgency} onChange={(v) => patchHook({ urgency: v })} />
              <EditArea label="Avoid" value={hc.avoid_rule} onChange={(v) => patchHook({ avoid_rule: v })} />
            </div>
          ) : (
            <>
              <Row k="Segment" v={hc.segment_insight} />
              <Row k="Emotion" v={hc.emotion} />
              <Row k="Hero product" v={hc.hero_product} />
              <Row k="Proof / price" v={hc.proof_or_price} />
              <Row k="Urgency" v={hc.urgency} />
              <Row k="Avoid" v={hc.avoid_rule} />
            </>
          )}
        </div>
      </Card>

      <Card title="Subject + preheader options">
        <div className="grid grid-cols-1 gap-3">
          {Object.entries(brief.subject_lines || {}).map(([key, line]) => (
            <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="text-xs font-semibold text-[var(--accent)] mb-2">{key.replace("seg_", "SEG ").replace("_", "-")}</div>
              {editable ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <EditField label="Selected subject" value={line.subject} onChange={(v) => patchSubject(key, { subject: v })} />
                    <EditField label="Selected preheader" value={line.preheader} onChange={(v) => patchSubject(key, { preheader: v })} />
                    <EditField label="Style" value={line.style} onChange={(v) => patchSubject(key, { style: v })} />
                    <EditField label="Shared thread" value={line.shared_thread} onChange={(v) => patchSubject(key, { shared_thread: v })} />
                  </div>
                  {(line.options || []).map((o, i) => (
                    <div key={i} className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">Option {i + 1}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <EditField label="Model hint" value={o.model_hint} onChange={(v) => patchSubjectOption(key, i, "model_hint", v)} />
                        <EditField label="Style" value={o.style} onChange={(v) => patchSubjectOption(key, i, "style", v)} />
                        <EditField label="Subject" value={o.subject} onChange={(v) => patchSubjectOption(key, i, "subject", v)} />
                        <EditField label="Preheader" value={o.preheader} onChange={(v) => patchSubjectOption(key, i, "preheader", v)} />
                        <div className="md:col-span-2">
                          <EditField label="Shared thread" value={o.shared_thread} onChange={(v) => patchSubjectOption(key, i, "shared_thread", v)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold">{line.subject || "—"}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">{line.preheader || "—"}</div>
                  {(line.options || []).map((o, i) => (
                    <div key={i} className="mt-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-xs">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{o.model_hint || "AI"} · {o.style || `Option ${i + 1}`}</div>
                      <div className="font-semibold mt-0.5">{o.subject}</div>
                      <div className="text-[var(--muted)] mt-0.5">{o.preheader}</div>
                      {o.shared_thread && <div className="text-[var(--accent-2)] mt-0.5">Thread: {o.shared_thread}</div>}
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Theme (visual brief)">
        {editable ? (
          <EditArea label="Theme" value={brief.theme} onChange={(v) => patch({ theme: v })} />
        ) : (
          <p className="text-sm leading-relaxed">{brief.theme || "—"}</p>
        )}
      </Card>

      <Card title="Body + P.S.">
        <div className="flex flex-col gap-3">
          {Object.entries(brief.body || {}).map(([key, value]) => (
            editable ? (
              <EditArea key={key} label={key === "base" ? "Base body" : key.replace("seg_", "SEG ").replace("_", "-")} value={value} rows={5} onChange={(v) => patchBody(key, v)} />
            ) : (
              <div key={key}>
                <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">{key === "base" ? "Base body" : key.replace("seg_", "SEG ").replace("_", "-")}</div>
                <p className="text-sm whitespace-pre-line leading-relaxed">{value || "—"}</p>
              </div>
            )
          ))}
          {editable ? (
            <EditField label="P.S. (10-15 words)" value={brief.ps} onChange={(v) => patch({ ps: v })} />
          ) : (
            <div className="text-sm"><span className="text-[var(--muted)]">P.S. </span>{brief.ps || "—"}</div>
          )}
        </div>
      </Card>

      <Card title="Banner">
        {editable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <EditField label="Logo / stars" value={banner.logo_stars} onChange={(v) => patchBanner({ logo_stars: v })} />
            <EditField label="CTA" value={banner.cta} onChange={(v) => patchBanner({ cta: v })} />
            <EditField label="Main text 1" value={banner.main_text_1 || banner.main_text} onChange={(v) => patchBanner({ main_text_1: v, main_text: [v, banner.main_text_2].filter(Boolean).join("\n") })} />
            <EditField label="Main text 2" value={banner.main_text_2} onChange={(v) => patchBanner({ main_text_2: v, main_text: [banner.main_text_1 || banner.main_text, v].filter(Boolean).join("\n") })} />
            <EditField label="Sub text 1" value={banner.sub_text_1 || banner.sub_text} onChange={(v) => patchBanner({ sub_text_1: v, sub_text: [v, banner.sub_text_2].filter(Boolean).join("\n") })} />
            <EditField label="Sub text 2" value={banner.sub_text_2} onChange={(v) => patchBanner({ sub_text_2: v, sub_text: [banner.sub_text_1 || banner.sub_text, v].filter(Boolean).join("\n") })} />
            <EditField label="Main image" value={banner.main_image} onChange={(v) => patchBanner({ main_image: v })} />
            <EditField label="Sub image" value={banner.sub_image} onChange={(v) => patchBanner({ sub_image: v })} />
            <EditField label="Trust-booster" value={banner.trust_booster} onChange={(v) => patchBanner({ trust_booster: v })} />
            <EditField label="Emergency" value={banner.emergency} onChange={(v) => patchBanner({ emergency: v })} />
            <div className="md:col-span-2">
              <EditArea label="Image guidance bullets" value={banner.image_guidance} rows={6} onChange={(v) => patchBanner({ image_guidance: v })} />
            </div>
            <div className="md:col-span-2">
              <EditArea
                label="Review texts"
                value={(banner.review_texts || (banner.review_quote ? [banner.review_quote] : [])).join("\n")}
                onChange={(v) => patchBanner({ review_texts: v.split(/\n+/).map((line) => line.trim()).filter(Boolean), review_quote: v.split(/\n+/)[0] || "" })}
              />
            </div>
          </div>
        ) : (
          <>
            {banner.logo_stars && <div className="text-xs text-[var(--muted)] mb-1">{banner.logo_stars}</div>}
            <div className="text-sm font-bold whitespace-pre-line">{[banner.main_text_1, banner.main_text_2].filter(Boolean).join("\n") || banner.main_text || "—"}</div>
            {([banner.sub_text_1, banner.sub_text_2].filter(Boolean).join("\n") || banner.sub_text) && (
              <div className="text-sm text-[var(--muted)] mt-1 whitespace-pre-line">{[banner.sub_text_1, banner.sub_text_2].filter(Boolean).join("\n") || banner.sub_text}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              {banner.main_image && <QC k="Main image" v={banner.main_image} />}
              {banner.sub_image && <QC k="Sub image" v={banner.sub_image} />}
              {banner.trust_booster && <QC k="Trust-booster" v={banner.trust_booster} />}
              {banner.emergency && <QC k="Emergency" v={banner.emergency} />}
            </div>
            {banner.image_guidance && <BannerBullets value={banner.image_guidance} />}
            {(banner.review_texts?.length ? banner.review_texts : banner.review_quote ? [banner.review_quote] : []).map((review, i) => (
              <div key={i} className="text-xs italic text-[var(--muted)] mt-2 border-l-2 border-[var(--border)] pl-2">{review}</div>
            ))}
            {banner.cta && <div className="mt-2 text-sm"><span className="text-[var(--muted)]">CTA: </span><strong style={{ color: "var(--accent)" }}>{banner.cta}</strong></div>}
          </>
        )}
        {editable && banner.image_guidance && <BannerBullets value={banner.image_guidance} />}
      </Card>

      <Card title={`Product blocks (${(brief.products || []).length})`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(brief.products || []).map((p, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3">
              {editable ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <EditField label="Name" value={p.name} onChange={(v) => patchProduct(i, { name: v })} />
                    <EditField label="Template style" value={p.template_style} onChange={(v) => patchProduct(i, { template_style: v })} />
                    <EditField label="Badge" value={p.popup_badge} onChange={(v) => patchProduct(i, { popup_badge: v })} />
                    <EditField label="Main text" value={p.main_text} onChange={(v) => patchProduct(i, { main_text: v })} />
                    <EditField label="CTA" value={p.cta} onChange={(v) => patchProduct(i, { cta: v })} />
                  </div>
                  <EditArea label="Sub text" value={p.sub_text} onChange={(v) => patchProduct(i, { sub_text: v })} />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">USPs</span>
                    {(p.usps || []).map((u, j) => (
                      <input key={j} value={u} onChange={(e) => patchProductUsp(i, j, e.target.value)} className="input text-xs" />
                    ))}
                    <button type="button" onClick={() => addProductUsp(i)} className="btn-ghost self-start">+ USP</button>
                  </div>
                  <EditArea label="Review" value={p.review} onChange={(v) => patchProduct(i, { review: v })} />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{p.name}</div>
                    {p.popup_badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--accent-2)] text-[var(--accent-2)]">{p.popup_badge}</span>}
                  </div>
                  {p.template_style && <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mt-1">{p.template_style}</div>}
                  <div className="text-xs font-bold text-[var(--accent)] mt-1">{p.main_text}</div>
                  {p.sub_text && <div className="text-xs text-[var(--muted)] mt-1">{p.sub_text}</div>}
                  {(p.usps || []).map((u, j) => (
                    <div key={j} className="text-xs mt-0.5">+ {u}</div>
                  ))}
                  {p.review && <div className="text-xs italic text-[var(--muted)] mt-1">{p.review}</div>}
                  {p.cta && <div className="text-xs mt-1"><strong style={{ color: "var(--accent)" }}>{p.cta}</strong></div>}
                </>
              )}
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
          <QC k="Playbook dos/don'ts" v={qc.playbook_dos_donts} />
          <QC k="Brand rules" v={qc.brand_rule_alignment} />
          <QC k="Accessibility/layout" v={qc.accessibility_layout} />
        </div>
        {editable && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {PLAYBOOK_QA_FIELDS.map(([field, label]) => (
              <EditArea key={field} label={label} value={String(qc[field] || "")} onChange={(v) => patchQa(field, v)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const PLAYBOOK_QA_FIELDS: [keyof GenBrief["quality_checks"], string][] = [
  ["click_reason", "Click reason"],
  ["hook_alignment", "Hook alignment"],
  ["proof_safety", "Proof safety"],
  ["spam_risk", "Spam risk"],
  ["optout_risk", "Opt-out risk"],
  ["photo_watchout", "Photo watchout"],
  ["first_200px", "First 200px"],
  ["inline_link_plan", "Inline link"],
  ["layout_risk", "Layout risk"],
  ["playbook_dos_donts", "Playbook dos/don'ts"],
  ["brand_rule_alignment", "Brand rules"],
  ["accessibility_layout", "Accessibility/layout"],
];

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex gap-2 text-sm py-0.5">
      <span className="text-[var(--muted)] w-32 shrink-0">{k}</span>
      <span className="flex-1">{v || "—"}</span>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} className="input text-xs" />
    </label>
  );
}

function EditArea({
  label,
  value,
  rows = 3,
  onChange,
}: {
  label: string;
  value?: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <textarea value={value || ""} rows={rows} onChange={(e) => onChange(e.target.value)} className="input text-xs" />
    </label>
  );
}

function BannerBullets({ value }: { value: string }) {
  const lines = compactBulletLines(value);
  return (
    <div className="mt-2 rounded bg-[var(--surface-2)] border border-[var(--border)] p-2 text-xs">
      <div className="text-[var(--accent)] font-semibold mb-1">Banner brief</div>
      <ul className="list-disc pl-4 flex flex-col gap-1">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function compactBulletLines(value: string): string[] {
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return value
    .split(/[.;]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
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
    `## Subject + Preheader Options`,
    ...Object.entries(brief.subject_lines || {}).flatMap(([key, line]) => [
      `### ${key.replace("seg_", "SEG ").replace("_", "-")}`,
      `- Selected subject: ${line.subject || ""}`,
      `- Selected preheader: ${line.preheader || ""}`,
      `- Shared thread: ${line.shared_thread || ""}`,
      ...(line.options || []).flatMap((o, i) => [
        `- Option ${i + 1} (${o.model_hint || ""} · ${o.style || ""}): ${o.subject || ""}`,
        `  Preheader: ${o.preheader || ""}`,
        `  Thread: ${o.shared_thread || ""}`,
      ]),
      ``,
    ]),
    `## Theme`,
    brief.theme || "",
    ``,
    `## Body`,
    ...Object.entries(brief.body || {}).flatMap(([key, value]) => [
      `### ${key === "base" ? "Base" : key.replace("seg_", "SEG ").replace("_", "-")}`,
      value || "",
      ``,
    ]),
    `- P.S.: ${brief.ps || ""}`,
    ``,
    `## Banner`,
    `- Logo/stars: ${b.logo_stars || ""}`,
    `- Main text 1: ${b.main_text_1 || b.main_text || ""}`,
    `- Main text 2: ${b.main_text_2 || ""}`,
    `- Sub text 1: ${b.sub_text_1 || b.sub_text || ""}`,
    `- Sub text 2: ${b.sub_text_2 || ""}`,
    `- Main image: ${b.main_image || ""}`,
    `- Sub image: ${b.sub_image || ""}`,
    `- Trust-booster: ${b.trust_booster || ""}`,
    `- Emergency: ${b.emergency || ""}`,
    `- Image: ${b.image_guidance || ""}`,
    `- Review: ${(b.review_texts || []).join(" | ") || b.review_quote || ""}`,
    `- CTA: ${b.cta || ""}`,
    ``,
    `## Product blocks`,
    ...(brief.products || []).flatMap((p) => [
      `### ${p.name}`,
      `- Template style: ${p.template_style || ""}`,
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
