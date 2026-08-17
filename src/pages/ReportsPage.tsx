import { useSearchParams } from 'react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  MONTHLY,
  PURCHASE_ORDERS,
  SOLD_THIS_MONTH,
  SUPPLIERS,
  TARGET_THIS_MONTH,
  TODAY,
} from '../data/mock'
import {
  CURRENT_MONTH,
  available,
  fifoValue,
  inventoryValue,
  isLow,
  listValue,
  salesAttainment,
  salesGap,
  totalStock,
  useDemo,
  volumeAttainment,
} from '../store/useDemo'
import { daysBetween, dec, money, num, pct } from '../lib/format'
import { Badge, Card, CardHead, PageHeader, Skeleton, Tabs, useBriefLoad } from '../components/ui'

type Tab = 'sales' | 'targets' | 'inventory' | 'purchases' | 'customers'

const SHADES = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe']

const tooltipStyle = {
  direction: 'rtl' as const,
  fontFamily: 'inherit',
  fontSize: 13,
  borderRadius: 12,
  border: '1px solid #e7e3ed',
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'crit'
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[13px] text-ink-soft">{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${tone === 'crit' ? 'text-crit' : ''}`}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}
    </Card>
  )
}

export function ReportsPage() {
  const loading = useBriefLoad()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'sales') as Tab
  const { customers, products, salesDelta } = useDemo()

  if (loading) return <Skeleton className="h-96" />

  const byCity = Object.entries(
    customers.reduce<Record<string, number>>((acc, c) => {
      acc[c.city] = (acc[c.city] ?? 0) + c.totalSales
      return acc
    }, {}),
  ).map(([city, value]) => ({ name: city, value }))

  return (
    <>
      <PageHeader title="گزارش‌ها" subtitle="همه ارقام از داده‌های همین دمو محاسبه می‌شوند" />

      <div className="mb-4">
        <Tabs<Tab>
          active={tab}
          onChange={(id) => setParams({ tab: id })}
          tabs={[
            { id: 'sales', label: 'گزارش فروش' },
            { id: 'targets', label: 'تحقق اهداف فروش' },
            { id: 'inventory', label: 'گزارش موجودی' },
            { id: 'purchases', label: 'گزارش خرید' },
            { id: 'customers', label: 'گزارش مشتریان' },
          ]}
        />
      </div>

      {tab === 'sales' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHead title="فروش ماهانه" extra={<span className="text-xs text-ink-soft">میلیارد تومان</span>} />
            <div className="h-64 px-3 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY}>
                  <CartesianGrid stroke="#e7e3ed" vertical={false} />
                  <XAxis dataKey="month" reversed tick={{ fontSize: 12, fill: '#6b6478' }} axisLine={false} tickLine={false} />
                  <YAxis orientation="right" tick={{ fontSize: 12, fill: '#6b6478' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => dec(v / 1_000_000_000)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                  <Bar dataKey="sales" name="فروش" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHead title="فروش به تفکیک مشتری" />
            <ul className="divide-y divide-line">
              {[...customers]
                .sort((a, b) => b.totalSales - a.totalSales)
                .map((c) => (
                  <li key={c.id} className="flex justify-between px-5 py-3 text-[13px]">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{money(c.totalSales)}</span>
                  </li>
                ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="فروش به تفکیک شهر" />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCity} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
                    {byCity.map((_, i) => (
                      <Cell key={i} fill={SHADES[i % SHADES.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-xs">
              {byCity.map((c, i) => (
                <li key={c.name} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />
                  {c.name}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-2">
            <CardHead title="فروش به تفکیک کالا" extra={<span className="text-xs text-ink-soft">مرداد ۱۴۰۵</span>} />
            <ul className="divide-y divide-line">
              {Object.entries(SOLD_THIS_MONTH)
                .sort((a, b) => b[1] - a[1])
                .map(([code, qty]) => {
                  const p = products.find((x) => x.code === code)
                  return (
                    <li key={code} className="flex justify-between px-5 py-3 text-[13px]">
                      <span>
                        {code} {p?.name}
                      </span>
                      <span className="tabular-nums">
                        {num(qty)} {p?.unit} · {money(qty * (p?.unitPrice ?? 0))}
                      </span>
                    </li>
                  )
                })}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'targets' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
            <Metric
              label="فروش مرداد در برابر هدف"
              value={pct(salesAttainment(salesDelta))}
              note={`${money(CURRENT_MONTH.sales + salesDelta)} از ${money(CURRENT_MONTH.targetSales)}`}
              tone={salesAttainment(salesDelta) < 100 ? 'crit' : undefined}
            />
            <Metric
              label="فاصله تا هدف"
              value={money(Math.max(0, salesGap(salesDelta)))}
              note={salesGap(salesDelta) > 0 ? 'باقی‌مانده تا پایان ماه' : 'هدف محقق شده است'}
            />
            <Metric
              label="حجم فروش در برابر هدف"
              value={pct(volumeAttainment())}
              note={`${num(CURRENT_MONTH.volume)} از ${num(CURRENT_MONTH.targetVolume)} واحد`}
            />
          </div>

          <Card className="lg:col-span-2">
            <CardHead
              title="فروش ماهانه در برابر هدف"
              extra={<span className="text-xs text-ink-soft">میلیارد تومان</span>}
            />
            <div className="h-64 px-3 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY}>
                  <CartesianGrid stroke="#e7e3ed" vertical={false} />
                  <XAxis dataKey="month" reversed tick={{ fontSize: 12, fill: '#6b6478' }} axisLine={false} tickLine={false} />
                  <YAxis orientation="right" tick={{ fontSize: 12, fill: '#6b6478' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => dec(v / 1_000_000_000)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
                  <Bar dataKey="sales" name="فروش واقعی" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="targetSales" name="هدف" fill="#ddd6fe" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHead
              title="حجم فروش به تفکیک کالا در برابر هدف"
              extra={<span className="text-xs text-ink-soft">مرداد ۱۴۰۵</span>}
            />
            <table className="w-full text-[13px]">
              <thead className="border-b border-line bg-canvas text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">کالا</th>
                  <th className="px-4 py-2.5 text-start font-medium">فروش واقعی</th>
                  <th className="px-4 py-2.5 text-start font-medium">هدف</th>
                  <th className="px-4 py-2.5 text-start font-medium">تحقق</th>
                  <th className="px-4 py-2.5 text-start font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(TARGET_THIS_MONTH).map(([code, target]) => {
                  const sold = SOLD_THIS_MONTH[code] ?? 0
                  const p = products.find((x) => x.code === code)
                  const rate = (sold / target) * 100
                  return (
                    <tr key={code} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        {code} {p?.name}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {num(sold)} {p?.unit}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{num(target)}</td>
                      <td className="px-4 py-3 tabular-nums">{pct(rate)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={rate >= 100 ? 'ok' : rate >= 90 ? 'warn' : 'crit'}>
                          {rate >= 100 ? 'محقق شده' : `${num(target - sold)} ${p?.unit} کسری`}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">
              اهداف در ابتدای ماه در ماژول فروش تعریف می‌شوند؛ ستون واقعی از همان سفارش‌هایی
              می‌آید که در دفتر سفارش می‌بینید.
            </p>
          </Card>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHead
              title="ارزش موجودی به تفکیک کالا (FIFO)"
              extra={
                <span className="text-xs text-ink-soft">
                  جمع {money(inventoryValue(products))} · به قیمت فروش {money(listValue(products))}
                </span>
              }
            />
            <ul className="divide-y divide-line">
              {[...products]
                .sort((a, b) => fifoValue(b) - fifoValue(a))
                .map((p) => (
                  <li key={p.code} className="flex justify-between px-5 py-3 text-[13px]">
                    <span>
                      {p.code} {p.name}
                    </span>
                    <span className="tabular-nums">
                      {money(fifoValue(p))}
                      <span className="ms-2 text-ink-soft">
                        ({money(totalStock(p) * p.unitPrice)} فروش)
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="کالاهای زیر حداقل موجودی" />
            <ul className="divide-y divide-line">
              {products.filter(isLow).map((p) => (
                <li key={p.code} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span>{p.name}</span>
                  <Badge tone="crit">
                    {num(totalStock(p))} از {num(p.minQty)}
                  </Badge>
                  <span className="ms-auto tabular-nums text-ink-soft">
                    قابل فروش {num(available(p))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'purchases' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHead title="خرید ماهانه" extra={<span className="text-xs text-ink-soft">میلیارد تومان</span>} />
            <div className="h-64 px-3 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MONTHLY}>
                  <CartesianGrid stroke="#e7e3ed" vertical={false} />
                  <XAxis dataKey="month" reversed tick={{ fontSize: 12, fill: '#6b6478' }} axisLine={false} tickLine={false} />
                  <YAxis orientation="right" tick={{ fontSize: 12, fill: '#6b6478' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => dec(v / 1_000_000_000)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                  <Bar dataKey="purchases" name="خرید" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardHead title="تامین‌کنندگان اصلی" />
            <ul className="divide-y divide-line">
              {SUPPLIERS.map((s) => (
                <li key={s.name} className="flex justify-between px-5 py-3 text-[13px]">
                  <span>{s.name}</span>
                  <span className="tabular-nums">{money(s.totalPurchases)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="خریدهای تاخیردار" />
            <ul className="divide-y divide-line">
              {PURCHASE_ORDERS.filter((p) => p.status === 'delayed').map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="font-medium">{p.id}</span>
                  <span className="text-ink-soft">{p.supplier}</span>
                  <Badge tone="crit">{num(p.delayDays)} روز</Badge>
                  <span className="ms-auto tabular-nums">{money(p.total)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'customers' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHead title="مشتریان برتر" />
            <ul className="divide-y divide-line">
              {[...customers]
                .sort((a, b) => b.totalSales - a.totalSales)
                .slice(0, 5)
                .map((c) => (
                  <li key={c.id} className="flex justify-between px-5 py-3 text-[13px]">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{money(c.totalSales)}</span>
                  </li>
                ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="مشتریان دارای بدهی" />
            <ul className="divide-y divide-line">
              {[...customers]
                .filter((c) => c.debt > 0)
                .sort((a, b) => b.debt - a.debt)
                .map((c) => (
                  <li key={c.id} className="flex justify-between px-5 py-3 text-[13px]">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{money(c.debt)}</span>
                  </li>
                ))}
            </ul>
          </Card>
          <Card className="lg:col-span-2">
            <CardHead title="مشتریان بدون خرید در ۶۰ روز گذشته" />
            <ul className="divide-y divide-line">
              {customers
                .filter((c) => daysBetween(c.lastPurchase, TODAY) > 60)
                .map((c) => (
                  <li key={c.id} className="flex justify-between px-5 py-3 text-[13px]">
                    <span>{c.name}</span>
                    <span className="tabular-nums text-ink-soft">
                      {num(daysBetween(c.lastPurchase, TODAY))} روز
                    </span>
                  </li>
                ))}
              {!customers.some((c) => daysBetween(c.lastPurchase, TODAY) > 60) && (
                <li className="px-5 py-6 text-center text-[13px] text-ink-soft">
                  همه مشتریان در ۶۰ روز گذشته خرید داشته‌اند.
                </li>
              )}
            </ul>
          </Card>
        </div>
      )}
    </>
  )
}
