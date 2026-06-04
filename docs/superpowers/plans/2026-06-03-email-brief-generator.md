# Email Brief Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `docs/email-brief-generator.html` — a standalone browser tool that guides users through a 6-step wizard to generate AI-powered email campaign briefs for 4 brands, with 2 contrasting creative options, a refinement loop, and Excel export.

**Architecture:** Single standalone HTML file (~2,200 lines), vanilla JS (ES6+), no build step. All mutable state lives in one `state` object. Wizard renders as collapsible cards. Two parallel AI API calls (Promise.all) generate Option A and B. Output renders side-by-side; refinement fires a partial-update call preserving unchanged sections. Excel export uses SheetJS.

**Tech Stack:** HTML5, vanilla JS ES6+, CSS Grid/Flexbox, SheetJS `xlsx.full.min.js` (CDN), Google Fonts (Plus Jakarta Sans, JetBrains Mono), Anthropic / Gemini / OpenAI REST APIs.

**Spec:** `docs/superpowers/specs/2026-06-02-email-brief-generator-design.md`

---

## File Map

| File | Role |
|---|---|
| `docs/email-brief-generator.html` | Entire application — HTML, CSS, JS in one file |

The single file is organised into clearly labelled `// ── SECTION ──` comment blocks inside the `<script>` tag, in this order:
1. `CONSTANTS` — BRAND_CONFIG, PRODUCT_CATALOG, PLAYBOOK_RULES
2. `STATE` — single `state` object
3. `API_KEYS` — sessionStorage read/write, provider/model selectors
4. `WIZARD_ENGINE` — card render, advance, edit, skip
5. `STEP_1` through `STEP_6` — per-step HTML builders and handlers
6. `API_LAYER` — 3 provider adapters, makeAPICall()
7. `PROMPT_BUILDER` — buildSystemPrompt(), buildUserPrompt(), buildRefinementPrompt()
8. `GENERATION` — generateBrief(), progress display, JSON parse, validation
9. `OUTPUT_RENDERER` — renderOutput(), section renders, copy buttons
10. `REFINEMENT` — refine panel, applyRefinement(), revision stack
11. `EXCEL_EXPORT` — exportToExcel(), buildSheet(), row mappers
12. `PERSISTENCE` — saveDraft(), loadDraft()
13. `INIT` — init(), event wiring

---

## Task 1 — HTML shell, CSS design system, static skeleton

**Files:**
- Create: `docs/email-brief-generator.html`

- [ ] **Step 1: Create the file with full shell and CSS**

Create `docs/email-brief-generator.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email Brief Generator</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>
:root {
  --bg:#f4f5f9;--surface:#fff;--border:#e2e5ec;--text:#1a1d27;
  --text-sec:#6b7280;--accent:#6366f1;--accent-light:#eef2ff;
  --success:#10b981;--warn:#f59e0b;--error:#ef4444;
  --font-body:'Plus Jakarta Sans',sans-serif;
  --font-mono:'JetBrains Mono',monospace;
  --radius:12px;--radius-sm:8px;
  --shadow-sm:0 1px 3px rgba(0,0,0,.08);
  --shadow-md:0 4px 12px rgba(0,0,0,.10);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font-body);background:var(--bg);color:var(--text);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}

/* ── Header ── */
.app-header{background:#1a1d27;color:#fff;padding:14px 24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.app-header h1{font-size:15px;font-weight:700;flex:1}
.hdr-group{display:flex;align-items:center;gap:6px}
.hdr-group label{font-size:11px;color:#9ca3af}
.hdr-select{background:#2d3142;color:#fff;border:1px solid #374151;border-radius:6px;padding:5px 8px;font-family:var(--font-body);font-size:12px;cursor:pointer}
.hdr-input{background:#2d3142;color:#fff;border:1px solid #374151;border-radius:6px;padding:5px 10px;font-family:var(--font-mono);font-size:11px;width:190px}
.hdr-input::placeholder{color:#6b7280}
.btn-hdr{background:#374151;color:#d1d5db;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:var(--font-body)}
.btn-hdr:hover{background:#4b5563}
.lang-toggle{display:flex;background:#2d3142;border-radius:6px;overflow:hidden;border:1px solid #374151}
.lang-toggle button{background:none;border:none;color:#9ca3af;padding:5px 10px;font-size:11px;font-family:var(--font-body);cursor:pointer;transition:all .15s}
.lang-toggle button.active{background:var(--accent);color:#fff}

/* ── Layout ── */
.app-main{max-width:1200px;margin:0 auto;padding:20px 16px;display:flex;flex-direction:column;gap:14px}

/* ── Wizard cards ── */
.w-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-sm);transition:box-shadow .2s,border-color .2s}
.w-card.active{box-shadow:var(--shadow-md);border-color:var(--accent)}
.w-card-hdr{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;user-select:none}
.w-card-hdr:hover{background:#fafbff}
.step-badge{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.step-badge.pending{background:var(--bg);color:var(--text-sec);border:2px solid var(--border)}
.step-badge.active{background:var(--accent);color:#fff}
.step-badge.done{background:var(--success);color:#fff}
.w-card-title{font-weight:600;font-size:13px;flex:1}
.w-card-summary{font-size:11px;color:var(--text-sec);max-width:500px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-edit{font-size:11px;color:var(--accent);background:var(--accent-light);border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-family:var(--font-body);white-space:nowrap}
.w-card-body{padding:18px;border-top:1px solid var(--border)}
.w-card-body.hidden{display:none}

/* ── Form elements ── */
.fg{margin-bottom:14px}
.fg label{display:block;font-size:11px;font-weight:700;color:var(--text-sec);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
.fg input,.fg select,.fg textarea{width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 11px;font-family:var(--font-body);font-size:13px;color:var(--text);background:var(--surface);transition:border-color .15s}
.fg input:focus,.fg select:focus,.fg textarea:focus{outline:none;border-color:var(--accent)}
.fg textarea{resize:vertical;min-height:70px}
.input-hint{font-size:11px;color:var(--text-sec);margin-top:4px}

/* ── Radio pills ── */
.pills{display:flex;flex-wrap:wrap;gap:7px}
.pill input{position:absolute;opacity:0;pointer-events:none}
.pill label{display:inline-flex;align-items:center;padding:6px 13px;border:2px solid var(--border);border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;transition:all .15s}
.pill input:checked+label{border-color:var(--accent);background:var(--accent-light);color:var(--accent)}
.pill label:hover{border-color:#a5b4fc}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:var(--radius-sm);border:none;font-family:var(--font-body);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:#4f46e5}
.btn-primary:disabled{background:#a5b4fc;cursor:not-allowed}
.btn-secondary{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--bg)}
.btn-skip{background:none;color:var(--text-sec);border:none;font-size:12px;cursor:pointer;text-decoration:underline;font-family:var(--font-body);padding:0}
.btn-row{display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap}

/* ── Alerts ── */
.alert{border-radius:var(--radius-sm);padding:9px 13px;font-size:12px;margin-bottom:12px;display:flex;gap:8px}
.alert.hidden{display:none}
.alert-warn{background:#fffbeb;border:1px solid var(--warn);color:#92400e}
.alert-info{background:#eff6ff;border:1px solid #93c5fd;color:#1e40af}

/* ── Product grid ── */
.product-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.p-slot{border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px}
.p-slot.hero{border-color:var(--warn);background:#fffbeb}
.p-slot-lbl{font-size:10px;font-weight:700;color:var(--text-sec);text-transform:uppercase;margin-bottom:7px;display:flex;align-items:center;gap:5px}
.p-slot select{width:100%;border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:12px;font-family:var(--font-body);margin-bottom:5px}
.btn-custom-url{font-size:11px;color:var(--accent);cursor:pointer;text-decoration:underline;background:none;border:none;font-family:var(--font-body);padding:0}
.custom-url-wrap{margin-top:6px;display:none}
.custom-url-wrap.open{display:block}
.custom-url-wrap input{width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:11px;font-family:var(--font-mono)}
.usp-wrap{margin-top:6px}
.usp-input{width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:11px;font-family:var(--font-body);margin-bottom:3px}
.scrape-status{font-size:10px;color:var(--text-sec);margin-top:3px}

/* ── Segments ── */
.seg-list{display:flex;flex-direction:column;gap:7px}
.seg-item{display:flex;align-items:flex-start;gap:9px;padding:9px 11px;border:1px solid var(--border);border-radius:var(--radius-sm)}
.seg-item input[type=checkbox]{margin-top:2px;accent-color:var(--accent);width:15px;height:15px;flex-shrink:0}
.seg-name{font-size:12px;font-weight:600}
.seg-meta{font-size:10px;color:var(--text-sec);margin-top:1px}
.tier-list{display:flex;flex-direction:column;gap:5px;margin-top:7px;padding-left:14px}
.tier-item{display:flex;align-items:center;gap:7px;font-size:12px}

/* ── Pre-flight ── */
.preflight{background:#f8faff;border:1px solid #c7d2fe;border-radius:var(--radius-sm);padding:14px;margin-bottom:14px;font-family:var(--font-mono);font-size:11px;line-height:2}
.preflight .lbl{color:var(--text-sec);display:inline-block;width:100px}
.preflight .val{color:var(--text);font-weight:500}
.token-warn{color:#92400e;font-size:11px;margin-bottom:10px;padding:7px 11px;background:#fffbeb;border-radius:var(--radius-sm);border:1px solid var(--warn)}
.token-warn.hidden{display:none}

/* ── Progress ── */
.progress-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow-sm)}
.progress-card h3{font-size:13px;font-weight:600;margin-bottom:10px}
.prog-steps{display:grid;grid-template-columns:1fr 1fr;gap:6px}
@media(max-width:600px){.prog-steps{grid-template-columns:1fr}}
.prog-step{display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 0}
.prog-step .ico{width:16px;text-align:center;font-size:13px}
.prog-step.done .ico::after{content:'✅'}
.prog-step.running .ico::after{content:'⏳'}
.prog-step.waiting .ico::after{content:'○';color:var(--text-sec)}

/* ── Output panel ── */
#output-panel{display:none}
#output-panel.open{display:block}
.output-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.output-toolbar h2{font-size:16px;font-weight:700}
.output-actions{display:flex;gap:8px;flex-wrap:wrap}
.output-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:1100px){.output-cols{grid-template-columns:1fr}}
.opt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-sm)}
.opt-card-hdr{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 18px;display:flex;align-items:center;justify-content:space-between}
.opt-card-hdr h3{font-size:14px;font-weight:700}
.btn-copy-full{background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:var(--font-body)}
.btn-copy-full:hover{background:rgba(255,255,255,.25)}
.out-section{padding:14px 18px;border-bottom:1px solid var(--border)}
.out-section:last-child{border-bottom:none}
.out-sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.out-sec-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-sec)}
.btn-copy-sec{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;font-family:var(--font-body)}
.btn-copy-sec:hover{background:var(--accent-light);color:var(--accent)}
.out-content{font-size:12px;line-height:1.8;white-space:pre-wrap;word-break:break-word}
.flag-err{color:var(--error);font-weight:700}
.flag-warn{color:var(--warn);font-weight:700}
.direction-box{background:#f8faff;border:1px solid #c7d2fe;border-radius:var(--radius-sm);padding:10px 13px;font-size:12px;line-height:1.8;margin-bottom:6px}
.direction-box strong{color:var(--accent)}

/* ── Product blocks (output) ── */
.prod-grid-out{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.prod-block{border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px;font-size:12px}
.prod-block .prod-name{font-weight:700;margin-bottom:6px;font-size:13px}
.prod-block .prod-main{font-weight:600;text-transform:uppercase;font-size:11px;color:var(--accent);margin-bottom:3px}
.prod-block .prod-sub{color:var(--text-sec);margin-bottom:4px}
.prod-block .prod-badge{display:inline-block;background:#fef9c3;border:1px solid #fde047;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-bottom:4px}
.prod-block .prod-usp{display:flex;gap:5px;margin-bottom:2px}
.prod-block .prod-usp::before{content:'✅';font-size:10px}
.prod-block .prod-review{font-style:italic;color:var(--text-sec);font-size:11px;border-left:2px solid var(--border);padding-left:7px;margin:5px 0}
.prod-block .prod-cta{background:var(--accent);color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-body);margin-top:5px;width:100%}

/* ── Refine panel ── */
.refine-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow-sm)}
.refine-panel h3{font-size:13px;font-weight:600;margin-bottom:12px}
.refine-scope{display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap}
.refine-scope label{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
.refine-actions{display:flex;align-items:center;gap:10px;margin-top:10px}
.btn-undo{background:none;border:none;color:var(--text-sec);font-size:12px;cursor:pointer;text-decoration:underline;font-family:var(--font-body);display:none}
.btn-undo.visible{display:inline-block}
</style>
</head>
<body>

<header class="app-header">
  <h1>✉️ Email Brief Generator</h1>
  <div class="hdr-group">
    <label>Provider</label>
    <select id="provider-select" class="hdr-select">
      <option value="claude">Claude</option>
      <option value="gemini">Gemini</option>
      <option value="openai">OpenAI</option>
    </select>
  </div>
  <div class="hdr-group">
    <label>Model</label>
    <select id="model-select" class="hdr-select"></select>
  </div>
  <div class="hdr-group">
    <input type="password" id="api-key-input" class="hdr-input" placeholder="API key" />
    <button class="btn-hdr" onclick="saveApiKey()">Save key</button>
  </div>
  <div class="lang-toggle">
    <button id="lang-en" onclick="setLang('en')">EN</button>
    <button id="lang-vi" class="active" onclick="setLang('vi')">VI</button>
  </div>
</header>

<main class="app-main">
  <div id="wizard-container"></div>
  <div id="progress-container" style="display:none"></div>
  <div id="output-panel"></div>
</main>

<script>
'use strict';

// ── CONSTANTS ────────────────────────────────────────────────
// (Added in Task 2)

// ── STATE ────────────────────────────────────────────────────
const state = {
  lang: 'vi',
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  wizard: {
    step: 1,
    done: {},           // step number → true when completed
    brand: null,
    date: null,
    theme: null,
    offerType: 'sitewide_pct',
    offerValue: '',
    urgency: '24h',
    products: Array(8).fill(null).map(()=>({name:'',usps:['','',''],customUrl:'',scraped:false})),
    segments: [],
    lastCTR: '', lastHero: '', lastAngle: 'Unknown', lastNote: ''
  },
  generated: { a: null, b: null },
  revisions: []   // [{a, b}, ...] — max 5
};

// ── API KEYS ─────────────────────────────────────────────────
// (Added in Task 3)

// ── WIZARD ENGINE ────────────────────────────────────────────
// (Added in Task 4)

// ── STEPS 1–6 ────────────────────────────────────────────────
// (Added in Tasks 5–8)

// ── API LAYER ────────────────────────────────────────────────
// (Added in Task 9)

// ── PROMPT BUILDER ───────────────────────────────────────────
// (Added in Task 10)

// ── GENERATION ───────────────────────────────────────────────
// (Added in Task 11)

// ── OUTPUT RENDERER ──────────────────────────────────────────
// (Added in Task 12)

// ── REFINEMENT ───────────────────────────────────────────────
// (Added in Task 13)

// ── EXCEL EXPORT ─────────────────────────────────────────────
// (Added in Task 14)

// ── PERSISTENCE ──────────────────────────────────────────────
// (Added in Task 14)

// ── INIT ─────────────────────────────────────────────────────
function init() {
  updateModelOptions();
  document.getElementById('provider-select').addEventListener('change', e => {
    state.provider = e.target.value;
    updateModelOptions();
    refreshApiKeyPlaceholder();
  });
  document.getElementById('model-select').addEventListener('change', e => { state.model = e.target.value; });
  renderWizard();
}

document.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>
```

