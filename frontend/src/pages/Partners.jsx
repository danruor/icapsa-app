import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase, Plus, X, Pencil, Trash2, Settings2, ArrowUpRight, ArrowDownLeft,
  TrendingUp, Landmark, Scale, Wallet, ChevronDown, ChevronRight, Zap, Building2, Wifi, Lock, FileSpreadsheet
} from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import api, { downloadFile } from '../lib/api'
import { CFE_DIVISIONS, MX_STATES, resolveConceptPrice } from '../lib/mx'
import { ConceptsView, AnalyticsView, CompetitorsView } from './PartnersExtra'
import { useSort, SortTh } from '../components/sortable'

const money = (n) => '$' + (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Cálculo espejo del backend (vista previa en vivo)
function computeItem(it, deal) {
  const fx = parseFloat(deal.fx) || 0
  const qty = parseInt(it.quantity) || 0
  const costUnitMXN = it.costCurrency === 'USD' ? (parseFloat(it.costUnit) || 0) * fx : (parseFloat(it.costUnit) || 0)
  const saleUnitMXN = it.saleCurrency === 'USD' ? (parseFloat(it.saleUnit) || 0) * fx : (parseFloat(it.saleUnit) || 0)
  const costTotal = costUnitMXN * qty
  const saleTotal = saleUnitMXN * qty
  const utility = saleTotal - costTotal
  const isr = utility > 0 ? utility * ((parseFloat(deal.isrRate) || 0) / 100) : 0
  const net = utility - isr
  const partnerShare = net > 0 ? net * ((parseFloat(deal.partnerRate) || 0) / 100) : 0
  const icapsaShare = net - partnerShare
  return { costUnitMXN, saleUnitMXN, costTotal, saleTotal, utility, isr, net, partnerShare, icapsaShare }
}
function computeDeal(deal) {
  const t = { costTotal: 0, saleTotal: 0, utility: 0, isr: 0, net: 0, partnerShare: 0, icapsaShare: 0 }
  for (const it of deal.items || []) {
    const c = computeItem(it, deal)
    for (const k of Object.keys(t)) t[k] += c[k]
  }
  return t
}

export default function Partners() {
  const me = useAuthStore(s => s.user)
  const isSuper = me?.role === 'SUPER_ADMIN'
  const [tab, setTab] = useState('deals')
  const [year, setYear] = useState(String(new Date().getFullYear()))  // 'all' = histórico
  const [editDeal, setEditDeal] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const yearParam = year === 'all' ? '' : `?year=${year}`
  const { data: summary } = useQuery({
    queryKey: ['partners-summary', year],
    queryFn: () => api.get(`/partners/summary${yearParam}`).then(r => r.data)
  })

  const s = summary?.settings
  const t = summary?.totals
  const balance = summary?.balance ?? 0
  const partnerName = s?.partnerName || 'DELEVSIS'
  const yearLabel = year === 'all' ? 'histórico' : `ejercicio ${year}`

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase size={22} className="text-brand-500" /> Sociedad
            {summary?.isClosed && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium"><Lock size={11} /> Ejercicio cerrado</span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Cuenta ICAPSA · {partnerName} — contratos, utilidades, datos y pagos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={e => setYear(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-500 bg-white">
            {(summary?.years || [new Date().getFullYear()]).map(y => (
              <option key={y} value={String(y)}>{summary?.closedYears?.includes(y) ? `🔒 ${y}` : `Ejercicio ${y}`}</option>
            ))}
            <option value="all">Histórico completo</option>
          </select>
          <button onClick={() => downloadFile(`/partners/export.xlsx${yearParam}`, `Sociedad-${year === 'all' ? 'historico' : year}.xlsx`)}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg" title="Exportar estado de cuenta a Excel">
            <FileSpreadsheet size={15} /> <span className="hidden sm:inline">Excel</span>
          </button>
          {isSuper && (
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg">
              <Settings2 size={15} /> <span className="hidden sm:inline">Ajustes</span>
            </button>
          )}
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard icon={TrendingUp} label={`Venta ${yearLabel}`} value={money(t.saleTotal)} sub={`Costo: ${money(t.costTotal)} · ${summary.dealCount} contratos`} />
          <SummaryCard icon={Landmark} label="Utilidad neta (tras ISR)" value={money(t.net)} sub={`ISR: ${money(t.isr)} · ICAPSA: ${money(t.icapsaShare)}`} />
          <SummaryCard icon={Scale} label={`Comisión ${partnerName}`} value={money(t.partnerShare)}
            sub={`Datos: ${money(summary.dataOwed || 0)} adeudo · margen datos ${money(summary.dataMargin || 0)}`} />
          <SummaryCard icon={Wallet}
            label={balance >= 0 ? `Por pagar a ${partnerName} (${yearLabel})` : `${partnerName} debe (${yearLabel})`}
            value={money(Math.abs(balance))}
            sub={year === 'all' ? `Pagado neto: ${money(summary.netPaid || 0)}` : `Arrastre previo: ${money(summary.carryOver || 0)} · Total: ${money(summary.balanceTotal || 0)}`}
            highlight={balance > 0.01} />
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {[{ k: 'deals', label: 'Contratos' }, { k: 'catalog', label: 'Catálogo' }, { k: 'analytics', label: 'Análisis 📊' }, { k: 'competitors', label: 'Competencia' }, { k: 'payments', label: 'Pagos' }, { k: 'data', label: 'Datos (SIM)' }].map(x => (
          <button key={x.k} onClick={() => setTab(x.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'deals' && <DealsView settings={s} year={year} isClosed={summary?.isClosed} onEdit={setEditDeal} />}
      {tab === 'catalog' && <ConceptsView settings={s} isSuper={isSuper} />}
      {tab === 'analytics' && <AnalyticsView year={year} />}
      {tab === 'competitors' && <CompetitorsView settings={s} isSuper={isSuper} />}
      {tab === 'payments' && <PaymentsView settings={s} year={year} isSuper={isSuper} isClosed={summary?.isClosed} />}
      {tab === 'data' && <DataView settings={s} year={year} isSuper={isSuper} isClosed={summary?.isClosed} />}

      {editDeal && <DealModal deal={editDeal === 'new' ? null : editDeal} settings={s} onClose={() => setEditDeal(null)} />}
      {showSettings && s && <SettingsModal settings={s} years={summary?.years || []} onClose={() => setShowSettings(false)} />}
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

// ============ Contratos ============
const DEAL_SORTERS = {
  name: d => d.name,
  client: d => d.clientType === 'CFE' ? `CFE ${d.division || ''}` : (d.clientName || 'zz'),
  date: d => new Date(d.dealDate || d.createdAt).getTime(),
  items: d => d.items.length,
  cost: d => d.calc.costTotal,
  sale: d => d.calc.saleTotal,
  net: d => d.calc.net,
  icapsa: d => d.calc.icapsaShare,
  partner: d => d.calc.partnerShare
}

function DealsView({ settings, year, isClosed, onEdit }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(null)
  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['partners-deals', year],
    queryFn: () => api.get(`/partners/deals${year === 'all' ? '' : `?year=${year}`}`).then(r => r.data)
  })
  const { sorted, sortKey, sortDir, toggle } = useSort(deals, DEAL_SORTERS, 'date')
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/partners/deals/${id}`),
    onSuccess: () => { qc.invalidateQueries(['partners-deals']); qc.invalidateQueries(['partners-summary']) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const partnerName = settings?.partnerName || 'DELEVSIS'

  return (
    <div>
      <div className="flex justify-between items-center mb-3 gap-3">
        <p className="text-xs text-gray-400">{isClosed ? '🔒 Este ejercicio está cerrado: los contratos son de solo lectura.' : `Contratos del ${year === 'all' ? 'histórico completo' : `ejercicio ${year}`}.`}</p>
        <button onClick={() => onEdit('new')}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex-shrink-0">
          <Plus size={16} /> Nuevo contrato
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 whitespace-nowrap">
              <th className="px-3 py-3 w-8"></th>
              <SortTh label="Contrato" k="name" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Fecha" k="date" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Cliente" k="client" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Conceptos" k="items" align="center" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Costo MXN" k="cost" align="right" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Venta MXN" k="sale" align="right" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Neta (−ISR)" k="net" align="right" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="ICAPSA" k="icapsa" align="right" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label={partnerName} k="partner" align="right" {...{ sortKey, sortDir, onToggle: toggle }} />
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && deals.length === 0 && (
              <tr><td colSpan="11" className="px-4 py-12 text-center text-gray-400">Sin contratos todavía. Registra el primero. 📊</td></tr>
            )}
            {sorted.map(d => (
              <DealRow key={d.id} d={d} expanded={expanded === d.id}
                onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                onEdit={() => onEdit(d)}
                onDelete={() => { if (confirm(`¿Eliminar el contrato «${d.name}» y sus conceptos?`)) remove.mutate(d.id) }}
                partnerName={partnerName} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">Clic en la flecha para ver los conceptos de cada contrato con su desglose. Neta = Utilidad − ISR · Reparto sobre la neta.</p>
    </div>
  )
}

function DealRow({ d, expanded, onToggle, onEdit, onDelete, partnerName }) {
  return (
    <>
      <tr className={`hover:bg-gray-50 ${d.status === 'CLOSED' ? 'opacity-60' : ''}`}>
        <td className="px-3 py-2.5">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-3 py-2.5">
          <button onClick={onEdit} className="font-medium text-gray-900 hover:text-brand-600 text-left">{d.name}</button>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
            {d.contractRef && <span>Ref: {d.contractRef}</span>}
            {d.includesData && <span className="inline-flex items-center gap-0.5 text-sky-600"><Wifi size={10} /> datos</span>}
            {d.status === 'CLOSED' && <span>· cerrado</span>}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
          {new Date(d.dealDate || d.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${d.clientType === 'CFE' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
            {d.clientType === 'CFE' ? <Zap size={10} /> : <Building2 size={10} />}
            {d.clientType === 'CFE' ? 'CFE' : (d.clientName || 'Privado')}
          </span>
          <div className="text-[10px] text-gray-400 mt-0.5">{d.clientType === 'CFE' ? (d.division || '—') : (d.state || '—')}</div>
        </td>
        <td className="px-3 py-2.5 text-center text-gray-600">{d.items.length}</td>
        <td className="px-3 py-2.5 text-right text-gray-700">{money(d.calc.costTotal)}</td>
        <td className="px-3 py-2.5 text-right text-gray-700">{money(d.calc.saleTotal)}</td>
        <td className="px-3 py-2.5 text-right font-medium text-gray-900">{money(d.calc.net)}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-brand-600">{money(d.calc.icapsaShare)}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-red-600">{money(d.calc.partnerShare)}</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <button onClick={onEdit} className="text-gray-400 hover:text-brand-600 mr-2"><Pencil size={14} /></button>
          <button onClick={onDelete} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan="11" className="px-4 py-3 bg-gray-50">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1 pr-2 font-medium">Concepto</th>
                  <th className="py-1 px-2 font-medium text-right">Cant.</th>
                  <th className="py-1 px-2 font-medium text-right">PU Costo</th>
                  <th className="py-1 px-2 font-medium text-right">PU Venta</th>
                  <th className="py-1 px-2 font-medium text-right">Costo</th>
                  <th className="py-1 px-2 font-medium text-right">Venta</th>
                  <th className="py-1 px-2 font-medium text-right">Utilidad</th>
                  <th className="py-1 px-2 font-medium text-right">Neta</th>
                  <th className="py-1 px-2 font-medium text-right">ICAPSA</th>
                  <th className="py-1 pl-2 font-medium text-right">{partnerName}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.items.map(it => (
                  <tr key={it.id} className="text-gray-700">
                    <td className="py-1.5 pr-2">{it.name}</td>
                    <td className="py-1.5 px-2 text-right">{it.quantity.toLocaleString('es-MX')}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{money(it.costUnit)} <span className="text-gray-400">{it.costCurrency}</span></td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{money(it.saleUnit)} <span className="text-gray-400">{it.saleCurrency}</span></td>
                    <td className="py-1.5 px-2 text-right">{money(it.calc.costTotal)}</td>
                    <td className="py-1.5 px-2 text-right">{money(it.calc.saleTotal)}</td>
                    <td className="py-1.5 px-2 text-right">{money(it.calc.utility)}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{money(it.calc.net)}</td>
                    <td className="py-1.5 px-2 text-right font-medium text-brand-600">{money(it.calc.icapsaShare)}</td>
                    <td className="py-1.5 pl-2 text-right font-medium text-red-600">{money(it.calc.partnerShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(d.dataNotes || d.notes) && (
              <p className="text-[10px] text-gray-400 mt-2">
                {d.includesData && d.dataNotes ? `📶 Datos: ${d.dataNotes}  ` : ''}{d.notes ? `· ${d.notes}` : ''}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ============ Modal de contrato ============
function DealModal({ deal, settings, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: deal?.name || '',
    clientType: deal?.clientType || 'PRIVATE',
    clientName: deal?.clientName || '',
    division: deal?.division || '',
    state: deal?.state || '',
    contractRef: deal?.contractRef || '',
    dealDate: (deal?.dealDate || new Date().toISOString()).split('T')[0],
    fx: deal?.fx ?? settings?.defaultFx ?? 19,
    isrRate: deal?.isrRate ?? settings?.defaultIsr ?? 30,
    partnerRate: deal?.partnerRate ?? settings?.defaultPartnerRate ?? 35,
    ivaRate: deal?.ivaRate ?? settings?.defaultIva ?? 16,
    status: deal?.status || 'OPEN',
    includesData: deal?.includesData || false,
    dataNotes: deal?.dataNotes || '',
    notes: deal?.notes || '',
    projectId: deal?.project?.id || ''
  })
  const [items, setItems] = useState(
    deal?.items?.length
      ? deal.items.map(it => ({ name: it.name, quantity: it.quantity, costUnit: it.costUnit, costCurrency: it.costCurrency, saleUnit: it.saleUnit, saleCurrency: it.saleCurrency, conceptId: it.conceptId || '', saveToCatalog: false }))
      : [{ name: '', quantity: 1, costUnit: '', costCurrency: 'USD', saleUnit: '', saleCurrency: 'USD', conceptId: '', saveToCatalog: false }]
  )

  const { data: links } = useQuery({ queryKey: ['board-links'], queryFn: () => api.get('/board/links').then(r => r.data) })
  const { data: catalog = [] } = useQuery({ queryKey: ['partners-concepts'], queryFn: () => api.get('/partners/concepts').then(r => r.data) })

  // Elegir un concepto del catálogo rellena el renglón: el precio de venta se resuelve
  // según la división CFE / estado / cliente del contrato (editable después)
  const [priceSource, setPriceSource] = useState({})
  const pickFromCatalog = (idx) => (e) => {
    const c = catalog.find(x => x.id === e.target.value)
    if (!c) { setItems(arr => arr.map((it, i) => i === idx ? { ...it, conceptId: '' } : it)); return }
    const resolved = resolveConceptPrice(c, form)
    setPriceSource(ps => ({ ...ps, [idx]: resolved.source }))
    setItems(arr => arr.map((it, i) => i === idx ? {
      ...it, conceptId: c.id, name: c.name,
      costUnit: c.costingMode === 'BREAKDOWN' ? c.calc.costMXN : c.costUnit,
      costCurrency: c.costingMode === 'BREAKDOWN' ? 'MXN' : c.costCurrency,
      saleUnit: resolved.saleUnit, saleCurrency: resolved.saleCurrency,
      saveToCatalog: false
    } : it))
  }

  const calc = useMemo(() => computeDeal({ ...form, items }), [form, items])
  const partnerName = settings?.partnerName || 'DELEVSIS'

  const save = useMutation({
    mutationFn: () => deal
      ? api.patch(`/partners/deals/${deal.id}`, { ...form, items })
      : api.post('/partners/deals', { ...form, items }),
    onSuccess: () => { qc.invalidateQueries(['partners-deals']); qc.invalidateQueries(['partners-summary']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const setItem = (idx, k) => (e) => setItems(arr => arr.map((it, i) => i === idx ? { ...it, [k]: e.target.value } : it))
  const addItem = () => setItems(arr => [...arr, { name: '', quantity: 1, costUnit: '', costCurrency: 'USD', saleUnit: '', saleCurrency: 'USD' }])
  const rmItem = (idx) => setItems(arr => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr)

  const canSave = form.name.trim() && items.every(it => it.name.trim())
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{deal ? 'Editar contrato' : 'Nuevo contrato'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Tipo de cliente */}
        <div className="flex gap-2 mb-4">
          {[{ k: 'CFE', label: 'CFE', icon: Zap }, { k: 'PRIVATE', label: 'Privado', icon: Building2 }].map(t => (
            <button key={t.k} onClick={() => setForm(f => ({ ...f, clientType: t.k }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${form.clientType === t.k ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Nombre del contrato / obra *</label>
            <input value={form.name} onChange={set('name')} placeholder="Ej: Torre Lítica" className={inputCls} />
          </div>
          <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">No. contrato / pedido</label>
              <input value={form.contractRef} onChange={set('contractRef')} placeholder="PED-2026-0142" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha</label>
              <input type="date" value={form.dealDate} onChange={set('dealDate')} className={inputCls} />
            </div>
          </div>

          {form.clientType === 'CFE' ? (
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">División de distribución CFE</label>
              <select value={form.division} onChange={set('division')} className={inputCls}>
                <option value="">Selecciona la división...</option>
                {CFE_DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-500 mb-1">Cliente (constructora, empresa...)</label>
                <input value={form.clientName} onChange={set('clientName')} placeholder="Ej: Francisco / ODG" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-500 mb-1">Estado</label>
                <select value={form.state} onChange={set('state')} className={inputCls}>
                  <option value="">Selecciona el estado...</option>
                  {MX_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Conceptos */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Conceptos del contrato</p>
            <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Plus size={13} /> Agregar concepto
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => {
              const c = computeItem(it, form)
              return (
                <div key={idx} className="bg-gray-50 rounded-lg p-2.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-44">
                      <label className="block text-[10px] text-gray-400 mb-0.5">📚 Del catálogo</label>
                      <select value={it.conceptId || ''} onChange={pickFromCatalog(idx)}
                        className="w-full border border-gray-200 rounded px-1.5 py-1.5 text-xs focus:outline-none focus:border-brand-500">
                        <option value="">Escribir libre...</option>
                        {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-[10px] text-gray-400 mb-0.5">Concepto *</label>
                      <input value={it.name} onChange={setItem(idx, 'name')} placeholder="Ej: Trifásicas 79"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] text-gray-400 mb-0.5">Cant.</label>
                      <input type="number" value={it.quantity} onChange={setItem(idx, 'quantity')}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                    </div>
                    <div className="w-36">
                      <label className="block text-[10px] text-gray-400 mb-0.5">PU Costo</label>
                      <div className="flex gap-1">
                        <input type="number" step="0.01" value={it.costUnit} onChange={setItem(idx, 'costUnit')}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                        <select value={it.costCurrency} onChange={setItem(idx, 'costCurrency')} className="border border-gray-200 rounded px-1 text-xs focus:outline-none">
                          <option>USD</option><option>MXN</option>
                        </select>
                      </div>
                    </div>
                    <div className="w-36">
                      <label className="block text-[10px] text-gray-400 mb-0.5">PU Venta</label>
                      <div className="flex gap-1">
                        <input type="number" step="0.01" value={it.saleUnit} onChange={setItem(idx, 'saleUnit')}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                        <select value={it.saleCurrency} onChange={setItem(idx, 'saleCurrency')} className="border border-gray-200 rounded px-1 text-xs focus:outline-none">
                          <option>USD</option><option>MXN</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={() => rmItem(idx)} className="text-gray-300 hover:text-red-500 pb-2" title="Quitar concepto">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
                    <p className="text-[10px] text-gray-400">
                      Utilidad: <span className="text-gray-600 font-medium">{money(c.utility)}</span> ·
                      Neta: <span className="text-gray-600 font-medium">{money(c.net)}</span> ·
                      ICAPSA: <span className="text-brand-600 font-medium">{money(c.icapsaShare)}</span> ·
                      {partnerName}: <span className="text-red-600 font-medium">{money(c.partnerShare)}</span>
                    </p>
                    {it.conceptId && priceSource[idx] && (
                      <span className="text-[10px] text-sky-600">💰 {priceSource[idx]}</span>
                    )}
                    {!it.conceptId && it.name.trim() && (
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={!!it.saveToCatalog}
                          onChange={e => setItems(arr => arr.map((x, i) => i === idx ? { ...x, saveToCatalog: e.target.checked } : x))} />
                        Guardar en catálogo
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Parámetros del contrato */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div><label className="block text-xs text-gray-500 mb-1">TC (USD→MXN)</label>
            <input type="number" step="0.01" value={form.fx} onChange={set('fx')} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">ISR %</label>
            <input type="number" step="0.1" value={form.isrRate} onChange={set('isrRate')} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">% {partnerName}</label>
            <input type="number" step="0.1" value={form.partnerRate} onChange={set('partnerRate')} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Estado del contrato</label>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              <option value="OPEN">Abierto</option><option value="CLOSED">Cerrado</option>
            </select></div>
        </div>

        {/* Datos (SIM) */}
        <div className="mt-4 bg-sky-50 border border-sky-100 rounded-xl p-3">
          <label className="flex items-center gap-2 text-sm text-sky-800 cursor-pointer">
            <input type="checkbox" checked={form.includesData} onChange={set('includesData')} />
            <Wifi size={15} /> Este contrato incluye tarjetas con datos (SIM)
          </label>
          {form.includesData && (
            <input value={form.dataNotes} onChange={set('dataNotes')}
              placeholder="Plan, MB/mes, tarifa... (el consumo mensual se registra en la pestaña Datos)"
              className={inputCls + ' mt-2'} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proyecto vinculado</label>
            <select value={form.projectId} onChange={set('projectId')} className={inputCls}>
              <option value="">Sin proyecto</option>
              {links?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas</label>
            <input value={form.notes} onChange={set('notes')} className={inputCls} />
          </div>
        </div>

        {/* Totales del contrato EN VIVO */}
        <div className="mt-4 bg-gray-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          <CalcCell label="Costo total" v={calc.costTotal} />
          <CalcCell label="Venta total" v={calc.saleTotal} />
          <CalcCell label="Utilidad" v={calc.utility} strong />
          <CalcCell label={`ISR (${form.isrRate}%)`} v={calc.isr} />
          <CalcCell label="Utilidad neta" v={calc.net} strong />
          <CalcCell label={`Venta + IVA ${form.ivaRate}%`} v={calc.saleTotal * (1 + (parseFloat(form.ivaRate) || 0) / 100)} muted />
          <CalcCell label={`ICAPSA (${(100 - (parseFloat(form.partnerRate) || 0)).toFixed(0)}%)`} v={calc.icapsaShare} brand />
          <CalcCell label={`${partnerName} (${form.partnerRate}%)`} v={calc.partnerShare} red />
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!canSave || save.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">
            {save.isPending ? 'Guardando...' : 'Guardar contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CalcCell({ label, v, strong, brand, red, muted }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={`text-xs ${muted ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
      <span className={`whitespace-nowrap ${brand ? 'font-semibold text-brand-600' : red ? 'font-semibold text-red-600' : strong ? 'font-semibold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
        {money(v)}
      </span>
    </div>
  )
}

// ============ Pagos ============
function PaymentsView({ settings, year, isSuper, isClosed }) {
  const qc = useQueryClient()
  const partnerName = settings?.partnerName || 'DELEVSIS'
  const [form, setForm] = useState({ direction: 'TO_PARTNER', amount: '', concept: '', method: '', date: new Date().toISOString().split('T')[0] })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['partners-payments', year],
    queryFn: () => api.get(`/partners/payments${year === 'all' ? '' : `?year=${year}`}`).then(r => r.data)
  })
  const { sorted: sortedPayments, sortKey: paySort, sortDir: payDir, toggle: payToggle } = useSort(
    payments, { date: p => new Date(p.date).getTime(), amount: p => p.amount }, 'date'
  )
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
      {!isClosed && <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Registrar pago</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={form.direction} onChange={set('direction')} className={inputCls}>
            <option value="TO_PARTNER">ICAPSA → {partnerName}</option>
            <option value="FROM_PARTNER">{partnerName} → ICAPSA</option>
          </select>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} placeholder="Monto MXN" className={inputCls + ' w-32'} />
          <input value={form.concept} onChange={set('concept')} placeholder="Concepto (ej: abono comisión Torre Lítica)" className={inputCls + ' flex-1 min-w-[180px]'} />
          <input value={form.method} onChange={set('method')} placeholder="Método" className={inputCls + ' w-32'} />
          <input type="date" value={form.date} onChange={set('date')} className={inputCls} />
          <button onClick={() => create.mutate()} disabled={!form.amount || !form.concept.trim() || create.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40">
            {create.isPending ? '...' : 'Registrar'}
          </button>
        </div>
      </div>}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        <div className="flex items-center justify-end gap-1 px-4 py-2">
          <span className="text-[10px] text-gray-400 mr-1">Ordenar por:</span>
          {[{ k: 'date', l: 'Fecha' }, { k: 'amount', l: 'Monto' }].map(o => (
            <button key={o.k} onClick={() => payToggle(o.k)}
              className={`text-xs px-2 py-1 rounded-lg font-medium ${paySort === o.k ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-gray-100'}`}>
              {o.l}{paySort === o.k ? (payDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
        {isLoading && <p className="text-center text-gray-400 text-sm py-8">Cargando...</p>}
        {!isLoading && payments.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin pagos registrados</p>}
        {sortedPayments.map(p => (
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

// ============ Datos (SIM) — consumo variable por SIM/lote y mes ============
const EMPTY_DATA = (s) => ({
  period: new Date().toISOString().slice(0, 7), concept: '', simLabel: '', cardsCount: '', mbUsed: '',
  autoCalc: true, costPerMB: s?.dataCostPerMB ?? 0, salePerMB: s?.dataSalePerMB ?? 0,
  fixedCostPerSim: s?.dataFixedCostPerSim ?? 0, fixedSalePerSim: s?.dataFixedSalePerSim ?? 0,
  amountToPartner: '', amountFromClient: '', dealId: '', notes: ''
})

function DataView({ settings, year, isSuper, isClosed }) {
  const qc = useQueryClient()
  const partnerName = settings?.partnerName || 'DELEVSIS'
  const [form, setForm] = useState(EMPTY_DATA(settings))
  const [editingId, setEditingId] = useState(null)

  const { data: charges = [], isLoading } = useQuery({
    queryKey: ['partners-data', year],
    queryFn: () => api.get(`/partners/data-charges${year === 'all' ? '' : `?year=${year}`}`).then(r => r.data)
  })
  const { data: deals = [] } = useQuery({
    queryKey: ['partners-deals', 'all'],
    queryFn: () => api.get('/partners/deals').then(r => r.data)
  })

  const invalidate = () => { qc.invalidateQueries(['partners-data']); qc.invalidateQueries(['partners-summary']) }
  const save = useMutation({
    mutationFn: () => editingId ? api.patch(`/partners/data-charges/${editingId}`, form) : api.post('/partners/data-charges', form),
    onSuccess: () => { setForm(EMPTY_DATA(settings)); setEditingId(null); invalidate() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/partners/data-charges/${id}`),
    onSuccess: invalidate,
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const startEdit = (c) => {
    setEditingId(c.id)
    setForm({
      period: c.period, concept: c.concept, simLabel: c.simLabel || '', cardsCount: c.cardsCount ?? '', mbUsed: c.mbUsed ?? '',
      autoCalc: c.autoCalc, costPerMB: c.costPerMB ?? settings?.dataCostPerMB ?? 0, salePerMB: c.salePerMB ?? settings?.dataSalePerMB ?? 0,
      fixedCostPerSim: c.fixedCostPerSim ?? settings?.dataFixedCostPerSim ?? 0, fixedSalePerSim: c.fixedSalePerSim ?? settings?.dataFixedSalePerSim ?? 0,
      amountToPartner: c.amountToPartner, amountFromClient: c.amountFromClient ?? '', dealId: c.dealId || '', notes: c.notes || ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
  const n = (v) => parseFloat(v) || 0

  // Cálculo en vivo
  const calcCost = form.autoCalc ? n(form.mbUsed) * n(form.costPerMB) + n(form.cardsCount) * n(form.fixedCostPerSim) : n(form.amountToPartner)
  const calcSale = form.autoCalc ? n(form.mbUsed) * n(form.salePerMB) + n(form.cardsCount) * n(form.fixedSalePerSim) : n(form.amountFromClient)

  const totalOwed = charges.reduce((s, c) => s + c.amountToPartner, 0)
  const totalBilled = charges.reduce((s, c) => s + (c.amountFromClient || 0), 0)
  const totalMB = charges.reduce((s, c) => s + (c.mbUsed || 0), 0)
  const dataDeals = deals.filter(d => d.includesData)

  // Resumen por periodo
  const byPeriod = Object.entries(charges.reduce((acc, c) => {
    if (!acc[c.period]) acc[c.period] = { mb: 0, cost: 0, sale: 0, n: 0 }
    acc[c.period].mb += c.mbUsed || 0; acc[c.period].cost += c.amountToPartner; acc[c.period].sale += c.amountFromClient || 0; acc[c.period].n++
    return acc
  }, {})).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="space-y-4">
      <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 text-xs text-sky-800 flex items-start gap-2">
        <Wifi size={15} className="flex-shrink-0 mt-0.5" />
        <span>El consumo de datos es <b>variable</b>: registra cada mes los MB usados por SIM o lote y el sistema calcula lo que se debe a {partnerName} y lo que se cobra al cliente con las tarifas por MB (ajustables por registro). Si el proveedor ya te facturó un monto, usa "Monto directo". Cuando se conecte la API del proveedor, estos registros se generarán solos.</span>
      </div>

      {!isClosed && (
        <div className={`bg-white rounded-xl border p-4 ${editingId ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{editingId ? '✏️ Corrigiendo registro' : 'Registrar consumo del mes'}</p>
            <div className="flex gap-1">
              {[{ v: true, l: 'Por consumo (MB)' }, { v: false, l: 'Monto directo' }].map(m => (
                <button key={String(m.v)} onClick={() => setForm(f => ({ ...f, autoCalc: m.v }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${form.autoCalc === m.v ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{m.l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><label className="block text-[10px] text-gray-400 mb-0.5">Periodo</label>
              <input type="month" value={form.period} onChange={set('period')} className={inputCls} /></div>
            <div className="flex-1 min-w-[150px]"><label className="block text-[10px] text-gray-400 mb-0.5">Concepto *</label>
              <input value={form.concept} onChange={set('concept')} placeholder="Ej: Consumo datos" className={inputCls + ' w-full'} /></div>
            <div className="w-36"><label className="block text-[10px] text-gray-400 mb-0.5">SIM / lote</label>
              <input value={form.simLabel} onChange={set('simLabel')} placeholder="ICCID o lote" className={inputCls + ' w-full'} /></div>
            <div className="w-24"><label className="block text-[10px] text-gray-400 mb-0.5">Tarjetas</label>
              <input type="number" value={form.cardsCount} onChange={set('cardsCount')} className={inputCls + ' w-full'} /></div>
            {form.autoCalc ? (
              <>
                <div className="w-28"><label className="block text-[10px] text-gray-400 mb-0.5">MB usados *</label>
                  <input type="number" step="0.01" value={form.mbUsed} onChange={set('mbUsed')} className={inputCls + ' w-full'} /></div>
                <div className="w-24"><label className="block text-[10px] text-gray-400 mb-0.5">$/MB prov.</label>
                  <input type="number" step="0.0001" value={form.costPerMB} onChange={set('costPerMB')} className={inputCls + ' w-full'} /></div>
                <div className="w-24"><label className="block text-[10px] text-gray-400 mb-0.5">$/MB cliente</label>
                  <input type="number" step="0.0001" value={form.salePerMB} onChange={set('salePerMB')} className={inputCls + ' w-full'} /></div>
                <div className="w-24"><label className="block text-[10px] text-gray-400 mb-0.5">Fijo/SIM prov.</label>
                  <input type="number" step="0.01" value={form.fixedCostPerSim} onChange={set('fixedCostPerSim')} className={inputCls + ' w-full'} /></div>
                <div className="w-24"><label className="block text-[10px] text-gray-400 mb-0.5">Fijo/SIM cliente</label>
                  <input type="number" step="0.01" value={form.fixedSalePerSim} onChange={set('fixedSalePerSim')} className={inputCls + ' w-full'} /></div>
              </>
            ) : (
              <>
                <div className="w-32"><label className="block text-[10px] text-gray-400 mb-0.5">$ a {partnerName} *</label>
                  <input type="number" step="0.01" value={form.amountToPartner} onChange={set('amountToPartner')} className={inputCls + ' w-full'} /></div>
                <div className="w-32"><label className="block text-[10px] text-gray-400 mb-0.5">$ cobrado</label>
                  <input type="number" step="0.01" value={form.amountFromClient} onChange={set('amountFromClient')} className={inputCls + ' w-full'} /></div>
              </>
            )}
            <div className="min-w-[150px]"><label className="block text-[10px] text-gray-400 mb-0.5">Contrato</label>
              <select value={form.dealId} onChange={set('dealId')} className={inputCls + ' w-full'}>
                <option value="">Sin vincular</option>
                {(dataDeals.length ? dataDeals : deals).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
          </div>
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <p className="text-xs text-gray-500">
              A {partnerName}: <span className="font-semibold text-red-600">{money(calcCost)}</span> ·
              Cobro cliente: <span className="font-semibold text-gray-900">{money(calcSale)}</span> ·
              Margen: <span className={`font-semibold ${calcSale - calcCost >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(calcSale - calcCost)}</span>
            </p>
            <div className="flex gap-2">
              {editingId && <button onClick={() => { setEditingId(null); setForm(EMPTY_DATA(settings)) }} className="border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg">Cancelar</button>}
              <button onClick={() => save.mutate()} disabled={!form.concept.trim() || (form.autoCalc ? form.mbUsed === '' : form.amountToPartner === '') || save.isPending}
                className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40">
                {save.isPending ? '...' : editingId ? 'Guardar cambios' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resumen por mes */}
      {byPeriod.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">Mes</th><th className="px-3 py-2.5 font-medium text-right">Registros</th><th className="px-3 py-2.5 font-medium text-right">MB</th>
              <th className="px-3 py-2.5 font-medium text-right">A {partnerName}</th><th className="px-3 py-2.5 font-medium text-right">Cobrado</th><th className="px-4 py-2.5 font-medium text-right">Margen</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {byPeriod.map(([p, v]) => (
                <tr key={p}><td className="px-4 py-2 font-mono text-xs">{p}</td><td className="px-3 py-2 text-right text-gray-500">{v.n}</td>
                  <td className="px-3 py-2 text-right">{v.mb.toLocaleString('es-MX')}</td><td className="px-3 py-2 text-right text-red-600">{money(v.cost)}</td>
                  <td className="px-3 py-2 text-right">{money(v.sale)}</td><td className={`px-4 py-2 text-right font-medium ${v.sale - v.cost >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(v.sale - v.cost)}</td></tr>
              ))}
              <tr className="bg-gray-50 font-semibold"><td className="px-4 py-2 text-xs">TOTAL</td><td className="px-3 py-2 text-right">{charges.length}</td>
                <td className="px-3 py-2 text-right">{totalMB.toLocaleString('es-MX')}</td><td className="px-3 py-2 text-right text-red-600">{money(totalOwed)}</td>
                <td className="px-3 py-2 text-right">{money(totalBilled)}</td><td className={`px-4 py-2 text-right ${totalBilled - totalOwed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(totalBilled - totalOwed)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {isLoading && <p className="text-center text-gray-400 text-sm py-8">Cargando...</p>}
        {!isLoading && charges.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin consumo de datos registrado</p>}
        {charges.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 rounded px-2 py-1 flex-shrink-0">{c.period}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{c.concept}{c.simLabel ? <span className="text-gray-400"> · {c.simLabel}</span> : ''}</p>
              <p className="text-xs text-gray-400">
                {c.mbUsed ? `${c.mbUsed.toLocaleString('es-MX')} MB${c.costPerMB ? ` @ $${c.costPerMB}/MB` : ''} · ` : ''}
                {c.cardsCount ? `${c.cardsCount} tarjetas · ` : ''}
                {c.deal ? `${c.deal.name} · ` : ''}
                {c.amountFromClient ? `cobrado ${money(c.amountFromClient)} · ` : ''}
                {c.autoCalc ? 'calculado' : 'monto directo'} · por {c.createdBy?.name}
              </p>
            </div>
            <span className="font-semibold text-red-600 whitespace-nowrap">−{money(c.amountToPartner)}</span>
            {!isClosed && <button onClick={() => startEdit(c)} className="text-gray-300 hover:text-brand-600" title="Corregir"><Pencil size={14} /></button>}
            {isSuper && !isClosed && (
              <button onClick={() => { if (confirm('¿Eliminar este registro?')) remove.mutate(c.id) }}
                className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ Ajustes ============
function SettingsModal({ settings, years, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    partnerName: settings.partnerName,
    defaultFx: settings.defaultFx, defaultIsr: settings.defaultIsr, defaultPartnerRate: settings.defaultPartnerRate, defaultIva: settings.defaultIva,
    dataCostPerMB: settings.dataCostPerMB ?? 0, dataSalePerMB: settings.dataSalePerMB ?? 0,
    dataFixedCostPerSim: settings.dataFixedCostPerSim ?? 0, dataFixedSalePerSim: settings.dataFixedSalePerSim ?? 0
  })
  const [closed, setClosed] = useState((settings.closedYears || '').split(',').map(y => parseInt(y)).filter(Boolean))
  const save = useMutation({
    mutationFn: () => api.patch('/partners/settings', { ...form, closedYears: closed }),
    onSuccess: () => { qc.invalidateQueries(['partners-summary']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
  const toggleYear = (y) => setClosed(c => c.includes(y) ? c.filter(x => x !== y) : [...c, y])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-5">
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

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">📶 Tarifas de datos (SIM)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">$/MB proveedor</label>
                <input type="number" step="0.0001" value={form.dataCostPerMB} onChange={set('dataCostPerMB')} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">$/MB al cliente</label>
                <input type="number" step="0.0001" value={form.dataSalePerMB} onChange={set('dataSalePerMB')} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Fijo mensual/SIM proveedor</label>
                <input type="number" step="0.01" value={form.dataFixedCostPerSim} onChange={set('dataFixedCostPerSim')} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Fijo mensual/SIM cliente</label>
                <input type="number" step="0.01" value={form.dataFixedSalePerSim} onChange={set('dataFixedSalePerSim')} className={inputCls} /></div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">🔒 Cierre de ejercicios</p>
            <p className="text-[10px] text-gray-400 mb-2">Un ejercicio cerrado no admite altas, cambios ni bajas de contratos, pagos o datos. Puedes reabrirlo cuando quieras.</p>
            <div className="flex flex-wrap gap-2">
              {years.map(y => (
                <button key={y} onClick={() => toggleYear(y)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border ${closed.includes(y) ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {closed.includes(y) ? <Lock size={11} /> : null} {y} {closed.includes(y) ? '· cerrado' : '· abierto'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-400">Los valores por defecto aplican a registros nuevos; cada contrato o registro puede ajustarse individualmente.</p>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
          {save.isPending ? 'Guardando...' : 'Guardar ajustes'}
        </button>
      </div>
    </div>
  )
}
