# AGENTS.md

This file gives coding agents concise guidance for working in this repository.

Keep responses concise and focused on the key result. Avoid unnecessary
explanation and long code dumps.

Use `SPEC.md` as the primary guide for product scope, architecture direction,
data model expectations, and implementation priorities in this repository.

When working with third-party libraries, tools, or framework features, verify
behavior against the official documentation before making changes.

## Project Purpose

French Sourcing Agent is a web platform connecting international buyers with a Paris-based sourcing agent who can represent them at French auctions.

The application allows customers to discover upcoming auctions, browse auction catalogues, and submit requests for the sourcing agent to bid on specific lots on their behalf.

The platform does not conduct live auctions or accept live bids. Instead, it manages proxy bidding requests, allowing the sourcing agent to coordinate and execute bids at external auction houses.

## Architecture

This is a React application using Vite with:

- JavaScript
- Plain CSS
- ESLint flat config


## Working Expectations

- Keep the UI light unless requirements explicitly change.
- Prefer simple, readable React components over abstraction too early.
- Preserve responsive behavior across desktop and mobile layouts.
- Keep the primary workflows easy to find from the main landing page.

```md
## Before changing

- Read applicable requirements/instructions; inspect the real code, config, conventions, and installed-version docs first.
- When creating or updating any UI, always read and follow `DESIGN.md` first.
- Resolve conflicts explicitly; use verified commands and references—never invent behavior or links.

## Scope and design

- Deliver only the requested change; preserve working behavior, architecture, UI direction, and externally owned systems unless authorized otherwise.
- Prefer simple, readable solutions. Reuse existing capabilities and obtain approval before adding dependencies.
- Organize by feature/responsibility: focused modules, clear public interfaces, separated data access/presentation, and no unnecessary coupling or circular dependencies.

## Code and state

- Follow project formatting, linting, naming, encoding, exports, and initialization patterns.
- Use meaningful names, focused functions, precise contracts/types, explicit conditions, and immutable shared state where required.
- Store authoritative state; derive calculations. Keep state local unless shared, use pure updates, latest-state updates, and isolate side effects in handlers/services.
- Subscribe only to needed data; avoid needless UI updates or unsafe reinitialization.

## Data, performance, and UI

- Use the established data layer/configuration; avoid hardcoded endpoints and competing clients.
- Parallelize independent work, respect dependencies, deduplicate requests, minimize transferred/persisted data, and normalize external values consistently.
- Prioritize loading, interaction, and scrolling. Defer nonessential work, optimize assets and large lists, avoid trivial memoization and layout thrashing, and preserve responsive, accessible interfaces.

## Security and errors

- Never commit secrets. Use placeholder config examples and appropriate ignores.
- Validate external input; enforce server-side authentication/authorization; preserve intended permissions, exposure, and transport protections.
- Return consistent errors, show safe user messages, log useful non-sensitive context, and preserve loading/error behavior. Treat response-shape mismatches as contracts to fix across layers.

```

