# Parisien Sourcing Agent — design handoff

This folder is everything a coding agent needs to build the landing page (and the rest of the UI)
as React + TypeScript components styled with plain CSS. Drop it into your repo as `design/`.

## What's inside

| Path | What it is | How the agent should use it |
|---|---|---|
| `DESIGN.md` | The design system: colours, type, spacing, components, accessibility rules, and full CSS in §11 | **Source of truth for every visual decision.** Read first. |
| `landing.html` | The approved landing page as clean static HTML + inline CSS (opens in any browser) | The reference to reproduce, section by section, as React components. Copy, structure and layout are final. |
| `assets/owl-mascot.png` | Mascot (transparent PNG, 1253×1253) | Header logo (46 px) and CTA band (220 px). Rules in DESIGN.md §7. |
| `assets/paris-banner.png` | Hero background (2000×667) | Hero section only. `background-size: cover; background-position: 72% center`. |
| `css/tokens.css` | CSS custom properties (`--navy`, `--space-6`, `--r-md` …) | Import once, globally. Never hard-code a hex that has a token. |
| `css/base.css` | Resets, headings, `.container`, `.section`, `.eyebrow`, `.ribbon`, `.grid` | Import once, globally. |
| `css/button.css`, `css/auction-card.css`, `css/badges-notice-forms.css`, `css/tables-calendar.css` | Component stylesheets | Import from the matching component file. |
| `spec.md` | The product spec (features, business rules, stack) | Context for what each screen must do. |

## Suggested layout in the React project

```
src/
  styles/
    tokens.css        ← from design/css
    base.css
  components/
    ui/
      Button.tsx        + Button.css
      Badge.tsx         + badges-notice-forms.css (shared)
      Notice.tsx
      Field.tsx
    layout/
      Header.tsx        + Header.css
      Ribbon.tsx
      Footer.tsx        + Footer.css
    auctions/
      AuctionCard.tsx   + auction-card.css
  pages/
    LandingPage.tsx     (composes Hero, HowItWorks, FeaturedAuctions, WhyAgent, CtaBand)
public/
  assets/owl-mascot.png
  assets/paris-banner.png
```

## Prompt to give the coding agent

Paste this (adjust paths if you put the folder somewhere other than `design/`):

> Read `design/README.md`, then `design/DESIGN.md` and `design/spec.md`. Open `design/landing.html` in a browser or read its source — it is the approved landing page.
>
> Build the landing page as React + TypeScript components (Vite, React Router) styled with **plain CSS only — no Tailwind, no CSS-in-JS**. Use the CSS custom properties from `design/css/tokens.css` and the classes from `design/css/base.css`; copy those two files into `src/styles/` and import them once in `main.tsx`. Copy `design/assets/*` into `public/assets/`.
>
> Create small reusable components: `Button` (variants from DESIGN.md §6.2), `Badge`/`StatusBadge` (§6.7 with all seven statuses), `Notice` (§6.6), `Header` + `Ribbon` (§6.1, §2.3), `AuctionCard` (§6.3), `StepTile` (§6.4), `FeatureTile` (§6.5), `CtaBand` (§6.11), `Footer` (§6.12), and a `LandingPage` that composes them in the same order as `landing.html`. Feed `AuctionCard` from a typed mock-data array (the three auctions in `landing.html`).
>
> Match `landing.html` pixel-for-pixel at 1280 px wide and keep it working at 390 px (nav collapses to a menu button, cards stack, mascot hidden in the CTA band). Use real `<button>`, `<a>`, `<label>`; keep every colour pairing from DESIGN.md §2 so contrast passes AA; no emoji, use Lucide stroke icons. When done, show me the result in the browser before moving on to other screens.

## Notes

- `landing.html` uses inline styles because it was exported from a design canvas. The agent should **not** keep inline styles; it should translate them into the component CSS files using the tokens.
- Fonts load from Google Fonts (`Playfair Display` 500/600/700, `Inter` 400/500/600); the `<link>` is in `landing.html`'s `<head>`.
- Mock auction houses, dates and lot counts are fictional placeholders.
