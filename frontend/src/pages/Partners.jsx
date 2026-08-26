import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase, Plus, X, Pencil, Trash2, Settings2, ArrowUpRight, ArrowDownLeft,
  TrendingUp, Landmark, Scale, Wallet
} from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import api from '../lib/api'

const money = (n) => '$' + (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Cálculo espejo del backend (para vista previa en vivo en el formulario)
function computeDeal(d) {
  const fx = parseFloat(d.fx) || 0
  const qty = parseInt(d.quantity) || 0
  const costUnitMXN = d.costCurrency === 'USD' ? (parseFloat(d.costUnit) || 0) * fx : (parseFloat(d.costUnit) || 0)
  const saleUnitMXN = d.saleCurrency === 'USD' ? (parseFloat(d.saleUnit) || 0) * fx : (parseFloat(d.saleUnit) || 0)
  const costTotal = costUnitMXN * qty
  const saleTotal = saleUnitMXN * qty
  const utility = saleTotal - costTotal
  const isr = utility > 0 ? utility * ((parseFloat(d.isrRate) || 0) / 100) : 0
  const net = utility - isr
  const partnerShare = net > 0 ? net * ((parseFloat(d.partnerRate) || 0) / 100) : 0
  const icapsaShare = net - partnerShare
  return { costUnitMXN, saleUnitMXN, costTotal, saleTotal, utility, isr, net, partnerShare, icapsaShare }
}

export default function Partners() {
  const me = useAuthStore(s => s.user)
  const isSuper = me?.role === 'SUPER_ADMIN'
  const [tab, setTab] = useState('deals')
  const [editDeal, setEditDeal] = useState(null)   // null | 'new' | deal
  const [showSettings, setShowSettings] = useState(false)

  const { data: summary } = useQuery({
    queryKey: ['partners-summary'],
    queryFn: () => api.get('/partners/summary').then(r => r.data)
  })

  const s = summary?.settings
  const t = summary?.totals
  const balance = summary?.balance ?? 0

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase size={22} className="text-brand-500" /> Sociedad
          </h1>
          <p className="text-sm text-gray-500 mt-1">Cuenta ICAPSA · {s?.partnerName || 'DELEVSIS'} — desarrollos, utilidades y pagos</p>
        </div>
        {isSuper && (
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg">
            <Settings2 size={15} /> <span className="hidden sm:inline">Ajustes</span>
          </button>
        )}
      </div>

      {/* Tarjetas resumen */}
      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard icon={TrendingUp} label="Venta total" value={money(t.saleTotal)} sub={`Costo: ${money(t.costTotal)}`} />
          <SummaryCard icon={Landmark} label="Utilidad neta (tras ISR)" value={money(t.net)} sub={`ISR: ${money(t.isr)}`} />
          <SummaryCard icon={Scale} label={`ICAPSA · ${s ? 100 - s.defaultPartnerRate : 65}%`} value={money(t.icapsaShare)}
            sub={`${s?.partnerName || 'DELEVSIS'}: ${money(t.partnerShare)}`} />
          <SummaryCard icon={Wallet} label={balance >= 0 ? `Por pagar a ${s?.partnerName || 'DELEVSIS'}` : `${s?.partnerName || 'DELEVSIS'} debe`}
            value={money(Math.abs(balance))} sub={`Pagado neto: ${money(summary?.netPaid || 0)}`}
            highlight={balance > 0.01} />
        </div>
      )}

      {/* Sub-pestañas */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[{ k: 'deals', label: 'Desarrollos' }, { k: 'payments', label: 'Pagos' }].map(x => (
          <button key={x.k} onClick={() => setTab(x.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'deals' && <DealsView settings={s} onEdit={setEditDeal} />}
      {tab === 'payments' && <PaymentsView settings={s} isSuper={isSuper} />}

      {editDeal && <DealModal deal={editDeal === 'new' ? null : editDeal} settings={s} onClose={() => setEditDeal(null)} />}
      {showSettings && s && <SettingsModal settings={s} onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, sub, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-brand-50 border-brand-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Icon size={14} className="text-brand-500" /> {label}</div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ============ Desarrollos (la tabla del Excel, viva) ============
function DealsView({ settings, onEdit }) {
  const qc = useQueryClient()
  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['partners-deals'],
    queryFn: () => api.get('/partners/deals').then(r => r.data)
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/partners/deals/${id}`),
    onSuccess: () => { qc.invalidateQueries(['partners-deals']); qc.invalidateQueries(['partners-summary']) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const partnerName = settings?.partnerName || 'DELEVSIS'

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => onEdit('new')}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nuevo desarrollo
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1080px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 whitespace-nowrap">
              <th className="px-3 py-3 font-medium">Desarrollo</th>
              <th className="px-3 py-3 font-medium text-right">Cant.</th>
              <th className="px-3 py-3 font-medium text-right">PU Costo</th>
              <th className="px-3 py-3 font-medium text-right">PU Venta</th>
              <th className="px-3 py-3 font-medium text-right">TC</th>
              <th className="px-3 py-3 font-medium text-right">Costo MXN</th>
              <th className="px-3 py-3 font-medium text-right">Venta MXN</th>
              <th className="px-3 py-3 font-medium text-right">Utilidad</th>
              <th className="px-3 py-3 font-medium text-right">Neta (−ISR)</th>
              <th className="px-3 py-3 font-medium text-right">ICAPSA</th>
              <th className="px-3 py-3 font-medium text-right">{partnerName}</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="12" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && deals.length === 0 && (
              <tr><td colSpan="12" className="px-4 py-12 text-center text-gray-400">
                Sin desarrollos todavía. Registra el primero y deja el Excel atrás. 📊
              </td></tr>
            )}
            {deals.map(d => (
              <tr key={d.id} className={`hover:bg-gray-50 ${d.status === 'CLOSED' ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2.5">
                  <button onClick={() => onEdit(d)} className="font-medium text-gray-900 hover:text-brand-600 text-left">
                    {d.name}
                  </button>
                  <div className="text-xs text-gray-400">{d.area || '—'}{d.status === 'CLOSED' ? ' · cerrado' : ''}</div>
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">{d.quantity.toLocaleString('es-MX')}</td>
                <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{money(d.costUnit)} <span className="text-[10px] text-gray-400">{d.costCurrency}</span></td>
                <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{money(d.saleUnit)} <span className="text-[10px] text-gray-400">{d.saleCurrency}</span></td>
                <td className="px-3 py-2.5 text-right text-gray-500">{d.fx}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{money(d.calc.costTotal)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{money(d.calc.saleTotal)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900">{money(d.calc.utility)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900">{money(d.calc.net)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-brand-600">{money(d.calc.icapsaShare)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-red-600">{money(d.calc.partnerShare)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(d)} className="text-gray-400 hover:text-brand-600 mr-2"><Pencil size={14} /></button>
                  <button onClick={() => { if (confirm(`¿Eliminar «${d.name}»?`)) remove.mutate(d.id) }}
                    className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">Utilidad = Venta − Costo · Neta = Utilidad − ISR · Reparto sobre la neta. Los % son editables por desarrollo.</p>
    </div>
  )
}

// ============ Modal de desarrollo con cálculo EN VIVO ============
function DealModal({ deal, settings, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: deal?.name || '',
    area: deal?.area || '',
    quantity: deal?.quantity ?? 1,
    costUnit: deal?.costUnit ?? '',
    costCurrency: deal?.costCurrency || 'USD',
    saleUnit: deal?.saleUnit ?? '',
    saleCurrency: deal?.saleCurrency || 'USD',
    fx: deal?.fx ?? settings?.defaultFx ?? 19,
    isrRate: deal?.isrRate ?? settings?.defaultIsr ?? 30,
    partnerRate: deal?.partnerRate ?? settings?.defaultPartnerRate ?? 35,
    ivaRate: deal?.ivaRate ?? settings?.defaultIva ?? 16,
    status: deal?.status || 'OPEN',
    notes: deal?.notes || '',
    projectId: deal?.project?.id || ''
  })

  const { data: links } = useQuery({ queryKey: ['board-links'], queryFn: () => api.get('/board/links').then(r => r.data) })

  const calc = useMemo(() => computeDeal(form), [form])
  const partnerName = settings?.partnerName || 'DELEVSIS'

  const save = useMutation({
    mutationFn: () => deal
      ? api.patch(`/partners/deals/${deal.id}`, form)
      : api.post('/partners/deals', form),
    onSuccess: () => { qc.invalidateQueries(['partners-deals']); qc.invalidateQueries(['partners-summary']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{deal ? 'Editar desarrollo' : 'Nuevo desarrollo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
            <input value={form.name} onChange={set('name')} placeholder="Ej: Tarjetas Internas (DVMC)" className={inputCls} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Área / grupo</label>
            <input value={form.area} onChange={set('area')} placeholder="Ej: CFE · Media Tensión" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
            <input type="number" value={form.quantity} onChange={set('quantity')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de cambio (USD→MXN)</label>
            <input type="number" step="0.01" value={form.fx} onChange={set('fx')} className={inputCls} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">PU Costo</label>
            <div className="flex gap-1">
              <input type="number" step="0.01" value={form.costUnit} onChange={set('costUnit')} className={inputCls} />
              <select value={form.costCurrency} onChange={set('costCurrency')} className="border border-gray-200 rounded-lg px-2 text-sm focus:outline-none">
                <option>USD</option><option>MXN</option>
              </select>
            </div>
            {form.costCurrency === 'USD' && <p className="text-[10px] text-gray-400 mt-0.5">= {money(calc.costUnitMXN)} MXN</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PU Venta</label>
            <div className="flex gap-1">
              <input type="number" step="0.01" value={form.saleUnit} onChange={set('saleUnit')} className={inputCls} />
              <select value={form.saleCurrency} onChange={set('saleCurrency')} className="border border-gray-200 rounded-lg px-2 text-sm focus:outline-none">
                <option>USD</option><option>MXN</option>
              </select>
            </div>
            {form.saleCurrency === 'USD' && <p className="text-[10px] text-gray-400 mt-0.5">= {money(calc.saleUnitMXN)} MXN</p>}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">ISR %</label>
            <input type="number" step="0.1" value={form.isrRate} onChange={set('isrRate')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">% {partnerName} (de la neta)</label>
            <input type="number" step="0.1" value={form.partnerRate} onChange={set('partnerRate')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">IVA % (informativo)</label>
            <input type="number" step="0.1" value={form.ivaRate} onChange={set('ivaRate')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              <option value="OPEN">Abierto</option>
              <option value="CLOSED">Cerrado</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Proyecto vinculado (opcional)</label>
            <select value={form.projectId} onChange={set('projectId')} className={inputCls}>
              <option value="">Sin proyecto</option>
              {links?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Notas</label>
            <input value={form.notes} onChange={set('notes')} className={inputCls} />
          </div>
        </div>

        {/* Vista previa del cálculo EN VIVO (como tu Excel, pero instantáneo) */}
        <div className="mt-4 bg-gray-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <Calc label="Costo total" v={calc.costTotal} />
          <Calc label="Venta total" v={calc.saleTotal} />
          <Calc label={`Venta + IVA ${form.ivaRate}%`} v={calc.saleTotal * (1 + (parseFloat(form.ivaRate) || 0) / 100)} muted />
          <Calc label="Utilidad" v={calc.utility} strong />
          <Calc label={`ISR (${form.isrRate}%)`} v={calc.isr} />
          <Calc label="Utilidad neta" v={calc.net} strong />
          <Calc label={`ICAPSA (${(100 - (parseFloat(form.partnerRate) || 0)).toFixed(0)}%)`} v={calc.icapsaShare} brand />
          <Calc label={`${partnerName} (${form.partnerRate}%)`} v={calc.partnerShare} red />
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">
            {save.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Calc({ label, v, strong, brand, red, muted }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={`text-xs ${muted ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
      <span className={`whitespace-nowrap ${brand ? 'font-semibold text-brand-600' : red ? 'font-semibold text-red-600' : strong ? 'font-semibold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
        {money(v)}
      </span>
    </div>
  )
}

// ============ Pagos (cuenta corriente) ============
function PaymentsView({ settings, isSuper }) {
  const qc = useQueryClient()
  const partnerName = settings?.partnerName || 'DELEVSIS'
  const [form, setForm] = useState({ direction: 'TO_PARTNER', amount: '', concept: '', method: '', date: new Date().toISOString().split('T')[0] })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['partners-payments'],
    queryFn: () => api.get('/partners/payments').then(r => r.data)
  })

  const create = useMutation({
    mutationFn: () => api.post('/partners/payments', form),
    onSuccess: () => {
      setForm(f => ({ ...f, amount: '', concept: '' }))
      qc.invalidateQueries(['partners-payments']); qc.invalidateQueries(['partners-summary'])
    },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/partners/payments/${id}`),
    onSuccess: () => { qc.invalidateQueries(['partners-payments']); qc.invalidateQueries(['partners-summary']) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  return (
    <div className="space-y-4">
      {/* Registrar pago */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Registrar pago</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={form.direction} onChange={set('direction')} className={inputCls}>
            <option value="TO_PARTNER">ICAPSA → {partnerName}</option>
            <option value="FROM_PARTNER">{partnerName} → ICAPSA</option>
          </select>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} placeholder="Monto MXN" className={inputCls + ' w-32'} />
          <input value={form.concept} onChange={set('concept')} placeholder="Concepto (ej: abono comisión DVMC)" className={inputCls + ' flex-1 min-w-[180px]'} />
          <input value={form.method} onChange={set('method')} placeholder="Método" className={inputCls + ' w-32'} />
          <input type="date" value={form.date} onChange={set('date')} className={inputCls} />
          <button onClick={() => create.mutate()} disabled={!form.amount || !form.concept.trim() || create.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40">
            {create.isPending ? '...' : 'Registrar'}
          </button>
        </div>
      </div>

      {/* Historial */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {isLoading && <p className="text-center text-gray-400 text-sm py-8">Cargando...</p>}
        {!isLoading && payments.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">Sin pagos registrados</p>
        )}
        {payments.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${p.direction === 'TO_PARTNER' ? 'bg-red-50 text-red-500' : 'bg-brand-50 text-brand-600'}`}>
              {p.direction === 'TO_PARTNER' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{p.concept}</p>
              <p className="text-xs text-gray-400">
                {p.direction === 'TO_PARTNER' ? `ICAPSA → ${partnerName}` : `${partnerName} → ICAPSA`}
                {p.method ? ` · ${p.method}` : ''} · {new Date(p.date).toLocaleDateString('es-MX')} · por {p.createdBy?.name}
              </p>
            </div>
            <span className={`font-semibold whitespace-nowrap ${p.direction === 'TO_PARTNER' ? 'text-red-600' : 'text-brand-600'}`}>
              {p.direction === 'TO_PARTNER' ? '−' : '+'}{money(p.amount)}
            </span>
            {isSuper && (
              <button onClick={() => { if (confirm('¿Eliminar este pago del registro?')) remove.mutate(p.id) }}
                className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ Ajustes globales (solo super admin) ============
function SettingsModal({ settings, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    partnerName: settings.partnerName,
    defaultFx: settings.defaultFx,
    defaultIsr: settings.defaultIsr,
    defaultPartnerRate: settings.defaultPartnerRate,
    defaultIva: settings.defaultIva
  })
  const save = useMutation({
    mutationFn: () => api.patch('/partners/settings', form),
    onSuccess: () => { qc.invalidateQueries(['partners-summary']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Ajustes de la sociedad</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">Nombre del socio</label>
            <input value={form.partnerName} onChange={set('partnerName')} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">TC por defecto</label>
              <input type="number" step="0.01" value={form.defaultFx} onChange={set('defaultFx')} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">ISR % por defecto</label>
              <input type="number" step="0.1" value={form.defaultIsr} onChange={set('defaultIsr')} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">% del socio</label>
              <input type="number" step="0.1" value={form.defaultPartnerRate} onChange={set('defaultPartnerRate')} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">IVA %</label>
              <input type="number" step="0.1" value={form.defaultIva} onChange={set('defaultIva')} className={inputCls} /></div>
          </div>
          <p className="text-[10px] text-gray-400">Los valores por defecto aplican a desarrollos nuevos; cada uno puede ajustarse individualmente.</p>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
          {save.isPending ? 'Guardando...' : 'Guardar ajustes'}
        </button>
      </div>
    </div>
  )
}
