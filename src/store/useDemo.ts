import { create } from 'zustand'
import type {
  AuditEntry,
  Conversation,
  Customer,
  DemoUser,
  Movement,
  Notification,
  OrderStatus,
  Product,
  SalesOrder,
  Shipment,
  SkuStock,
  Stage,
  WorkOrder,
} from '../types'
import {
  AUDIT_LOG,
  CASH_DAILY,
  CASH_ENTRIES,
  CASH_OPENING,
  CUSTOMERS,
  INVOICES,
  MONTHLY,
  MOVEMENTS,
  NOTIFICATIONS,
  PRODUCTS,
  SALES_ORDERS,
  TODAY,
  USERS,
} from '../data/mock'
import {
  MANAGER_CONTACTS,
  PRODUCED_UNIT,
  SEED_CONVERSATIONS,
  SHIPMENTS,
  SKU_STOCK,
  STAGE_FLOW,
  STAGE_LABELS,
  WORK_ORDERS,
  materialFor,
  modelOf,
} from '../data/catalog'
import { money, num } from '../lib/format'

export type Period = '6m' | '12m' | 'year'

/** Aggregates that describe the whole company, not the tracked subset shown in
 *  the tables. Kept apart so nothing derived ever gets confused with them. */
export const COMPANY = {
  monthlyPurchases: 2_170_000_000,
  activeCustomers: 127,
  newCustomersThisMonth: 12,
  salesChangePct: 14.2,
  purchaseChangePct: -3.1,
}

export const STATUS_FLOW: OrderStatus[] = [
  'draft',
  'confirmed',
  'preparing',
  'ready',
  'shipped',
  'delivered',
]

export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'پیش‌نویس',
  confirmed: 'تایید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده ارسال',
  shipped: 'ارسال شده',
  delivered: 'تحویل شده',
}

interface NewOrderInput {
  customerId: string
  productCode: string
  qty: number
  unitPrice: number
  discountPct: number
}

interface DemoState {
  period: Period
  products: Product[]
  orders: SalesOrder[]
  customers: Customer[]
  movements: Movement[]
  notifications: Notification[]
  auditLog: AuditEntry[]
  users: DemoUser[]
  workOrders: WorkOrder[]
  skuStock: SkuStock[]
  shipments: Shipment[]
  conversations: Conversation[]
  dismissedAlerts: string[]
  /** Sales booked during this demo session, added on top of the seeded month. */
  salesDelta: number
  receivablesDelta: number
  /** Treasury moved during this session by settling a due receipt or payment. */
  cashReceipts: number
  cashPayments: number
  /** Ids of the cash lines already settled, so nothing settles twice. */
  settled: string[]
  toast: string | null

  setPeriod: (p: Period) => void
  setToast: (t: string | null) => void
  settleCash: (entryId: string, actor: string) => void
  createOrder: (input: NewOrderInput, actor: string) => string
  advanceOrder: (orderId: string, actor: string) => void
  transferStock: (productCode: string, from: string, to: string, qty: number, actor: string) => void
  advanceWorkOrder: (workOrderId: string, actor: string) => void
  confirmDelivery: (shipmentId: string, signedBy: string, actor: string) => void
  sendMessage: (contactId: string, text: string) => void
  dismissAlert: (id: string) => void
  markRead: (id: string) => void
  markAllRead: () => void
  addUser: (user: Omit<DemoUser, 'id' | 'active' | 'lastSeen'>, actor: string) => void
  logAudit: (entry: Omit<AuditEntry, 'id'>) => void
}

let sequence = 1048

const now = () =>
  new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date())

