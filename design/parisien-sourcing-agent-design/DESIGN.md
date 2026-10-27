# Parisien Sourcing Agent — DESIGN.md

Design system for the Parisien Sourcing Agent web app (React + TypeScript, styled with plain CSS — no utility framework).
Derived from the two reference images: the owl mascot (royal blue, ivory breast, navy beret,
tricolour scarf, gilt frame and brass loupe) and the sun-washed Paris quayside banner.

---

## 1. Brand essence

| | |
|---|---|
| **Feel** | Elegant, trustworthy, a little playful. A Parisien auction house that welcomes international buyers. |
| **Metaphor** | The mascot is the agent: sharp-eyed (loupe), knows art (gilt frame), unmistakably Parisien (beret, tricolour). |
| **Tone of voice** | Clear, courteous, precise about money. Never breathless or salesy. |
| **One-line brief** | *Old-world auction house credibility, built with modern web clarity.* |

Design principles

1. **Ivory ground, navy ink, blue action, gold as a jewel.** Gold is a highlight, never a surface.
2. **Serif for headlines, sans for everything else.** The serif carries the auction-house feeling; the sans keeps forms and tables legible.
3. **Flat and crisp.** No gradient washes, no glassy blurs on UI chrome, no left-border cards. Depth comes from one soft shadow on raised cards only.
4. **Money and status are never ambiguous.** Amounts always in EUR with thousands separators; statuses always a labelled badge, never colour alone.

---

## 2. Colour

### 2.1 Palette tokens

| Token | Hex | Role | From the reference |
|---|---|---|---|
| `ivory` | `#FBF7EE` | Page background | Sky / breast feathers |
| `ivory-deep` | `#F3ECDB` | Footer, alt sections, table stripes | Quayside stone |
| `cream-line` | `#E6DCC3` | Borders, dividers | Shadowed stone |
| `white` | `#FFFFFF` | Cards, inputs, alternating sections | Scarf stripe |
| `navy` | `#0F2A5F` | Headings, dark bands, primary text on gold | Beret |
| `blue` | `#1F5FD0` | Primary actions, links | Wing feathers |
| `blue-hover` | `#174CA8` | Primary hover | — |
| `blue-tint` | `#E8F0FB` | Icon chips, selected rows, info backgrounds | — |
| `ribbon-blue` | `#1E3A8A` | Tricolour ribbon only | Scarf |
| `gold` | `#C9A227` | Decorative accent: rings, badges, CTA on navy | Frame / loupe |
| `gold-line` | `#E3C96A` | Gold borders on highlighted panels | — |
| `gold-tint` | `#FFF9E6` | Notice / warning background | — |
| `gold-text` | `#7A5F0B` | Gold-coloured **text** (eyebrows, notice icons) | — |
| `red` | `#D62828` | Tricolour ribbon, destructive actions, "Rejected" | Scarf |
| `ink` | `#1B1F2A` | Body text | Outline |
| `ink-soft` | `#3C4760` | Secondary body text | — |
| `ink-muted` | `#55607A` | Captions, meta, placeholders | — |
| `green` | `#1E7A4A` | "Won" status, success | — |

Contrast notes (checked against the surface each is used on):

- `gold` `#C9A227` fails as text on ivory/white. Use `gold-text` `#7A5F0B` for any gold-coloured type.
- `blue` on white = 5.8:1; `ink-muted` on ivory = 5.9:1; `ivory` on `navy` = 13:1. All pass AA for body text.
- `gold` as a *background* with `navy` text = 7.6:1 (CTA on navy band, category badges).

### 2.2 Status colours (bid requests)

Each status is a pill with text + a small icon. Colour is reinforcement, not the only signal.

| Status | Background | Text | Icon |
|---|---|---|---|
| Pending review | `#FFF9E6` | `#7A5F0B` | clock |
| Accepted | `#E8F0FB` | `#0F2A5F` | check-circle |
| Rejected | `#FDE8E8` | `#9B1C1C` | x-circle |
| Cancelled | `#EEF0F4` | `#55607A` | slash |
| Bid placed | `#0F2A5F` | `#FBF7EE` | gavel / hammer |
| Won | `#E3F3EA` | `#1E7A4A` | trophy |
| Lost | `#EEF0F4` | `#3C4760` | minus-circle |

### 2.3 The tricolour ribbon