- [ ] **Step 2: Open in browser and verify shell**

```bash
open "docs/email-brief-generator.html"
```

Expected: Dark sticky header visible, model/provider dropdowns present, "Wizard loading" area blank (no errors). Open DevTools console — zero errors.

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: email brief generator — HTML shell and CSS design system"
```

---

## Task 2 — BRAND_CONFIG and PRODUCT_CATALOG constants

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── CONSTANTS ──` block

- [ ] **Step 1: Add BRAND_CONFIG**

Replace `// ── CONSTANTS ────────...` with:

```javascript
// ── CONSTANTS ────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// BRAND_CONFIG — brand identity, persona, segment definitions
// ─────────────────────────────────────────────────────────────
const BRAND_CONFIG = {
  BraGoddess: {
    persona: 'Sandra', accentColor: 'pink', layout: 'narrative',
    voice: 'warm, personal, 55+ women, comfort-focused, anti-wire',
    segments: [
      { id:'21', name:'Bralettes/Comfort', meta:'Low AOV · High freq' },
      { id:'22', name:'Contour/Push-Up',   meta:'Med AOV · Med freq' },
      { id:'45', name:'Shapers/Panties',   meta:'Med AOV · Low freq' },
      { id:'8',  name:'Sleepwear/Tights',  meta:'Med AOV · Med freq' },
      { id:'3',  name:'Strapless/Special-Occasion', meta:'Med AOV · Low freq' }
    ]
  },
  GentsLux: {
    persona: 'Jordan', accentColor: 'blue', layout: 'simple',
    voice: 'direct, solution-focused, men 55+, comfort + mobility',
    segments: [
      { id:'71', name:"Men's Tops",   meta:'Med AOV · High freq' },
      { id:'72', name:"Men's Bottoms",meta:'High AOV · Med freq' },
      { id:'73', name:"Men's Others", meta:'Med AOV · Low freq' }
    ]
  },
  LuxFitting: {
    persona: 'Adele', accentColor: 'rose', layout: 'simple',
    voice: 'elegant, empathetic, women 50+, health + comfort + style',
    segments: [
      { id:'61', name:"Women's Tops",    meta:'Med AOV · High freq' },
      { id:'62', name:"Women's Bottoms", meta:'High AOV · High freq' },
      { id:'63', name:"Women's Dresses", meta:'High AOV · Med freq' },
      { id:'64', name:"Women's Others",  meta:'Med AOV · Low freq' }
    ]
  },
  SantaFare: {
    persona: 'Mary', accentColor: 'red', layout: 'simple',
    voice: 'joyful, gift-focused, thoughtful personalization',
    segments: [
      { id:'1', name:'Personalized Gifts', meta:'Low AOV · Med freq · Low risk',
        tiers: [
          { id:'1-A', name:'Active',   meta:'<90 days since last order' },
          { id:'1-B', name:'Drifting', meta:'90–180 days' },
          { id:'1-C', name:'Lapsed',   meta:'>180 days' },
          { id:'1-D', name:'VIP',      meta:'2+ orders' }
        ]
      }
    ]
  }
};

// ─────────────────────────────────────────────────────────────
// PRODUCT_CATALOG — update this block when products change
// ─────────────────────────────────────────────────────────────
const PRODUCT_CATALOG = {
  BraGoddess: [
    { name:'Daisy Bra',    slug:'daisy-bra',    url:'https://bragoddess.com/products/daisy-bra',
      usps:['Easy snap front closure','Wire-free lift','Breathable soft fabric'],
      review:'"Forgot it\'s there!" — Helen R.' },
    { name:'SonaShape',    slug:'sonashape',    url:'https://bragoddess.com/products/sonashape',
      usps:['Daily comfort seamless fit','Invisible under clothing','Gentle lift'],
      review:'"Underwires? Never again." — Claire T.' },
    { name:'Posy Bra',     slug:'posy-bra',     url:'https://bragoddess.com/products/posy-bra',
      usps:['Front-hook ease','Smoothing back panel','Lace detail'],
      review:'"My 2nd order!" — Sharon M.' },
    { name:'Activa Bra',   slug:'activa-bra',   url:'https://bragoddess.com/products/activa-bra',
      usps:['Gentle support','Wide comfort straps','All-day wear'],
      review:'"Best decision ever!" — Judith K.' },
    { name:'ZipLacy',      slug:'ziplacy',      url:'https://bragoddess.com/products/ziplacy',
      usps:['Powerful support','Ultimate comfort','Front zip closure'],
      review:'"Game-changer!" — Shirley D.' },
    { name:'ZenaLift',     slug:'zenalift',     url:'https://bragoddess.com/products/zenalift',
      usps:['Ultimate lift','Zero discomfort','17K+ happy customers'],
      review:'"Amazing support!" — Evelyn P.' },
    { name:'IvyLift',      slug:'ivylift',      url:'https://bragoddess.com/products/ivylift',
      usps:['Seamless wire-free push-up','Sculpt & define','Lightweight'],
      review:'"Never going back!" — Nancy W.' },
    { name:'HoneyCurve',   slug:'honeycurve',   url:'https://bragoddess.com/products/honeycurve',
      usps:['Powerful custom-lift support','Innovative design','All-day comfort'],
      review:'"Perfect shape!" — Patricia L.' },
    { name:'RosyLift',     slug:'rosylift',     url:'https://bragoddess.com/products/rosylift',
      usps:['Best-selling custom lift','98% loved','Adjustable support'],
      review:'"My favourite!" — Linda S.' },
    { name:'LiftyGlow',    slug:'liftyglow',    url:'https://bragoddess.com/products/liftyglow',
      usps:['#1 flexi-lift comfy bra','Biggest price drop','Flexible underwire-free'],
      review:'"Incredible lift!" — Joyce B.' },
    { name:'ZoeShape',     slug:'zoeshape',     url:'https://bragoddess.com/products/zoeshape',
      usps:['Powerful lifting & shaping','Full coverage','Low stock'],
      review:'"Smooths everything!" — Barbara H.' },
    { name:'Moona Bra',    slug:'moona-bra',    url:'https://bragoddess.com/products/moona-bra',
      usps:['3-second front fasten','Front snap for easy on/off','Comfort support'],
      review:'"So easy to put on!" — Martha O.' },
    { name:'EvaGlow Bra',  slug:'evaglow-bra',  url:'https://bragoddess.com/products/evaglow-bra',
      usps:['Seamless powerful lift','Cleavage boost','Breathable'],
      review:'"Feels like nothing!" — Rose C.' },
    { name:'MiraHug',      slug:'mirahug',      url:'https://bragoddess.com/products/mirahug',
      usps:['Ultimate lifting & shaping','Corrector design','Full support'],
      review:'"Like a hug all day!" — Frances T.' }
  ],
  GentsLux: [
    { name:'IcyShorts',      slug:'icy-shorts',      url:'https://gentslux.com/products/icy-shorts',
      usps:['Ice silk cooling fabric','Quick-dry 4× faster','360° stretch'],
      review:'"Saved my summer!" — Frank D.' },
    { name:'JettJeans',      slug:'jett-jeans',      url:'https://gentslux.com/products/jett-jeans',
      usps:['Comfortable sit/bend/walk','Sturdy daily wear','Stretch fabric'],
      review:'"Comfortable all day." — Terry D.' },
    { name:'StretchMotions',  slug:'stretch-motions', url:'https://gentslux.com/products/stretch-motions',
      usps:['Superb stretch','6 deep pockets','Work-hard move-easy'],
      review:'"Best pants I own!" — Dennis W.' },
    { name:'AirFlexion',     slug:'airflexion',      url:'https://gentslux.com/products/airflexion',
      usps:['Pull-on elastic waist','No belt wrestling','360° stretch'],
      review:'"Step in, ready to go!" — George P.' },
    { name:'IceStrider',     slug:'ice-strider',     url:'https://gentslux.com/products/ice-strider',
      usps:['Room without sloppiness','Elastic fit','Cool ice fabric'],
      review:'"Sharp and comfy." — Robert K.' },
    { name:'MultiPants',     slug:'multi-pants',     url:'https://gentslux.com/products/multi-pants',
      usps:['6 deep pockets','4-way stretch','Versatile daily wear'],
      review:'"Everything fits!" — Harold B.' }
  ],
  LuxFitting: [
    { name:'Icy Shorts',   slug:'icy-shorts-lf',  url:'https://luxfitting.com/products/icy-shorts',
      usps:['Ice silk cooling','Easy stretch','Quick-dry'],
      review:'"No pinching at all!" — Marissa T.' },
    { name:'SoftyGrace',   slug:'softy-grace',    url:'https://luxfitting.com/products/softy-grace',
      usps:['Silky pull-on waist','No press or roll','All-day soft'],
      review:'"Wore it all day!" — Linda R.' },
    { name:'AiryGrace',    slug:'airy-grace',     url:'https://luxfitting.com/products/airy-grace',
      usps:['Airy drape fabric','Pull-on ease','Elegant flow'],
      review:'"Feels so light!" — Diane M.' },
    { name:'LinenGlam',    slug:'linen-glam',     url:'https://luxfitting.com/products/linen-glam',
      usps:['Ultra soft LinoWeave','Glamorous style','Breathable'],
      review:'"So classy!" — Beverly H.' },
    { name:'EllaEase',     slug:'ella-ease',      url:'https://luxfitting.com/products/ella-ease',
      usps:['Gentle stretch','Helps knee/leg movement','Pull-on waist'],
      review:'"My legs feel free!" — Shirley D.' },
    { name:'SuedeSoft',    slug:'suede-soft',     url:'https://luxfitting.com/products/suede-soft',
      usps:['Buttery suede feel','Wrinkle-resistant','Easy care'],
      review:'"Looks expensive!" — Patricia O.' }
  ],
  SantaFare: [
    { name:'BygoneMark',    slug:'bygone-mark',    url:'https://santafare.com/products/bygone-mark',
      usps:['Custom engraving','Premium quality','Fast shipping'],
      review:'"Perfect personalised gift!" — Sarah M.' },
    { name:'Pouchic',       slug:'pouchic',        url:'https://santafare.com/products/pouchic',
      usps:['Snap closure leather','Stylish organiser','Personalised'],
      review:'"A stylish lifesaver!" — Kate W.' },
    { name:'Snowflake',     slug:'snowflake',      url:'https://santafare.com/products/snowflake',
      usps:['Unique snowflake design','Personalised name','Gift-ready packaging'],
      review:'"They loved it!" — Jennifer L.' },
    { name:'Winkkey',       slug:'winkkey',        url:'https://santafare.com/products/winkkey',
      usps:['Personalised key ring','Durable metal','Compact gift'],
      review:'"So thoughtful!" — Amanda R.' },
    { name:'TimelessMark',  slug:'timeless-mark',  url:'https://santafare.com/products/timeless-mark',
      usps:['Mark your place','Timeless elegance','Personalised text'],
      review:'"Best $9 I\'ve ever spent!" — David K.' }
  ]
};

// ─────────────────────────────────────────────────────────────
// PLAYBOOK_RULES — dos/don'ts injected into every system prompt
// ─────────────────────────────────────────────────────────────
const PLAYBOOK_RULES = `
EMAIL COPY RULES (must follow):
- Subject line: ≤50 chars. No all-caps. Use {{first_name}} personalisation.
- Preheader: 60–90 chars. Complements subject, never repeats it.
- Never use spam words: free!, winner, congratulations, click here, limited time offer.
- Replace $ with 💲 or write as "12.99" without symbol (spam filter).
- Replace "off" with "o.f.f" in promotional price lines.
- P.S. line must add new information (social proof, scarcity, or curiosity hook) — never restate the offer.
- Banner main text: all-caps, bold, ≤8 words per line.
- Body: persona-signed. Open with pain acknowledgement OR a vivid moment. No generic "I hope this email finds you well."
- Product block main text: ALL CAPS, ≤5 words.
- USPs: start with a verb or adjective. No filler ("Great quality", "Amazing value").
- CTAs: imperative verb + product name or benefit. No "Click here" or "Learn more".
- F-pattern rule: complete hook (pain + product promise) must land within first 200px / 3 lines of email.
`;

const MODEL_OPTIONS = {
  claude: ['claude-sonnet-4-6','claude-opus-4-8','claude-haiku-4-5'],
  gemini: ['gemini-2.0-flash','gemini-2.5-pro'],
  openai: ['gpt-4o','gpt-4o-mini']
};
```

