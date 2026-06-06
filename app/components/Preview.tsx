"use client";

import { useState } from "react";

// The exported HTML matches the team's SendGrid Designs (light, no dark-mode block), so the
// preview just toggles render width. A light background frames it like an inbox.
export function Preview({ html }: { html: string }) {
  const [width, setWidth] = useState<"mobile" | "desktop">("desktop");
  const frameWidth = width === "mobile" ? 390 : 680;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 soft-panel">
        <span className="text-sm text-[var(--muted)]">Width:</span>
        <button
          onClick={() => setWidth("mobile")}
          className={`choice-pill ${width === "mobile" ? "choice-pill-active" : ""}`}
        >
          Mobile
        </button>
        <button
          onClick={() => setWidth("desktop")}
          className={`choice-pill ${width === "desktop" ? "choice-pill-active" : ""}`}
        >
          Desktop
        </button>
      </div>
      <div className="preview-shell">
        <iframe
          title="Email preview"
          srcDoc={html}
          // sandbox="" = no scripts, unique origin: injected markup can't run JS or read the app session.
          sandbox=""
          style={{ width: frameWidth, height: 760, border: "none", background: "#fff", borderRadius: 6 }}
        />
      </div>
    </div>
  );
}
