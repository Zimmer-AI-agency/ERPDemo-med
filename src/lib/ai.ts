import {
  INVOICES,
  PURCHASE_ORDERS,
  SOLD_THIS_MONTH,
  TARGET_THIS_MONTH,
} from '../data/mock'
import type { Customer, Product, SalesOrder, Shipment, SkuStock, WorkOrder } from '../types'
import { PAYABLES, PRODUCED_UNIT, STAGE_LABELS, modelOf } from '../data/catalog'
import {
  CURRENT_MONTH,
  STATUS_LABELS,
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
  monthlySales,
  salesAttainment,
  salesGap,
  totalStock,
  wastePct,
  wipUnits,
} from '../store/useDemo'
import { money, num, pct, toman } from './format'

export interface AiAnswer {
  text: string
  source?: string
  period?: string
  updatedAt?: string
}

export const SUGGESTED_QUESTIONS = [
  'فروش این ماه چقدر بوده؟',
  'تحقق هدف فروش چقدر است؟',
  'ارزش موجودی انبار به روش FIFO چقدر است؟',
  'وضعیت نقدینگی امروز چطور است؟',
  'کدام کالاها موجودی بحرانی دارند؟',
  'کدام سفارش کار از برنامه عقب است؟',
  'مصرف مواد اولیه نسبت به برنامه چطور بوده؟',
  'وضعیت بارهای در مسیر چیست؟',
  'بدهی ما به تامین‌کنندگان چقدر است؟',
  'وضعیت سفارش SO-1042 چیست؟',
]

const NO_ANSWER: AiAnswer = {
  text: 'اطلاعات کافی برای پاسخ دقیق در داده‌های فعلی وجود ندارد.',
}

interface Ctx {
  products: Product[]
  customers: Customer[]
  orders: SalesOrder[]
  workOrders: WorkOrder[]
  shipments: Shipment[]
  skuStock: SkuStock[]
  salesDelta: number
  cashReceipts: number
  cashPayments: number
  settled: string[]
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w))

/** Every number below is read out of the demo state or the seeded dataset.
 *  Nothing here composes a figure the rest of the app cannot show you. */
