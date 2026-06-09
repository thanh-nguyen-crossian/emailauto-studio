"use client";

import { useRef, useState } from "react";
import type { GenBannerOption, GenBrief, GenProductBlock } from "@/lib/briefgen";
import type { BodyVarietyProfile } from "@/lib/config/types";

const defaultBannerOption = (index: number): GenBannerOption => ({
  label: index === 0 ? "A" : "B",
  model_hint: "",
  main_text_1: "",
  main_text_2: "",
  main_text_3: "",
  sub_text_1: "",
  sub_text_2: "",
  sub_text_3: "",
  cta: "",
  review_texts: [],
  main_image: "",
  sub_image: "",
  trust_booster: "",
  emergency: "",
  image_guidance: "",
});

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
  const undoStack = useRef<GenBrief[]>([]);
  const redoStack = useRef<GenBrief[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const syncHistory = () => setHistoryTick((v) => v + 1);
  const pushUndo = () => {
    undoStack.current.push(cloneBrief(brief));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    syncHistory();
  };
  const patch = (next: Partial<GenBrief>) => {
    if (!onChange) return;
    pushUndo();
    onChange({ ...brief, ...next });
  };
  const undoBrief = () => {
    const previous = undoStack.current.pop();
    if (!previous || !onChange) return;
    redoStack.current.push(cloneBrief(brief));
    onChange(previous);
    syncHistory();
  };
  const redoBrief = () => {
    const next = redoStack.current.pop();
    if (!next || !onChange) return;
    undoStack.current.push(cloneBrief(brief));
    onChange(next);
    syncHistory();
  };
  const canUndo = historyTick >= 0 && undoStack.current.length > 0;
  const canRedo = historyTick >= 0 && redoStack.current.length > 0;
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
  const patchBannerOption = (index: number, field: keyof GenBannerOption, value: string) => {
    const options = [...(banner.options || [])];
    const current = options[index] || defaultBannerOption(index);
    options[index] = field === "review_texts"
      ? { ...current, review_texts: value.split(/\n+/).map((line) => line.trim()).filter(Boolean) }
      : { ...current, [field]: value };
    patchBanner({ options });
  };
  const patchBodyOption = (key: string, index: number, field: "label" | "model_hint" | "body" | "ps" | "placement_note", value: string) => {
    const all = { ...(brief.body_options || {}) };
    const options = [...(all[key] || [])];
    options[index] = { ...(options[index] || { label: index === 0 ? "A" : "B", model_hint: "", body: "", ps: "", placement_note: "" }), [field]: value };
    all[key] = options;
    patch({ body_options: all });
  };
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
        <div className="flex items-center gap-2">
          {editable && (
            <>
              <button type="button" onClick={undoBrief} disabled={!canUndo} className="btn-ghost">Undo</button>
              <button type="button" onClick={redoBrief} disabled={!canRedo} className="btn-ghost">Redo</button>
            </>
          )}
          <button onClick={onDownload} className="btn-ghost">Download brief (.md)</button>
        </div>
      </div>

      <Card title="Creative direction" defaultOpen={false}>
        {editable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <EditField label="Angle" value={cd.angle} onChange={(v) => patchDirection({ angle: v })} />
            <EditField label="Framework" value={cd.framework} onChange={(v) => patchDirection({ framework: v })} />
            <EditArea label="Flow" value={cd.flow} onChange={(v) => patchDirection({ flow: v })} />
            <EditArea label="Differentiator" value={cd.differentiator} onChange={(v) => patchDirection({ differentiator: v })} />
            {brief.body_variety && (
              <div className="col-span-2 rounded border p-2.5 flex flex-col gap-1" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Body variety used</span>
                <p className="text-xs text-[var(--text)] mt-1">
                  {brief.body_variety.openerMechanicLabel} · {brief.body_variety.creativeLens} · {brief.body_variety.proofRole} · {brief.body_variety.subjectStyle} · {brief.body_variety.visualDirection}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              <Tag label={`Angle: ${cd.angle || "—"}`} />
              <Tag label={`Framework: ${cd.framework || "—"}`} />
            </div>
            <Row k="Flow" v={cd.flow} />
            <Row k="Differentiator" v={cd.differentiator} />
            {brief.body_variety && (
              <div className="mt-3 rounded border p-2.5 flex flex-col gap-1" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Body variety used</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                  {([
                    ["Opener", brief.body_variety.openerMechanicLabel],
                    ["Character", `${brief.body_variety.namedCharacter} (${brief.body_variety.characterRole})`],
                    ["Pain", brief.body_variety.painPoint],
                    ["Sensory", `"${brief.body_variety.sensoryPhrase}"`],
                    ["Arc", brief.body_variety.emotionalArcLabel],
                    ["Lens", brief.body_variety.creativeLens],
                    ["Proof", brief.body_variety.proofRole],
                    ["Subject", brief.body_variety.subjectStyle],
                    ["Visual", brief.body_variety.visualDirection],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5 text-xs col-span-2 sm:col-span-1">
                      <span className="font-semibold text-[var(--muted)] w-16 shrink-0">{k}</span>
                      <span className="text-[var(--text)]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      <Card title="Subject + preheader options" defaultOpen={false}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(brief.body_options || {}).flatMap(([key, options]) =>
              (options || []).map((o, i) => (
                <div key={`${key}-${i}`} className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">{key} · Option {o.label || i + 1}</div>
                  {editable ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <EditField label="Label" value={o.label} onChange={(v) => patchBodyOption(key, i, "label", v)} />
                        <EditField label="Model hint" value={o.model_hint} onChange={(v) => patchBodyOption(key, i, "model_hint", v)} />
                      </div>
                      <EditArea label="Body option" value={o.body} rows={4} onChange={(v) => patchBodyOption(key, i, "body", v)} />
                      <EditField label="P.S." value={o.ps} onChange={(v) => patchBodyOption(key, i, "ps", v)} />
                      <EditField label="Placement note" value={o.placement_note} onChange={(v) => patchBodyOption(key, i, "placement_note", v)} />
                    </div>
                  ) : (
                    <>
                      <p className="text-xs whitespace-pre-line">{o.body}</p>
                      {o.ps && <p className="text-xs mt-1"><strong>P.S.</strong> {o.ps}</p>}
                      {o.placement_note && <p className="text-[11px] text-[var(--muted)] mt-1">{o.placement_note}</p>}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card title="Banner">
        {editable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <EditField label="Logo / stars" value={banner.logo_stars} onChange={(v) => patchBanner({ logo_stars: v })} />
            <EditField label="CTA" value={banner.cta} onChange={(v) => patchBanner({ cta: v })} />
            <EditField label="Main text 1 (hook)" value={banner.main_text_1 || banner.main_text} onChange={(v) => patchBanner({ main_text_1: v, main_text: [v, banner.main_text_2, banner.main_text_3].filter(Boolean).join("\n") })} />
            <EditField label="Main text 2 (proof)" value={banner.main_text_2} onChange={(v) => patchBanner({ main_text_2: v, main_text: [banner.main_text_1 || banner.main_text, v, banner.main_text_3].filter(Boolean).join("\n") })} />
            <EditField label="Main text 3 (urgency)" value={banner.main_text_3} onChange={(v) => patchBanner({ main_text_3: v, main_text: [banner.main_text_1 || banner.main_text, banner.main_text_2, v].filter(Boolean).join("\n") })} />
            <EditField label="Sub text 1 (offer)" value={banner.sub_text_1 || banner.sub_text} onChange={(v) => patchBanner({ sub_text_1: v, sub_text: [v, banner.sub_text_2, banner.sub_text_3].filter(Boolean).join("\n") })} />
            <EditField label="Sub text 2 (proof)" value={banner.sub_text_2} onChange={(v) => patchBanner({ sub_text_2: v, sub_text: [banner.sub_text_1 || banner.sub_text, v, banner.sub_text_3].filter(Boolean).join("\n") })} />
            <EditField label="Sub text 3 (urgency)" value={banner.sub_text_3} onChange={(v) => patchBanner({ sub_text_3: v, sub_text: [banner.sub_text_1 || banner.sub_text, banner.sub_text_2, v].filter(Boolean).join("\n") })} />
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
            <div className="text-sm font-bold whitespace-pre-line">{[banner.main_text_1, banner.main_text_2, banner.main_text_3].filter(Boolean).join("\n") || banner.main_text || "—"}</div>
            {([banner.sub_text_1, banner.sub_text_2, banner.sub_text_3].filter(Boolean).join("\n") || banner.sub_text) && (
              <div className="text-sm text-[var(--muted)] mt-1 whitespace-pre-line">{[banner.sub_text_1, banner.sub_text_2, banner.sub_text_3].filter(Boolean).join("\n") || banner.sub_text}</div>
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
        {!!banner.options?.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {banner.options.map((o, i) => (
              <div key={i} className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">Banner option {o.label || i + 1}</div>
                {editable ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <EditField label="Label" value={o.label} onChange={(v) => patchBannerOption(i, "label", v)} />
                      <EditField label="Model hint" value={o.model_hint} onChange={(v) => patchBannerOption(i, "model_hint", v)} />
                      <EditField label="Main 1" value={o.main_text_1} onChange={(v) => patchBannerOption(i, "main_text_1", v)} />
                      <EditField label="Main 2" value={o.main_text_2} onChange={(v) => patchBannerOption(i, "main_text_2", v)} />
                      <EditField label="Main 3" value={o.main_text_3} onChange={(v) => patchBannerOption(i, "main_text_3", v)} />
                      <EditField label="Sub 1" value={o.sub_text_1} onChange={(v) => patchBannerOption(i, "sub_text_1", v)} />
                      <EditField label="Sub 2" value={o.sub_text_2} onChange={(v) => patchBannerOption(i, "sub_text_2", v)} />
                      <EditField label="Sub 3" value={o.sub_text_3} onChange={(v) => patchBannerOption(i, "sub_text_3", v)} />
                      <EditField label="CTA" value={o.cta} onChange={(v) => patchBannerOption(i, "cta", v)} />
                      <EditField label="Emergency" value={o.emergency} onChange={(v) => patchBannerOption(i, "emergency", v)} />
                    </div>
                    <EditField label="Main image" value={o.main_image} onChange={(v) => patchBannerOption(i, "main_image", v)} />
                    <EditField label="Sub image" value={o.sub_image} onChange={(v) => patchBannerOption(i, "sub_image", v)} />
                    <EditField label="Trust-booster" value={o.trust_booster} onChange={(v) => patchBannerOption(i, "trust_booster", v)} />
                    <EditArea label="Review texts" value={(o.review_texts || []).join("\n")} onChange={(v) => patchBannerOption(i, "review_texts", v)} />
                    <EditArea label="Image guidance" value={o.image_guidance} onChange={(v) => patchBannerOption(i, "image_guidance", v)} />
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold">{[o.main_text_1, o.main_text_2, o.main_text_3].filter(Boolean).join(" / ")}</div>
                    <div className="text-xs text-[var(--muted)]">{[o.sub_text_1, o.sub_text_2, o.sub_text_3].filter(Boolean).join(" / ")}</div>
                    <div className="text-[11px] text-[var(--muted)] mt-1">{o.main_image}</div>
                  </>
                )}
              </div>
            ))}
          </div>
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
                    <EditField label="Image headline" value={p.main_text} onChange={(v) => patchProduct(i, { main_text: v })} />
                    <EditField label="Image CTA" value={p.cta} onChange={(v) => patchProduct(i, { cta: v })} />
                  </div>
                  <EditArea label="Image sub text" value={p.sub_text} onChange={(v) => patchProduct(i, { sub_text: v })} />
                  <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-2">Product image brief</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <EditField label="Main image" value={p.main_image || p.image_options?.[0]?.main_image} onChange={(v) => patchProduct(i, { main_image: v })} />
                      <EditField label="Sub image" value={p.sub_image || p.image_options?.[0]?.sub_image} onChange={(v) => patchProduct(i, { sub_image: v })} />
                    </div>
                    <EditField label="Alt text" value={p.alt_text || p.image_options?.[0]?.alt_text} onChange={(v) => patchProduct(i, { alt_text: v })} />
                    <EditArea label="Image notes" value={p.image_notes || p.image_options?.[0]?.notes} rows={2} onChange={(v) => patchProduct(i, { image_notes: v })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">USPs</span>
                    {(p.usps || []).map((u, j) => (
                      <input key={j} value={u} aria-label={`USP ${j + 1} for ${p.name || `product ${i + 1}`}`} onChange={(e) => patchProductUsp(i, j, e.target.value)} className="input text-xs" />
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
                  {(p.main_image || p.sub_image || p.alt_text || p.image_notes || p.image_options?.[0]) && (
                    <div className="mt-2 rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Product image brief</div>
                      {(p.main_image || p.image_options?.[0]?.main_image) && <div className="text-[var(--muted)] mt-0.5">Main: {p.main_image || p.image_options?.[0]?.main_image}</div>}
                      {(p.sub_image || p.image_options?.[0]?.sub_image) && <div className="text-[var(--muted)] mt-0.5">Sub: {p.sub_image || p.image_options?.[0]?.sub_image}</div>}
                      {(p.alt_text || p.image_options?.[0]?.alt_text) && <div className="text-[var(--muted)] mt-0.5">Alt: {p.alt_text || p.image_options?.[0]?.alt_text}</div>}
                      {(p.image_notes || p.image_options?.[0]?.notes) && <div className="text-[var(--muted)] mt-0.5">{p.image_notes || p.image_options?.[0]?.notes}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Self-QA (model)" defaultOpen={false}>
        <div className="mb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Message Promise</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <QC k="Opener mechanic" v={qc.opener_mechanic} />
            <QC k="Hook coherence" v={qc.hook_coherence} />
            <QC k="Click reason" v={qc.click_reason} />
            <QC k="Hook alignment" v={qc.hook_alignment} />
          </div>
        </div>
        <div className="mb-2 pt-2 border-t border-[var(--border)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Offer / Product / Design</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <QC k="First 200px" v={qc.first_200px} />
            <QC k="CTA assessment" v={qc.cta_assessment} />
            <QC k="Inline link" v={qc.inline_link_plan} />
            <QC k="Layout risk" v={qc.layout_risk} />
            <QC k="Photo watchout" v={qc.photo_watchout} />
          </div>
        </div>
        <div className="mb-2 pt-2 border-t border-[var(--border)]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Safety / Brand</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <QC k="Spam risk" v={qc.spam_risk} color={riskColor(qc.spam_risk)} />
            <QC k="Opt-out risk" v={qc.optout_risk} color={riskColor(qc.optout_risk)} />
            <QC k="Proof safety" v={qc.proof_safety} />
            <QC k="Brand rules" v={qc.brand_rule_alignment} />
            <QC k="Playbook dos/don'ts" v={qc.playbook_dos_donts} />
            <QC k="Accessibility/layout" v={qc.accessibility_layout} />
          </div>
        </div>
        {editable && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 pt-2 border-t border-[var(--border)]">
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
  ["opener_mechanic", "Opener mechanic"],
  ["hook_coherence", "Hook coherence"],
  ["click_reason", "Click reason"],
  ["hook_alignment", "Hook alignment"],
  ["cta_assessment", "CTA assessment"],
  ["first_200px", "First 200px"],
  ["inline_link_plan", "Inline link"],
  ["layout_risk", "Layout risk"],
  ["photo_watchout", "Photo watchout"],
  ["proof_safety", "Proof safety"],
  ["spam_risk", "Spam risk"],
  ["optout_risk", "Opt-out risk"],
  ["playbook_dos_donts", "Playbook dos/don'ts"],
  ["brand_rule_alignment", "Brand rules"],
  ["accessibility_layout", "Accessibility/layout"],
];

function cloneBrief(brief: GenBrief): GenBrief {
  return JSON.parse(JSON.stringify(brief)) as GenBrief;
}

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
      <input value={value || ""} aria-label={label} onChange={(e) => onChange(e.target.value)} className="input text-xs" />
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
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = (open: string, close: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const v = value || "";
    const selected = v.slice(start, end);
    const newValue = v.slice(0, start) + open + selected + close + v.slice(end);
    onChange(newValue);
    const newCursor = selected.length > 0 ? start + open.length + selected.length + close.length : start + open.length;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); }, 0);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" title="Bold (**text**)" onClick={() => wrap("**", "**")} className="fmt-btn font-bold">B</button>
        <button type="button" title="Italic (*text*)" onClick={() => wrap("*", "*")} className="fmt-btn italic">I</button>
        <button type="button" title="Underline (__text__)" onClick={() => wrap("__", "__")} className="fmt-btn underline">U</button>
        <button type="button" title="Brand accent (==text==)" onClick={() => wrap("==", "==")} className="fmt-btn" style={{ color: "var(--accent)" }}>A</button>
        <span className="text-[9px] text-[var(--muted)] ml-0.5">select + click</span>
      </div>
      <textarea ref={ref} value={value || ""} rows={rows} aria-label={label} onChange={(e) => onChange(e.target.value)} className="input text-xs" />
    </div>
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

function Card({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="section-panel p-0 overflow-hidden">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold border-b border-[var(--border)] bg-[var(--surface-2)]">
        {title}
      </summary>
      <div className="p-4">
        {children}
      </div>
    </details>
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
    ...(Object.keys(brief.body_options || {}).length
      ? [
          `### Body A/B Options`,
          ...Object.entries(brief.body_options || {}).flatMap(([key, options]) => [
            `#### ${key === "base" ? "Base" : key.replace("seg_", "SEG ").replace("_", "-")}`,
            ...(options || []).flatMap((o, i) => [
              `- Option ${o.label || i + 1} (${o.model_hint || ""})`,
              `  Body: ${o.body || ""}`,
              `  P.S.: ${o.ps || ""}`,
              `  Placement: ${o.placement_note || ""}`,
            ]),
          ]),
          ``,
        ]
      : []),
    `- P.S.: ${brief.ps || ""}`,
    ``,
    `## Banner`,
    `- Logo/stars: ${b.logo_stars || ""}`,
    `- Main text 1: ${b.main_text_1 || b.main_text || ""}`,
    `- Main text 2: ${b.main_text_2 || ""}`,
    `- Main text 3: ${b.main_text_3 || ""}`,
    `- Sub text 1: ${b.sub_text_1 || b.sub_text || ""}`,
    `- Sub text 2: ${b.sub_text_2 || ""}`,
    `- Sub text 3: ${b.sub_text_3 || ""}`,
    `- Main image: ${b.main_image || ""}`,
    `- Sub image: ${b.sub_image || ""}`,
    `- Trust-booster: ${b.trust_booster || ""}`,
    `- Emergency: ${b.emergency || ""}`,
    `- Image: ${b.image_guidance || ""}`,
    `- Review: ${(b.review_texts || []).join(" | ") || b.review_quote || ""}`,
    `- CTA: ${b.cta || ""}`,
    ...(b.options?.length
      ? [
          ``,
          `### Banner A/B Options`,
          ...(b.options || []).flatMap((o, i) => [
            `- Option ${o.label || i + 1} (${o.model_hint || ""})`,
            `  Main text 1: ${o.main_text_1 || ""}`,
            `  Main text 2: ${o.main_text_2 || ""}`,
            `  Main text 3: ${o.main_text_3 || ""}`,
            `  Sub text 1: ${o.sub_text_1 || ""}`,
            `  Sub text 2: ${o.sub_text_2 || ""}`,
            `  Sub text 3: ${o.sub_text_3 || ""}`,
            `  CTA: ${o.cta || ""}`,
            `  Main image: ${o.main_image || ""}`,
            `  Sub image: ${o.sub_image || ""}`,
            `  Trust-booster: ${o.trust_booster || ""}`,
            `  Emergency: ${o.emergency || ""}`,
            `  Review texts: ${(o.review_texts || []).join(" | ")}`,
            `  Image guidance: ${o.image_guidance || ""}`,
          ]),
        ]
      : []),
    ``,
    `## Product blocks`,
    ...(brief.products || []).flatMap((p) => [
      `### ${p.name}`,
      `- Template style: ${p.template_style || ""}`,
      `- Badge: ${p.popup_badge || ""}`,
      `- Image headline: ${p.main_text || ""}`,
      `- Image sub text: ${p.sub_text || ""}`,
      ...(p.usps || []).map((u) => `- USP: ${u}`),
      `- Review: ${p.review || ""}`,
      `- Image CTA: ${p.cta || ""}`,
      `- Main image: ${p.main_image || p.image_options?.[0]?.main_image || ""}`,
      `- Sub image: ${p.sub_image || p.image_options?.[0]?.sub_image || ""}`,
      `- Alt text: ${p.alt_text || p.image_options?.[0]?.alt_text || ""}`,
      `- Image notes: ${p.image_notes || p.image_options?.[0]?.notes || ""}`,
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
