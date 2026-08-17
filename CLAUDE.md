# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # tsc -b && vite build
npm test         # vitest run (src/demo.test.ts, src/render.test.tsx)
npm run lint     # oxlint
npx vitest run -t "shipping an order"   # single test by name
```

## What this is

A **client-facing sales demo** of **Zimmer (زیمر)**, a modular ERP, configured for a **medical device and supplies company** (کالای پزشکی) that both manufactures single-use devices and distributes imported goods. Not a working ERP: frontend only, mock data, local state.

Two requirements documents, and they do not fully agree:

- `ZIMMER~1.DOC` (Word, read it with `unzip -p … word/document.xml`) is the current brief: module list, personas, the full build checklist, phasing.
- `textile_erp_demo_coding_agent_spec(1).md` is the earlier textile-ERP spec. Its **domain** is obsolete — the demo was converted from garment manufacturing to medical supplies — but it still holds the per-page column lists, the Persian label conventions and the hard constraints (§68: no backend, no database, no real auth, no real LLM, no SSR), which all still apply.

Where they conflict, the Zimmer doc wins on **scope** (which modules exist, which personas, accounting modes) and the older spec wins on **craft** (labels, column lists, RTL rules) — never on domain vocabulary, which is medical throughout.

Success is measured by whether a client believes purchasing → inventory → manufacturing → sales → distribution → CRM → accounting → reporting are one connected system.

## Architecture

Six interlocking systems carry the demo. Understanding them matters more than the file tree.

**1. Connected mock state.** `src/store/useDemo.ts` holds orders, products, customers, movements, work orders, SKU stock, shipments, conversations, notifications, audit log, users. The point of the demo is that one action fans out, so mutations are deliberately wide:

- `createOrder` appends the order, reserves stock, bumps the customer's count/sales/debt/timeline, pushes a notification and an audit entry, and raises `salesDelta`.
- `advanceOrder` to `shipped` releases the reservation, drains the warehouses and writes a stock movement.
- `advanceWorkOrder` is production's version of the same idea: leaving `molding` consumes `plannedMaterial` kilograms of the right raw material and writes an outbound movement; reaching `cartoning` adds the size curve into `skuStock`.
- `confirmDelivery` writes the proof of delivery **and** closes the sales order behind it.
- `settleCash` moves the treasury, the buyer's balance, the receivables figure, the notification feed and the audit log together, and refuses to settle the same document twice.

Never add a mutation that touches only its own slice.

Derived values are functions, not stored fields: `totalStock`, `available`, `isLow`, `fifoLayers`, `fifoValue`, `inventoryValue`, `listValue`, `inventoryMargin`, `monthlySales`, `salesAttainment`, `salesGap`, `volumeAttainment`, `cashSeries`, `cashBalance`, `cashToday`, `dueCash`, `wipUnits`, `wipByStage`, `wastePct`, `isBehind`, `finishedUnits`. Recomputing keeps every screen consistent after a mutation for free.

**Three client-requested capabilities live in that derived layer, not in a page:**

1. **FIFO inventory valuation.** Every `Lot` carries `unitCost` (and, for finished medical goods, `expiresAt`). `fifoLayers(product)` peels the remaining quantity off the **newest** layer backwards — because the oldest layers are the ones already consumed — and `inventoryValue` sums those costs. `listValue` is the same stock at sale price; the two are shown side by side and must never be confused. Accounting, the warehouse dashboard and the AI summaries all quote the FIFO figure.
2. **Sales against defined targets.** `MONTHLY` rows carry `targetSales` and `targetVolume`, and `TARGET_THIS_MONTH` carries a per-item quantity target. Attainment is derived (`salesAttainment`), so an order booked live in the demo moves the KPI, the alert and the assistant's answer at once.
3. **Automatic daily receipts, payments and cash.** `CASH_DAILY` is the ten-day treasury, `CASH_ENTRIES` today's module-raised lines — `posted` ones already in the balance, `due` ones waiting for the finance manager. `cashSeries` adds the session's settlements onto the last day and runs the balance forward from `CASH_OPENING`.

**2. Module selection.** `src/store/useAuth.ts` also holds `modules` and `accountingMode`. The entry screen is a two-step setup: pick modules (all pre-checked as the guided default), then pick a persona. Unselected modules simply do not appear — no greyed-out upsell rows. `Nav.tsx` filters on permission **and** module; `<Guard>` in `App.tsx` checks both. Messaging, the activity log and the AI layer are deliberately not modules: they wrap any selection.

**3. Two first-class accounting modes.** Neither is a fallback and nothing is pre-selected. `AccountingPage.tsx` renders `NativeMode` (AP/AR, invoice lists, journal, aging — Zimmer is the system of record) or `IntegrationMode` (connected state, last-synced, read-only summary — the client's existing software is the system of record). Both must stay built; do not let one decay into a description of the other.

**4. Frontend RBAC.** `rolePermissions` is **mutable state**, seeded from `src/data/rbac.ts`. The admin permission matrix edits it live, and switching into that role must immediately reflect the edit, so the role→permission map cannot be a frozen constant. Three enforcement points, all reading the same list: `<Can permission="…">`, `<Guard>`, `Nav.tsx`.

**5. AI layer — summaries and alerts, active not previewed.** `src/lib/insights.ts` derives both from live state: `summaryFor(dept, ctx)` writes the plain-language dashboard card, `alertsFor(dept, ctx)` derives threshold alerts (low stock, work order behind schedule, material waste over BOM, sales below target, unsettled treasury documents, overdue receivable/payable, delayed PO, dormant buyer). Alerts are department-scoped, dismissible, and carry `ownerId` + `prefill` so **any** alert can hand off into a pre-filled internal message — the demo's signature moment. `management` is the one scope that is never filtered.

The single deliberate future-phase callout is `AiNextCard` (forecasting, autonomous reordering, agentic margin analysis). Everything else is built, not previewed.

**6. Deterministic assistant.** `src/lib/ai.ts` pattern-matches the question and reads live store state, so it reflects orders, work orders and settlements made earlier in the same demo. Every numeric answer carries source / period / last-updated. Questions it cannot ground return the fixed refusal string. **Never let it compose a figure the rest of the app cannot show you** — a wrong number in front of a client is the one unrecoverable bug here. Watch substring matching in Persian: `'بار'` is inside `انبار` and `اعتبار`, so match on `'بارها'`; `'استریل'` is inside `استریلیزاسیون`. Branch order matters: the targets branch must sit before the generic monthly-sales branch, which would otherwise swallow «تحقق هدف فروش این ماه».

## RTL is a layout decision, not a stylesheet flag

Navigation is the **first** grid column (right edge in RTL), main content second, insight panel last (left). Drawers enter from the left. Use logical properties throughout (`ms-`/`me-`, `border-s`/`border-e`, `start-`/`end-`) — a physical `left`/`right` will be wrong on one side of the app.

Persian digits, Jalali dates and Toman all come from `src/lib/format.ts`, built on `Intl.NumberFormat('fa-IR')`. Dates are **stored** as Jalali strings (`'1405-05-22'`), so there is no calendar conversion anywhere and a plain string compare sorts them. Cards use `money()` (rounded, `۱۲۸ میلیون تومان`), detail views use `toman()` (full, `۱۲۸٬۰۴۰٬۰۰۰ تومان`).

## Visual rules

Tokens live in `@theme` in `src/index.css`; no hard-coded colours in components.

Brand comes from the client's brand kit and must not drift: `--color-brand #7f5af0`, `--color-brand-light #a379ff` (lighter variant), `--color-brand-dark #7e4ee6` (hover/pressed), `--color-brand-ink #5b2cc0` (body-size brand text on white), `--brand-rgb 127 90 240`. `--color-brand-tint` is the 10% wash used for selected rows and active nav — `brand-light` is a mid purple, not a background, so text on it would fail contrast. Purple is brand/CTA/selection only; status uses the separate ok/warn/crit/info tokens.