export const useDemo = create<DemoState>((set, get) => ({
  period: '12m',
  products: structuredClone(PRODUCTS),
  orders: structuredClone(SALES_ORDERS),
  customers: structuredClone(CUSTOMERS),
  movements: structuredClone(MOVEMENTS),
  notifications: structuredClone(NOTIFICATIONS),
  auditLog: structuredClone(AUDIT_LOG),
  users: structuredClone(USERS),
  workOrders: structuredClone(WORK_ORDERS),
  skuStock: structuredClone(SKU_STOCK),
  shipments: structuredClone(SHIPMENTS),
  conversations: structuredClone(SEED_CONVERSATIONS),
  dismissedAlerts: [],
  salesDelta: 0,
  receivablesDelta: 0,
  cashReceipts: 0,
  cashPayments: 0,
  settled: [],
  toast: null,

  setPeriod: (period) => set({ period }),
  setToast: (toast) => set({ toast }),

  /** Receipts and payments are raised by the modules and fall due on their own
   *  date; settling one moves the treasury, the buyer's balance and the log
   *  together. Nothing here is typed in by hand. */
  settleCash: (entryId, actor) => {
    const entry = CASH_ENTRIES.find((e) => e.id === entryId)
    if (!entry || get().settled.includes(entryId)) return
    const receipt = entry.kind === 'receipt'
    const invoice = INVOICES.find((i) => i.id === entry.ref)

    set((s) => ({
      settled: [...s.settled, entryId],
      cashReceipts: s.cashReceipts + (receipt ? entry.amount : 0),
      cashPayments: s.cashPayments + (receipt ? 0 : entry.amount),
      receivablesDelta: s.receivablesDelta - (receipt ? entry.amount : 0),
      customers: s.customers.map((c) =>
        receipt && invoice && c.id === invoice.customerId
          ? {
              ...c,
              debt: Math.max(0, c.debt - entry.amount),
              timeline: [
                { at: TODAY, text: `دریافت ${money(entry.amount)} بابت ${entry.ref} ثبت شد.` },
                ...c.timeline,
              ],
            }
          : c,
      ),
      notifications: [
        {
          id: `N-${Date.now()}`,
          text: `${receipt ? 'دریافت' : 'پرداخت'} ${money(entry.amount)} بابت ${entry.ref} ثبت شد.`,
          ago: 'هم‌اکنون',
          severity: 'info' as const,
          read: false,
        },
        ...s.notifications,
      ],
      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: receipt ? 'ثبت دریافت' : 'ثبت پرداخت',
          module: 'مالی',
          detail: `${entry.ref} — ${money(entry.amount)} از ${entry.party}`,
        },
        ...s.auditLog,
      ],
      toast: `${receipt ? 'دریافت' : 'پرداخت'} ${entry.ref} ثبت شد.`,
    }))
  },

  logAudit: (entry) =>
    set((s) => ({ auditLog: [{ id: `A-${Date.now()}`, ...entry }, ...s.auditLog] })),

  /** One action, six consequences. This is the demo's whole argument: the
   *  modules are not separate spreadsheets. */
  createOrder: ({ customerId, productCode, qty, unitPrice, discountPct }, actor) => {
    const id = `SO-${++sequence}`
    const total = Math.round(qty * unitPrice * (1 - discountPct / 100))
    const customer = get().customers.find((c) => c.id === customerId)!

    set((s) => ({
      orders: [
        {
          id,
          customerId,
          lines: [{ productCode, qty, unitPrice, discountPct }],
          total,
          paidPct: 0,
          status: 'confirmed',
          createdAt: TODAY,
          dueAt: TODAY,
          isNew: true,
        },
        ...s.orders,
      ],

      // Confirming an order reserves stock. It only leaves the warehouse when
      // the order ships, which is what advanceOrder() handles.
      products: s.products.map((p) =>
        p.code === productCode ? { ...p, reserved: p.reserved + qty } : p,
      ),

      customers: s.customers.map((c) =>
        c.id === customerId
          ? {
              ...c,
              orderCount: c.orderCount + 1,
              totalSales: c.totalSales + total,
              debt: c.debt + total,
              lastPurchase: TODAY,
              timeline: [{ at: TODAY, text: `سفارش ${id} ثبت شد.` }, ...c.timeline],
            }
          : c,
      ),

      notifications: [
        {
          id: `N-${Date.now()}`,
          text: `سفارش ${id} برای ${customer.name} ثبت شد.`,
          ago: 'هم‌اکنون',
          severity: 'info',
          read: false,
        },
        ...s.notifications,
      ],

      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: 'ایجاد سفارش',
          module: 'فروش',
          detail: `${id} به مبلغ ${money(total)} ایجاد شد`,
        },
        ...s.auditLog,
      ],

      salesDelta: s.salesDelta + total,
      receivablesDelta: s.receivablesDelta + total,
      toast: `سفارش ${id} با موفقیت ثبت شد.`,
    }))

    return id
  },

  advanceOrder: (orderId, actor) => {
    const order = get().orders.find((o) => o.id === orderId)
    if (!order) return
    const next = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]
    if (!next) return

    set((s) => ({
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: next } : o)),
      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: 'تغییر وضعیت سفارش',
          module: 'فروش',
          detail: `${orderId} به «${STATUS_LABELS[next]}» تغییر کرد`,
        },
        ...s.auditLog,
      ],
      toast: `وضعیت ${orderId} به «${STATUS_LABELS[next]}» تغییر کرد.`,
    }))

    // Shipping is the moment goods physically leave: release the reservation
    // and take the quantity out of the warehouses.
    if (next !== 'shipped') return
    const customer = get().customers.find((c) => c.id === order.customerId)

    set((s) => ({
      products: s.products.map((p) => {
        const line = order.lines.find((l) => l.productCode === p.code)
        if (!line) return p
        let remaining = line.qty
        const stock = p.stock.map((w) => {
          const take = Math.min(w.qty, remaining)
          remaining -= take
          return { ...w, qty: w.qty - take }
        })
        return { ...p, stock, reserved: Math.max(0, p.reserved - line.qty) }
      }),
      movements: [
        ...order.lines.map((line, i) => ({
          id: `MV-${Date.now()}-${i}`,
          at: `${TODAY} ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`,
          productCode: line.productCode,
          kind: 'out' as const,
          qty: line.qty,
          ref: orderId,
          note: customer?.name ?? '',
        })),
        ...s.movements,
      ],
    }))
  },

  transferStock: (productCode, from, to, qty, actor) =>
    set((s) => ({
      products: s.products.map((p) =>
        p.code === productCode
          ? {
              ...p,
              stock: p.stock.map((w) =>
                w.warehouseId === from
                  ? { ...w, qty: w.qty - qty }
                  : w.warehouseId === to
                    ? { ...w, qty: w.qty + qty }
                    : w,
              ),
            }
          : p,
      ),
      movements: [
        {
          id: `MV-${Date.now()}`,
          at: `${TODAY} ${now()}`,
          productCode,
          kind: 'transfer',
          qty,
          ref: `TR-${Math.floor(Date.now() / 1000) % 1000}`,
          note: 'انتقال داخلی',
        },
        ...s.movements,
      ],
      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: 'انتقال موجودی',
          module: 'انبار',
          detail: `${num(qty)} واحد ${productCode} منتقل شد`,
        },
        ...s.auditLog,
      ],
      toast: `${num(qty)} واحد ${productCode} منتقل شد.`,
    })),

  /** Production is wired to the warehouse at both ends: leaving the moulding
   *  press eats raw material, reaching cartoning puts released devices on the
   *  shelf. */
  advanceWorkOrder: (workOrderId, actor) => {
    const wo = get().workOrders.find((w) => w.id === workOrderId)
    if (!wo) return
    const next = STAGE_FLOW[STAGE_FLOW.indexOf(wo.stage) + 1] as Stage | undefined
    if (!next) return
    const model = modelOf(wo.modelCode)
    const material = materialFor(wo.modelCode, wo.variant)
    const at = `${TODAY} ${now()}`

    set((s) => ({
      workOrders: s.workOrders.map((w) => (w.id === workOrderId ? { ...w, stage: next } : w)),

      // Moulding is where the raw material physically goes.
      products:
        wo.stage === 'molding'
          ? s.products.map((p) => {
              if (p.code !== material) return p
              let remaining = wo.plannedMaterial
              return {
                ...p,
                stock: p.stock.map((w) => {
                  const take = Math.min(w.qty, remaining)
                  remaining -= take
                  return { ...w, qty: w.qty - take }
                }),
              }
            })
          : s.products,

      // Cartoning is where released goods appear, size by size.
      skuStock:
        next === 'cartoning'
          ? Object.entries(wo.sizeCurve).reduce((rows, [size, qty]) => {
              const i = rows.findIndex(
                (r) => r.modelCode === wo.modelCode && r.variant === wo.variant && r.size === size,
              )
              if (i === -1)
                return [...rows, { modelCode: wo.modelCode, variant: wo.variant, size, qty }]
              return rows.map((r, j) => (j === i ? { ...r, qty: r.qty + qty } : r))
            }, s.skuStock)
          : s.skuStock,

      movements:
        wo.stage === 'molding'
          ? [
              {
                id: `MV-${Date.now()}`,
                at,
                productCode: material,
                kind: 'out' as const,
                qty: wo.plannedMaterial,
                ref: wo.id,
                note: `تزریق ${model?.name ?? wo.modelCode}`,
              },
              ...s.movements,
            ]
          : s.movements,

      notifications:
        next === 'cartoning'
          ? [
              {
                id: `N-${Date.now()}`,
                text: `${num(wo.qty)} ${PRODUCED_UNIT} ${model?.name ?? wo.modelCode} از ${wo.id} به موجودی محصول نهایی اضافه شد.`,
                ago: 'هم‌اکنون',
                severity: 'info' as const,
                read: false,
              },
              ...s.notifications,
            ]
          : s.notifications,

      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: 'تغییر مرحله تولید',
          module: 'تولید',
          detail: `${wo.id} به مرحله «${STAGE_LABELS[next]}» منتقل شد`,
        },
        ...s.auditLog,
      ],
      toast: `${wo.id} به مرحله «${STAGE_LABELS[next]}» رفت.`,
    }))
  },

  /** Confirming receipt closes the sales order too — the buyer's order is not
   *  finished until the goods are signed for. */
  confirmDelivery: (shipmentId, signedBy, actor) => {
    const shipment = get().shipments.find((sh) => sh.id === shipmentId)
    if (!shipment || shipment.status === 'delivered') return

    set((s) => ({
      shipments: s.shipments.map((sh) =>
        sh.id === shipmentId
          ? { ...sh, status: 'delivered' as const, pod: { by: signedBy, at: TODAY } }
          : sh,
      ),
      orders: s.orders.map((o) =>
        o.id === shipment.orderId ? { ...o, status: 'delivered' as const } : o,
      ),
      notifications: [
        {
          id: `N-${Date.now()}`,
          text: `بار ${shipment.id} تحویل شد و سفارش ${shipment.orderId} بسته شد.`,
          ago: 'هم‌اکنون',
          severity: 'info',
          read: false,
        },
        ...s.notifications,
      ],
      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: 'تایید تحویل بار',
          module: 'توزیع',
          detail: `${shipment.id} توسط ${signedBy} تحویل گرفته شد`,
        },
        ...s.auditLog,
      ],
      toast: `تحویل ${shipment.id} ثبت شد.`,
    }))
  },

  sendMessage: (contactId, text) =>
    set((s) => {
      const message = { id: `M-${Date.now()}`, from: 'me', text, at: now() }
      const exists = s.conversations.some((c) => c.contactId === contactId)
      return {
        conversations: exists
          ? s.conversations.map((c) =>
              c.contactId === contactId ? { ...c, messages: [...c.messages, message] } : c,
            )
          : [...s.conversations, { id: `CV-${Date.now()}`, contactId, messages: [message] }],
        toast: `پیام برای ${MANAGER_CONTACTS.find((m) => m.id === contactId)?.name ?? 'همکار'} ارسال شد.`,
      }
    }),

  dismissAlert: (id) => set((s) => ({ dismissedAlerts: [...s.dismissedAlerts, id] })),

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  markAllRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

  addUser: (user, actor) =>
    set((s) => ({
      users: [
        { id: `U-${Date.now()}`, active: true, lastSeen: 'هرگز', ...user },
        ...s.users,
      ],
      auditLog: [
        {
          id: `A-${Date.now()}`,
          at: now(),
          user: actor,
          action: 'ایجاد کاربر',
          module: 'کاربران',
          detail: `${user.name} با نقش ${user.role} ایجاد شد`,
        },
        ...s.auditLog,
      ],
      toast: `کاربر ${user.name} ایجاد شد.`,
    })),
}))

