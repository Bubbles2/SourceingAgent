---
name: api-structure
description: Scaffold a new API domain in the Express + Sequelize + PostgreSQL backend. Use when the user asks to add an endpoint, add a domain, mirror the existing backend API structure, or follow SPEC.md.
version: 1.1.0
last_updated: 2026-05-08
---

# API Structure — Express + Sequelize + PostgreSQL

## When to use

Invoke this skill when the user asks to:

- Create a new API endpoint or domain
- Add Sequelize model usage on the server
- Mirror the existing per-domain backend layout
- Follow / update `SPEC.md`

## When NOT to use

- For client-side API calls — use the RTK Query pattern in `src/client/store/api/` instead.
- For database migrations — this project does not own the schema.
- For mutating endpoints. The system is read-only by design; check with the user before bypassing this.

---

## Inputs

| Input             | Source                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| Domain name       | User (e.g. `widget`)                                                      |
| Source view/table | User or `SPEC.md`                                                         |
| Response shape    | User or — for read-only dashboards — derived from the view's columns     |

## Outputs

For a new domain `widget`:

1. `server/api/widget/widgetController.js`
2. `server/api/widget/index.js`
3. `server/models/widget.js`
4. Edit `server/models/index.js` — add `getWidgetModels()` lazy accessor
5. Edit `server/api/index.js` — mount router, add legacy alias if requested
6. Edit `SPEC.md` — add a §6.x section
7. (Client follow-up) RTK Query service + types — flag this to the user; it's outside the scope of this skill

---

## Folder layout (target)

```
server/
└── api/
    └── widget/
        ├── widgetController.js
        └── index.js
```

The folder name **must** match the domain name. The controller filename **must** be `<domain>Controller.js`.

---

## Templates

### Controller (`server/api/widget/widgetController.js`)

```js
import { col, fn, getWidgetModels, sequelize } from "../../models/index.js";
import { schemaTable } from "../../config/schema.js";
import { toNumber } from "../../utils/number.js";

export async function index(req, res) {
  try {
    const { Widget } = getWidgetModels();

    const [summary, rows] = await Promise.all([
      sequelize.query(`
        select
          count(*)::int as widget_count,
          coalesce(sum(amount), 0) as total_amount
        from ${schemaTable("v_widget_summary")}
      `),
      Widget.findAll({
        attributes: ["id", "name", "amount"],
        order: [["amount", "DESC"]],
        limit: 10,
        raw: true,
      }),
    ]);

    const summaryRow = summary[0][0];

    return res.json({
      summary: {
        widgetCount: summaryRow.widget_count,
        totalAmount: toNumber(summaryRow.total_amount),
      },
      widgets: rows.map((row) => ({
        id: row.id,
        name: row.name,
        amount: toNumber(row.amount),
      })),
    });
  } catch (error) {
    console.error("Widget dashboard failed.", error);
    return res.status(500).json({ error: "Unable to load widget dashboard." });
  }
}
```

Rules:

- **Named exports only.** Never `module.exports`.
- **Use `Promise.all`** for parallel reads.
- **Aggregate in SQL** (`COUNT`, `SUM`, `COALESCE`), not in JS.
- **`toNumber()` every Decimal** before returning.
- **camelCase** all JSON keys.
- **Generic error message** in the response. Log the underlying error to the server console only.

### Router (`server/api/widget/index.js`)

```js
import express from "express";
import { index } from "./widgetController.js";

const router = new express.Router();

router.get("/", index);
router.get("/dashboard", index);

export default router;
```

### Model (`server/models/widget.js`)

```js
import { DataTypes } from "sequelize";
import { getSchemaName } from "../config/schema.js";

export function initWidgetModels(sequelize) {
  const schema = getSchemaName();

  const modelOptions = {
    schema,
    freezeTableName: true,
    timestamps: false,
  };

  const Widget = sequelize.define(
    "Widget",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      name: DataTypes.STRING,
      amount: DataTypes.DECIMAL,
    },
    {
      ...modelOptions,
      tableName: "v_widget_summary",
    },
  );

  return { Widget };
}
```

Rules:

- `freezeTableName: true` — model name does not pluralise.
- `timestamps: false` — `jde_demo` doesn't have `createdAt`/`updatedAt`.
- `constraints: false` on every association — the schema is owned externally; we don't enforce FKs.
- Compound primary keys for views (multiple `primaryKey: true` columns).

### Lazy accessor (`server/models/index.js`)

```js
import { initWidgetModels } from "./widget.js";

let widgetModels;

export function getWidgetModels() {
  if (!widgetModels) {
    widgetModels = initWidgetModels(sequelize);
  }
  return widgetModels;
}
```

### Router registration (`server/api/index.js`)

```js
import widgetRoutes from "./widget/index.js";

router.use("/widget", widgetRoutes);

// Legacy alias (only if the user asks for one)
import { index as widgetDashboard } from "./widget/widgetController.js";
router.get("/widget-dashboard", widgetDashboard);
```

---

## Definition of done

- [ ] `server/api/<domain>/<domain>Controller.js` exists with named-export handlers.
- [ ] `server/api/<domain>/index.js` registers `GET /` and `GET /dashboard`.
- [ ] Sequelize model defined with `freezeTableName: true, timestamps: false`.
- [ ] Lazy `getXxxModels()` added to `server/models/index.js`.
- [ ] Router mounted from `server/api/index.js`.
- [ ] All `Decimal` fields piped through `toNumber()`.
- [ ] Response keys camelCase.
- [ ] `JDE_SCHEMA` interpolation goes through `schemaTable()` only — no string concatenation.
- [ ] `SPEC.md` updated with the new §6.x section, including request/response shapes.
- [ ] `npm run lint && npm run typecheck` clean.

---

## Pitfalls

- **Forgetting `getXxxModels()`**: importing a model directly from `server/models/<domain>.js` will instantiate Sequelize at module load time, breaking the lazy-init pattern.
- **Using `await sequelize.authenticate()`**: not needed inside controllers; the pool already lazy-connects.
- **Returning Decimals raw**: `pg` serialises them as strings; clients then break on arithmetic.
- **Direct schema interpolation**: `\`from ${process.env.JDE_SCHEMA}.tbl\`` bypasses validation. Always `schemaTable("tbl")`.
- **Using `WITH` in the connection-tester**: blocked by the regex in `connectionController.js`. Don't loosen it.
