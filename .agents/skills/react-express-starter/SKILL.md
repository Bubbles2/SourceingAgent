---
name: react-express-starter
description: Bootstrap a new project that mirrors this React + Express + Sequelize + PostgreSQL stack. Use when the user wants to start a fresh project with the same conventions, or scaffold the JDE Demo ERP layout from scratch.
version: 1.1.0
last_updated: 2026-05-08
---

# React + Express Starter

This skill captures the **conventions** of the JDE Demo ERP repo so a new project can be bootstrapped with the same shape.

> Only invoke when starting a new project or recreating this layout. For day-to-day work in **this** repo, follow `CLAUDE.md` and `AGENTS.md` instead — they reflect the actual code.

---

## When NOT to use

- For incremental work in an existing project — the rules in `CLAUDE.md` / `AGENTS.md` already cover that.
- When the target stack differs (e.g. Bun, Fastify, Drizzle, Prisma, TanStack Query). Adapt this skill or pick a different starter.

---

## Stack

- **Package manager**: npm only.
- **Single package**, ES modules, Node 20.6+ (uses `node --env-file=.env`).
- **Frontend**: React 18, TypeScript (`strict: true`), Vite, Redux Toolkit + RTK Query.
- **Backend**: Express 4 in plain JavaScript ESM.
- **Database**: PostgreSQL via Sequelize 6 over `pg`.
- **Tooling**: ESLint flat config, Prettier, Vitest (jsdom), Playwright, `concurrently`, `tsc --noEmit`.

---

## Layout (recommended)

```
.
├── src/
│   ├── main.tsx
│   ├── styles.css
│   └── client/
│       ├── app/
│       ├── components/
│       │   └── <domain>-domain/
│       ├── features/<domain>/
│       └── store/
│           ├── api/
│           ├── slices/
│           ├── hooks.ts
│           ├── index.ts
│           └── provider.tsx
├── server/
│   ├── index.js                 # listen on API_PORT
│   ├── app.js                   # mount /api, serve dist/
│   ├── api/
│   │   ├── index.js
│   │   └── <domain>/
│   │       ├── <domain>Controller.js
│   │       └── index.js
│   ├── config/
│   │   ├── database.js
│   │   └── schema.js
│   ├── models/
│   │   ├── index.js
│   │   └── <domain>.js
│   └── utils/
├── .env.example
├── index.html
├── vite.config.js
├── tsconfig.client.json
├── tsconfig.server.json
├── eslint.config.js
├── package.json
├── SPEC.md
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

---

## `package.json` scripts (canonical)

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "dev:client": "vite --host 127.0.0.1",
    "dev:server": "node --env-file=.env server/index.js",
    "start": "node --env-file=.env server/index.js",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "lint": "eslint src server --ext .js,.jsx,.ts,.tsx",
    "format": "prettier --write \"src/**/*.{js,jsx,ts,tsx,css}\" \"server/**/*.js\" \"*.{js,md,json,html}\"",
    "typecheck": "npm run typecheck:client && npm run typecheck:server",
    "typecheck:client": "tsc -p tsconfig.client.json",
    "typecheck:server": "tsc -p tsconfig.server.json",
    "test": "vitest run --passWithNoTests --environment jsdom",
    "test:e2e": "playwright test --pass-with-no-tests"
  }
}
```

---

## Conventions

- **TypeScript on the client**, JavaScript ESM on the server (typechecked via `allowJs`).
- **Per-domain folders** under `server/api/<domain>/` with `<domain>Controller.js` + `index.js`.
- **Lazy Sequelize models** via `getXxxModels()` accessors.
- **RTK Query** for all client server-state. One `createApi` per domain under `src/client/store/api/`.
- **Generic error envelope**: `{ error: "<message>" }`.
- **Schema validation**: any raw SQL goes through a `schemaTable()` helper that validates the schema name against `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- **Decimal coercion** in a single `toNumber()` util.
- **kebab-case filenames**, **PascalCase** components, **camelCase** identifiers.

---

## Bootstrap order

1. `npm init -y`, set `"type": "module"`.
2. Install deps (see `package.json` from JDE Demo ERP for the full list).
3. Add `tsconfig.client.json` (strict, `jsx: "react-jsx"`, `moduleResolution: "Bundler"`) and `tsconfig.server.json` (NodeNext, `allowJs`, `checkJs: false`).
4. Add `vite.config.js` with the `/api` proxy to the Express port.
5. Add `eslint.config.js` (flat) with separate blocks for `src/**/*.{ts,tsx}`, `src/**/*.{js,jsx}`, and `server/**/*.js`.
6. Scaffold `server/index.js`, `server/app.js`, and the first domain (`server/api/health/`).
7. Scaffold `src/main.tsx`, `src/client/app/`, `src/client/store/` (provider, hooks, index, slices, api).
8. Add `SPEC.md`, `AGENTS.md`, `CLAUDE.md`.
9. `npm run lint && npm run typecheck && npm run build` — all green before committing.

---

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

If you can't run these, report it explicitly — don't claim the bootstrap is done.