A 6 px band of three equal segments (`ribbon-blue` / `white` / `red`) sits directly under the main header, echoing the ribbon in the banner. Use it **once per page** (under the header) and optionally as a 60 × 4 px sign-off in the footer. Never use it as a border on cards or buttons.

---

## 3. Typography

| Role | Family | Weight | Size / line-height | Notes |
|---|---|---|---|---|
| Display (h1) | Playfair Display | 600 | 52 / 1.08 | Letter-spacing −0.01em. 40 px on mobile. |
| Section (h2) | Playfair Display | 600 | 36 / 1.15 | 30 px on mobile |
| Card title (h3, serif) | Playfair Display | 600 | 22 / 1.25 | Auction and catalogue titles |
| Sub-heading (h3, sans) | Inter | 600 | 18 / 1.3 | Feature titles, form section titles |
| Eyebrow | Inter | 600 | 13 / 1 | Uppercase, letter-spacing 0.08em, colour `gold-text` |
| Body large | Inter | 400 | 18 / 1.6 | Hero lead only |
| Body | Inter | 400 | 15–16 / 1.55 | Default |
| Meta / caption | Inter | 400 | 13–14 / 1.5 | Colour `ink-muted` |
| Button | Inter | 600 | 14–16 / 1 | |
| Date numeral | Playfair Display | 600 | 30 / 1 | In auction-card date blocks |
| Amounts (EUR) | Inter | 500 | inherit | `font-variant-numeric: tabular-nums` |

Google Fonts:
`https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600&display=swap`

Fallback stacks: `'Playfair Display', Georgia, 'Times New Roman', serif` · `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`.

Rules
- Serif is for headings and auction titles only. Never set body copy, labels, tables or form fields in the serif.
- Headings are `navy`, never `blue`.
- Parisien titles keep their accents and typographic apostrophes (Arts décoratifs du XXe siècle).

---

## 4. Spacing, radius, elevation

**Spacing scale (px):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80

- Section padding: 80 px top/bottom on desktop, 48 px on mobile. Horizontal page gutter 32 px (16 px on mobile).
- Content container: `max-width: 1200px`, centred.
- Card padding: 20–24 px. Gap between cards: 24 px.
- Stack gap inside a card: 12 px; between a heading and its lead: 10 px.

**Radius**

| Token | px | Use |
|---|---|---|
| `r-sm` | 6 | Buttons, inputs, small chips |
| `r-md` | 8 | Panels, feature tiles, notices |
| `r-lg` | 10 | Cards, the hero panel |
| `r-pill` | 999 | Status and category badges |

**Elevation**

| Token | Value | Use |
|---|---|---|
| `shadow-card-hover` | `0 10px 30px rgba(15,42,95,0.12)` | Card hover only |
| `shadow-raised` | `0 16px 48px rgba(15,42,95,0.12)` | Hero panel, modals, calendar popovers |

Everything else is flat with a 1 px `cream-line` border.

---

## 5. Layout & breakpoints

| Breakpoint | Width | Behaviour |
|---|---|---|
| Mobile | < 640 px | Single column. Nav collapses to a menu button. Cards full-width. Hero panel full-width with 24 px padding. |
| Tablet | 640–1023 px | 2-column card grids. Header wraps to two rows. |
| Desktop | ≥ 1024 px | 3–4 column grids. 1200 px container. |

- Grids are `flex-wrap` rows with `flex: 1 1 <min>` children (300 px for auction cards, 230 px for step tiles) so they reflow without media queries.
- Wide tables (admin, My requests) sit inside an `overflow-x: auto` box; never shrink columns below readable width.
- The calendar is full-width at ≥ 1024 px and switches to a list/agenda view below 640 px.

---

## 6. Components

### 6.1 Header
- Ivory background, 1 px `cream-line` bottom border, tricolour ribbon directly beneath.
- Left: mascot at 46 px + wordmark in Playfair Display 700, 21 px, `navy`.
- Centre/right: nav links Inter 500 15 px `navy`, hover `blue`. Minimum 44 px tap height.
- Right: **Sign in** (secondary button) + **Create account** (primary). Signed-in: avatar menu + "My requests".

### 6.2 Buttons

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `blue` | white | — | `blue-hover` |
| Secondary | transparent | `navy` | 1.5 px `navy` | `blue-tint` bg |
| Gold (on navy only) | `gold` | `navy` | — | `#D9B43A` |
| Ghost on navy | transparent | `ivory` | 1.5 px `ivory` | `rgba(251,247,238,0.12)` bg |
| Destructive | `red` | white | — | `#B81F1F` |
| Link button | — | `blue` | — | `navy`, underline |

