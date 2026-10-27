---
name: modern-react-components
description: Build clean, modern React 18+ components that avoid common pitfalls — unnecessary state, useEffect misuse, mirrored props, premature memoisation. Use when authoring or modifying React components.
version: 1.1.0
last_updated: 2026-05-08
---

# Writing React Components

We're using React 18+ and following the modern playbook focused on **clarity, correctness, and maintainability**.

> **Project note**: this project uses **Redux Toolkit + RTK Query** for all server state. Do **not** introduce TanStack Query, axios, or `useEffect`-based fetching.

---

## When NOT to use

- For Redux-store-shape decisions — use the Redux Toolkit conventions in `AGENTS.md` / `CLAUDE.md`.
- For server-only logic — this skill is client-side only.
- For Vue / Svelte / other UI frameworks.

---

## Component structure & style

- **PREFER** small, focused components with a single responsibility.
- **PREFER** named `function` declarations over arrow functions.
  - Exception: anonymous callbacks, inline render props, and closures.
- **PREFER** explicit prop types and (for shared APIs) explicit return types.
- Keep components flat and readable; avoid deeply nested JSX.
- Group related logic together (event handlers, derived values, helpers).

```tsx
// ✅
type KpiRowProps = { summary: Summary };

function KpiRow({ summary }: KpiRowProps) {
  return (
    <div className="kpi-row">
      <article>
        <span>Available</span>
        <strong>{compactFormatter.format(summary.availableQuantity)}</strong>
      </article>
    </div>
  );
}

export default KpiRow;
```

---

## State management

- **AVOID** `useEffect()` whenever possible. See the project reference doc:
  [`references/you-dont-need-useeffect.md`](references/you-dont-need-useeffect.md).
- **PREFER** deriving values during render instead of synchronising state.
- **PREFER** RTK Query (`@reduxjs/toolkit/query/react`) for server state.
  - Server-state caching, loading, errors, and invalidation are all RTK Query's job — don't reinvent them with `useState` + `useEffect`.
- **AVOID** unnecessary `useState()` / `useReducer()`.
  - Derive from props or other state when possible.
  - Localise state to the lowest practical component.
- **DO NOT** mirror props in state unless absolutely necessary.

```tsx
// ❌ unnecessary state + effect
function Total({ items }: { items: Item[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => setTotal(items.reduce((a, b) => a + b.price, 0)), [items]);
  return <span>{total}</span>;
}

// ✅ derive during render
function Total({ items }: { items: Item[] }) {
  const total = items.reduce((a, b) => a + b.price, 0);
  return <span>{total}</span>;
}
```

---

## Rendering & derivation

- **PREFER** computing derived values inline or via tiny helpers.
- Use `useMemo()` only for proven performance issues.
- **AVOID** premature optimisation (`memo`, `useCallback` by default).
- Keep render logic deterministic and free of side effects.

---

## Event handling

- **PREFER** named handler functions over inline arrows in JSX.

```tsx
// ✅
function handleClick() {
  /* ... */
}
<button onClick={handleClick} />

// Acceptable when the handler is trivial and unique to this site:
<button onClick={onBack} />
```

- Use clear names: `handleSubmit`, `handleChange`, `handleClose`.
- Keep handlers small; extract complex logic into helpers.

> **Project reality**: the existing dispatch wiring in `wrapper.tsx` uses inline arrows (`onClick={() => dispatch(showLanding())}`). Don't churn the file just to remove them — only refactor when you're already editing the file for another reason.

---

## Effects, data, and side effects

- **AVOID** effects for:
  - Derived state
  - Data transformations
  - Event-based logic that belongs in handlers
  - Synchronising URL/state (use a router / RTK Query lifecycle)
- If side effects are unavoidable, keep them minimal, isolated, and well-documented.
- Prefer framework-level abstractions (RTK Query, router) over raw effects.

---

## Props & composition

- **PREFER** composition over configuration.
- **AVOID** boolean prop explosion (`<Modal big rounded inverted closeOnEsc>`). Prefer expressive APIs (variants, slots, `children`).
- Use `children` intentionally and document expected structure.
- Keep prop names semantic and predictable.

---

## Performance & stability

- **PREFER** stable references only when required (memoised contexts, virtualised lists), not by default.
- **AVOID** unnecessary `memo` / `useCallback`.
- Keep keys stable and meaningful when rendering lists.
- Avoid `index` keys on reorderable lists.

---

## Files & naming (project conventions)

- Filenames: **kebab-case** (`sales-dashboard.tsx`, `inventory-kpi-row.tsx`).
- Component identifiers: **PascalCase** (`SalesDashboard`).
- One default-exported component per file.
- Co-locate per-domain panels under `components/<domain>-domain/`.
- Co-locate page-level components and types under `features/<domain>/`.
- Per-domain formatters live next to the panels (`<domain>-formatters.ts`).

---

## General principles

- Write code for humans first, compilers second.
- Prefer explicitness over cleverness.
- Optimise for readability and long-term maintenance.
- If a pattern feels complex, reconsider the component boundary.

## Validation

```powershell
npm run lint
npm run typecheck
npm test
```