- [ ] **Step 2: Verify in browser console**

Open the file in a browser. In DevTools console run:
```javascript
console.log(Object.keys(BRAND_CONFIG));
// Expected: ["BraGoddess", "GentsLux", "LuxFitting", "SantaFare"]
console.log(PRODUCT_CATALOG.BraGoddess.length);
// Expected: 14
console.log(BRAND_CONFIG.SantaFare.segments[0].tiers.length);
// Expected: 4
```

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add BRAND_CONFIG and PRODUCT_CATALOG constants"
```

---

## Task 3 — API key management + model selector

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── API KEYS ──` block

- [ ] **Step 1: Add API key functions**

Replace `// ── API KEYS ────────...` with:

```javascript
// ── API KEYS ─────────────────────────────────────────────────
function updateModelOptions() {
  const sel = document.getElementById('model-select');
  sel.innerHTML = MODEL_OPTIONS[state.provider]
    .map(m => `<option value="${m}">${m}</option>`).join('');
  state.model = MODEL_OPTIONS[state.provider][0];
}

function saveApiKey() {
  const raw = document.getElementById('api-key-input').value.trim();
  if (!raw) return;
  sessionStorage.setItem(`apikey_${state.provider}`, raw);
  document.getElementById('api-key-input').value = '';
  refreshApiKeyPlaceholder();
}

function refreshApiKeyPlaceholder() {
  const saved = sessionStorage.getItem(`apikey_${state.provider}`);
  const inp = document.getElementById('api-key-input');
  inp.placeholder = saved ? '••••• (saved for this session)' : 'API key';
  inp.value = '';
}

function getApiKey() {
  return sessionStorage.getItem(`apikey_${state.provider}`)
    || document.getElementById('api-key-input').value.trim();
}

function setLang(l) {
  state.lang = l;
  document.getElementById('lang-en').classList.toggle('active', l === 'en');
  document.getElementById('lang-vi').classList.toggle('active', l === 'vi');
}
```

- [ ] **Step 2: Verify key is NOT in localStorage**

In browser: enter a fake key `sk-test-123`, click "Save key". Then run in console:
```javascript
localStorage.getItem('apikey_claude');   // Expected: null
sessionStorage.getItem('apikey_claude'); // Expected: "sk-test-123"
```
Reload the page — key should be gone (sessionStorage clears on tab close).

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add API key management with sessionStorage (clears on tab close)"
```

---

## Task 4 — Wizard engine (card framework)

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── WIZARD ENGINE ──` block

- [ ] **Step 1: Add wizard engine**

Replace `// ── WIZARD ENGINE ────────...` with:

```javascript
// ── WIZARD ENGINE ────────────────────────────────────────────
const STEPS = [
  { n:1, title:'Brand · Date · Theme' },
  { n:2, title:'Promo & Urgency' },
  { n:3, title:'Products (8 slots)' },
  { n:4, title:'Segments', skippable:true },
  { n:5, title:'Last Send Context', skippable:true },
  { n:6, title:'Generate' }
];

function renderWizard() {
  const c = document.getElementById('wizard-container');
  c.innerHTML = STEPS.map(s => renderCard(s)).join('');
  attachStepHandlers();
}

function renderCard({ n, title, skippable }) {
  const isDone = state.wizard.done[n];
  const isActive = state.wizard.step === n;
  const badgeClass = isDone ? 'done' : isActive ? 'active' : 'pending';
  const badgeText  = isDone ? '✓' : n;
  const summary    = isDone ? getSummary(n) : '';
  return `
<div class="w-card ${isActive ? 'active' : ''}" id="wcard-${n}">
  <div class="w-card-hdr" onclick="toggleCard(${n})">
    <span class="step-badge ${badgeClass}">${badgeText}</span>
    <span class="w-card-title">Step ${n}: ${title}</span>
    ${summary ? `<span class="w-card-summary">${escHtml(summary)}</span>` : ''}
    ${isDone ? `<button class="btn-edit" onclick="event.stopPropagation();editStep(${n})">Edit</button>` : ''}
  </div>
  <div class="w-card-body ${isActive ? '' : 'hidden'}" id="wbody-${n}">
    ${getStepBody(n)}
  </div>
