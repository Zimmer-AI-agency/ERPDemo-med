import { expect, test, beforeEach } from 'vitest'
import {
  available,
  cashBalance,
  cashToday,
  dueCash,
  fifoLayers,
  fifoValue,
  finishedUnits,
  inventoryValue,
  isBehind,
  isLow,
  listValue,
  salesAttainment,
  totalStock,
  useDemo,
} from './store/useDemo'
import { useAuth } from './store/useAuth'
import { answer } from './lib/ai'
import { alertsFor } from './lib/insights'
import {
  PRODUCTS,
  CUSTOMERS,
  SALES_ORDERS,
  NOTIFICATIONS,
  AUDIT_LOG,
  MOVEMENTS,
  CASH_ENTRIES,
  MONTHLY,
} from './data/mock'
import { SEED_CONVERSATIONS, SHIPMENTS, SKU_STOCK, WORK_ORDERS, materialFor } from './data/catalog'

const reset = () =>
  useDemo.setState({
    products: structuredClone(PRODUCTS),
    customers: structuredClone(CUSTOMERS),
    orders: structuredClone(SALES_ORDERS),
    notifications: structuredClone(NOTIFICATIONS),
    auditLog: structuredClone(AUDIT_LOG),
    movements: structuredClone(MOVEMENTS),
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
  })

beforeEach(reset)

const ctx = () => {
  const {
    products,
    customers,
    orders,
    workOrders,
    shipments,
    skuStock,
    salesDelta,
    receivablesDelta,
    cashReceipts,
    cashPayments,
    settled,
  } = useDemo.getState()
  return {
    products,
    customers,
    orders,
    workOrders,
    shipments,
    skuStock,
    salesDelta,
    receivablesDelta,
    cashReceipts,
    cashPayments,
    settled,
  }
}

test('creating an order fans out to inventory, customer, alerts and the audit log', () => {
  const before = useDemo.getState()
  const customer = before.customers[0]
  const product = before.products.find((p) => p.code === 'M-201')!
  const freeBefore = available(product)

  const id = before.createOrder(
    { customerId: customer.id, productCode: 'M-201', qty: 500, unitPrice: 55_000, discountPct: 10 },
    'سارا رضایی',
  )

  const after = useDemo.getState()
  const order = after.orders.find((o) => o.id === id)!

  expect(order.total).toBe(500 * 55_000 * 0.9)
  // Confirming reserves stock rather than removing it, so the total on hand is
  // unchanged while the sellable quantity drops.
  expect(available(after.products.find((p) => p.code === 'M-201')!)).toBe(freeBefore - 500)
  expect(totalStock(after.products.find((p) => p.code === 'M-201')!)).toBe(totalStock(product))

  const updated = after.customers.find((c) => c.id === customer.id)!
  expect(updated.orderCount).toBe(customer.orderCount + 1)
  expect(updated.totalSales).toBe(customer.totalSales + order.total)

  expect(after.notifications[0].text).toContain(id)
  expect(after.auditLog[0].module).toBe('فروش')
  expect(after.salesDelta).toBe(order.total)
})

test('shipping an order removes stock and records a movement', () => {
  const state = useDemo.getState()
  const id = state.createOrder(
    { customerId: 'C-01', productCode: 'M-201', qty: 300, unitPrice: 55_000, discountPct: 0 },
    'سارا رضایی',
  )
  const stockBefore = totalStock(useDemo.getState().products.find((p) => p.code === 'M-201')!)

  // confirmed -> preparing -> ready -> shipped
  for (let i = 0; i < 3; i++) useDemo.getState().advanceOrder(id, 'سارا رضایی')

  const after = useDemo.getState()
  const product = after.products.find((p) => p.code === 'M-201')!
  expect(after.orders.find((o) => o.id === id)!.status).toBe('shipped')
  expect(totalStock(product)).toBe(stockBefore - 300)
  expect(after.movements[0]).toMatchObject({ productCode: 'M-201', kind: 'out', ref: id })
})

test('stock transfer moves quantity between warehouses without changing the total', () => {
  const before = totalStock(useDemo.getState().products.find((p) => p.code === 'M-202')!)
  useDemo.getState().transferStock('M-202', 'WH-2', 'WH-3', 250, 'علی محمدی')

  const product = useDemo.getState().products.find((p) => p.code === 'M-202')!
  expect(totalStock(product)).toBe(before)
  expect(product.stock.find((w) => w.warehouseId === 'WH-2')!.qty).toBe(1_300 - 250)
  expect(product.stock.find((w) => w.warehouseId === 'WH-3')!.qty).toBe(800 + 250)
})

