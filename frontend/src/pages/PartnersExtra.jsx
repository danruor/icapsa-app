import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, ReferenceLine
} from 'recharts'
import { Plus, X, Pencil, Trash2, BookOpen, TrendingUp, Target, Wrench } from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import { brandForEmail } from '../lib/brand'
import api from '../lib/api'

const money = (n) => '$' + (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneyShort = (n) => {
  const v = Math.abs(n ?? 0)
  if (v >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k'
  return '$' + (n ?? 0).toFixed(0)
}
const PALETTE = ['#378ADD', '#EF9F27', '#9333EA', '#0891B2', '#DC2626', '#4F46E5', '#EA580C', '#BE185D']

function useBrandHex() {
  const user = useAuthStore(s => s.user)
  return brandForEmail(user?.email).hex500
}

// ================= CATÁLOGO =================
export function ConceptsView({ settings, isSuper }) {
  const qc = useQueryClient()
  const [edit, setEdit] = useState(null) // null | 'new' | concept
  const { data: concepts = [], isLoading } = useQuery({
    queryKey: ['partners-concepts'],
    queryFn: () => api.get('/partners/concepts').then(r => r.data)
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/partners/concepts/${id}`),
    onSuccess: () => qc.invalidateQueries(['partners-concepts']),
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Catálogo maestro — al usarlo en un contrato, los precios se copian y pueden ajustarse (varían por división, cliente o fecha).</p>
        <button onClick={() => setEdit('new')}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex-shrink-0">
          <Plus size={16} /> Nuevo concepto
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 whitespace-nowrap">
              <th className="px-3 py-3 font-medium">Concepto</th>
              <th className="px-3 py-3 font-medium">Costeo</th>
              <th className="px-3 py-3 font-medium text-right">Costo (MXN)</th>
              <th className="px-3 py-3 font-medium text-right">Venta (MXN)</th>
              <th className="px-3 py-3 font-medium text-right">Margen</th>
              <th className="px-3 py-3 font-medium text-center">Usos</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && concepts.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">Catálogo vacío — agrega tu primera tarjeta/concepto 📚</td></tr>
            )}
            {concepts.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5">
                  <button onClick={() => setEdit(c)} className="font-medium text-gray-900 hover:text-brand-600 text-left">{c.name}</button>
                  {c.description && <div className="text-xs text-gray-400 truncate max-w-[240px]">{c.description}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${c.costingMode === 'BREAKDOWN' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                    {c.costingMode === 'BREAKDOWN' ? <><Wrench size={10} /> Desglosado ({c.costParts.length})</> : 'Total'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">{money(c.calc.costMXN)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{money(c.calc.saleMXN)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-medium ${c.calc.marginPct >= 30 ? 'text-emerald-600' : c.calc.marginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                    {c.calc.marginPct.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-gray-500">{c._count.dealItems}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => setEdit(c)} className="text-gray-400 hover:text-brand-600 mr-2"><Pencil size={14} /></button>
                  {isSuper && (
                    <button onClick={() => { if (confirm(`¿Eliminar «${c.name}» del catálogo? Los contratos que lo usaron conservan sus precios.`)) remove.mutate(c.id) }}
                      className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && <ConceptModal concept={edit === 'new' ? null : edit} settings={settings} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ConceptModal({ concept, settings, onClose }) {
  const qc = useQueryClient()
  const brandHex = useBrandHex()
  const [form, setForm] = useState({
    name: concept?.name || '',
    description: concept?.description || '',
    costingMode: concept?.costingMode || 'TOTAL',
    costUnit: concept?.costUnit ?? '',
    costCurrency: concept?.costCurrency || 'USD',
    saleUnit: concept?.saleUnit ?? '',
    saleCurrency: concept?.saleCurrency || 'USD'
  })
  const [parts, setParts] = useState(
    concept?.costParts?.length
      ? concept.costParts.map(p => ({ label: p.label, amount: p.amount, currency: p.currency }))
      : [{ label: 'Manufactura', amount: '', currency: 'USD' }, { label: 'Componentes', amount: '', currency: 'USD' }, { label: 'Software', amount: '', currency: 'USD' }]
  )

  const { data: history = [] } = useQuery({
    queryKey: ['concept-history', concept?.id],
    queryFn: () => api.get(`/partners/concepts/${concept.id}/history`).then(r => r.data),
    enabled: !!concept
  })

  const fx = settings?.defaultFx || 19
  const partsSumMXN = parts.reduce((s, p) => s + (p.currency === 'USD' ? (parseFloat(p.amount) || 0) * fx : (parseFloat(p.amount) || 0)), 0)
  const costMXN = form.costingMode === 'BREAKDOWN' ? partsSumMXN
    : (form.costCurrency === 'USD' ? (parseFloat(form.costUnit) || 0) * fx : (parseFloat(form.costUnit) || 0))
  const saleMXN = form.saleCurrency === 'USD' ? (parseFloat(form.saleUnit) || 0) * fx : (parseFloat(form.saleUnit) || 0)
  const marginPct = saleMXN > 0 ? ((saleMXN - costMXN) / saleMXN) * 100 : 0

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, costParts: form.costingMode === 'BREAKDOWN' ? parts : [] }
      return concept ? api.patch(`/partners/concepts/${concept.id}`, payload) : api.post('/partners/concepts', payload)
    },
    onSuccess: () => { qc.invalidateQueries(['partners-concepts']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setPart = (i, k) => (e) => setParts(arr => arr.map((p, idx) => idx === i ? { ...p, [k]: e.target.value } : p))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
  const canSave = form.name.trim() && (form.costingMode !== 'BREAKDOWN' || parts.every(p => p.label.trim()))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{concept ? 'Editar concepto' : 'Nuevo concepto de catálogo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
            <input value={form.name} onChange={set('name')} placeholder="Ej: Tarjeta IoT Trifásica 79" className={inputCls} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">Descripción</label>
            <input value={form.description} onChange={set('description')} className={inputCls} />
          </div>
        </div>

        {/* Modo de costeo configurable */}
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1.5">Costeo interno</label>
          <div className="flex gap-2">
            {[{ k: 'TOTAL', label: 'Costo total' }, { k: 'BREAKDOWN', label: 'Desglosado (manufactura, componentes...)' }].map(m => (
              <button key={m.k} onClick={() => setForm(f => ({ ...f, costingMode: m.k }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${form.costingMode === m.k ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {form.costingMode === 'TOTAL' ? (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Costo unitario</label>
              <div className="flex gap-1">
                <input type="number" step="0.01" value={form.costUnit} onChange={set('costUnit')} className={inputCls} />
                <select value={form.costCurrency} onChange={set('costCurrency')} className="border border-gray-200 rounded-lg px-2 text-sm focus:outline-none"><option>USD</option><option>MXN</option></select>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 bg-purple-50/50 border border-purple-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-purple-700">Partes del costo (por unidad)</p>
              <button onClick={() => setParts(arr => [...arr, { label: '', amount: '', currency: 'USD' }])}
                className="text-xs font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1"><Plus size={12} /> Agregar parte</button>
            </div>
            <div className="space-y-1.5">
              {parts.map((p, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input value={p.label} onChange={setPart(i, 'label')} placeholder="Ej: Manufactura"
                    className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                  <input type="number" step="0.01" value={p.amount} onChange={setPart(i, 'amount')} placeholder="0.00"
                    className="w-28 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                  <select value={p.currency} onChange={setPart(i, 'currency')} className="border border-gray-200 rounded px-1 py-1.5 text-xs focus:outline-none">
                    <option>USD</option><option>MXN</option>
                  </select>
                  <button onClick={() => setParts(arr => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr)}
                    className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <p className="text-xs text-purple-700 font-medium mt-2 text-right">Costo total: {money(partsSumMXN)} MXN</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Precio de venta (referencia)</label>
            <div className="flex gap-1">
              <input type="number" step="0.01" value={form.saleUnit} onChange={set('saleUnit')} className={inputCls} />
              <select value={form.saleCurrency} onChange={set('saleCurrency')} className="border border-gray-200 rounded-lg px-2 text-sm focus:outline-none"><option>USD</option><option>MXN</option></select>
            </div>
          </div>
          <div className="flex items-end">
            <div className="bg-gray-50 rounded-lg px-3 py-2 w-full text-sm flex justify-between">
              <span className="text-gray-500 text-xs">Margen</span>
              <span className={`font-semibold ${marginPct >= 30 ? 'text-emerald-600' : marginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>{marginPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Historial de precios reales */}
        {concept && history.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Historial de precios en contratos</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history.map(h => ({ ...h, fecha: new Date(h.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={moneyShort} width={52} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Line type="monotone" dataKey="saleMXN" name="Venta MXN" stroke={brandHex} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="costMXN" name="Costo MXN" stroke="#9CA3AF" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-28 overflow-y-auto mt-1">
              {history.slice().reverse().map((h, i) => (
                <p key={i} className="text-[10px] text-gray-400 py-0.5">
                  {new Date(h.date).toLocaleDateString('es-MX')} · {h.client} · {h.deal} · {h.quantity} pzas → venta {money(h.saleMXN)}, costo {money(h.costMXN)}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!canSave || save.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">
            {save.isPending ? 'Guardando...' : 'Guardar concepto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ================= ANÁLISIS =================
export function AnalyticsView() {
  const brandHex = useBrandHex()
  const [gran, setGran] = useState('month')
  const { data, isLoading } = useQuery({
    queryKey: ['partners-analytics', gran],
    queryFn: () => api.get(`/partners/analytics?granularity=${gran}`).then(r => r.data)
  })

  if (isLoading) return <p className="text-center text-gray-400 py-16">Calculando análisis...</p>
  if (!data || data.byPeriod.length === 0)
    return <p className="text-center text-gray-400 py-16">Aún no hay contratos que analizar — registra el primero 📊</p>

  const topClient = data.byClient[0]
  const topDivision = data.byDivision[0]
  const totalSale = data.byType.reduce((s, t) => s + t.sale, 0)
  const totalUtility = data.byType.reduce((s, t) => s + t.utility, 0)
  const marginPct = totalSale > 0 ? (totalUtility / totalSale) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Insights rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">🏆 Mejor cliente (venta)</p>
          <p className="font-semibold text-gray-900">{topClient?.client || '—'}</p>
          <p className="text-xs text-gray-400">{topClient ? `${money(topClient.sale)} · utilidad ${money(topClient.utility)}` : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">⚡ División CFE líder</p>
          <p className="font-semibold text-gray-900">{topDivision?.division || 'Sin contratos CFE'}</p>
          <p className="text-xs text-gray-400">{topDivision ? `${money(topDivision.sale)} en venta` : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">📈 Margen bruto global</p>
          <p className={`font-semibold ${marginPct >= 30 ? 'text-emerald-600' : marginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>{marginPct.toFixed(1)}%</p>
          <p className="text-xs text-gray-400">Utilidad {money(totalUtility)} / Venta {money(totalSale)}</p>
        </div>
      </div>

      {/* Tendencia temporal */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Tendencia de venta, costo y utilidad neta</p>
          <div className="flex gap-1">
            {[{ k: 'day', l: 'Día' }, { k: 'month', l: 'Mes' }, { k: 'year', l: 'Año' }].map(g => (
              <button key={g.k} onClick={() => setGran(g.k)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${gran === g.k ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {g.l}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.byPeriod}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyShort} width={56} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Area type="monotone" dataKey="sale" name="Venta" stroke={brandHex} fill={brandHex} fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="cost" name="Costo" stroke="#9CA3AF" fill="#9CA3AF" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="net" name="Utilidad neta" stroke="#EF9F27" fill="#EF9F27" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por cliente/constructora */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Por cliente / constructora</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byClient.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={moneyShort} />
                <YAxis type="category" dataKey="client" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="sale" name="Venta" fill={brandHex} radius={[0, 3, 3, 0]} />
                <Bar dataKey="utility" name="Utilidad" fill="#EF9F27" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Por división CFE */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Por división CFE</p>
          {data.byDivision.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-16">Sin contratos CFE con división</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byDivision.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={moneyShort} />
                  <YAxis type="category" dataKey="division" tick={{ fontSize: 10 }} width={110} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend />
                  <Bar dataKey="sale" name="Venta" fill={brandHex} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="net" name="Neta" fill="#22C55E" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* CFE vs Privados */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">CFE vs Privados</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.byType} dataKey="sale" nameKey="type" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {data.byType.map((_, i) => <Cell key={i} fill={i === 0 ? '#22C55E' : brandHex} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 text-sm">
            {data.byType.map((t, i) => (
              <div key={t.type} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? '#22C55E' : brandHex }} />
                  {t.type} <span className="text-xs text-gray-400">({t.count} contratos)</span>
                </span>
                <span className="font-medium">{money(t.sale)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ================= COMPETENCIA =================
export function CompetitorsView({ settings, isSuper }) {
  const qc = useQueryClient()
  const brandHex = useBrandHex()
  const fx = settings?.defaultFx || 19
  const [conceptFilter, setConceptFilter] = useState('')
  const [form, setForm] = useState({
    competitor: '', price: '', currency: 'MXN', priceType: 'SALE',
    conceptId: '', context: '', date: new Date().toISOString().split('T')[0], notes: ''
  })

  const { data: concepts = [] } = useQuery({
    queryKey: ['partners-concepts'],
    queryFn: () => api.get('/partners/concepts').then(r => r.data)
  })
  const { data: prices = [], isLoading } = useQuery({
    queryKey: ['partners-competitors'],
    queryFn: () => api.get('/partners/competitor-prices').then(r => r.data)
  })

  const create = useMutation({
    mutationFn: () => api.post('/partners/competitor-prices', form),
    onSuccess: () => {
      setForm(f => ({ ...f, competitor: '', price: '', context: '', notes: '' }))
      qc.invalidateQueries(['partners-competitors'])
    },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/partners/competitor-prices/${id}`),
    onSuccess: () => qc.invalidateQueries(['partners-competitors']),
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  // Comparativa del concepto seleccionado
  const selectedConcept = concepts.find(c => c.id === conceptFilter)
  const compareData = useMemo(() => {
    if (!selectedConcept) return []
    const rows = [
      { name: 'ICAPSA costo', value: selectedConcept.calc.costMXN, kind: 'cost' },
      { name: 'ICAPSA venta', value: selectedConcept.calc.saleMXN, kind: 'ours' }
    ]
    for (const p of prices.filter(p => p.conceptId === conceptFilter)) {
      rows.push({
        name: `${p.competitor}${p.priceType === 'COST' ? ' (costo)' : ''}`,
        value: p.currency === 'USD' ? p.price * fx : p.price,
        kind: 'competitor'
      })
    }
    return rows
  }, [selectedConcept, prices, conceptFilter, fx])

  const competitorAvg = useMemo(() => {
    const comp = compareData.filter(r => r.kind === 'competitor')
    return comp.length ? comp.reduce((s, r) => s + r.value, 0) / comp.length : null
  }, [compareData])

  const filtered = conceptFilter ? prices.filter(p => p.conceptId === conceptFilter) : prices

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
        <Target size={15} className="flex-shrink-0 mt-0.5" />
        <span>Registra los precios de competidores que detecten en licitaciones y obras. Al vincularlos a un concepto del catálogo, la gráfica compara tu costo y tu precio contra cada competidor — la base para decidir dónde apretar.</span>
      </div>

      {/* Registrar precio de competencia */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Registrar precio de competidor</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]"><label className="block text-[10px] text-gray-400 mb-0.5">Competidor *</label>
            <input value={form.competitor} onChange={set('competitor')} placeholder="Empresa" className={inputCls + ' w-full'} /></div>
          <div className="w-32"><label className="block text-[10px] text-gray-400 mb-0.5">Precio *</label>
            <input type="number" step="0.01" value={form.price} onChange={set('price')} className={inputCls + ' w-full'} /></div>
          <div><label className="block text-[10px] text-gray-400 mb-0.5">Moneda</label>
            <select value={form.currency} onChange={set('currency')} className={inputCls}><option>MXN</option><option>USD</option></select></div>
          <div><label className="block text-[10px] text-gray-400 mb-0.5">Tipo</label>
            <select value={form.priceType} onChange={set('priceType')} className={inputCls}>
              <option value="SALE">Venta</option><option value="COST">Costo (est.)</option>
            </select></div>
          <div className="min-w-[150px]"><label className="block text-[10px] text-gray-400 mb-0.5">Concepto (nuestro)</label>
            <select value={form.conceptId} onChange={set('conceptId')} className={inputCls + ' w-full'}>
              <option value="">Sin vincular</option>
              {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="flex-1 min-w-[140px]"><label className="block text-[10px] text-gray-400 mb-0.5">Contexto</label>
            <input value={form.context} onChange={set('context')} placeholder="Licitación, constructora, división..." className={inputCls + ' w-full'} /></div>
          <div><label className="block text-[10px] text-gray-400 mb-0.5">Fecha</label>
            <input type="date" value={form.date} onChange={set('date')} className={inputCls} /></div>
          <button onClick={() => create.mutate()} disabled={!form.competitor.trim() || !form.price || create.isPending}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40">
            {create.isPending ? '...' : 'Registrar'}
          </button>
        </div>
      </div>

      {/* Comparativa gráfica */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-700">Comparativa por tarjeta/concepto</p>
          <select value={conceptFilter} onChange={e => setConceptFilter(e.target.value)} className={inputCls}>
            <option value="">Selecciona un concepto...</option>
            {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {!selectedConcept ? (
          <p className="text-center text-gray-400 text-sm py-12">Elige un concepto del catálogo para comparar contra la competencia</p>
        ) : compareData.length <= 2 ? (
          <p className="text-center text-gray-400 text-sm py-12">Sin precios de competidores vinculados a «{selectedConcept.name}» — registra el primero arriba</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={54} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyShort} width={56} />
                  <Tooltip formatter={(v) => money(v)} />
                  {competitorAvg && <ReferenceLine y={competitorAvg} stroke="#DC2626" strokeDasharray="4 4" label={{ value: 'Prom. competencia', fontSize: 10, fill: '#DC2626', position: 'insideTopRight' }} />}
                  <Bar dataKey="value" name="Precio MXN" radius={[4, 4, 0, 0]}>
                    {compareData.map((r, i) => (
                      <Cell key={i} fill={r.kind === 'cost' ? '#9CA3AF' : r.kind === 'ours' ? brandHex : PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {competitorAvg && (
              <p className="text-xs text-gray-500 mt-2">
                {selectedConcept.calc.saleMXN > competitorAvg
                  ? `⚠️ Tu precio (${money(selectedConcept.calc.saleMXN)}) está ${(((selectedConcept.calc.saleMXN - competitorAvg) / competitorAvg) * 100).toFixed(1)}% ARRIBA del promedio competidor (${money(competitorAvg)}).`
                  : `✅ Tu precio (${money(selectedConcept.calc.saleMXN)}) está ${(((competitorAvg - selectedConcept.calc.saleMXN) / competitorAvg) * 100).toFixed(1)}% ABAJO del promedio competidor (${money(competitorAvg)}).`}
                {' '}Margen sobre tu costo: {selectedConcept.calc.saleMXN > 0 ? (((selectedConcept.calc.saleMXN - selectedConcept.calc.costMXN) / selectedConcept.calc.saleMXN) * 100).toFixed(1) : 0}%.
              </p>
            )}
          </>
        )}
      </div>

      {/* Tabla de registros */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {isLoading && <p className="text-center text-gray-400 text-sm py-8">Cargando...</p>}
        {!isLoading && filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin precios de competencia registrados</p>}
        {filtered.map(p => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{p.competitor} <span className={`text-[10px] px-1.5 py-0.5 rounded ml-1 ${p.priceType === 'COST' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'}`}>{p.priceType === 'COST' ? 'costo est.' : 'venta'}</span></p>
              <p className="text-xs text-gray-400">
                {p.concept ? `${p.concept.name} · ` : ''}{p.context ? `${p.context} · ` : ''}
                {new Date(p.date).toLocaleDateString('es-MX')} · por {p.createdBy?.name}
              </p>
            </div>
            <span className="font-semibold text-gray-900 whitespace-nowrap">{money(p.price)} <span className="text-[10px] text-gray-400">{p.currency}</span></span>
            {isSuper && (
              <button onClick={() => { if (confirm('¿Eliminar este registro?')) remove.mutate(p.id) }}
                className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