**No capsules.** Status, stage and approval indicators are never filled pills. `Badge` is a hairline chip: 6px radius, `bg-surface`, a border in the status colour at 30%, the label in the status colour, and a small square dot (`dot={false}` when the chip labels a thing rather than a state). Progress bars use 3px radius, not `rounded-full`. Circles are reserved for avatars, step markers and status dots.

One radius system: surfaces 12px, controls 8px, chips 6px, checkboxes 5px, bars 3px.

No remote assets. The entry panel is drawn in CSS/SVG because a demo machine cannot be assumed to reach an image host; anything visual must be bundled or drawn. Light-only by intent (internal ERP on a projector). Motion is deliberately low: CSS transitions, a `useCountUp` hook for KPIs, `dialog[open]` slide. No animation library. `prefers-reduced-motion` is honoured globally.

Dropdowns are `Select` in `src/components/ui.tsx`, not `<select>` — a native dropdown paints OS chrome that cannot be styled and reads as foreign next to everything else. It reimplements what the native element was paying for: `role="combobox"`/`listbox`, arrow/Home/End/Enter/Escape keys, click-outside, and flipping upward near a viewport or modal edge. Never reintroduce a bare `<select>`.

Overlays use the native `<dialog>` element (`Drawer`, `Modal` in `src/components/ui.tsx`) so focus trapping, Escape and the top layer come from the platform.