</div>`;
}

function toggleCard(n) {
  if (state.wizard.step === n) return; // already open
  if (!state.wizard.done[n]) return;   // can't open incomplete step
  editStep(n);
}

function editStep(n) {
  state.wizard.step = n;
  renderWizard();
}

function advanceStep(n) {
  state.wizard.done[n] = true;
  state.wizard.step = n + 1;
  saveDraft();
  renderWizard();
  // Scroll new active card into view
  setTimeout(() => {
    const el = document.getElementById(`wcard-${n+1}`);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 80);
}

function skipStep(n) {
  advanceStep(n);
}

function getSummary(n) {
  const w = state.wizard;
  if (n===1) return `${w.brand || '—'} · ${w.date || '—'} · "${w.theme || '—'}"`;
  if (n===2) return `${w.offerValue || 'No promo'} · ${urgencyLabel(w.urgency)}`;
  if (n===3) {
    const filled = w.products.filter(p=>p.name).map(p=>p.name);
    return filled.slice(0,4).join(' · ') + (filled.length>4 ? ` +${filled.length-4}` : '');
  }
  if (n===4) return `Segments: ${w.segments.join(' · ') || 'all'}`;
  if (n===5) return w.lastHero ? `CTR ${w.lastCTR||'?'}% · ${w.lastAngle} · ${w.lastHero}` : 'Skipped';
  return '';
}

function urgencyLabel(u) {
  return {h24:'24 hrs (ends midnight)', h48:'48 hrs', weekend:'Weekend only', none:'No urgency'}[u] || u;
}

function getStepBody(n) {
  if (n===1) return buildStep1();
  if (n===2) return buildStep2();
  if (n===3) return buildStep3();
  if (n===4) return buildStep4();
  if (n===5) return buildStep5();
  if (n===6) return buildStep6();
  return '';
}

function attachStepHandlers() {
  // delegated in each buildStepN() via inline handlers
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

- [ ] **Step 2: Add stub step builders so renderWizard() works now**

Add this directly below the wizard engine (temporary stubs, replaced by Tasks 5–8):

```javascript
function buildStep1(){ return '<p style="color:#6b7280;font-size:12px">Step 1 — coming in Task 5</p>'; }
function buildStep2(){ return '<p style="color:#6b7280;font-size:12px">Step 2 — coming in Task 5</p>'; }
function buildStep3(){ return '<p style="color:#6b7280;font-size:12px">Step 3 — coming in Task 6</p>'; }
function buildStep4(){ return '<p style="color:#6b7280;font-size:12px">Step 4 — coming in Task 7</p>'; }
function buildStep5(){ return '<p style="color:#6b7280;font-size:12px">Step 5 — coming in Task 8</p>'; }
function buildStep6(){ return '<p style="color:#6b7280;font-size:12px">Step 6 — coming in Task 8</p>'; }
function saveDraft(){} // stub, implemented in Task 14
```

- [ ] **Step 3: Verify wizard renders**

Open in browser. Expected: 6 collapsible step cards; Step 1 expanded (active border), Steps 2–6 collapsed with pending badges. No console errors.

- [ ] **Step 4: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add wizard card engine with advance/edit/skip"
```

---

## Task 5 — Steps 1 and 2 (Brand/Date/Theme + Promo/Urgency)

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `buildStep1` and `buildStep2` stubs

- [ ] **Step 1: Replace buildStep1()**

```javascript
function buildStep1() {
  const w = state.wizard;
  const sfWarn = w.brand === 'SantaFare' && w.date && w.date < '2026-11-01'
    ? '' : 'hidden';
  return `
<div class="alert alert-warn ${sfWarn}" id="sf-warn">
  ⚠️ SantaFare campaigns are paused through Oct 2026 — are you sure?
</div>
<div class="fg">
  <label>Brand</label>
  <div class="pills">
    ${['BraGoddess','GentsLux','LuxFitting','SantaFare'].map(b=>`
      <span class="pill">
        <input type="radio" name="brand" id="br-${b}" value="${b}" ${w.brand===b?'checked':''}
          onchange="state.wizard.brand='${b}';checkSFWarn()">
        <label for="br-${b}">${b}</label>
      </span>`).join('')}
  </div>
</div>
<div class="fg">
  <label>Send date</label>
  <input type="date" id="send-date" value="${w.date||''}"
    onchange="state.wizard.date=this.value;checkSFWarn()">
  <div class="input-hint" id="day-name">${w.date ? formatDayName(w.date) : 'Select a date'}</div>
</div>
<div class="fg">
  <label>Campaign theme</label>
  <input type="text" id="theme-input" value="${escHtml(w.theme||'')}"
    placeholder="e.g. Summer Flash Sale · 70% OFF · Thank You"
    oninput="state.wizard.theme=this.value">
</div>
<div class="btn-row">
  <button class="btn btn-primary" onclick="submitStep1()">Next →</button>
</div>`;
}

function formatDayName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function checkSFWarn() {
  const el = document.getElementById('sf-warn');
  if (!el) return;
  const w = state.wizard;
  const show = w.brand === 'SantaFare' && w.date && w.date < '2026-11-01';
  el.classList.toggle('hidden', !show);
  // update day name hint
  const dn = document.getElementById('day-name');
  if (dn) dn.textContent = w.date ? formatDayName(w.date) : 'Select a date';
}

function submitStep1() {
  const w = state.wizard;
  if (!w.brand) { alert('Please select a brand.'); return; }
  if (!w.date)  { alert('Please pick a send date.'); return; }
  if (!w.theme || w.theme.trim().length < 3) { alert('Please enter a campaign theme (at least 3 chars).'); return; }
  // Pre-fill segments to all for selected brand
  const brand = BRAND_CONFIG[w.brand];
  if (brand.segments[0].tiers) {
    w.segments = brand.segments[0].tiers.map(t => t.id);
  } else {
    w.segments = brand.segments.map(s => s.id);
  }
  // Load saved draft products for this brand
  loadDraft(w.brand);
  advanceStep(1);
}
```

- [ ] **Step 2: Replace buildStep2()**

```javascript
function buildStep2() {
  const w = state.wizard;
  // Determine if guided (first visit) or fast mode
  const isGuided = !state.wizard.done[2] && !localStorage.getItem(`s2_seen_${w.brand}`);
  return `
<div class="fg">
  <label>Offer type</label>
  <div class="pills">
    ${[['sitewide_pct','Sitewide % OFF'],['fixed_price','Fixed price (e.g. $12.99)'],
       ['free_ship','Free shipping threshold'],['none','No promo']].map(([v,lbl])=>`
      <span class="pill">
        <input type="radio" name="offerType" id="ot-${v}" value="${v}"
          ${w.offerType===v?'checked':''}
          onchange="state.wizard.offerType='${v}';toggleOfferValue()">
        <label for="ot-${v}">${lbl}</label>
      </span>`).join('')}
  </div>
</div>
<div class="fg" id="offer-value-group" style="${w.offerType==='none'?'display:none':''}">
  <label>Offer value</label>
  <input type="text" id="offer-value" value="${escHtml(w.offerValue||'')}"
    placeholder="e.g. 70% OFF or $12.99"
    oninput="state.wizard.offerValue=this.value">
</div>
<div class="fg">
  <label>Urgency window</label>
  <div class="pills">
    ${[['h24','24 hrs (ends midnight)'],['h48','48 hrs'],
       ['weekend','Weekend only'],['none','No urgency']].map(([v,lbl])=>`
      <span class="pill">
        <input type="radio" name="urgency" id="ur-${v}" value="${v}"
          ${w.urgency===v?'checked':''}
          onchange="state.wizard.urgency='${v}'">
        <label for="ur-${v}">${lbl}</label>
      </span>`).join('')}
  </div>
</div>
<div class="btn-row">
  <button class="btn btn-primary" onclick="submitStep2()">Next →</button>
</div>`;
}

function toggleOfferValue() {
  const grp = document.getElementById('offer-value-group');
  if (grp) grp.style.display = state.wizard.offerType === 'none' ? 'none' : '';
}

function submitStep2() {
  const w = state.wizard;
  if (w.offerType !== 'none' && !w.offerValue.trim()) {
    alert('Please enter the offer value (e.g. "70% OFF" or "$12.99").'); return;
  }
  localStorage.setItem(`s2_seen_${w.brand}`, '1');
  advanceStep(2);
}
```

- [ ] **Step 3: Verify Steps 1–2 work**

Open in browser. Fill Step 1 (pick a brand, date, theme) → click Next. Step 1 should collapse showing summary; Step 2 opens. Fill offer + urgency → Next. Both steps show summaries.

Try: select SantaFare + a date before Nov 2026 → yellow warning appears.

- [ ] **Step 4: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: implement wizard Steps 1 and 2 (brand/theme/promo)"
```

---

## Task 6 — Step 3 (Products grid with catalog + URL scraping)

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `buildStep3` stub

- [ ] **Step 1: Replace buildStep3()**

```javascript
function buildStep3() {
  const w = state.wizard;
  const brand = w.brand || 'BraGoddess';
  const catalog = PRODUCT_CATALOG[brand] || [];
  const opts = `<option value="">— select product —</option>`
    + catalog.map(p=>`<option value="${escHtml(p.name)}">${escHtml(p.name)}</option>`).join('');

  const slots = w.products.map((p, i) => `
<div class="p-slot ${i===0?'hero':''}" id="pslot-${i}">
  <div class="p-slot-lbl">${i===0?'<span class="hero-star">★</span> Hero':'Support'} ${i+1}</div>
  <select onchange="onProductSelect(${i},this.value)">${opts.replace(`value="${escHtml(p.name)}"`,`value="${escHtml(p.name)}" selected`)}</select>
  <button class="btn-custom-url" onclick="toggleCustomUrl(${i})">+ Custom URL</button>
  <div class="custom-url-wrap ${p.customUrl?'open':''}" id="curl-${i}">
    <input type="text" class="hdr-input" style="background:#fff;color:#1a1d27;width:100%"
      placeholder="https://..." value="${escHtml(p.customUrl||'')}"
      onblur="scrapeProduct(${i},this.value)">
    <div class="scrape-status" id="scrape-status-${i}"></div>
  </div>
  <div class="usp-wrap" id="usps-${i}">
    ${p.usps.map((u,j)=>`<input class="usp-input" placeholder="USP ${j+1}"
      value="${escHtml(u)}" oninput="state.wizard.products[${i}].usps[${j}]=this.value">`).join('')}
  </div>
</div>`).join('');

  return `
<div class="alert alert-info">
  Slot 1 is the Hero product (featured in banner + body). Slots 2–8 are support products.
  Catalog loads for <strong>${brand}</strong>. Add a custom URL to scrape USPs from a landing page.
</div>
<div class="product-grid">${slots}</div>
<div class="btn-row">
  <button class="btn btn-primary" onclick="submitStep3()">Next →</button>
</div>`;
}

function onProductSelect(i, name) {
  state.wizard.products[i].name = name;
  // Auto-fill USPs from catalog
  const brand = state.wizard.brand;
  const match = (PRODUCT_CATALOG[brand]||[]).find(p=>p.name===name);
  if (match) {
    state.wizard.products[i].usps = [...match.usps, '', ''].slice(0,3);
    state.wizard.products[i].customUrl = '';
    // Re-render USP inputs
    const wrap = document.getElementById(`usps-${i}`);
    if (wrap) wrap.innerHTML = match.usps.concat(['','']).slice(0,3)
      .map((u,j)=>`<input class="usp-input" placeholder="USP ${j+1}"
        value="${escHtml(u)}" oninput="state.wizard.products[${i}].usps[${j}]=this.value">`).join('');
  }
}

function toggleCustomUrl(i) {
  const el = document.getElementById(`curl-${i}`);
  if (el) el.classList.toggle('open');
}

async function scrapeProduct(i, url) {
  if (!url || !url.startsWith('http')) return;
  state.wizard.products[i].customUrl = url;
  const statusEl = document.getElementById(`scrape-status-${i}`);
  if (statusEl) statusEl.textContent = '⏳ Fetching...';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const usps = extractUSPs(html);
    if (usps.length) {
      state.wizard.products[i].usps = usps.slice(0,3);
      state.wizard.products[i].scraped = true;
      const wrap = document.getElementById(`usps-${i}`);
      if (wrap) wrap.innerHTML = usps.slice(0,3)
        .map((u,j)=>`<input class="usp-input" placeholder="USP ${j+1}"
          value="${escHtml(u)}" oninput="state.wizard.products[${i}].usps[${j}]=this.value">`).join('');
      if (statusEl) statusEl.textContent = `✅ Scraped ${usps.length} USPs`;
    } else {
      if (statusEl) statusEl.textContent = '⚠️ Could not extract USPs — edit manually above';
    }
  } catch(e) {
    if (statusEl) statusEl.textContent = '⚠️ Could not fetch page (CORS) — enter USPs manually';
  }
}

