"use client";

import { useState } from "react";

// The exported HTML matches the team's SendGrid Designs (light, no dark-mode block), so the
// preview just toggles render width. A light background frames it like an inbox.
export function Preview({ html }: { html: string }) {
  const [width, setWidth] = useState<"mobile" | "desktop">("desktop");
  const frameWidth = width === "mobile" ? 390 : 680;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Width:</span>
        <button
          onClick={() => setWidth("mobile")}
          className={`px-3 py-1 rounded text-sm border ${
            width === "mobile"
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          📱 Mobile
        </button>
        <button
          onClick={() => setWidth("desktop")}
          className={`px-3 py-1 rounded text-sm border ${
            width === "desktop"
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          🖥️ Desktop
        </button>
      </div>
      <div className="flex justify-center bg-[#e9eaee] rounded-lg p-4 overflow-auto">
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