test('the assistant reports exactly the products that are below their minimum', () => {
  const low = useDemo.getState().products.filter(isLow)
  expect(low.map((p) => p.code).sort()).toEqual(['M-202', 'R-101', 'S-101'])

  const reply = answer('کدام کالاها موجودی بحرانی دارند؟', ctx())
  expect(reply.source).toBe('موجودی انبار')
  for (const p of low) expect(reply.text).toContain(p.name)
})

test('the assistant reflects orders placed during the session', () => {
  const first = answer('فروش این ماه چقدر بوده؟', ctx()).text
  useDemo
    .getState()
    .createOrder(
      { customerId: 'C-01', productCode: 'M-201', qty: 100, unitPrice: 55_000, discountPct: 0 },
      'سارا رضایی',
    )
  const second = answer('فروش این ماه چقدر بوده؟', ctx()).text

  expect(second).not.toBe(first)
  expect(second).toContain('در همین نشست')
})

test('a question outside the dataset gets a refusal, never an invented number', () => {
  const reply = answer('سود خالص سال گذشته چقدر بوده؟', ctx())
  expect(reply.text).toBe('اطلاعات کافی برای پاسخ دقیق در داده‌های فعلی وجود ندارد.')
  expect(reply.source).toBeUndefined()
})

test('editing a role permission changes what that role can do immediately', () => {
  useAuth.getState().signInAs('SALES_MANAGER')
  expect(useAuth.getState().can('sales.create')).toBe(true)

  useAuth.getState().togglePermission('SALES_MANAGER', 'sales.create')
  expect(useAuth.getState().can('sales.create')).toBe(false)

  useAuth.getState().signInAs('CEO')
  expect(useAuth.getState().can('users.manage')).toBe(false)
})

test('leaving the moulding press takes the raw material out of the warehouse', () => {
  const wo = useDemo.getState().workOrders.find((w) => w.stage === 'molding')!
  const material = materialFor(wo.modelCode, wo.variant)
  const before = totalStock(useDemo.getState().products.find((p) => p.code === material)!)

  useDemo.getState().advanceWorkOrder(wo.id, 'کاوه نظری')

  const after = useDemo.getState()
  expect(after.workOrders.find((w) => w.id === wo.id)!.stage).toBe('assembly')
  expect(totalStock(after.products.find((p) => p.code === material)!)).toBe(
    before - wo.plannedMaterial,
  )
  expect(after.movements[0]).toMatchObject({ productCode: material, kind: 'out', ref: wo.id })
})

test('reaching cartoning puts released devices on the shelf, size by size', () => {
  // WO-052 sits at QC, one step short of cartoning.
  const wo = useDemo.getState().workOrders.find((w) => w.id === 'WO-052')!
  const before = finishedUnits(useDemo.getState().skuStock, wo.modelCode, wo.variant)

  useDemo.getState().advanceWorkOrder(wo.id, 'کاوه نظری')

  const after = useDemo.getState()
  expect(after.workOrders.find((w) => w.id === wo.id)!.stage).toBe('cartoning')
  expect(finishedUnits(after.skuStock, wo.modelCode, wo.variant)).toBe(before + wo.qty)
  const size = Object.keys(wo.sizeCurve)[0]
  expect(
    after.skuStock.find(
      (r) => r.modelCode === wo.modelCode && r.variant === wo.variant && r.size === size,
    )!.qty,
  ).toBeGreaterThan(0)
})

test('confirming a delivery closes the sales order behind it', () => {
  const shipment = useDemo.getState().shipments.find((s) => s.status === 'in_transit')!
  useDemo.getState().confirmDelivery(shipment.id, 'انبار خریدار — آقای رستمی', 'علی محمدی')

  const after = useDemo.getState()
  expect(after.shipments.find((s) => s.id === shipment.id)!.pod?.by).toContain('رستمی')
  expect(after.orders.find((o) => o.id === shipment.orderId)!.status).toBe('delivered')
})

test('alerts are department-scoped and carry the manager who owns the fix', () => {
  const warehouse = alertsFor('warehouse', ctx())
  const production = alertsFor('production', ctx())
  const everything = alertsFor('management', ctx())

  expect(warehouse.every((a) => a.dept === 'warehouse')).toBe(true)
  expect(warehouse.length).toBe(useDemo.getState().products.filter(isLow).length)
  expect(everything.length).toBeGreaterThan(warehouse.length)

  // The late subcontracted run is the one the production manager must answer for.
  const late = production.find((a) => a.id.startsWith('AL-late-'))!
  expect(useDemo.getState().workOrders.filter(isBehind).length).toBeGreaterThan(0)
  expect(late.ownerId).toBe('U-07')
  expect(late.prefill).toBeTruthy()
})

test('an alert hands off into a pre-filled message to that manager', () => {
  const alert = alertsFor('warehouse', ctx()).find((a) => a.ownerId)!
  useDemo.getState().sendMessage(alert.ownerId!, alert.prefill!)

  const thread = useDemo.getState().conversations.find((c) => c.contactId === alert.ownerId)!
  expect(thread.messages.at(-1)!.text).toBe(alert.prefill)
  expect(thread.messages.at(-1)!.from).toBe('me')
})