## Mock data

Two files, one company: **تجهیزات پزشکی سلامت‌گستر پارس**, which moulds, assembles and sterilises its own single-use devices *and* imports finished medical goods.

- `src/data/mock.ts` — buyers بیمارستان پارس / پخش دارویی آریا / …, imported goods M-201…M-401, raw polymers and non-wovens R-101…R-301, sterilisation gas S-101, components T-101…T-103, purchase orders, invoices, movements, audit log, users, the 12-month series with its targets, and the treasury tables.
- `src/data/catalog.ts` — manufactured models MD-204 (سرنگ) / MD-311 (دستکش) / MD-408 (گان) with their BOMs and size runs, work orders WO-051…WO-055, SKU stock, price list, shipments SH-203…SH-207, payables, ledger, the external accounting connection, manager contacts and seeded conversations.

Two product classes, deliberately: `kind: 'finished'` M- items are traded goods sold as they arrive; MD- models are produced from R-/S-/T- materials and only they carry work orders, BOMs and size curves. Produced goods are counted in **cartons** (`PRODUCED_UNIT`), never «عدد».

Reuse those exact IDs across modules; cross-module ID consistency is what sells the integration story. Traceable chain to keep intact: PO-312 → R-101 → WO-055 → MD-204 → SO-1048 → پخش دارویی آریا → shipment → receivable → cash → dashboard.

Figures are internally consistent by construction (invoice amounts sum to the aging buckets, order totals equal qty × price × discount, size curves sum to the order quantity, `plannedMaterial` equals qty × `materialPerUnit`, today's `CASH_DAILY` row equals the posted `CASH_ENTRIES`). A raw material's stock must cover any planned consumption of a work order still short of `molding`, or advancing that order will clamp at zero instead of drawing the full BOM quantity. The only company-scale numbers not derived from the tables live in `COMPANY` in `useDemo.ts` — keep that boundary sharp.

Anchors worth not breaking: SO-1042 totals ۱۲۸٬۰۴۰٬۰۰۰ (2,400 × 55,000 less 3%), low stock is derived and reads 3 items (M-202, R-101, S-101), receivables reconcile at 890M total / 284M overdue, and Mordad sales sit at ۹۲.۷٪ of the month's target so the attainment story has somewhere to go.

## Deviations from the spec's suggested stack

- **shadcn/ui not used.** RTL-native design would restyle every default anyway, and the demo needs about six primitives, not forty. They are hand-built in `src/components/ui.tsx` on native `<dialog>`.
- **No animation library.** The spec names Framer Motion; the motion budget here is fades, a slide and a count-up, which CSS covers.
- **Lucide kept** (spec names it explicitly), single family, `strokeWidth={1.5}` throughout.
