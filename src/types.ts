export type Permission =
  | 'dashboard.view'
  | 'sales.view'
  | 'sales.create'
  | 'sales.edit'
  | 'warehouse.view'
  | 'warehouse.transfer'
  | 'warehouse.adjust'
  | 'crm.view'
  | 'crm.edit'
  | 'purchases.view'
  | 'purchases.create'
  | 'reports.view'
  | 'manufacturing.view'
  | 'manufacturing.edit'
  | 'distribution.view'
  | 'distribution.edit'
  | 'accounting.view'
  | 'accounting.edit'
  | 'messages.use'
  | 'users.manage'
  | 'roles.manage'
  | 'settings.manage'
  | 'audit.view'
  | 'ai.use'

export type RoleId =
  | 'SUPER_ADMIN'
  | 'CEO'
  | 'PRODUCTION_MANAGER'
  | 'SALES_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'FINANCE_MANAGER'
  | 'CRM_SPECIALIST'
  | 'PURCHASE_MANAGER'

/** A module the prospect can switch on at setup. Messaging, the activity log
 *  and the AI layer are deliberately not here: they wrap any selection. */
export type ModuleId =
  | 'purchasing'
  | 'inventory'
  | 'manufacturing'
  | 'sales'
  | 'distribution'
  | 'crm'
  | 'accounting'

/** Neither mode is a fallback. The client picks one at setup. */
export type AccountingMode = 'native' | 'integration'

/** Department scope for alerts, the activity feed and dashboards. */
export type Dept =
  | 'management'
  | 'production'
  | 'sales'
  | 'warehouse'
  | 'finance'
  | 'crm'
  | 'purchasing'

export type ProductKind = 'finished' | 'raw'

export interface StockByWarehouse {
  warehouseId: string
  qty: number
}

export interface Lot {
  code: string
  qty: number
  receivedAt: string
  supplier: string
  /** Purchase cost of this layer. FIFO valuation reads this, not unitPrice. */
  unitCost: number
  /** Medical goods carry a shelf life; sterile lots carry one that matters. */
  expiresAt?: string
}

export interface Product {
  code: string
  name: string
  kind: ProductKind
  unit: string
  category: string
  /** Grade or type of the item — sterile / powder-free / raw compound. */
  variant: string
  composition?: string
  /** Registration code with the national medical device authority (IMED). */
  imed?: string
  sterile?: boolean
  storage?: string
  unitPrice: number
  minQty: number
  reserved: number
  stock: StockByWarehouse[]
  lots: Lot[]
}

export interface Warehouse {
  id: string
  name: string
  capacityPct: number
}

export type MovementKind = 'in' | 'out' | 'transfer'

export interface Movement {
  id: string
  at: string
  productCode: string
  kind: MovementKind
  qty: number
  ref: string
  note: string
}

export interface Customer {
  id: string
  name: string
  city: string
  totalSales: number
  debt: number
  orderCount: number
  lastPurchase: string
  rep: string
  status: 'active' | 'watch' | 'dormant'
  notes: string[]
  timeline: { at: string; text: string }[]
  /** Hospitals and distributors buy on terms, and medical selling is
   *  evaluation-driven: a sample carton goes out before the tender. */
  credit: { limit: number; terms: string }
  samples: { modelCode: string; variant: string; sentAt: string; status: string }[]
}

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'shipped'
  | 'delivered'

export interface OrderLine {
  productCode: string
  qty: number
  unitPrice: number
  discountPct: number
  /** Manufactured lines are placed per model and broken down by size (syringe
   *  volume, glove size, catheter gauge). Traded goods leave these undefined. */
  modelCode?: string
  variant?: string
  sizeCurve?: Record<string, number>
}

export interface SalesOrder {
  id: string
  customerId: string
  lines: OrderLine[]
  total: number
  paidPct: number
  status: OrderStatus
  createdAt: string
  dueAt: string
  isNew?: boolean
}