test('dismissing an alert removes it from the panel only', () => {
  const alert = alertsFor('warehouse', ctx())[0]
  useDemo.getState().dismissAlert(alert.id)
  expect(useDemo.getState().dismissedAlerts).toContain(alert.id)
  // The underlying condition is untouched: the stock is still below minimum.
  expect(alertsFor('warehouse', ctx()).some((a) => a.id === alert.id)).toBe(true)
})

test('a module switched off at setup disappears from the workspace', () => {
  expect(useAuth.getState().hasModule('accounting')).toBe(true)
  useAuth.getState().toggleModule('accounting')
  expect(useAuth.getState().hasModule('accounting')).toBe(false)
  // Dropping accounting drops the mode choice with it, so re-adding asks again.
  expect(useAuth.getState().accountingMode).toBeNull()
  useAuth.getState().toggleModule('accounting')
})

test('the assistant answers production questions from live work orders', () => {
  const reply = answer('کدام سفارش کار از برنامه عقب است؟', ctx())
  expect(reply.source).toBe('ماژول تولید')
  for (const w of useDemo.getState().workOrders.filter(isBehind)) {
    expect(reply.text).toContain(w.id)
  }
})

test('inventory is valued FIFO: the newest layers are what is left on the shelf', () => {
  const masks = useDemo.getState().products.find((p) => p.code === 'M-201')!
  const layers = fifoLayers(masks)

  // Both seeded lots are still there, newest first, and they add up to the
  // quantity on hand — nothing is valued twice.
  expect(layers.map((l) => l.lot.code)).toEqual(['LOT-24088', 'LOT-24076'])
  expect(layers.reduce((s, l) => s + l.qty, 0)).toBe(totalStock(masks))
  expect(fifoValue(masks)).toBe(1_600 * 38_500 + 2_600 * 36_000)

  // Selling drains the oldest layer first, so the remaining value is carried by
  // the newer, dearer one.
  const id = useDemo.getState().createOrder(
    { customerId: 'C-01', productCode: 'M-201', qty: 2_600, unitPrice: 55_000, discountPct: 0 },
    'سارا رضایی',
  )
  for (let i = 0; i < 3; i++) useDemo.getState().advanceOrder(id, 'سارا رضایی')

  const after = useDemo.getState().products.find((p) => p.code === 'M-201')!
  expect(totalStock(after)).toBe(1_600)
  expect(fifoValue(after)).toBe(1_600 * 38_500)
  // Cost is below sale value, which is the whole point of holding both figures.
  expect(inventoryValue(useDemo.getState().products)).toBeLessThan(
    listValue(useDemo.getState().products),
  )
})

test('sales are measured against the target defined for the month', () => {
  const month = MONTHLY[MONTHLY.length - 1]
  expect(salesAttainment(0)).toBeCloseTo((month.sales / month.targetSales) * 100, 6)

  // Booking an order in the session moves attainment, not just the sales figure.
  const before = salesAttainment(0)
  useDemo.getState().createOrder(
    { customerId: 'C-01', productCode: 'M-201', qty: 1_000, unitPrice: 55_000, discountPct: 0 },
    'سارا رضایی',
  )
  expect(salesAttainment(useDemo.getState().salesDelta)).toBeGreaterThan(before)

  const reply = answer('تحقق هدف فروش چقدر است؟', ctx())
  expect(reply.source).toBe('اهداف فروش — ماژول گزارش‌ها')
})

test('settling a due receipt moves cash, the buyer balance and the log together', () => {
  const entry = CASH_ENTRIES.find((e) => e.id === 'INV-882')!
  const balanceBefore = cashBalance(0, 0)
  const buyerBefore = useDemo.getState().customers.find((c) => c.id === 'C-01')!.debt
  expect(dueCash(useDemo.getState().settled)).toContain(entry)

  useDemo.getState().settleCash(entry.id, 'شیما توکلی')

  const after = useDemo.getState()
  expect(cashBalance(after.cashReceipts, after.cashPayments)).toBe(balanceBefore + entry.amount)
  expect(cashToday(after.cashReceipts, after.cashPayments).receipts).toBeGreaterThan(
    cashToday(0, 0).receipts,
  )
  expect(after.customers.find((c) => c.id === 'C-01')!.debt).toBe(buyerBefore - entry.amount)
  expect(after.auditLog[0].module).toBe('مالی')
  expect(dueCash(after.settled)).not.toContain(entry)

  // Settling twice must not double-count the money.
  after.settleCash(entry.id, 'شیما توکلی')
  expect(useDemo.getState().cashReceipts).toBe(entry.amount)
})