Sizes: lg 48 px high / 24 px padding / 16 px text · md 44 px / 18 px / 15 px · sm 36 px / 14 px / 14 px (admin tables only).
Radius `r-sm`. Focus ring: 2 px `blue` outline, 2 px offset.

### 6.3 Auction card
- White, 1 px `cream-line`, `r-lg`, overflow hidden, hover `shadow-card-hover`.
- **Header strip**: `navy` background, `ivory` text. Left: day numeral (Playfair 30) + "MON YYYY" uppercase 13 px. Right: category badge (`gold` bg, `navy` text, pill, uppercase 12 px).
- **Body**: title (Playfair 22), house · city with pin icon (15 px `ink-soft`), meta line (14 px `ink-muted`): lots · sale time · viewing dates.
- **Footer**: `cream-line` top border. Left: "Catalogue (PDF)" link with file icon. Right: "Request a bid" primary button (md). Catalogue link opens the external PDF in a new tab.

### 6.4 Step tile (How it works)
Ivory panel, `cream-line` border, `r-md`, 24 px padding. Number in a 40 px circle with a 2 px `gold` ring, Playfair 700 18 `navy`. Title Inter 600 18 `navy`. Body 15 px `ink-soft`.

### 6.5 Feature tile (Why an agent)
No border. 48 px icon chip (`blue-tint` bg, `navy` stroke icon, `r-md`), title Inter 600 18, body 15 px `ink-soft`.

### 6.6 Notice (mandatory fees notice)
`gold-tint` background, 1 px `gold-line` border, `r-md`, 20 × 24 px padding, info icon in `gold-text`. Lead words bold in `navy`. **Must appear on the bid-request form above the submit button**, and on the landing page under the featured auctions.

### 6.7 Status badge
Pill, 12 px uppercase 600, 5 × 10 px padding, icon 14 px before the label. Colours from §2.2.

### 6.8 Forms
- Label Inter 500 14 px `navy`, 6 px above the field.
- Input 44 px high, white, 1 px `cream-line`, `r-sm`, 14 px padding, text 15 px `ink`. Focus: border `blue` + 2 px `blue` ring at 25 %.
- Error: border `red`, helper text 13 px `#9B1C1C` with an x-circle icon.
- Amount fields: EUR prefix inside the field, `tabular-nums`, thousands separators on blur.
- Selects (auction, catalogue): same chrome as inputs with a chevron icon; disabled until the parent selection is made.
- Required fields marked with "*" in `red`; optional fields labelled "(optional)".

### 6.9 Tables (My requests, admin)
Header row `ivory-deep`, Inter 600 13 px uppercase `navy`. Rows 52 px, 1 px `cream-line` dividers, zebra `#FDFBF5`. Amount column right-aligned. Status column uses badges. Row hover `blue-tint`.

### 6.10 Calendar
Month grid with 1 px `cream-line` lines on white. Today: `blue-tint` cell with `blue` date numeral. Auction entries: `navy` pill with ivory text, truncated title; click opens a `shadow-raised` popover with title, house, date, catalogue link and "Request a bid". Weekend columns tinted `ivory`.

### 6.11 CTA band
`navy` background. Heading Playfair 600 38 `ivory`, lead 17 px `#D6DEEE`. Gold button + ghost-on-navy button. Mascot at 220 px on the right, hidden below 640 px.

### 6.12 Footer
`ivory-deep` background, `cream-line` top border. Wordmark + one-line description, three link columns (Explore / Account / Legal) with 12 px uppercase column titles, bottom row with © line and the 60 × 4 px tricolour sign-off.

---

## 7. Imagery & mascot

- **Mascot (owl)**: use the transparent PNG. Allowed sizes: 46 px (header), 120 px (empty states, 404), 220 px (CTA band, onboarding). Always on `ivory`, white or `navy`. Never stretch, recolour, flip, add speech bubbles, or crop the head.
- **Banner (Paris quayside)**: hero backgrounds only. `background-size: cover; background-position: 72% center` so the owl stays in view when cropped. Overlay text sits in an ivory panel at 92 % opacity with a `gold-line` border — never directly on the scene.
- **Auction imagery**: when real lot photos exist, show them in a 4:3 box with `object-fit: cover`, `r-md`, 1 px `cream-line`. Without photos, use the navy date strip (no stock images, no placeholder art).
- No photos of real auctioneers, real auction houses or real artworks without rights.