function extractUSPs(html) {
  // Parse bullet points and feature lists from product page HTML
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const items = [];
  tmp.querySelectorAll('li, .feature, .benefit, [class*="usp"], [class*="feature"]').forEach(el => {
    const t = el.textContent.trim();
    if (t.length > 5 && t.length < 120 && !t.includes('\n')) items.push(t);
  });
  return [...new Set(items)].slice(0, 6);
}

function submitStep3() {
  const filled = state.wizard.products.filter(p=>p.name);
  if (filled.length < 4) { alert('Please select at least 4 products (including the hero).'); return; }
  if (!state.wizard.products[0].name) { alert('Please select a Hero product (Slot 1).'); return; }
  advanceStep(3);
}
```

- [ ] **Step 2: Verify product grid**

Open in browser. Complete Steps 1–2, then verify Step 3:
- Dropdowns are populated with products for the selected brand
- Selecting a product auto-fills USP inputs
- Clicking "+ Custom URL" reveals the URL input
- Entering `https://bragoddess.com` in URL field: shows "⚠️ Could not fetch page (CORS)" (expected in browser)
- "Next" blocked if fewer than 4 products filled

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: implement wizard Step 3 (product grid, catalog, URL scraping)"
```

---

## Task 7 — Step 4 (Segments with per-brand checkboxes + SF tiers)

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `buildStep4` stub

- [ ] **Step 1: Replace buildStep4()**

```javascript
function buildStep4() {
  const w = state.wizard;
  const brand = BRAND_CONFIG[w.brand];
  if (!brand) return '<p>Select a brand in Step 1 first.</p>';

  let html = '<div class="seg-list">';
  brand.segments.forEach(seg => {
    if (seg.tiers) {
      // SantaFare: one segment with tier checkboxes
      html += `
<div class="seg-item" style="flex-direction:column;align-items:flex-start">
  <div style="display:flex;align-items:center;gap:9px">
    <input type="checkbox" checked disabled>
    <div>
      <div class="seg-name">Segment ${seg.id} — ${seg.name}</div>
      <div class="seg-meta">${seg.meta}</div>
    </div>
  </div>
  <div class="tier-list">
    ${seg.tiers.map(t=>`
    <label class="tier-item">
      <input type="checkbox" value="${t.id}"
        ${w.segments.includes(t.id)?'checked':''}
        onchange="toggleSegment('${t.id}',this.checked)">
      <span><strong>${t.id}</strong> ${t.name}</span>
      <span style="color:var(--text-sec);font-size:10px">— ${t.meta}</span>
    </label>`).join('')}
  </div>
</div>`;
    } else {
      html += `
<div class="seg-item">
  <input type="checkbox" value="${seg.id}"
    ${w.segments.includes(seg.id)?'checked':''}
    onchange="toggleSegment('${seg.id}',this.checked)">
  <div>
    <div class="seg-name">Seg ${seg.id} — ${seg.name}</div>
    <div class="seg-meta">${seg.meta}</div>
  </div>
</div>`;
    }
  });
  html += '</div>';

  return `
${html}
<div class="btn-row">
  <button class="btn btn-primary" onclick="submitStep4()">Next →</button>
  <button class="btn-skip" onclick="skipStep(4)">Skip — use all</button>
</div>`;
}

function toggleSegment(id, checked) {
  if (checked) {
    if (!state.wizard.segments.includes(id)) state.wizard.segments.push(id);
  } else {
    state.wizard.segments = state.wizard.segments.filter(s=>s!==id);
  }
}

function submitStep4() {
  if (!state.wizard.segments.length) { alert('Select at least one segment.'); return; }
  advanceStep(4);
}
```

- [ ] **Step 2: Verify segment display**

Progress through to Step 4. For BraGoddess: should see 5 checkboxes (21/22/45/8/3), all pre-checked. For SantaFare: one segment row with 4 tier checkboxes (1-A/1-B/1-C/1-D). Unchecking a box and clicking Next should save only the checked IDs.

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: implement wizard Step 4 (segments with SF tier support)"
```

---

## Task 8 — Steps 5 and 6 (Last send context + pre-flight)

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `buildStep5` and `buildStep6` stubs

- [ ] **Step 1: Replace buildStep5()**

```javascript
function buildStep5() {
  const w = state.wizard;
  return `
<div class="alert alert-info">
  Optional — helps the AI avoid content fatigue by choosing a different angle and framework from last time.
</div>
<div class="fg">
  <label>Last send CTR (%)</label>
  <input type="number" step="0.01" min="0" max="100"
    value="${w.lastCTR||''}" placeholder="e.g. 0.84"
    oninput="state.wizard.lastCTR=this.value">
</div>
<div class="fg">
  <label>Last hero product</label>
  <input type="text" value="${escHtml(w.lastHero||'')}" placeholder="e.g. Daisy Bra"
    oninput="state.wizard.lastHero=this.value">
</div>
<div class="fg">
  <label>Last angle used</label>
  <select onchange="state.wizard.lastAngle=this.value">
    ${['Unknown','Pain-First','Desire-First','Occasion','Social-Proof','Mechanism','Identity']
      .map(a=>`<option value="${a}" ${w.lastAngle===a?'selected':''}>${a}</option>`).join('')}
  </select>
</div>
<div class="fg">
  <label>Note (optional)</label>
  <textarea placeholder="e.g. 3rd consecutive Customer Reviews arc — avoid"
    oninput="state.wizard.lastNote=this.value">${escHtml(w.lastNote||'')}</textarea>
</div>
<div class="btn-row">
  <button class="btn btn-primary" onclick="advanceStep(5)">Next →</button>
  <button class="btn-skip" onclick="skipStep(5)">Skip this step</button>
</div>`;
}
```

- [ ] **Step 2: Replace buildStep6()**

```javascript
function buildStep6() {
  const w = state.wizard;
  const estTokens = estimateTokens();
  const warnClass = estTokens > 4000 ? '' : 'hidden';
  return `
<div class="preflight">
  <div><span class="lbl">Brand</span><span class="val">${escHtml(w.brand||'—')}</span></div>
  <div><span class="lbl">Date</span><span class="val">${w.date ? formatDayName(w.date) : '—'}</span></div>
  <div><span class="lbl">Theme</span><span class="val">${escHtml(w.theme||'—')}</span></div>
  <div><span class="lbl">Promo</span><span class="val">${escHtml(w.offerValue||'No promo')} · ${urgencyLabel(w.urgency)}</span></div>
  <div><span class="lbl">Products</span><span class="val">${escHtml(w.products.filter(p=>p.name).map(p=>p.name).join(' · ') || '—')}</span></div>
  <div><span class="lbl">Segments</span><span class="val">${escHtml(w.segments.join(' · ') || 'all')}</span></div>
  <div><span class="lbl">Last send</span><span class="val">${w.lastHero ? `CTR ${w.lastCTR||'?'}% · ${w.lastAngle} · ${escHtml(w.lastHero)}` : 'Not provided'}</span></div>
  <div><span class="lbl">Est. output</span><span class="val">~${estTokens.toLocaleString()} tokens (2 calls)</span></div>
</div>
<div class="token-warn ${warnClass}">
  ⚠️ Large output estimated. Consider reducing segments or products for faster generation.
</div>
<div class="btn-row">
  <button class="btn btn-primary" id="gen-btn" onclick="generateBrief()">✨ Generate Brief</button>
</div>`;
}

function estimateTokens() {
  const w = state.wizard;
  const segCount = w.segments.length || 5;
  const prodCount = w.products.filter(p=>p.name).length;
  // Rough estimate: base 800 + 350 per segment + 200 per product
  return 800 + (segCount * 350) + (prodCount * 200);
}
```

- [ ] **Step 3: Verify full wizard flow**