/* ---------------------------------- derived --------------------------------- */

export const totalStock = (p: Product) => p.stock.reduce((sum, w) => sum + w.qty, 0)
export const available = (p: Product) => totalStock(p) - p.reserved
export const isLow = (p: Product) => totalStock(p) < p.minQty

/** Sale-price value of what is on the shelf. Useful for a sales conversation,
 *  never for the balance sheet — that is what fifoValue() is for. */
export const listValue = (products: Product[]) =>
  products.reduce((sum, p) => sum + totalStock(p) * p.unitPrice, 0)

/* ------------------------------ derived: FIFO ------------------------------- */

/** The layers still on the shelf under FIFO. The oldest lots are consumed
 *  first, so what remains is peeled off the newest layer backwards. */
export function fifoLayers(p: Product) {
  let remaining = totalStock(p)
  const layers = [...p.lots]
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .map((lot) => {
      const qty = Math.min(lot.qty, remaining)
      remaining -= qty
      return { lot, qty, value: qty * lot.unitCost }
    })
    .filter((l) => l.qty > 0)

  // Stock received before the seeded lot history is valued at purchase price.
  if (remaining > 0) {
    layers.push({
      lot: {
        code: 'مانده ابتدای دوره',
        qty: remaining,
        receivedAt: '',
        supplier: '—',
        unitCost: p.unitPrice,
      },
      qty: remaining,
      value: remaining * p.unitPrice,
    })
  }
  return layers
}