---

## 8. Iconography

Stroke icons, 2 px stroke, round caps and joins, 16 / 18 / 24 px sizes (Lucide works out of the box). Colour inherits from text. Decorative icons get `aria-hidden="true"`; meaning-bearing icons get an `aria-label`. No emoji anywhere in the UI.

Recurring icons: map-pin (location), file-text (catalogue PDF), arrow-right (view all), search (agent), list (statuses), lock (privacy), info (notice), calendar, gavel/hammer (bid placed), trophy (won).

---

## 9. Motion

- Transitions 150 ms ease-out on colour, border and shadow. Nothing animates on load.
- Card hover: shadow only, no lift/scale.
- Respect `prefers-reduced-motion: reduce` by disabling all transitions.

---

## 10. Accessibility

- All text ≥ 4.5:1 (≥ 3:1 at 24 px+). Use the §2 pairings only.
- Touch targets ≥ 44 × 44 px; nav links padded to reach it.
- Real `<button>`, `<a href>`, `<input>` + `<label>`; no click handlers on `div`s.
- Visible focus ring on every interactive element.
- Status never conveyed by colour alone (badge text + icon).
- Language attribute `en`; Parisien proper nouns keep their accents.
- Forms announce errors inline and in a summary at the top on submit.

---

## 11. CSS implementation

Plain CSS only. One global stylesheet (`src/styles/tokens.css` + `src/styles/base.css`) and one CSS file per component (`AuctionCard.css`, `Button.css`, …), imported by the component. Class names follow a simple BEM-ish convention: `.auction-card`, `.auction-card__title`, `.btn`, `.btn--secondary`.

### 11.1 Tokens (`tokens.css`)

```css
:root {
  /* Colour */
  --ivory: #FBF7EE;
  --ivory-deep: #F3ECDB;
  --cream-line: #E6DCC3;
  --white: #FFFFFF;
  --navy: #0F2A5F;
  --blue: #1F5FD0;
  --blue-hover: #174CA8;
  --blue-tint: #E8F0FB;
  --ribbon-blue: #1E3A8A;
  --gold: #C9A227;
  --gold-hover: #D9B43A;
  --gold-line: #E3C96A;
  --gold-tint: #FFF9E6;
  --gold-text: #7A5F0B;
  --red: #D62828;
  --red-hover: #B81F1F;
  --red-tint: #FDE8E8;
  --red-text: #9B1C1C;
  --green: #1E7A4A;
  --green-tint: #E3F3EA;
  --grey-tint: #EEF0F4;
  --ink: #1B1F2A;
  --ink-soft: #3C4760;
  --ink-muted: #55607A;
  --on-navy-soft: #D6DEEE;

  /* Type */
  --font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-sans: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --text-display: 52px;
  --text-section: 36px;
  --text-card: 22px;
  --text-sub: 18px;
  --text-lead: 18px;
  --text-body: 15px;
  --text-meta: 14px;
  --text-eyebrow: 13px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Radius */
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 10px;
  --r-pill: 999px;

  /* Elevation */
  --shadow-card-hover: 0 10px 30px rgba(15, 42, 95, 0.12);
  --shadow-raised: 0 16px 48px rgba(15, 42, 95, 0.12);

  /* Layout */
  --page-max: 1200px;
  --gutter: 32px;
  --section-pad: 80px;
  --tap: 44px;

  /* Motion */
  --ease: 150ms ease-out;
}

@media (max-width: 639px) {
  :root {
    --text-display: 40px;
    --text-section: 30px;
    --gutter: 16px;
    --section-pad: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  :root { --ease: 0s; }
}
```

### 11.2 Base (`base.css`)

