# Style Guide — urt aesthetic
*A comprehensive guide for replicating the visual style of this app in a new project.*

---

## Overview

The aesthetic is **Windows XP / Y2K nostalgia meets modern minimalism**. Think: a real Windows XP desktop from 2003 — chrome titlebar gradients, beveled borders, Tahoma UI font, pixel icons — but sitting on top of a clean, slightly dark modern page. The overall mood is warm, personal, and a little chaotic in a good way. It's not a parody — it takes the XP aesthetic seriously and executes it cleanly.

Two distinct visual layers coexist:
1. **The "page" layer** — dark charcoal background, large expressive typography, hero-style layout. Modern-feeling.
2. **The "desktop" layer** — actual Windows XP window chrome, taskbar, desktop icons, popup dialogs. Retro-faithful.

---

## Color Palette

### Global (non-XP) colors

```css
--charcoal:      #363732   /* main background — dark olive-grey, not pure black */
--sky-aqua:      #53d8fb   /* jackson's accent — bright cyan */
--maya-blue:     #66c3ff   /* justin's accent — lighter periwinkle blue */
--soft-blossom:  #d4afb9   /* fay's accent — muted dusty rose/pink */
--alice-blue:    #dce1e9   /* primary text on dark bg — off-white with a blue tint */
```

These are used for the hero section text, the chat UI, and any non-XP parts of the page. The background `#363732` is important — it's warm dark, not cold dark. Not `#1a1a1a`, not `#000`. It reads slightly green-grey.

### Windows XP chrome colors (hardcoded)

```css
/* dialog/popup window chrome */
background: #d4d0c8        /* classic XP silver-grey */
border-color: #ffffff #808080 #808080 #ffffff  /* beveled 3D effect */
box-shadow: 2px 2px 0 #000, inset 1px 1px 0 #dfdfdf

/* default XP blue titlebar gradient */
background: linear-gradient(to right, #0a246a, #a6caf0)

/* taskbar */
background: linear-gradient(to bottom, #484848, #1e1e1e)
border-top: 1px solid #555

/* start button */
background: linear-gradient(to bottom, #4a8c4a, #2c6b2c)  /* green, like XP start */
border: 1px solid #1e4e1e

/* dialog body (white scroll area) */
background: #fff
border: 1px solid #808080

/* dialog section labels */
color: #555
/* dialog dividers */
background: #c0c0c0
/* monospace log blocks */
background: #f0f0f0; border: 1px solid #c0c0c0
/* blockquotes */
background: #f5f5f5; border-left: 3px solid #aaa
```

### Per-person theme colors (CSS custom properties)

Each "person card" injects these CSS variables onto its container element. All XP window styles reference these vars so each card has its own color scheme:

```css
--title-start    /* left side of titlebar gradient */
--title-end      /* right side of titlebar gradient */
--accent         /* hover color, buttons, highlights, pulse ring */
--body           /* window background color */
--text           /* main text */
--text-muted     /* labels, secondary text */
--border         /* outer border (darker) */
--border-light   /* inner borders, dividers (lighter) */
```

**Fay Wu** — navy + red:
```
titleStart: #1D3557   (Oxford Navy)
titleEnd:   #457B9D   (Cerulean)
accent:     #E63946   (Punch Red)
body:       #F1FAEE   (Honeydew)
text:       #1D3557
textMuted:  #457B9D
border:     #457B9D
borderLight:#A8DADC   (Frosted Blue)
```

**Jackson Huang** — navy + orange/tomato:
```
titleStart: #0D3B66   (Regal Navy)
titleEnd:   #F95738   (Tomato)
accent:     #F95738
body:       #FAF0CA   (Lemon Chiffon)
text:       #0D3B66
textMuted:  #EE964B   (Sandy Brown)
border:     #EE964B
borderLight:#F4D35E   (Royal Gold)
```

**Justin Fang** — charcoal + pink:
```
titleStart: #595758   (Charcoal)
titleEnd:   #FFC8FB   (Pink Orchid)
accent:     #FF92C2   (Pink Mist)
body:       #FFEEF2   (Lavender Blush)
text:       #595758
textMuted:  #FF92C2
border:     #FF92C2
borderLight:#FFE4F3   (Lavender Veil)
```

---

## Typography

Four fonts total. Each has a very specific role — don't mix them up.

### 1. Stack Sans Notch (body / base font)
```css
font-family: "Stack Sans Notch", sans-serif;
```
- **Where used:** Body base font, chat UI, sign-in screens, general non-XP text
- **Weights:** 200–700 available
- **Vibe:** Clean, slightly techy, modern. The "real" text of the app.
- Import: `family=Stack+Sans+Notch:wght@200..700`

