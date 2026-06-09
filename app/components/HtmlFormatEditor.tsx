"use client";

import { useRef, useState } from "react";

export function HtmlFormatEditor({
  value,
  accent,
  onChange,
}: {
  value: string;
  accent: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const history = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const [historyTick, setHistoryTick] = useState(0);

  const refreshHistory = () => setHistoryTick((v) => v + 1);
  const canUndo = historyTick >= 0 && history.current.undo.length > 0;
  const canRedo = historyTick >= 0 && history.current.redo.length > 0;

  function commitValue(next: string) {
    if (next === value) return;
    history.current.undo.push(value);
    if (history.current.undo.length > 80) history.current.undo.shift();
    history.current.redo = [];
    onChange(next);
    refreshHistory();
  }

  function undo() {
    const previous = history.current.undo.pop();
    if (previous == null) return;
    history.current.redo.push(value);
    onChange(previous);
    refreshHistory();
    requestAnimationFrame(() => ref.current?.focus());
  }

  function redo() {
    const next = history.current.redo.pop();
    if (next == null) return;
    history.current.undo.push(value);
    onChange(next);
    refreshHistory();
    requestAnimationFrame(() => ref.current?.focus());
  }

  function replaceSelection(format: (selection: string) => string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const formatted = format(selected);
    const next = value.slice(0, start) + formatted + value.slice(end);
    commitValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start;
      el.selectionEnd = start + formatted.length;
    });
  }

  function insert(text: string) {
    replaceSelection((selected) => selected || text);
  }

  function link(style: "text" | "button") {
    const href = window.prompt("URL", "https://");
    if (!href) return;
    replaceSelection((selected) => {
      const label = selected || window.prompt("Link text", "Shop now") || "Shop now";
      if (style === "button") {
        return `<a clicktracking="off" href="${escapeAttr(href)}" style="display:inline-block;background:${accent};color:#ffffff !important;text-decoration:none;font-weight:bold;padding:10px 22px;border-radius:4px;">${label}</a>`;
      }
      return `<a clicktracking="off" href="${escapeAttr(href)}" style="color:${accent};font-weight:bold;text-decoration:underline;">${label}</a>`;
    });
  }

  return (
    <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] p-2">
        <Tool label="Undo" title="Undo" onClick={undo} disabled={!canUndo} />
        <Tool label="Redo" title="Redo" onClick={redo} disabled={!canRedo} />
        <Tool label="B" title="Bold" onClick={() => replaceSelection((s) => `<strong>${s || "bold text"}</strong>`)} />
        <Tool label="I" title="Italic" onClick={() => replaceSelection((s) => `<em>${s || "italic text"}</em>`)} />
        <Tool label="U" title="Underline" onClick={() => replaceSelection((s) => `<u>${s || "underlined text"}</u>`)} />
        <Tool label="S" title="Strikethrough" onClick={() => replaceSelection((s) => `<s>${s || "struck text"}</s>`)} />
        <Tool label="Accent" title="Brand color" onClick={() => replaceSelection((s) => `<span style="color:${accent};"><strong>${s || "accent text"}</strong></span>`)} />
        <Tool label="Red" title="Red text" onClick={() => replaceSelection((s) => `<span style="color:#c83434;">${s || "red text"}</span>`)} />
        <Tool label="Green" title="Green text" onClick={() => replaceSelection((s) => `<span style="color:#1a7f5a;">${s || "green text"}</span>`)} />
        <Tool label="Highlight" title="Highlight" onClick={() => replaceSelection((s) => `<span style="background:#fff1a8;">${s || "highlighted text"}</span>`)} />
        <Tool label="Small" title="Small text" onClick={() => replaceSelection((s) => `<span style="font-size:13px;line-height:18px;">${s || "small text"}</span>`)} />
        <Tool label="Large" title="Large text" onClick={() => replaceSelection((s) => `<span style="font-size:20px;line-height:26px;">${s || "large text"}</span>`)} />
        <Tool label="Link" title="Text link" onClick={() => link("text")} />
        <Tool label="Button" title="CTA button" onClick={() => link("button")} />
        <Tool label="Center" title="Center align" onClick={() => replaceSelection((s) => `<div style="text-align:center;">${s || "Centered text"}</div>`)} />
        <Tool label="H2" title="Heading" onClick={() => replaceSelection((s) => `<h2 style="font-size:22px;line-height:28px;margin:0 0 10px;">${s || "Heading"}</h2>`)} />
        <Tool label="List" title="Bullet list item" onClick={() => replaceSelection((s) => `<ul><li>${s || "List item"}</li></ul>`)} />
        <Tool label="BR" title="Line break" onClick={() => insert("<br>")} />
        <Tool label="Plain" title="Strip tags in selection" onClick={() => replaceSelection((s) => stripTags(s))} />
      </div>
      <textarea
        ref={ref}
        value={value}
        aria-label="Editable email HTML"
        onChange={(e) => commitValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
          }
        }}
        spellCheck={false}
        className="w-full mono text-xs leading-relaxed p-3 bg-transparent text-[var(--text)] outline-none resize-y"
        style={{ height: 260 }}
      />
    </div>
  );
}

function Tool({ label, title, onClick, disabled }: { label: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className="btn-ghost">
      {label}
    </button>
  );
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}