export type PurchaseStatus = 'pending' | 'in_transit' | 'received' | 'delayed'

export interface PurchaseOrder {
  id: string
  supplier: string
  productCode: string
  qty: number
  total: number
  status: PurchaseStatus
  expectedAt: string
  delayDays: number
}

export interface Invoice {
  id: string
  customerId: string
  amount: number
  dueAt: string
  overdueDays: number
}

export interface Notification {
  id: string
  text: string
  ago: string
  severity: 'crit' | 'warn' | 'info'
  read: boolean
}

export interface AuditEntry {
  id: string
  at: string
  user: string
  action: string
  module: string
  detail: string
}

export interface DemoUser {
  id: string
  name: string
  title: string
  role: RoleId
  unit: string
  active: boolean
  lastSeen: string
}

/* -------------------------------- production -------------------------------- */

export interface BomLine {
  itemCode: string
  qty: number
  unit: string
  note?: string
}

export interface Model {
  code: string
  name: string
  catalog: string
  variants: string[]
  sizes: string[]
  unitPrice: number
  /** Kilograms of the primary raw material allowed per produced unit (a carton).
   *  Actual usage is recorded on the work order. */
  materialPerUnit: number
  bom: BomLine[]
}

/** Finished goods are held per model–variant–size, not as one number. */
export interface SkuStock {
  modelCode: string
  variant: string
  size: string
  qty: number
}

export type Stage =
  | 'molding'
  | 'assembly'
  | 'packaging'
  | 'sterilization'
  | 'qc'
  | 'cartoning'

export interface WorkOrder {
  id: string
  modelCode: string
  variant: string
  qty: number
  sizeCurve: Record<string, number>
  stage: Stage
  startedAt: string
  dueAt: string
  line: string
  /** Set when the stage is done outside the four walls — sterilisation usually is. */
  subcontractor?: string
  plannedMaterial: number
  actualMaterial: number
  orderId?: string
  isNew?: boolean
}

export type ShipmentStatus = 'planned' | 'loading' | 'in_transit' | 'delivered'

export interface Shipment {
  id: string
  orderId: string
  customerId: string
  carrier: string
  destination: string
  boxes: number
  units: number
  cost: number
  status: ShipmentStatus
  shippedAt: string
  etaAt: string
  /** Proof of delivery: who signed for it and when. */
  pod?: { by: string; at: string }
}

export interface LedgerEntry {
  id: string
  at: string
  ref: string
  account: string
  module: string
  debit: number
  credit: number
}

export interface Payable {
  id: string
  supplier: string
  amount: number
  dueAt: string
  overdueDays: number
}

/** One day of the treasury. Every line is raised by a module — a delivered
 *  order, a settled supplier invoice — never typed in by hand. */
export interface CashDay {
  at: string
  receipts: number
  payments: number
}

/** A single automatic receipt or payment posted on the day it fell due. */
export interface CashEntry {
  id: string
  at: string
  kind: 'receipt' | 'payment'
  party: string
  ref: string
  module: string
  amount: number
  /** Auto-posted lines are already in the balance; due ones wait for a click. */
  status: 'posted' | 'due'
}

export interface ManagerContact {
  id: string
  name: string
  title: string
  dept: Dept
  role: RoleId
  online: boolean
  lastActive: string
}

export interface Message {
  id: string
  from: string
  text: string
  at: string
}

export interface Conversation {
  id: string
  contactId: string
  messages: Message[]
}

export interface Alert {
  id: string
  dept: Dept
  severity: 'crit' | 'warn' | 'info'
  title: string
  detail: string
  /** Where the alert opens into. */
  to?: string
  /** The manager who owns the fix, plus the message that gets pre-filled. */
  ownerId?: string
  prefill?: string
}

export interface Lead {
  id: string
  name: string
  city: string
  source: string
  stage: 'new' | 'contacted' | 'quoted' | 'won' | 'lost'
  value: number
  owner: string
}