### 2. Mansalva (display / name headings)
```css
font-family: "Mansalva", sans-serif;
```
- **Where used:** Hero section large names, person name inside XP window (`xp-name`)
- **Weight:** 400 only
- **Size:** Scales massively with viewport — `clamp(38px, 10vw, 180px)` for hero, `22px` for card name
- **Vibe:** Chunky, expressive, handwritten-ish but structured. The "personality" font.
- Import: `family=Mansalva`

### 3. VT323 (retro terminal / monospace display)
```css
font-family: "VT323", monospace;
```
- **Where used:** Stats rows (label + value), quote carousel text, file names, hex codes in color swatches
- **Size:** 12px–15px (it renders large, don't go bigger)
- **Letter-spacing:** 0.03–0.04em for the terminal feel
- **Vibe:** Pixel-style terminal font. Low-key retro — doesn't scream "retro" but reads differently from everything else. Used for data/facts, not prose.
- Import: `family=VT323`

### 4. Londrina Outline (logo / special heading)
```css
font-family: "Londrina Outline", sans-serif;
```
- **Where used:** The "sic" logo only
- **Size:** `clamp(32px, 4vw, 56px)`
- **Vibe:** Outlined/hollow letterforms. One-off statement use.
- Import: `family=Londrina+Outline`

### 5. Tahoma (XP chrome UI)
```css
font-family: "Tahoma", sans-serif;
```
- **Where used:** ALL XP chrome elements — titlebar text, menubar, taskbar tabs, clock, dialog buttons, desktop icon labels, window control buttons, quote nav, file hover
- **Size:** 10px–12px (XP was small)
- **Vibe:** This is the actual Windows XP system font. Using it is what makes the chrome feel authentic.
- No import needed — it's a system font (falls back fine on non-Windows)

### 6. Courier New (dialog code blocks)
```css
font-family: "Courier New", Courier, monospace;
font-size: 10px;
```
- **Where used:** `pre` blocks inside dialogs — fake terminal output, log entries, code snippets
- **Vibe:** Classic monospace. Used only inside dialog content, not in the chrome.

### Font import (Google Fonts)
```css
@import url("https://fonts.googleapis.com/css2?family=Londrina+Outline&family=Mansalva&family=Stack+Sans+Notch:wght@200..700&family=VT323&display=swap");
```

---

## Key Design Patterns

### The XP beveled border
The signature 3D feel of XP windows comes from this border pattern:
```css
border: 2px solid;
border-color: var(--border-light) var(--border) var(--border) var(--border-light);
/* light top-left, dark bottom-right = convex 3D effect */
```
For dialog windows (silver chrome):
```css
border-color: #ffffff #808080 #808080 #ffffff;
box-shadow: 2px 2px 0 #000, inset 1px 1px 0 #dfdfdf;
```

### Titlebar gradients
Every window's titlebar is a horizontal linear gradient. Per-person windows use CSS vars; dialogs either use the person's vars or the default XP blue:
```css
/* person window */
background: linear-gradient(to right, var(--title-start), var(--title-end));

/* dialog — uses --dlg-title-start/end, falls back to XP blue */
background: linear-gradient(to right, var(--dlg-title-start, #0a246a), var(--dlg-title-end, #a6caf0));
```

### Window control buttons (─ □ ✕)
```css
width: 18px; height: 16px; font-size: 9px;
border: 1px solid rgba(255,255,255,0.35);
border-radius: 2px;
background: rgba(255,255,255,0.18);
color: white;
font-family: "Tahoma";
/* close goes red on hover */
.xp-close:hover { background: #d93025; }
```

### Hover states
- **XP buttons/items:** `background: var(--accent); color: white` — simple fill with accent color
- **Links on dark bg:** Underline animation via `::after` pseudo-element that scales from 0 to 1 on hover
- **Desktop icons:** `background: rgba(255,255,255,0.12)` + `outline: 1px dashed rgba(255,255,255,0.3)`
- **Taskbar tabs:** `filter: brightness(1.15)` on the start button

### Animations
```css
/* entrance — used for hero names */
@keyframes name-fade {
  0%   { opacity: 0; transform: translateY(28px); }
  60%  { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* content swap — used for carousels */
@keyframes just-fade {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

/* decorative line grow */
@keyframes line-grow {
  0%   { transform: scaleX(0); opacity: 0; }
  100% { transform: scaleX(1); opacity: 1; }
}

/* pulsing ring — used to hint something is clickable */
@keyframes photo-pulse {
  0%   { box-shadow: 0 0 0 0px var(--accent); }
  70%  { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0px transparent; }
}
/* usage: animation: photo-pulse 2s ease-out infinite */
```

### Custom cursors
```css
/* default desktop cursor */
cursor: url('/15.png') 0 0, auto;

/* pointer for interactive elements */
cursor: url('/14.png') 0 0, pointer;

/* grab/grabbing for draggable elements */
cursor: grab;  /* on titlebar */
cursor: grabbing;  /* on .desktop--dragging */
```
The pixel cursor PNGs are stored in `/public/`. If you don't have them, fall back to `auto` / `pointer` — the CSS already has those as fallbacks.

### Dialog overlay
```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}
```
Click the overlay to close. Click inside the dialog stops propagation.

### Scrollable content inside dialogs
```css
.dialog-scroll-body {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #808080;
  margin: 8px;
  padding: 10px 12px;
}
```
White background inside the gray XP chrome — classic XP dialog content area.

### Taskbar
Fixed to bottom, `z-index: 100`. Dark gradient background. Always visible. Contains:
- Start button (green gradient, left-rounded)
- Window tabs (dark gradient pills, dimmed + italic when closed)
- Clock (right-aligned, semi-transparent background)

---

## Layout & Spacing

```
--section-px: 120px (desktop), 24px (mobile ≤640px)
```

- Windows are 370px wide by default, min 220px wide
- Windows have `border-radius: 6px 6px 2px 2px` — rounded top, nearly square bottom
- Photo panel is 110px wide, fixed
- Gap between stat rows: 2px (tight, data-dense)
- Gap between major sections inside a window: 7px
- Dividers: 1px lines

### Z-index hierarchy
```
XP windows:     z-index 10–40 (stack-based, highest = frontmost)
Taskbar:        z-index 100
Error popup:    z-index 200
Dialog overlay: z-index 300
```

---

## Background

```css
background: url('/bg.png') center center / cover no-repeat fixed;
```

`background-attachment: fixed` is critical — it prevents the background image from recalculating/shifting when content height changes (e.g. windows opening/closing). The bg is a pixelated/retro wallpaper image.

---

## Mobile (≤900px)

- XP windows switch from `position: absolute` to `position: static` — they stack vertically as a flex column, centered
- Desktop icons move from a top-right column to a horizontal wrap row at the top
- Resize handles are hidden (`display: none`)
- Taskbar tabs scroll horizontally with `overflow-x: auto`
- Windows go full-width up to `max-width: 420px`

---

## Content style inside dialogs

Dialog bodies use these classes for consistency:

```css
.dlg-content    /* flex column, gap 8px, font-size 11px, line-height 1.6 */
.dlg-label      /* 10px, bold, uppercase, letter-spacing 0.06em, color #555 — section headers */
.dlg-divider    /* 1px grey line */
.dlg-quote      /* indented blockquote with left border — for real quotes */
.dlg-attr       /* 10px italic attribution under a quote */
.dlg-mono       /* Courier New 10px pre block — for fake terminal/log output */
```

The tone of dialog content is personal and lowercase — reads like someone is describing their friends, not writing a bio. Short paragraphs. Real quotes. Occasional humor.

---

## What to carry over to a new app

If you're building a new app with this aesthetic, here's the priority list:

1. **Import all four Google fonts** (Stack Sans Notch, Mansalva, VT323, Londrina Outline)
2. **Use Tahoma for all XP chrome elements** (titlebars, buttons, labels, tabs)
3. **Use `#363732` as your dark background** — not pure black
4. **Use `#dce1e9` (alice blue) as your primary light text** on that dark bg
5. **The per-person accent colors** (`#53d8fb`, `#66c3ff`, `#d4afb9`) are the identity colors for fay, jackson, and justin respectively
6. **XP beveled borders:** `border-color: #ffffff #808080 #808080 #ffffff` with `box-shadow: 2px 2px 0 #000`
7. **XP silver chrome:** `#d4d0c8` background for dialogs/popups
8. **Titlebar:** horizontal gradient, 22–28px tall, white bold Tahoma text
9. **Keep VT323 for data** (stats, timestamps, code-adjacent text) — not for prose
10. **Keep Mansalva for display names/headings only** — don't use it for body text
11. **Animations should be subtle** — the `name-fade` bounce and `just-fade` are the signature moves. Nothing flashy.