"use client";

import { useMemo, useState } from "react";
import { analyzePreviewGotchas, withDarkPreviewStyles } from "./previewUtils";

export function Preview({ html }: { html: string }) {
  const [width, setWidth] = useState<"mobile" | "desktop">("desktop");
  const [dark, setDark] = useState(false);
  const frameWidth = width === "mobile" ? 390 : 680;
  const gotchas = useMemo(() => analyzePreviewGotchas(html), [html]);
  const srcDoc = useMemo(() => (dark ? withDarkPreviewStyles(html) : html), [dark, html]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 soft-panel">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--muted)]">Width:</span>
          <button
            type="button"
            onClick={() => setWidth("mobile")}
            className={`choice-pill ${width === "mobile" ? "choice-pill-active" : ""}`}
          >
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setWidth("desktop")}
            className={`choice-pill ${width === "desktop" ? "choice-pill-active" : ""}`}
          >
            Desktop
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDark((value) => !value)}
          className={`choice-pill ${dark ? "choice-pill-active" : ""}`}
          aria-pressed={dark}
        >
          Dark inbox
        </button>
      </div>
      <div className="preview-shell">
        <iframe
          title={dark ? "Email preview in dark inbox mode" : "Email preview"}
          srcDoc={srcDoc}
          // sandbox="" = no scripts, unique origin: injected markup can't run JS or read the app session.
          sandbox=""
          style={{ width: frameWidth, height: 760, border: "none", background: dark ? "#111827" : "#fff", borderRadius: 6 }}
        />
      </div>
      {gotchas.length > 0 && (
        <div className="soft-panel">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Email-client gotchas</div>
          <div className="mt-2 flex flex-col gap-1">
            {gotchas.slice(0, 5).map((gotcha, index) => (
              <div
                key={`${gotcha.severity}:${index}`}
                className={`text-xs ${gotcha.severity === "block" ? "text-[var(--bad)]" : gotcha.severity === "warn" ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}
              >
                {gotcha.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