Complete all 6 steps. Step 6 should show a pre-flight summary card with all values filled. Token estimate should update based on segment/product count. "✨ Generate Brief" button present (clicking it will error until Task 11 — that's expected).

- [ ] **Step 4: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: implement wizard Steps 5 and 6 (last send + pre-flight)"
```

---

## Task 9 — API abstraction layer

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── API LAYER ──` block

- [ ] **Step 1: Add makeAPICall() with 3 provider adapters**

Replace `// ── API LAYER ────────...` with:

```javascript
// ── API LAYER ─────────────────────────────────────────────────
async function makeAPICall(systemPrompt, userPrompt) {
  const key = getApiKey();
  if (!key) throw new Error('No API key. Enter your key in the header and click Save.');

  if (state.provider === 'claude')  return callClaude(systemPrompt, userPrompt, key);
  if (state.provider === 'gemini')  return callGemini(systemPrompt, userPrompt, key);
  if (state.provider === 'openai')  return callOpenAI(systemPrompt, userPrompt, key);
  throw new Error('Unknown provider: ' + state.provider);
}

async function callClaude(sys, user, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: state.model,
      max_tokens: 8192,
      system: sys,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({error:{message:res.statusText}}));
    throw new Error(`Claude API error ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(sys, user, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: user }] }]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({error:{message:res.statusText}}));
    throw new Error(`Gemini API error ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(sys, user, key) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: state.model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: user }
      ]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({error:{message:res.statusText}}));
    throw new Error(`OpenAI API error ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function extractJSON(text) {
  // Strip markdown fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  // Find outermost { }
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return JSON.parse(raw.slice(start, end + 1));
}
```

- [ ] **Step 2: Test API call in console (requires real key)**

Enter a real API key for your provider in the header. In the browser console:
```javascript
makeAPICall('You are a test assistant.', 'Say "API OK" and nothing else.')
  .then(r => console.log('Response:', r))
  .catch(e => console.error('Error:', e.message));
```
Expected: `Response: API OK` (or similar short confirmation). No CORS errors for these three endpoints.

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add API abstraction layer (Claude, Gemini, OpenAI)"
```

---

## Task 10 — Prompt builder

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── PROMPT BUILDER ──` block

- [ ] **Step 1: Add buildSystemPrompt(), buildUserPrompt(), buildRefinementPrompt()**

Replace `// ── PROMPT BUILDER ────────...` with:

```javascript
// ── PROMPT BUILDER ────────────────────────────────────────────
function buildSystemPrompt(isOptionB, optionADirection) {
  const w = state.wizard;
  const brand = BRAND_CONFIG[w.brand];
  const products = w.products.filter(p=>p.name);
  const segments = w.segments;

  const productContext = products.map((p,i) => {
    const cat = (PRODUCT_CATALOG[w.brand]||[]).find(c=>c.name===p.name) || {};
    const usps = p.usps.filter(Boolean).length ? p.usps.filter(Boolean) : (cat.usps||[]);
    const review = cat.review || '';
    return `Product ${i+1}${i===0?' (HERO)':''}: ${p.name}
  USPs: ${usps.join(' | ')}
  Top review: ${review}`;
  }).join('\n');

  const segContext = segments.map(id => {
    const brand_ = BRAND_CONFIG[w.brand];
    const seg = brand_.segments.find(s=>s.id===id)
      || brand_.segments.flatMap(s=>s.tiers||[]).find(t=>t.id===id)
      || {id, name:id, meta:''};
    return `Segment ${id}: ${seg.name} — ${seg.meta}`;
  }).join('\n');

  const contrastInstruction = isOptionB && optionADirection ? `
CRITICAL CONTRAST REQUIREMENT:
Option A used:
  Angle: ${optionADirection.angle}
  Framework: ${optionADirection.framework}
You MUST choose a DIFFERENT angle AND a DIFFERENT framework for Option B.
State your choices in creative_direction BEFORE writing any copy.
If you repeat the same angle or framework as Option A, your response is invalid.` : '';

  return `You are an expert email copywriter for ${w.brand}.
Brand persona: ${brand.persona} (${brand.voice})
Layout: ${brand.layout}

PRODUCTS:
${productContext}

SEGMENTS FOR THIS SEND:
${segContext}

${PLAYBOOK_RULES}

${contrastInstruction}

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact schema. No prose before or after the JSON.
Do not wrap in markdown fences.

{
  "creative_direction": {
    "angle": "<one of: Pain-First|Desire-First|Occasion|Social-Proof|Mechanism|Identity>",
    "framework": "<one of: PAS|BAB|4U|Social-Proof+CTA|3-Reasons-Why>",
    "flow": "<one sentence: copy journey from banner to CTA>",
    "differentiator": "<what makes this option distinct>"
  },
  "subject_lines": {
    ${segments.map(id=>`"seg_${id.replace('-','_')}": {"subject": "<≤50 chars>", "preheader": "<60-90 chars>"}`).join(',\n    ')}
  },
  "theme": "<visual brief for designer — background, colour palette, mood, layout ref>",
  "banner": {
    "logo_stars": "Logo + ⭐⭐⭐⭐⭐ 5-star review line",
    "main_text": "<ALL CAPS headline, ≤8 words per line>",
    "sub_text": "<supporting line>",
    "image_guidance": "<photo/GIF direction>",
    "review_quote": "<customer quote with name>",
    "cta": "<CTA button text>"
  },
  "body": {
    "base": "<full persona-signed body copy, signed ${brand.persona}>",
    ${segments.map(id=>`"seg_${id.replace('-','_')}": "<segment ${id} variant body copy>"`).join(',\n    ')}
  },
  "products": [
    ${products.map((_,i)=>`{
      "slot": ${i+1},
      "name": "<product name>",
      "main_text": "<ALL CAPS ≤5 words>",
      "sub_text": "<product descriptor>",
      "popup_badge": "<BESTSELLER|LOW STOCK|98% LOVED|BIGGEST PRICE DROP|SENIORS FAVE>",
      "usps": ["<USP 1 starting with verb/adj>", "<USP 2>"],
      "review": "<short customer quote — Name>",
      "cta": "<CTA text e.g. GET DAISY BRA>"
    }`).join(',\n    ')}
  ]
}`;
}

function buildUserPrompt() {
  const w = state.wizard;
  const lastSend = w.lastHero
    ? `\nLast send: CTR ${w.lastCTR||'unknown'}%, hero was "${w.lastHero}", angle was ${w.lastAngle}.${w.lastNote?' Note: '+w.lastNote:''}`
    : '';
  const promo = w.offerType === 'none' ? 'No promo this send.'
    : `Promo: ${w.offerValue} — ${urgencyLabel(w.urgency)}`;
  return `Generate a complete email brief for this send:

Brand: ${w.brand}
Send date: ${w.date ? formatDayName(w.date) : w.date}
Campaign theme: ${w.theme}
${promo}${lastSend}

Generate Option A now. Focus on a strong, concrete creative direction first, then write all copy sections.`;
}

function buildRefinementPrompt(existingBrief, changes, option) {
  return `You are editing an existing email brief.

CURRENT BRIEF (JSON):
${JSON.stringify(existingBrief, null, 2)}

REQUESTED CHANGES:
${changes}

INSTRUCTIONS:
- Apply the requested changes to the relevant sections only.
- Return the COMPLETE brief JSON with ALL fields — unchanged sections must be returned verbatim from the current brief.
- Do not add explanation or prose outside the JSON.
- Follow all playbook rules: subject ≤50 chars, preheader 60–90 chars, no spam words.`;
}
```

- [ ] **Step 2: Verify prompt structure in console**

Complete the wizard through Step 5. In console:
```javascript
const sys = buildSystemPrompt(false, null);
const usr = buildUserPrompt();
console.log('System prompt length:', sys.length);  // Expected: >1500 chars
console.log('User prompt:', usr);                  // Should show brand/date/theme/promo
console.log('Schema includes segments:', sys.includes(state.wizard.segments[0])); // true
```

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add prompt builder (system/user/refinement prompts + JSON schema)"
```

---

## Task 11 — Generation engine

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── GENERATION ──` block

- [ ] **Step 1: Add generateBrief() and validation**

Replace `// ── GENERATION ────────...` with:

```javascript
// ── GENERATION ────────────────────────────────────────────────
const VALID_ANGLES     = ['Pain-First','Desire-First','Occasion','Social-Proof','Mechanism','Identity'];
const VALID_FRAMEWORKS = ['PAS','BAB','4U','Social-Proof+CTA','3-Reasons-Why'];
const SPAM_WORDS       = ['free!','winner','congratulations','click here','limited time offer','act now','urgent'];

async function generateBrief() {
  const btn = document.getElementById('gen-btn');
  if (btn) btn.disabled = true;

  showProgress();

  const sysA = buildSystemPrompt(false, null);
  const usr  = buildUserPrompt();

  // Fire both calls in parallel — Option B waits for A's direction
  try {
    // Option A first (we need its direction for B's contrast instruction)
    updateProgress('a', 'Subject lines', 'running');
    updateProgress('b', 'Waiting for Option A direction...', 'waiting');

    const rawA = await makeAPICall(sysA, usr);
    const briefA = extractJSON(rawA);
    validateBrief(briefA, 'A');

    updateProgress('a', 'Subject lines', 'done');
    updateProgress('b', 'Starting...', 'running');

    // Now build Option B with contrast instruction
    const sysB = buildSystemPrompt(true, briefA.creative_direction);
    const usrB = usr.replace('Generate Option A now', 'Generate Option B now');

    const rawB = await makeAPICall(sysB, usrB);
    let briefB = extractJSON(rawB);
    validateBrief(briefB, 'B');

    // Auto-retry if angles are identical
    if (briefB.creative_direction?.angle === briefA.creative_direction?.angle) {
      updateProgress('b', 'Retrying (same angle as A)...', 'running');
      const rawBRetry = await makeAPICall(sysB, usrB + '\n\nWARNING: Your previous attempt used the same angle as Option A. You must choose a different angle.');
      briefB = extractJSON(rawBRetry);
      validateBrief(briefB, 'B');
    }

    state.generated.a = briefA;
    state.generated.b = briefB;

    updateProgress('b', 'Done', 'done');
    hideProgress();
    renderOutput(briefA, briefB);

  } catch(e) {
    hideProgress();
    alert('Generation failed: ' + e.message);
    if (btn) btn.disabled = false;
  }
}

function validateBrief(brief, option) {
  brief._flags = brief._flags || [];

  // Subject line length
  Object.entries(brief.subject_lines || {}).forEach(([seg, sl]) => {
    if (sl.subject && sl.subject.length > 50)
      brief._flags.push({ field:`subject_lines.${seg}.subject`, type:'warn', msg:`Subject too long (${sl.subject.length} chars > 50)` });
    if (sl.preheader && (sl.preheader.length < 60 || sl.preheader.length > 90))
      brief._flags.push({ field:`subject_lines.${seg}.preheader`, type:'warn', msg:`Preheader length ${sl.preheader.length} (target 60–90)` });
  });

  // Spam words
  const fullText = JSON.stringify(brief).toLowerCase();
  SPAM_WORDS.forEach(w => {
    if (fullText.includes(w))
      brief._flags.push({ field:'body', type:'warn', msg:`Spam word detected: "${w}"` });
  });

  // Angle/framework validity
  if (!VALID_ANGLES.includes(brief.creative_direction?.angle))
    brief._flags.push({ field:'creative_direction.angle', type:'error', msg:`Invalid angle: ${brief.creative_direction?.angle}` });
  if (!VALID_FRAMEWORKS.includes(brief.creative_direction?.framework))
    brief._flags.push({ field:'creative_direction.framework', type:'error', msg:`Invalid framework: ${brief.creative_direction?.framework}` });
}

function showProgress() {
  const c = document.getElementById('progress-container');
  c.style.display = 'block';
  c.innerHTML = `
<div class="progress-card">
  <h3>Generating your brief...</h3>
  <div class="prog-steps">
    <div class="prog-step running" id="prog-a-0"><span class="ico"></span>Option A: Building prompts</div>
    <div class="prog-step waiting" id="prog-b-0"><span class="ico"></span>Option B: Waiting</div>
    <div class="prog-step waiting" id="prog-a-1"><span class="ico"></span>Option A: Calling AI</div>
    <div class="prog-step waiting" id="prog-b-1"><span class="ico"></span>Option B: Calling AI</div>
    <div class="prog-step waiting" id="prog-a-2"><span class="ico"></span>Option A: Validating</div>
    <div class="prog-step waiting" id="prog-b-2"><span class="ico"></span>Option B: Validating</div>
  </div>
</div>`;
}

function updateProgress(opt, label, status) {
  // Simple approach: update progress card's text content
  const card = document.querySelector('.progress-card h3');
  if (card) card.textContent = `Option ${opt.toUpperCase()}: ${label}`;
}

function hideProgress() {
  const c = document.getElementById('progress-container');
  c.style.display = 'none';
}
```

- [ ] **Step 2: Test generation end-to-end**

Complete the full wizard, then click "✨ Generate Brief". With a real API key:
- Progress card appears
- After 15–40s, output panel appears with two options
- Check console for any errors; brief JSON should have `creative_direction`, `subject_lines`, `banner`, `body`, `products`

If no API key available, test error path: click Generate with no key → should show `alert("Generation failed: No API key...")`

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add generation engine (parallel calls, validation, auto-retry)"
```

---

## Task 12 — Output renderer

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── OUTPUT RENDERER ──` block

- [ ] **Step 1: Add renderOutput() and section renderers**

Replace `// ── OUTPUT RENDERER ────────...` with:

```javascript
// ── OUTPUT RENDERER ───────────────────────────────────────────
function renderOutput(briefA, briefB) {
  const panel = document.getElementById('output-panel');
  panel.classList.add('open');
  panel.innerHTML = `
<div class="output-toolbar">
  <h2>Generated Brief — ${escHtml(state.wizard.brand)} · ${state.wizard.date||''}</h2>
  <div class="output-actions">
    <button class="btn btn-secondary" onclick="exportToExcel()">⬇ Export to Excel</button>
    <button class="btn btn-secondary" onclick="regenerate()">🔄 Regenerate</button>
  </div>
</div>
<div class="output-cols">
  ${renderOption('A', briefA)}
  ${renderOption('B', briefB)}
</div>
${renderRefinePanel()}
`;
  panel.scrollIntoView({ behavior:'smooth', block:'start' });
  renderRefinePanelHandlers();
}

function renderOption(label, brief) {
  if (!brief) return '';
  const flags = (brief._flags||[]).map(f=>
    `<div class="flag-${f.type}">⚠️ ${escHtml(f.msg)}</div>`).join('');
  return `
<div class="opt-card">
  <div class="opt-card-hdr">
    <h3>Option ${label}</h3>
    <button class="btn-copy-full" onclick="copyFull('${label}')">📋 Copy full</button>
  </div>
  ${flags ? `<div class="out-section">${flags}</div>` : ''}
  ${renderDirectionSection(brief)}
  ${renderSubjectSection(brief)}
  ${renderThemeSection(brief)}
  ${renderBannerSection(brief)}
  ${renderBodySection(brief)}
  ${renderProductsSection(brief)}
</div>`;
}

function renderDirectionSection(brief) {
  const d = brief.creative_direction || {};
  return `
<div class="out-section">
  <div class="out-sec-hdr">
    <span class="out-sec-title">Creative Direction</span>
    <button class="btn-copy-sec" onclick="copySection(this)">📋</button>
  </div>
  <div class="direction-box">
    <strong>Angle:</strong> ${escHtml(d.angle||'—')}<br>
    <strong>Framework:</strong> ${escHtml(d.framework||'—')}<br>
    <strong>Flow:</strong> ${escHtml(d.flow||'—')}<br>
    <strong>Differentiator:</strong> ${escHtml(d.differentiator||'—')}
  </div>
</div>`;
}

function renderSubjectSection(brief) {
  const sl = brief.subject_lines || {};
  const rows = Object.entries(sl).map(([seg,v])=>`
<div style="margin-bottom:8px">
  <div style="font-size:10px;font-weight:700;color:var(--text-sec);text-transform:uppercase">
    ${escHtml(seg.replace('seg_','Seg ').replace('_','-'))}
  </div>
  <div style="font-weight:600">${escHtml(v.subject||'')}</div>
  <div style="color:var(--text-sec);font-size:11px">${escHtml(v.preheader||'')}</div>
</div>`).join('');
  return outSection('Subject Lines & Preheaders', rows);
}

function renderThemeSection(brief) {
  return outSection('Theme (Visual Brief)', `<div class="out-content">${escHtml(brief.theme||'')}</div>`);
}

function renderBannerSection(brief) {
  const b = brief.banner || {};
  const content = [
    b.logo_stars && `<div style="color:var(--text-sec);font-size:11px">${escHtml(b.logo_stars)}</div>`,
    b.main_text  && `<div style="font-weight:700;font-size:14px;margin:6px 0">${escHtml(b.main_text)}</div>`,
    b.sub_text   && `<div style="color:var(--text-sec)">${escHtml(b.sub_text)}</div>`,
    b.image_guidance && `<div style="background:#f8faff;border-radius:6px;padding:7px 10px;margin:6px 0;font-size:11px"><strong>Image:</strong> ${escHtml(b.image_guidance)}</div>`,
    b.review_quote && `<div style="font-style:italic;border-left:2px solid var(--border);padding-left:8px;margin:6px 0;font-size:12px">${escHtml(b.review_quote)}</div>`,
    b.cta && `<div style="margin-top:6px"><strong style="color:var(--accent)">${escHtml(b.cta)}</strong></div>`
  ].filter(Boolean).join('');
  return outSection('Banner', content);
}

function renderBodySection(brief) {
  const body = brief.body || {};
  let content = '';
  if (body.base) content += `<div style="margin-bottom:10px"><div class="out-sec-title" style="margin-bottom:4px">Base</div><div class="out-content">${escHtml(body.base)}</div></div>`;
  Object.entries(body).forEach(([k,v]) => {
    if (k === 'base') return;
    const segLabel = k.replace('seg_','Seg ').replace('_','-');
    content += `<div style="margin-bottom:10px"><div class="out-sec-title" style="margin-bottom:4px">${escHtml(segLabel)}</div><div class="out-content">${escHtml(v)}</div></div>`;
  });
  return outSection('Body Copy', content);
}

function renderProductsSection(brief) {
  const prods = brief.products || [];
  const grid = `<div class="prod-grid-out">
    ${prods.map(p=>`
    <div class="prod-block">
      <div class="prod-name">${escHtml(p.name||'')}</div>
      <div class="prod-main">${escHtml(p.main_text||'')}</div>
      <div class="prod-sub">${escHtml(p.sub_text||'')}</div>
      ${p.popup_badge ? `<div class="prod-badge">${escHtml(p.popup_badge)}</div>` : ''}
      ${(p.usps||[]).map(u=>`<div class="prod-usp">${escHtml(u)}</div>`).join('')}
      ${p.review ? `<div class="prod-review">${escHtml(p.review)}</div>` : ''}
      <button class="prod-cta">${escHtml(p.cta||'SHOP NOW')}</button>
    </div>`).join('')}
  </div>`;
  return outSection('Product Blocks', grid);
}

function outSection(title, html) {
  return `
<div class="out-section">
  <div class="out-sec-hdr">
    <span class="out-sec-title">${title}</span>
    <button class="btn-copy-sec" onclick="copySection(this)">📋</button>
  </div>
  ${html}
</div>`;
}

function copySection(btn) {
  const section = btn.closest('.out-section');
  const text = section.innerText.replace(/📋/g,'').trim();
  navigator.clipboard.writeText(text).then(()=>{
    btn.textContent='✅'; setTimeout(()=>btn.textContent='📋',1500);
  });
}

function copyFull(label) {
  const brief = label === 'A' ? state.generated.a : state.generated.b;
  if (!brief) return;
  const text = briefToPlainText(brief);
  navigator.clipboard.writeText(text).then(()=>alert('Option ' + label + ' copied to clipboard!'));
}

function briefToPlainText(brief) {
  const d = brief.creative_direction || {};
  const lines = [
    '=== CREATIVE DIRECTION ===',
    `Angle: ${d.angle}`, `Framework: ${d.framework}`, `Flow: ${d.flow}`, '',
    '=== SUBJECT LINES & PREHEADERS ===',
    ...Object.entries(brief.subject_lines||{}).flatMap(([seg,v])=>[
      `${seg.replace('seg_','SEG ').replace('_','-')}: ${v.subject}`,
      `Preheader: ${v.preheader}`, ''
    ]),
    '=== THEME ===', brief.theme||'', '',
    '=== BANNER ===',
    ...[brief.banner?.main_text, brief.banner?.sub_text, brief.banner?.image_guidance,
        brief.banner?.review_quote, `CTA: ${brief.banner?.cta}`].filter(Boolean), '',
    '=== BODY COPY ===',
    ...Object.entries(brief.body||{}).flatMap(([k,v])=>[
      `--- ${k.replace('seg_','SEG ').replace('_','-').toUpperCase()} ---`, v, ''
    ]),
    '=== PRODUCT BLOCKS ===',
    ...(brief.products||[]).flatMap(p=>[
      `[${p.slot}] ${p.name}`, p.main_text, p.sub_text, p.popup_badge,
      ...(p.usps||[]).map(u=>`✅ ${u}`), p.review, `CTA: ${p.cta}`, ''
    ])
  ];
  return lines.join('\n');
}

function regenerate() {
  // Disable for 10s to prevent rapid-fire
  const btn = document.querySelector('.output-actions button:last-child');
  if (btn) { btn.disabled = true; setTimeout(()=>btn.disabled=false, 10000); }
  generateBrief();
}
```

- [ ] **Step 2: Verify output renders**

After generation, verify:
- Two option cards appear side-by-side (or stacked on narrow screens)
- Creative Direction section shows angle, framework, flow
- Subject lines show per-segment with preheader below
- Product blocks render in 2-up grid
- `[📋 Copy full]` button copies plain text to clipboard
- Section `[📋]` buttons copy section content

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add output renderer (side-by-side options, copy buttons, product grid)"
```

---

## Task 13 — Refinement loop

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── REFINEMENT ──` block

- [ ] **Step 1: Add refine panel, applyRefinement(), revision stack**

Replace `// ── REFINEMENT ────────...` with:

```javascript
// ── REFINEMENT ────────────────────────────────────────────────
function renderRefinePanel() {
  return `
<div class="refine-panel" style="margin-top:16px">
  <h3>✏️ Refine this brief</h3>
  <div class="refine-scope">
    <label><input type="radio" name="scope" value="both" checked> Both options</label>
    <label><input type="radio" name="scope" value="a"> Option A only</label>
    <label><input type="radio" name="scope" value="b"> Option B only</label>
  </div>
  <textarea class="refine-textarea" id="refine-input"
    placeholder='Describe your changes, e.g:
• "Make subject lines more urgent for seg 45"
• "Shorten body copy — max 3 paragraphs, no P.S."
• "Change banner headline to focus on the price point"
• "Switch Option B angle to Social Proof"'></textarea>
  <div class="refine-actions">
    <button class="btn btn-primary" onclick="applyRefinement()">✨ Apply Changes</button>
    <button class="btn-undo ${state.revisions.length>0?'visible':''}" id="undo-btn" onclick="undoRefinement()">↩ Undo last change</button>
  </div>
</div>`;
}

function renderRefinePanelHandlers() {
  // no-op — all handlers inline
}

async function applyRefinement() {
  const changes = document.getElementById('refine-input')?.value?.trim();
  if (!changes) { alert('Please describe the changes you want.'); return; }

  const scope = document.querySelector('input[name="scope"]:checked')?.value || 'both';
  const applyToA = scope === 'both' || scope === 'a';
  const applyToB = scope === 'both' || scope === 'b';

  // Push current state to revision stack (max 5)
  if (state.revisions.length >= 5) state.revisions.shift();
  state.revisions.push({ a: state.generated.a, b: state.generated.b });

  const applyBtn = document.querySelector('.refine-actions .btn-primary');
  if (applyBtn) applyBtn.disabled = true;

  try {
    const [newA, newB] = await Promise.all([
      applyToA ? refineOption(state.generated.a, changes) : Promise.resolve(state.generated.a),
      applyToB ? refineOption(state.generated.b, changes) : Promise.resolve(state.generated.b)
    ]);

    state.generated.a = newA;
    state.generated.b = newB;
    renderOutput(newA, newB);
  } catch(e) {
    // Revert revision on failure
    const prev = state.revisions.pop();
    if (prev) { state.generated.a = prev.a; state.generated.b = prev.b; }
    alert('Refinement failed: ' + e.message);
  } finally {
    if (applyBtn) applyBtn.disabled = false;
  }
}

async function refineOption(existingBrief, changes) {
  if (!existingBrief) return existingBrief;
  const w = state.wizard;
  const brand = BRAND_CONFIG[w.brand];
  const sys = `You are an expert email copywriter for ${w.brand}. Persona: ${brand.persona}.
${PLAYBOOK_RULES}
Return ONLY valid JSON — no prose, no markdown fences.`;
  const user = buildRefinementPrompt(existingBrief, changes);
  const raw = await makeAPICall(sys, user);
  const refined = extractJSON(raw);
  validateBrief(refined, '?');
  return refined;
}

function undoRefinement() {
  if (!state.revisions.length) return;
  const prev = state.revisions.pop();
  state.generated.a = prev.a;
  state.generated.b = prev.b;
  renderOutput(prev.a, prev.b);
}
```

- [ ] **Step 2: Verify refinement loop**

Generate a brief. Then in the Refine panel:
1. Type `"Make all subject lines shorter — max 40 chars"`
2. Scope: "Both options"
3. Click "Apply Changes"
4. Wait ~15s — output should update with shorter subject lines
5. Click "↩ Undo last change" — original subject lines should return

Verify `state.revisions.length` increments with each apply and decrements with each undo.

- [ ] **Step 3: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add refinement loop with revision stack and undo"
```

---

## Task 14 — Excel export + draft persistence + final QA

**Files:**
- Modify: `docs/email-brief-generator.html` — replace `// ── EXCEL EXPORT ──` and `// ── PERSISTENCE ──` blocks; update `saveDraft()` / `loadDraft()` stubs

- [ ] **Step 1: Add Excel export (SheetJS row mapping)**

Replace `// ── EXCEL EXPORT ────────...` with:

```javascript
// ── EXCEL EXPORT ─────────────────────────────────────────────
function exportToExcel() {
  const { a, b } = state.generated;
  if (!a && !b) { alert('Generate a brief first.'); return; }
  const wb = XLSX.utils.book_new();
  const brand = state.wizard.brand || 'Brand';
  const date  = state.wizard.date  || 'Date';
  const d = new Date(date + 'T12:00:00');
  const dayPart = isNaN(d) ? date : d.toLocaleDateString('en-US',{weekday:'short',day:'2-digit',month:'short',year:'2-digit'}).replace(/,/g,'');
  const safeEmoji = ['⭐','✅','🌸','🌀','🦆','🐏','🧤','🌴'];
  const emoji = safeEmoji[Math.floor(Math.random()*safeEmoji.length)];

  if (a) {
    const ws = briefToSheet(a);
    const sheetName = `${emoji}${brand}_${dayPart}_A`.slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  if (b) {
    const ws = briefToSheet(b);
    const sheetName = `${emoji}${brand}_${dayPart}_B`.slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, `${brand}_brief_${date}.xlsx`);
}

function briefToSheet(brief) {
  const rows = [];
  const cell = (label, value, col2label, col2value) => {
    const row = { A: null, B: label||null, C: value||null };
    if (col2label) { row.D = col2label; row.E = col2value||null; }
    return row;
  };

  // Subject lines + preheaders (2 per row, alternating brand segments)
  const segs = Object.entries(brief.subject_lines||{});
  rows.push({ A:null }); // spacer
  // Pair them: seg[0]+seg[2], seg[1]+seg[3], etc.
  for (let i=0; i<segs.length; i+=2) {
    const [k1,v1] = segs[i];
    const [k2,v2] = segs[i+1]||[];
    const seg1 = k1.replace('seg_','').replace('_','-');
    const seg2 = k2 ? k2.replace('seg_','').replace('_','-') : null;
    rows.push(cell(`Subject ${seg1}`, v1?.subject||'', seg2?`Subject ${seg2}`:null, v2?.subject||''));
    rows.push(cell(`PreHeader ${seg1}`, v1?.preheader||'', seg2?`PreHeader ${seg2}`:null, v2?.preheader||''));
  }
  // Remaining odd segment
  if (segs.length % 2 !== 0) {
    const [k,v] = segs[segs.length-1];
    const seg = k.replace('seg_','').replace('_','-');
    rows.push(cell(`Subject ${seg}`, v?.subject||''));
    rows.push(cell(`PreHeader ${seg}`, v?.preheader||''));
  }

  rows.push({ A:null }); // spacer
  rows.push(cell('Theme', brief.theme||''));

  // Banner
  const b = brief.banner||{};
  const bannerText = [
    b.logo_stars, `Main text: ${b.main_text||''}`, `Sub text: ${b.sub_text||''}`,
    `Image: ${b.image_guidance||''}`, `Review: ${b.review_quote||''}`, `CTA: ${b.cta||''}`
  ].filter(Boolean).join('\n');
  rows.push(cell('Banner', bannerText));

  // Body
  const bodyText = Object.entries(brief.body||{}).map(([k,v])=>
    `${k==='base'?'Base':k.replace('seg_','SEG ').replace('_','-').toUpperCase()}\n${v}`
  ).join('\n\n');
  rows.push(cell('Body', bodyText));

  rows.push(cell('Ảnh sản phẩm', 'Layout tương tự temp trước\n- Gồm ảnh mẫu mặc sản phẩm\n- Hình phụ phù hợp'));

  // Products (alternating Product N / CTA row)
  (brief.products||[]).forEach((p,i) => {
    const productText = [
      `Product image: ${p.name}`,
      `Main text: ${p.main_text||''}`,
      `Sub text: ${p.sub_text||''}`,
      p.popup_badge ? `Popout: ${p.popup_badge}` : '',
      ...(p.usps||[]).map(u=>`✅ ${u}`),
      p.review ? `Review: ${p.review}` : ''
    ].filter(Boolean).join('\n');

    if (i % 2 === 0) {
      // Start a new pair row
      const next = brief.products[i+1];
      const nextText = next ? [
        `Product image: ${next.name}`,
        `Main text: ${next.main_text||''}`,
        `Sub text: ${next.sub_text||''}`,
        next.popup_badge ? `Popout: ${next.popup_badge}` : '',
        ...(next.usps||[]).map(u=>`✅ ${u}`),
        next.review ? `Review: ${next.review}` : ''
      ].filter(Boolean).join('\n') : '';
      rows.push(cell(`Product ${i+1}`, productText, next?`Product ${i+2}`:null, nextText));
      rows.push(cell(null, `CTA: ${p.cta||''}`, next?null:null, next?`CTA: ${next.cta||''}`:null));
    }
    rows.push({ A:null }); // spacer between product pairs
  });

  // Convert to worksheet
  const wsData = rows.map(r => [r.A||null, r.B||null, r.C||null, r.D||null, r.E||null]);
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [{ wch:3 },{ wch:18 },{ wch:70 },{ wch:18 },{ wch:70 }];

  return ws;
}
```

- [ ] **Step 2: Add draft persistence**

Replace `// ── PERSISTENCE ────────...` with:

```javascript
// ── PERSISTENCE ───────────────────────────────────────────────
function saveDraft() {
  const w = state.wizard;
  if (!w.brand) return;
  const draft = {
    date: w.date, theme: w.theme,
    offerType: w.offerType, offerValue: w.offerValue, urgency: w.urgency,
    products: w.products,
    lastCTR: w.lastCTR, lastHero: w.lastHero, lastAngle: w.lastAngle, lastNote: w.lastNote
  };
  try { localStorage.setItem(`draft_${w.brand}`, JSON.stringify(draft)); } catch(e){}
}

function loadDraft(brand) {
  try {
    const raw = localStorage.getItem(`draft_${brand}`);
    if (!raw) return;
    const d = JSON.parse(raw);
    const w = state.wizard;
    // Only restore products + promo — not date/theme (user just set those)
    if (d.products) w.products = d.products;
    if (d.offerType) w.offerType = d.offerType;
    if (d.offerValue) w.offerValue = d.offerValue;
    if (d.urgency) w.urgency = d.urgency;
    if (d.lastCTR) w.lastCTR = d.lastCTR;
    if (d.lastHero) w.lastHero = d.lastHero;
    if (d.lastAngle) w.lastAngle = d.lastAngle;
    if (d.lastNote) w.lastNote = d.lastNote;
  } catch(e){}
}
```

- [ ] **Step 3: Run final QA checklist**

Open `docs/email-brief-generator.html` in browser. Test each item:

```
[ ] Header: provider/model dropdowns work, switching provider updates model list
[ ] API key: save key → placeholder shows "(saved for this session)" → reload tab → key gone
[ ] Step 1: all 4 brands selectable; SantaFare + pre-Nov-2026 date shows warning
[ ] Step 2: "No promo" hides offer value field; fast mode (second visit) shows all inputs at once
[ ] Step 3: changing brand in Step 1 (via Edit) updates product dropdown; hero slot has gold border
[ ] Step 4: BraGoddess shows 5 checkboxes; SantaFare shows 1 segment + 4 tier checkboxes
[ ] Step 5: skip button works (no validation required)
[ ] Step 6: pre-flight shows correct values; token estimate updates with segment count
[ ] Generation: with real API key, brief generates in <60s; both options render
[ ] Options: side-by-side on wide screen (≥1100px); validation flags show for long subject lines
[ ] Copy section: clipboard receives plain text
[ ] Copy full: clipboard receives full formatted brief
[ ] Refine: change description + Apply Changes updates relevant option(s)
[ ] Undo: reverts to previous version; undo button hidden when no revisions exist
[ ] Excel export: .xlsx downloads; open in Excel/LibreOffice — 2 sheets (A + B), rows match format
[ ] Draft restore: complete wizard for BraGoddess, reload page, reselect BraGoddess → products pre-filled
[ ] EN/VI toggle: changes state.lang (theme output language driven by prompt in Task 10 — verify theme is in VI by default)
```

- [ ] **Step 4: Commit**

```bash
git add docs/email-brief-generator.html
git commit -m "feat: add Excel export (SheetJS row mapping) and draft persistence"
```

- [ ] **Step 5: Final commit tagging the feature complete**

```bash
git commit --allow-empty -m "feat: email brief generator v1.0 complete"
```

---

## Self-Review Against Spec

| Spec requirement | Covered in task |
|---|---|
| All 4 brands, brand-driven segments | Task 2, 4 |
| Standalone HTML, shareable | Task 1 |
| 6-step guided wizard (Approach B cards) | Task 4 |
| Step 1: Brand/Date/Theme/Language toggle | Task 5 |
| Step 2: Promo/Urgency, guided vs. fast mode | Task 5 |
| Step 3: 8-slot product grid, catalog, URL scraping | Task 6 |
| Step 4: Segments, all pre-checked, skip | Task 7 |
| Step 5: Last send context, optional | Task 8 |
| Step 6: Pre-flight summary, token estimate | Task 8 |
| Claude/Gemini/OpenAI provider abstraction | Task 9 |
| API keys in sessionStorage, never in DOM | Task 3 |
| 2 parallel calls, Option B contrast-enforced | Task 11 |
| Explicit JSON schema in system prompt | Task 10 |
| Post-parse validation (subject length, spam, angle diff) | Task 11 |
| Auto-retry if Option B angle = Option A | Task 11 |
| Side-by-side output ≥1100px | Task 12 |
| Copy section + copy full brief | Task 12 |
| Generation progress display | Task 11 |
| Refinement panel with scope selector | Task 13 |
| Partial-update prompt (preserve unchanged sections) | Task 13 |
| Revision stack (max 5), undo | Task 13 |
| Excel export, 2 sheets A+B, matching row format | Task 14 |
| SantaFare season warning | Task 5 |
| Draft persistence (localStorage, brand-keyed) | Task 14 |
| PRODUCT_CATALOG const block, easy to update | Task 2 |
| Regenerate with seed_hint | Task 12 (`regenerate()` 10s cooldown) |
| Token estimate + warning if >4k | Task 8 |
| Language toggle EN/VI | Task 3, injected into theme prompt in Task 10 |