/** Cost of the stock on hand, valued first-in first-out. */
export const fifoValue = (p: Product) => fifoLayers(p).reduce((sum, l) => sum + l.value, 0)

export const inventoryValue = (products: Product[]) =>
  products.reduce((sum, p) => sum + fifoValue(p), 0)

/** Unrealised margin: what the shelf would sell for, less what it cost. */
export const inventoryMargin = (products: Product[]) =>
  listValue(products) - inventoryValue(products)

export const monthlySales = (salesDelta: number) => MONTHLY[MONTHLY.length - 1].sales + salesDelta

export const receivables = (delta: number) => 890_000_000 + delta

/* ----------------------------- derived: targets ----------------------------- */

export const CURRENT_MONTH = MONTHLY[MONTHLY.length - 1]

/** Percentage of this month's sales target already booked. */
export const salesAttainment = (salesDelta: number) =>
  (monthlySales(salesDelta) / CURRENT_MONTH.targetSales) * 100

export const salesGap = (salesDelta: number) =>
  CURRENT_MONTH.targetSales - monthlySales(salesDelta)

export const volumeAttainment = () => (CURRENT_MONTH.volume / CURRENT_MONTH.targetVolume) * 100

/** Below this, the sales manager gets an alert rather than a green tile. */
export const TARGET_ALERT_PCT = 95

