import type {
  Conversation,
  LedgerEntry,
  ManagerContact,
  Model,
  Payable,
  Shipment,
  SkuStock,
  WorkOrder,
} from '../types'
import { ROLE_DEPT } from './rbac'
import { USERS } from './mock'

/** The seeded company. Both a maker and a distributor: it moulds, assembles and
 *  sterilises its own single-use devices (the MD- models, built from the R-/S-/T-
 *  materials) and imports finished medical goods (the M- items) alongside them. */
export const COMPANY_NAME = 'تجهیزات پزشکی سلامت‌گستر پارس'
export const CATALOG = 'کاتالوگ ۱۴۰۵'
/** Produced goods are counted, priced and shipped by the carton. */
export const PRODUCED_UNIT = 'کارتن'
export const PRODUCTION_LINES = ['خط ۱ — تزریق و مونتاژ', 'خط ۲ — بسته‌بندی استریل']

export const MODELS: Model[] = [
  {
    code: 'MD-204',
    name: 'سرنگ یکبار مصرف استریل',
    catalog: CATALOG,
    variants: ['استاندارد', 'لوئرلاک'],
    sizes: ['۱ml', '۲ml', '۵ml', '۱۰ml', '۲۰ml', '۵۰ml'],
    unitPrice: 1_450_000,
    materialPerUnit: 2.4,
    bom: [
      { itemCode: 'R-101', qty: 2.4, unit: 'کیلوگرم', note: 'بدنه و پیستون — تزریق پلاستیک' },
      { itemCode: 'T-101', qty: 100, unit: 'عدد', note: 'سوزن هر کارتن ۱۰۰ عددی' },
      { itemCode: 'T-103', qty: 2, unit: 'عدد', note: 'لیبل کارتن و بروشور IMED' },
    ],
  },
  {
    code: 'MD-311',
    name: 'دستکش معاینه بدون پودر',
    catalog: CATALOG,
    variants: ['نیتریل', 'لاتکس'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    unitPrice: 320_000,
    materialPerUnit: 1.15,
    bom: [
      { itemCode: 'R-201', qty: 1.15, unit: 'کیلوگرم', note: 'نیتریل؛ برای گرید لاتکس از R-202' },
      { itemCode: 'S-101', qty: 0.05, unit: 'کیلوگرم', note: 'استریل EO' },
      { itemCode: 'T-103', qty: 2, unit: 'عدد' },
    ],
  },
  {
    code: 'MD-408',
    name: 'گان جراحی یکبار مصرف',
    catalog: CATALOG,
    variants: ['استریل', 'غیراستریل'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    unitPrice: 780_000,
    materialPerUnit: 2.35,
    bom: [
      { itemCode: 'R-301', qty: 2.35, unit: 'کیلوگرم', note: 'اسپان‌باند SMS سه لایه' },
      { itemCode: 'T-102', qty: 1, unit: 'بسته', note: 'بند و کاف' },
      { itemCode: 'T-103', qty: 2, unit: 'عدد' },
    ],
  },
]

export const modelOf = (code: string) => MODELS.find((m) => m.code === code)

/** Which raw material a run actually eats. The BOM names the default; the latex
 *  grade pulls a different compound, which is noted on the BOM line. */
export function materialFor(modelCode: string, variant: string) {
  if (modelCode === 'MD-311') return variant === 'لاتکس' ? 'R-202' : 'R-201'
  return modelOf(modelCode)?.bom[0].itemCode ?? ''
}

export const STAGE_FLOW = [
  'molding',
  'assembly',
  'packaging',
  'sterilization',
  'qc',
  'cartoning',
] as const

export const STAGE_LABELS: Record<(typeof STAGE_FLOW)[number], string> = {
  molding: 'قالب‌گیری و تزریق',
  assembly: 'مونتاژ',
  packaging: 'بسته‌بندی اولیه',
  sterilization: 'استریلیزاسیون',
  qc: 'کنترل کیفیت و آزادسازی',
  cartoning: 'کارتن‌گذاری',
}

/** Five open work orders on two lines, one of them out at the sterilisation
 *  contractor and past its date — that one drives the "behind schedule" alert. */
export const WORK_ORDERS: WorkOrder[] = [
  {
    id: 'WO-055',
    modelCode: 'MD-204',
    variant: 'استاندارد',
    qty: 480,
    sizeCurve: { '۱ml': 40, '۲ml': 90, '۵ml': 120, '۱۰ml': 120, '۲۰ml': 70, '۵۰ml': 40 },
    stage: 'assembly',
    startedAt: '1405-05-18',
    dueAt: '1405-06-05',
    line: PRODUCTION_LINES[0],
    plannedMaterial: 1_152,
    actualMaterial: 1_188,
    orderId: 'SO-1048',
  },
  {
    id: 'WO-054',
    modelCode: 'MD-311',
    variant: 'نیتریل',
    qty: 1_200,
    sizeCurve: { XS: 150, S: 300, M: 350, L: 250, XL: 150 },
    stage: 'molding',
    startedAt: '1405-05-24',
    dueAt: '1405-06-08',
    line: PRODUCTION_LINES[1],
    plannedMaterial: 1_380,
    actualMaterial: 1_362,
    orderId: 'SO-1047',
  },
  {
    id: 'WO-053',
    modelCode: 'MD-408',
    variant: 'استریل',
    qty: 300,
    sizeCurve: { S: 30, M: 80, L: 90, XL: 70, XXL: 30 },
    stage: 'sterilization',
    startedAt: '1405-05-12',
    dueAt: '1405-05-22',
    line: PRODUCTION_LINES[1],
    subcontractor: 'پرتوکاران گاما',
    plannedMaterial: 705,
    actualMaterial: 712,
  },
  {
    id: 'WO-052',
    modelCode: 'MD-204',
    variant: 'لوئرلاک',
    qty: 260,
    sizeCurve: { '۱ml': 20, '۲ml': 50, '۵ml': 65, '۱۰ml': 65, '۲۰ml': 40, '۵۰ml': 20 },
    stage: 'qc',
    startedAt: '1405-05-08',
    dueAt: '1405-05-26',
    line: PRODUCTION_LINES[0],
    plannedMaterial: 624,
    actualMaterial: 617,
  },
  {
    id: 'WO-051',
    modelCode: 'MD-311',
    variant: 'لاتکس',
    qty: 900,
    sizeCurve: { XS: 110, S: 230, M: 260, L: 190, XL: 110 },
    stage: 'cartoning',
    startedAt: '1405-05-04',
    dueAt: '1405-05-26',
    line: PRODUCTION_LINES[1],
    subcontractor: 'استریل و بسته‌بندی نوید',
    plannedMaterial: 1_035,
    actualMaterial: 1_041,
  },
]

export const SUBCONTRACTORS = [
  {
    name: 'پرتوکاران گاما',
    stage: 'استریلیزاسیون پرتویی',
    city: 'تهران',
    openOrders: 1,
    onTimePct: 72,
  },
  {
    name: 'استریل و بسته‌بندی نوید',
    stage: 'بسته‌بندی نهایی',
    city: 'کرج',
    openOrders: 1,
    onTimePct: 94,
  },
]

/** Finished goods, held per model–variant–size. */
export const SKU_STOCK: SkuStock[] = [
  { modelCode: 'MD-204', variant: 'استاندارد', size: '۱ml', qty: 22 },
  { modelCode: 'MD-204', variant: 'استاندارد', size: '۲ml', qty: 48 },
  { modelCode: 'MD-204', variant: 'استاندارد', size: '۵ml', qty: 64 },
  { modelCode: 'MD-204', variant: 'استاندارد', size: '۱۰ml', qty: 57 },
  { modelCode: 'MD-204', variant: 'استاندارد', size: '۲۰ml', qty: 31 },
  { modelCode: 'MD-204', variant: 'استاندارد', size: '۵۰ml', qty: 18 },
  { modelCode: 'MD-204', variant: 'لوئرلاک', size: '۱ml', qty: 14 },
  { modelCode: 'MD-204', variant: 'لوئرلاک', size: '۲ml', qty: 30 },
  { modelCode: 'MD-204', variant: 'لوئرلاک', size: '۵ml', qty: 41 },
  { modelCode: 'MD-204', variant: 'لوئرلاک', size: '۱۰ml', qty: 38 },
  { modelCode: 'MD-204', variant: 'لوئرلاک', size: '۲۰ml', qty: 19 },
  { modelCode: 'MD-204', variant: 'لوئرلاک', size: '۵۰ml', qty: 11 },
  { modelCode: 'MD-311', variant: 'نیتریل', size: 'XS', qty: 180 },
  { modelCode: 'MD-311', variant: 'نیتریل', size: 'S', qty: 340 },
  { modelCode: 'MD-311', variant: 'نیتریل', size: 'M', qty: 410 },
  { modelCode: 'MD-311', variant: 'نیتریل', size: 'L', qty: 290 },
  { modelCode: 'MD-311', variant: 'نیتریل', size: 'XL', qty: 160 },
  { modelCode: 'MD-311', variant: 'لاتکس', size: 'XS', qty: 90 },
  { modelCode: 'MD-311', variant: 'لاتکس', size: 'S', qty: 210 },
  { modelCode: 'MD-311', variant: 'لاتکس', size: 'M', qty: 260 },
  { modelCode: 'MD-311', variant: 'لاتکس', size: 'L', qty: 180 },
  { modelCode: 'MD-311', variant: 'لاتکس', size: 'XL', qty: 95 },
  { modelCode: 'MD-408', variant: 'استریل', size: 'S', qty: 24 },
  { modelCode: 'MD-408', variant: 'استریل', size: 'M', qty: 58 },
  { modelCode: 'MD-408', variant: 'استریل', size: 'L', qty: 66 },
  { modelCode: 'MD-408', variant: 'استریل', size: 'XL', qty: 50 },
  { modelCode: 'MD-408', variant: 'استریل', size: 'XXL', qty: 22 },
]

/** Buyer-specific pricing: hospital tenders are tiered, and one distributor has
 *  a negotiated annual rate. The sales order form reads the base column. */
export const PRICE_LIST = [
  { modelCode: 'MD-204', base: 1_450_000, volume: 1_378_000, contract: 1_305_000, minQty: 120 },
  { modelCode: 'MD-311', base: 320_000, volume: 298_000, contract: 284_000, minQty: 300 },
  { modelCode: 'MD-408', base: 780_000, volume: 741_000, contract: 702_000, minQty: 150 },
]

export const SHIPMENTS: Shipment[] = [
  {
    id: 'SH-207',
    orderId: 'SO-1047',
    customerId: 'C-05',
    carrier: 'باربری آسیا ترابر',
    destination: 'مشهد — انبار مرکزی داروخانه زنجیره‌ای اطلس',
    boxes: 30,
    units: 900,
    cost: 9_600_000,
    status: 'planned',
    shippedAt: '1405-06-01',
    etaAt: '1405-06-03',
  },
  {
    id: 'SH-206',
    orderId: 'SO-1044',
    customerId: 'C-05',
    carrier: 'باربری آسیا ترابر',
    destination: 'مشهد — انبار مرکزی داروخانه زنجیره‌ای اطلس',
    boxes: 14,
    units: 1_600,
    cost: 7_400_000,
    status: 'loading',
    shippedAt: '1405-05-26',
    etaAt: '1405-05-29',
  },
  {
    id: 'SH-205',
    orderId: 'SO-1043',
    customerId: 'C-03',
    carrier: 'حمل و نقل پارسیان',
    destination: 'تهران — انبار تجهیزات پزشکی تهران',
    boxes: 26,
    units: 3_200,
    cost: 5_800_000,
    status: 'in_transit',
    shippedAt: '1405-05-24',
    etaAt: '1405-05-27',
  },
  {
    id: 'SH-204',
    orderId: 'SO-1046',
    customerId: 'C-01',
    carrier: 'پیک بار تهران',
    destination: 'تهران — انبار تجهیزات بیمارستان پارس',
    boxes: 12,
    units: 300,
    cost: 4_200_000,
    status: 'delivered',
    shippedAt: '1405-05-21',
    etaAt: '1405-05-23',
    pod: { by: 'انبار تجهیزات بیمارستان پارس — آقای صادقی', at: '1405-05-23' },
  },
  {
    id: 'SH-203',
    orderId: 'SO-1041',
    customerId: 'C-02',
    carrier: 'حمل و نقل پارسیان',
    destination: 'تهران — پخش دارویی آریا',
    boxes: 18,
    units: 2_050,
    cost: 5_100_000,
    status: 'delivered',
    shippedAt: '1405-05-18',
    etaAt: '1405-05-20',
    pod: { by: 'دفتر مرکزی پخش دارویی آریا — خانم نیک‌پور', at: '1405-05-20' },
  },
]

/* -------------------------------- accounting -------------------------------- */

/** Supplier invoices. The purchasing module raised every one of these. */
export const PAYABLES: Payable[] = [
  { id: 'AP-118', supplier: 'پلیمر پارس شیمی', amount: 462_000_000, dueAt: '1405-06-02', overdueDays: 0 },
  { id: 'AP-115', supplier: 'کامپاند نیتریل کاشان', amount: 348_000_000, dueAt: '1405-05-20', overdueDays: 5 },
  { id: 'AP-112', supplier: 'گاز طبی البرز', amount: 176_000_000, dueAt: '1405-05-12', overdueDays: 13 },
  { id: 'AP-109', supplier: 'نساجی نبافته مهرگان', amount: 84_000_000, dueAt: '1405-04-28', overdueDays: 27 },
  { id: 'AP-104', supplier: 'پرتوکاران گاما', amount: 46_000_000, dueAt: '1405-05-05', overdueDays: 20 },
]

/** Journal lines posted automatically by the other modules. Every entry names
 *  the module that raised it, which is the whole point of native mode. */
export const LEDGER: LedgerEntry[] = [
  {
    id: 'JV-1042',
    at: '1405-05-25',
    ref: 'SO-1047',
    account: 'حساب‌های دریافتنی / درآمد فروش',
    module: 'فروش',
    debit: 288_000_000,
    credit: 288_000_000,
  },
  {
    id: 'JV-1041',
    at: '1405-05-24',
    ref: 'SH-205',
    account: 'هزینه حمل و توزیع / بانک',
    module: 'توزیع',
    debit: 5_800_000,
    credit: 5_800_000,
  },
  {
    id: 'JV-1040',
    at: '1405-05-24',
    ref: 'WO-054',
    account: 'کالای در جریان ساخت / موجودی مواد اولیه',
    module: 'تولید',
    debit: 74_970_000,
    credit: 74_970_000,
  },
  {
    id: 'JV-1039',
    at: '1405-05-23',
    ref: 'INV-882',
    account: 'بانک / حساب‌های دریافتنی',
    module: 'مالی',
    debit: 48_000_000,
    credit: 48_000_000,
  },
  {
    id: 'JV-1038',
    at: '1405-05-22',
    ref: 'PO-312',
    account: 'موجودی مواد اولیه / حساب‌های پرداختنی',
    module: 'خرید',
    debit: 462_000_000,
    credit: 462_000_000,
  },
  {
    id: 'JV-1037',
    at: '1405-05-21',
    ref: 'SO-1046',
    account: 'بهای تمام‌شده کالای فروش‌رفته / موجودی محصول',
    module: 'فروش',
    debit: 141_000_000,
    credit: 141_000_000,
  },
  {
    id: 'JV-1036',
    at: '1405-05-20',
    ref: 'WO-051',
    account: 'موجودی محصول نهایی / کالای در جریان ساخت',
    module: 'تولید',
    debit: 96_400_000,
    credit: 96_400_000,
  },
]

/** Integration mode: the client's existing accounting software stays the
 *  system of record and Zimmer posts into it. */
export const EXTERNAL_ACCOUNTING = {
  name: 'الماس',
  status: 'متصل' as const,
  lastSyncedAt: 'امروز، ۱۴:۲۲',
  mappedAccounts: 42,
  syncedDocsThisMonth: 318,
  failedDocs: 0,
  direction: 'یک‌طرفه — زیمر ارسال می‌کند، الماس مرجع باقی می‌ماند',
}

/* --------------------------------- messaging -------------------------------- */

export const MANAGER_CONTACTS: ManagerContact[] = USERS.filter((u) => u.active).map((u) => ({
  id: u.id,
  name: u.name,
  title: u.title,
  dept: ROLE_DEPT[u.role],
  role: u.role,
  online: u.lastSeen.includes('دقیقه'),
  lastActive: u.lastSeen,
}))

export const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'CV-01',
    contactId: 'U-03',
    messages: [
      {
        id: 'M-01',
        from: 'علی محمدی',
        text: 'گرانول پلی‌پروپیلن R-101 برای سفارش کار WO-055 فقط تا آخر هفته کفاف می‌دهد.',
        at: '۰۹:۴۰',
      },
      {
        id: 'M-02',
        from: 'me',
        text: 'با خرید هماهنگ می‌کنم. PO-312 در راه است؟',
        at: '۰۹:۵۲',
      },
      { id: 'M-03', from: 'علی محمدی', text: 'بله، رسید ورود امروز ثبت می‌شود.', at: '۱۰:۰۵' },
    ],
  },
  {
    id: 'CV-02',
    contactId: 'U-05',
    messages: [
      {
        id: 'M-04',
        from: 'رضا کریمی',
        text: 'سفارش خرید گاز اتیلن اکساید S-101 را با تامین‌کننده دوم هم قیمت گرفتم.',
        at: 'دیروز',
      },
    ],
  },
]