```css
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ivory);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 { margin: 0; color: var(--navy); }
h1 { font-family: var(--font-display); font-weight: 600; font-size: var(--text-display); line-height: 1.08; letter-spacing: -0.01em; }
h2 { font-family: var(--font-display); font-weight: 600; font-size: var(--text-section); line-height: 1.15; }
h3 { font-family: var(--font-sans); font-weight: 600; font-size: var(--text-sub); line-height: 1.3; }
h3.serif { font-family: var(--font-display); font-size: var(--text-card); line-height: 1.25; }

p { margin: 0; }
a { color: var(--blue); }
a:hover { color: var(--navy); }

:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }

.container { max-width: var(--page-max); margin: 0 auto; padding-inline: var(--gutter); }
.section { padding-block: var(--section-pad); }
.section--white { background: var(--white); border-top: 1px solid var(--cream-line); border-bottom: 1px solid var(--cream-line); }
.section--navy { background: var(--navy); color: var(--ivory); }
.section--navy h2 { color: var(--ivory); }
.section--navy p { color: var(--on-navy-soft); }

.eyebrow {
  font-size: var(--text-eyebrow); font-weight: 600; line-height: 1;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold-text);
}
.lead { font-size: var(--text-lead); line-height: 1.6; color: var(--ink-soft); }
.meta { font-size: var(--text-meta); color: var(--ink-muted); }
.amount { font-variant-numeric: tabular-nums; font-weight: 500; }

/* Tricolour ribbon — once per page, under the header */
.ribbon { display: flex; height: 6px; }
.ribbon > span { flex: 1 1 0; }
.ribbon > span:nth-child(1) { background: var(--ribbon-blue); }
.ribbon > span:nth-child(2) { background: var(--white); }
.ribbon > span:nth-child(3) { background: var(--red); }

/* Responsive card rows — no media queries needed */
.grid { display: flex; flex-wrap: wrap; gap: var(--space-6); }
.grid > * { flex: 1 1 300px; min-width: 0; }
.grid--steps > * { flex-basis: 230px; }
.grid--features { gap: var(--space-8); }
.grid--features > * { flex-basis: 280px; }
```

### 11.3 Buttons (`Button.css`)

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: var(--tap); padding: 0 18px;
  border: 1.5px solid transparent; border-radius: var(--r-sm);
  background: var(--blue); color: var(--white);
  font: 600 15px/1 var(--font-sans); text-decoration: none; cursor: pointer;
  transition: background var(--ease), color var(--ease), border-color var(--ease);
}
.btn:hover { background: var(--blue-hover); color: var(--white); }
.btn--lg { min-height: 48px; padding: 0 24px; font-size: 16px; }
.btn--sm { min-height: 36px; padding: 0 14px; font-size: 14px; }

.btn--secondary { background: transparent; color: var(--navy); border-color: var(--navy); }
.btn--secondary:hover { background: var(--blue-tint); color: var(--navy); }

.btn--gold { background: var(--gold); color: var(--navy); }
.btn--gold:hover { background: var(--gold-hover); color: var(--navy); }

.btn--ghost-on-navy { background: transparent; color: var(--ivory); border-color: var(--ivory); }
.btn--ghost-on-navy:hover { background: rgba(251, 247, 238, 0.12); color: var(--ivory); }

.btn--danger { background: var(--red); }
.btn--danger:hover { background: var(--red-hover); }

.btn--link { background: none; color: var(--blue); padding: 0; min-height: var(--tap); gap: 6px; }
.btn--link:hover { color: var(--navy); text-decoration: underline; }
```

### 11.4 Auction card (`AuctionCard.css`)

```css
.auction-card {
  display: flex; flex-direction: column;
  background: var(--white); border: 1px solid var(--cream-line);
  border-radius: var(--r-lg); overflow: hidden;
  transition: box-shadow var(--ease);
}
.auction-card:hover { box-shadow: var(--shadow-card-hover); }

.auction-card__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  background: var(--navy); color: var(--ivory);
}
.auction-card__date { display: flex; align-items: baseline; gap: var(--space-2); }
.auction-card__day { font-family: var(--font-display); font-size: 30px; font-weight: 600; line-height: 1; }
.auction-card__month { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }

.auction-card__body { display: flex; flex-direction: column; gap: var(--space-3); padding: 22px var(--space-5) var(--space-5); flex: 1 1 auto; }
.auction-card__title { font-family: var(--font-display); font-size: var(--text-card); font-weight: 600; line-height: 1.25; color: var(--navy); }
.auction-card__house { display: flex; align-items: center; gap: var(--space-2); color: var(--ink-soft); }

.auction-card__foot {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
  padding: var(--space-4) var(--space-5); border-top: 1px solid var(--cream-line);
}
```

### 11.5 Badges, notice, forms

```css
/* Category badge (gold on navy card head) */
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: var(--r-pill);
  font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  background: var(--gold); color: var(--navy);
}