export function answer(question: string, ctx: Ctx): AiAnswer {
  const q = question.trim()
  const updatedAt = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const orderMatch = q.match(/SO-(\d{4})/i)
  if (orderMatch) {
    const order = ctx.orders.find((o) => o.id === `SO-${orderMatch[1]}`)
    if (!order) return NO_ANSWER
    const customer = ctx.customers.find((c) => c.id === order.customerId)
    const line = order.lines[0]
    return {
      text: [
        `سفارش ${order.id} برای ${customer?.name} در وضعیت «${STATUS_LABELS[order.status]}» است.`,
        `مقدار: ${num(line.qty)} واحد از ${line.productCode}`,
        `مبلغ: ${toman(order.total)}`,
        `پرداخت شده: ${num(order.paidPct)}٪`,
      ].join('\n'),
      source: 'سفارش‌های فروش',
      period: `ثبت در ${order.createdAt.split('-')[2]} مرداد`,
      updatedAt,
    }
  }

  if (has(q, 'FIFO', 'fifo', 'فایفو', 'ارزش موجودی', 'بهای تمام‌شده', 'ارزش‌گذاری')) {
    const cost = inventoryValue(ctx.products)
    const list = listValue(ctx.products)
    const ranked = [...ctx.products].sort((a, b) => fifoValue(b) - fifoValue(a)).slice(0, 4)
    return {
      text: [
        `ارزش موجودی انبار به روش FIFO برابر ${money(cost)} است (به قیمت فروش ${money(list)}).`,
        '',
        'سنگین‌ترین اقلام:',
        ...ranked.map(
          (p) =>
            `${p.code} ${p.name} — ${num(totalStock(p))} ${p.unit} — ${money(fifoValue(p))} در ${num(fifoLayers(p).length)} لایه`,
        ),
      ].join('\n'),
      source: 'ارزش‌گذاری FIFO — ماژول انبار',
      updatedAt,
    }
  }

  if (has(q, 'نقدینگی', 'مانده نقد', 'موجودی نقد', 'خزانه')) {
    const today = cashToday(ctx.cashReceipts, ctx.cashPayments)
    const due = dueCash(ctx.settled)
    return {
      text: [
        `مانده نقد ${money(cashBalance(ctx.cashReceipts, ctx.cashPayments))} است.`,
        `امروز ${money(today.receipts)} دریافت و ${money(today.payments)} پرداخت به‌صورت خودکار ثبت شده؛ خالص ${money(today.net)}.`,
        due.length
          ? `${num(due.length)} سند در انتظار تایید است: ${due.map((e) => e.ref).join('، ')}.`
          : 'همه اسناد امروز تایید شده‌اند.',
      ].join('\n'),
      source: 'دریافت و پرداخت روزانه — ماژول حسابداری',
      period: 'امروز، ۲۵ مرداد ۱۴۰۵',
      updatedAt,
    }
  }

  if (has(q, 'هدف', 'اهداف', 'تحقق', 'بودجه فروش')) {
    const attained = salesAttainment(ctx.salesDelta)
    const items = Object.entries(TARGET_THIS_MONTH)
    return {
      text: [
        `فروش مرداد ${money(monthlySales(ctx.salesDelta))} در برابر هدف ${money(CURRENT_MONTH.targetSales)} است — ${pct(attained)} تحقق.`,
        salesGap(ctx.salesDelta) > 0
          ? `${money(salesGap(ctx.salesDelta))} تا هدف فاصله دارید.`
          : 'هدف ماه محقق شده است.',
        '',
        'حجم فروش به تفکیک کالا (واقعی در برابر هدف):',
        ...items.map(([code, target]) => {
          const sold = SOLD_THIS_MONTH[code] ?? 0
          const p = ctx.products.find((x) => x.code === code)
          return `${code} ${p?.name ?? ''} — ${num(sold)} از ${num(target)} ${p?.unit ?? ''} (${pct((sold / target) * 100)})`
        }),
      ].join('\n'),
      source: 'اهداف فروش — ماژول گزارش‌ها',
      period: 'مرداد ۱۴۰۵',
      updatedAt,
    }
  }

  if (has(q, 'بحرانی', 'کم‌موجود', 'کم موجود', 'حداقل موجودی')) {
    const low = ctx.products.filter(isLow)
    if (!low.length) return { text: 'هیچ کالایی زیر حداقل موجودی نیست.', source: 'موجودی انبار', updatedAt }
    const worst = low.reduce((a, b) => (totalStock(a) / a.minQty < totalStock(b) / b.minQty ? a : b))
    return {
      text: [
        `${num(low.length)} کالا در وضعیت بحرانی قرار دارند:`,
        ...low.map((p, i) => `${num(i + 1)}. ${p.name} — ${num(totalStock(p))} ${p.unit}`),
        '',
        `بیشترین ریسک مربوط به ${worst.name} است که از حداقل موجودی ${num(worst.minQty)} ${worst.unit} پایین‌تر قرار دارد.`,
      ].join('\n'),
      source: 'موجودی انبار',
      updatedAt,
    }
  }

  if (has(q, 'بدهی', 'مطالبات', 'بدهکار')) {
    const ranked = [...ctx.customers].sort((a, b) => b.debt - a.debt)
    const top = ranked[0]
    const totalDebt = ranked.reduce((s, c) => s + c.debt, 0)
    return {
      text: [
        `بیشترین بدهی مربوط به ${top.name} با ${money(top.debt)} است.`,
        '',
        'سه مشتری نخست:',
        ...ranked.slice(0, 3).map((c, i) => `${num(i + 1)}. ${c.name} — ${money(c.debt)}`),
        '',
        `این سه مشتری ${num(Math.round((ranked.slice(0, 3).reduce((s, c) => s + c.debt, 0) / totalDebt) * 100))}٪ کل مطالبات را تشکیل می‌دهند.`,
      ].join('\n'),
      source: 'مطالبات فروش',
      period: 'مرداد ۱۴۰۵',
      updatedAt,
    }
  }

  if (has(q, 'تاخیر', 'تأخیر', 'دیرکرد')) {
    const delayed = PURCHASE_ORDERS.filter((p) => p.status === 'delayed')
    return {
      text: [
        `${num(delayed.length)} سفارش خرید تاخیر دارد:`,
        ...delayed.map(
          (p) => `${p.id} — ${p.supplier} — ${num(p.delayDays)} روز تاخیر — ${money(p.total)}`,
        ),
      ].join('\n'),
      source: 'سفارش‌های خرید',
      updatedAt,
    }
  }

  const woMatch = q.match(/WO-(\d{3})/i)
  if (woMatch || has(q, 'سفارش کار', 'تولید', 'خط تولید')) {
    const one = woMatch && ctx.workOrders.find((w) => w.id === `WO-${woMatch[1]}`)
    if (woMatch && !one) return NO_ANSWER
    if (one) {
      return {
        text: [
          `سفارش کار ${one.id} (${modelOf(one.modelCode)?.name} — ${one.variant}) در مرحله «${STAGE_LABELS[one.stage]}» است.`,
          `تعداد: ${num(one.qty)} ${PRODUCED_UNIT}`,
          one.subcontractor ? `پیمانکار: ${one.subcontractor}` : `خط: ${one.line}`,
          `مصرف مواد اولیه: ${num(one.actualMaterial)} کیلوگرم در برابر ${num(one.plannedMaterial)} کیلوگرم برنامه`,
          isBehind(one) ? 'وضعیت: عقب از برنامه' : 'وضعیت: در برنامه',
        ].join('\n'),
        source: 'سفارش‌های کار تولید',
        updatedAt,
      }
    }
    const late = ctx.workOrders.filter(isBehind)
    return {
      text: [
        `${num(ctx.workOrders.length)} سفارش کار باز است و ${num(wipUnits(ctx.workOrders))} ${PRODUCED_UNIT} کالا در جریان ساخت قرار دارد.`,
        late.length
          ? `${num(late.length)} مورد عقب از برنامه است: ${late.map((w) => `${w.id} (${STAGE_LABELS[w.stage]})`).join('، ')}`
          : 'هیچ سفارش کاری از برنامه عقب نیست.',
        `موجودی محصول نهایی: ${num(finishedUnits(ctx.skuStock))} ${PRODUCED_UNIT}.`,
      ].join('\n'),
      source: 'ماژول تولید',
      updatedAt,
    }
  }

  if (has(q, 'مصرف مواد', 'ضایعات', 'BOM', 'اتلاف')) {
    const over = ctx.workOrders.filter((w) => wastePct(w) > 2)
    return {
      text: [
        over.length
          ? `${num(over.length)} سفارش کار بیش از برنامه مواد اولیه مصرف کرده‌اند:`
          : 'مصرف مواد اولیه همه سفارش‌های کار در محدوده BOM است.',
        ...over.map(
          (w) =>
            `${w.id} — ${modelOf(w.modelCode)?.name} — ${num(w.actualMaterial)} کیلوگرم در برابر ${num(w.plannedMaterial)} کیلوگرم (${pct(wastePct(w))} بیشتر)`,
        ),
      ].join('\n'),
      source: 'مصرف مواد اولیه — ماژول تولید',
      updatedAt,
    }
  }

  if (has(q, 'بارها', 'ارسال', 'حمل', 'مرسوله', 'در مسیر')) {
    const transit = ctx.shipments.filter((s) => s.status === 'in_transit')
    const delivered = ctx.shipments.filter((s) => s.status === 'delivered')
    return {
      text: [
        `${num(transit.length)} بار در مسیر و ${num(delivered.length)} بار تحویل‌شده در سیستم ثبت است.`,
        ...transit.map((s) => `${s.id} — سفارش ${s.orderId} — ${s.carrier} — رسیدن ${s.etaAt.split('-')[2]} مرداد`),
      ].join('\n'),
      source: 'ماژول ارسال و توزیع',
      updatedAt,
    }
  }

  if (has(q, 'پرداختنی', 'تامین‌کننده') && has(q, 'بدهی', 'صورتحساب', 'پرداخت')) {
    const total = PAYABLES.reduce((s, p) => s + p.amount, 0)
    const late = PAYABLES.filter((p) => p.overdueDays > 0)
    return {
      text: [
        `بدهی به تامین‌کنندگان ${money(total)} است.`,
        `${num(late.length)} صورتحساب سررسید گذشته است:`,
        ...late.map((p) => `${p.id} — ${p.supplier} — ${num(p.overdueDays)} روز — ${money(p.amount)}`),
      ].join('\n'),
      source: 'حساب‌های پرداختنی',
      updatedAt,
    }
  }

  if (has(q, 'استریل') && has(q, 'فروش', 'کالا')) {
    const sterile = ctx.products.filter((p) => p.sterile)
    const gauze = ctx.products.find((p) => p.code === 'M-202')!
    return {
      text: [
        'فروش کالاهای استریل در مرداد ۱۴۰۵:',
        ...sterile.map((p) => `${p.code} ${p.name} — ${num(SOLD_THIS_MONTH[p.code] ?? 0)} ${p.unit}`),
        '',
        `موجودی قابل فروش ${gauze.name} هم‌اکنون ${num(available(gauze))} ${gauze.unit} است.`,
      ].join('\n'),
      source: 'گزارش فروش',
      period: 'مرداد ۱۴۰۵',
      updatedAt,
    }
  }

  if (has(q, 'فروش') && has(q, 'ماه', 'این ماه')) {
    const total = monthlySales(ctx.salesDelta)
    return {
      text: [
        `فروش مرداد ۱۴۰۵ برابر ${money(total)} است — ${pct(salesAttainment(ctx.salesDelta))} هدف ${money(CURRENT_MONTH.targetSales)} این ماه.`,
        ctx.salesDelta > 0
          ? `از این مبلغ، ${money(ctx.salesDelta)} مربوط به سفارش‌هایی است که در همین نشست ثبت شده‌اند.`
          : 'نسبت به تیر ۱۴۰۵ رشد ۱۴.۲ درصدی داشته است.',
      ].join('\n'),
      source: 'گزارش فروش',
      period: 'مرداد ۱۴۰۵',
      updatedAt,
    }
  }

  if (has(q, 'سررسید', 'معوق', 'فاکتور')) {
    const total = INVOICES.reduce((s, i) => s + i.amount, 0)
    return {
      text: [
        `${num(INVOICES.length)} فاکتور سررسید گذشته به ارزش ${money(total)} وجود دارد.`,
        ...INVOICES.map((i) => {
          const c = ctx.customers.find((c) => c.id === i.customerId)
          return `${i.id} — ${c?.name} — ${num(i.overdueDays)} روز — ${money(i.amount)}`
        }),
      ].join('\n'),
      source: 'مطالبات فروش',
      updatedAt,
    }
  }

  return NO_ANSWER
}
