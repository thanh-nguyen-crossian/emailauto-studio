"use client";

import type { Brand, ImageOverrides, Product } from "@/lib/config/types";

// Block-based image editor. Each image block (logo, hero banner, every product) takes a URL.
// Workflow: upload the image in SendGrid (Design Library → Your Images), copy its CDN URL
// (e.g. https://cdn.mcauto-images-production.sendgrid.net/.../650x650.jpg), paste it here.
// The URL is used in both the live preview and the exported HTML.

function Thumb({ url }: { url?: string }) {
  if (!url) return <div className="w-12 h-12 rounded bg-[var(--surface-2)] border border-[var(--border)] shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      className="w-12 h-12 rounded object-cover border border-[var(--border)] shrink-0 bg-white"
    />
  );
}

function Row({
  label,
  hint,
  url,
  onChange,
}: {
  label: string;
  hint?: string;
  url?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Thumb url={url} />
      <div className="flex-1">
        <div className="text-xs font-medium">
          {label}
          {hint && <span className="text-[var(--muted)] font-normal"> · {hint}</span>}
        </div>
        <input
          value={url || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste SendGrid image URL…"
          className="input mt-1 text-xs"
        />
      </div>
    </div>
  );
}

export function ImageEditor({
  brand,
  products,
  images,
  onChange,
  includeLogo,
  onToggleLogo,
}: {
  brand: Brand;
  products: Product[];
  images: ImageOverrides;
  onChange: (images: ImageOverrides) => void;
  includeLogo: boolean;
  onToggleLogo: (v: boolean) => void;
}) {
  const setProduct = (slug: string, url: string) =>
    onChange({ ...images, products: { ...(images.products || {}), [slug]: url } });

  return (
    <div className="section-panel flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">Images</h3>
        <p className="text-xs text-[var(--muted)] mt-1">
          Paste SendGrid image URLs for preview and export.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeLogo}
          onChange={(e) => onToggleLogo(e.target.checked)}
        />
        Include a logo block above the hero
        <span className="text-[var(--muted)]">(off = email starts at the hero image)</span>
      </label>
      {includeLogo && (
        <Row label="Logo" hint="≈160px wide" url={images.logo} onChange={(v) => onChange({ ...images, logo: v })} />
      )}
      <Row label="Hero banner" hint="≈564px wide" url={images.hero} onChange={(v) => onChange({ ...images, hero: v })} />
      <div className="h-px bg-[var(--border)] my-1" />
      <div className="text-xs font-medium text-[var(--muted)]">Product images</div>
      {products.map((p) => (
        <Row
          key={p.slug}
          label={p.name}
          hint={p.slug === brand.heroSlug ? "hero product" : `type ${p.segment}`}
          url={images.products?.[p.slug]}
          onChange={(v) => setProduct(p.slug, v)}
        />
      ))}
    </div>
  );
}