/* Status badges — text + icon, colour only reinforces. Use with .badge: class="badge status--won" */
.status--pending   { background: var(--gold-tint);  color: var(--gold-text); }
.status--accepted  { background: var(--blue-tint);  color: var(--navy); }
.status--rejected  { background: var(--red-tint);   color: var(--red-text); }
.status--cancelled { background: var(--grey-tint);  color: var(--ink-muted); }
.status--placed    { background: var(--navy);       color: var(--ivory); }
.status--won       { background: var(--green-tint); color: var(--green); }
.status--lost      { background: var(--grey-tint);  color: var(--ink-soft); }

/* Mandatory fees notice */
.notice {
  display: flex; gap: var(--space-4); align-items: flex-start;
  padding: var(--space-5) var(--space-6);
  background: var(--gold-tint); border: 1px solid var(--gold-line); border-radius: var(--r-md);
  color: var(--ink-soft);
}
.notice svg { flex: 0 0 auto; color: var(--gold-text); margin-top: 2px; }
.notice strong { color: var(--navy); }

/* Forms */
.field { display: flex; flex-direction: column; gap: 6px; }
.field__label { font-size: 14px; font-weight: 500; color: var(--navy); }
.field__label .req { color: var(--red); }
.field__input {
  min-height: var(--tap); padding: 0 14px;
  background: var(--white); border: 1px solid var(--cream-line); border-radius: var(--r-sm);
  font: 400 15px var(--font-sans); color: var(--ink);
  transition: border-color var(--ease), box-shadow var(--ease);
}
.field__input:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 2px rgba(31, 95, 208, 0.25); }
.field--error .field__input { border-color: var(--red); }
.field__error { font-size: 13px; color: var(--red-text); display: flex; gap: 4px; align-items: center; }
.field--amount { position: relative; }
.field--amount .field__input { padding-left: 34px; font-variant-numeric: tabular-nums; }
.field--amount::before { content: '€'; position: absolute; left: 14px; bottom: 13px; color: var(--ink-muted); }
```

### 11.6 Tables and calendar

```css
.table-wrap { overflow-x: auto; border: 1px solid var(--cream-line); border-radius: var(--r-md); background: var(--white); }
.table { width: 100%; border-collapse: collapse; }
.table th {
  background: var(--ivory-deep); padding: 0 var(--space-4); height: 44px; text-align: left;
  font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--navy);
}
.table td { height: 52px; padding: 0 var(--space-4); border-top: 1px solid var(--cream-line); }
.table tbody tr:nth-child(even) { background: #FDFBF5; }
.table tbody tr:hover { background: var(--blue-tint); }
.table td.amount { text-align: right; }

.cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; background: var(--cream-line); border: 1px solid var(--cream-line); }
.cal__cell { background: var(--white); min-height: 110px; padding: var(--space-2); }
.cal__cell--weekend { background: var(--ivory); }
.cal__cell--today { background: var(--blue-tint); }
.cal__cell--today .cal__num { color: var(--blue); font-weight: 600; }
.cal__event {
  display: block; margin-top: 4px; padding: 3px 8px; border-radius: var(--r-pill);
  background: var(--navy); color: var(--ivory); font-size: 12px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none;
}
.popover { background: var(--white); border: 1px solid var(--cream-line); border-radius: var(--r-md); box-shadow: var(--shadow-raised); padding: var(--space-5); }
@media (max-width: 639px) { .cal { display: none; } .cal-agenda { display: block; } }
```

### 11.7 Example markup

```html
<a class="btn btn--lg" href="/auctions">Browse upcoming auctions</a>
<a class="btn btn--secondary btn--lg" href="#how">How it works</a>

<span class="eyebrow">Upcoming sales</span>

<span class="badge status--pending">Pending review</span>

<div class="notice">
  <svg aria-hidden="true" …></svg>
  <p><strong>About maximum bids.</strong> The maximum bid is the hammer price only …</p>
</div>
```

---

## 12. Do / Don't

| Do | Don't |
|---|---|
| Keep gold to rings, badges, lines and one CTA on navy | Use gold as a section background or body text colour |
| Use the tricolour ribbon once under the header | Put the ribbon on cards, buttons or every section |
| Serif for headings and auction titles | Serif in forms, tables, nav or buttons |
| Show amounts as `12 500 €` / `€12,500` consistently per locale | Mix formats or drop the currency |
| Show the fees notice wherever a maximum bid is entered | Hide it behind a tooltip |
| Hide the mascot on tiny screens | Shrink it below 46 px or crop it |
| Flat surfaces with one soft hover shadow | Gradients, glass blur on chrome, left-border accent cards |