/* ------------------------------ derived: cash ------------------------------- */

/** Ten days of treasury, with today's row carrying whatever was settled during
 *  the session, and a running balance on top of the opening figure. */
export function cashSeries(receiptsDelta = 0, paymentsDelta = 0) {
  let balance = CASH_OPENING
  return CASH_DAILY.map((d, i) => {
    const last = i === CASH_DAILY.length - 1
    const receipts = d.receipts + (last ? receiptsDelta : 0)
    const payments = d.payments + (last ? paymentsDelta : 0)
    balance += receipts - payments
    return { ...d, receipts, payments, net: receipts - payments, balance }
  })
}

export const cashBalance = (receiptsDelta = 0, paymentsDelta = 0) =>
  cashSeries(receiptsDelta, paymentsDelta).at(-1)!.balance

export const cashToday = (receiptsDelta = 0, paymentsDelta = 0) =>
  cashSeries(receiptsDelta, paymentsDelta).at(-1)!

/** Lines the modules raised for today that nobody has settled yet. */
export const dueCash = (settled: string[]) =>
  CASH_ENTRIES.filter((e) => e.status === 'due' && !settled.includes(e.id))

/* --------------------------- derived: manufacturing -------------------------- */

/** Anything not yet cartoned is still work in progress. */
export const wipUnits = (workOrders: WorkOrder[]) =>
  workOrders.filter((w) => w.stage !== 'cartoning').reduce((sum, w) => sum + w.qty, 0)

export const wipByStage = (workOrders: WorkOrder[]) =>
  STAGE_FLOW.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    units: workOrders.filter((w) => w.stage === stage).reduce((sum, w) => sum + w.qty, 0),
    orders: workOrders.filter((w) => w.stage === stage).length,
  }))

/** Positive means the run ate more raw material than the BOM allowed. */
export const wastePct = (w: WorkOrder) =>
  ((w.actualMaterial - w.plannedMaterial) / w.plannedMaterial) * 100

/** Jalali dates are stored as sortable strings, so a plain compare is enough. */
export const isBehind = (w: WorkOrder) => w.dueAt < TODAY && w.stage !== 'cartoning'

export const finishedUnits = (rows: SkuStock[], modelCode?: string, variant?: string) =>
  rows
    .filter((r) => (!modelCode || r.modelCode === modelCode) && (!variant || r.variant === variant))
    .reduce((sum, r) => sum + r.qty, 0)

export const seriesFor = (period: Period) =>
  period === '6m' ? MONTHLY.slice(-6) : period === 'year' ? MONTHLY.slice(-5) : MONTHLY
