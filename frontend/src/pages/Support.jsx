import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { LifeBuoy, Plus, X, AlertTriangle, Clock, Star, UserCheck, CalendarClock, Search, Inbox, CheckCircle2, Building2 } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { brandForEmail } from '../lib/brand'
import { useSort, SortTh } from '../components/sortable'
import { CATEGORY, PRIORITY, STATUS, fmtDateTime, relTime, avatarColor, initials } from '../lib/support'

const PRIORITY_ORDER = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
const TICKET_SORTERS = {
  folio: t => t.folio,
  title: t => t.title,
  company: t => t.company || 'zz',
  status: t => Object.keys(STATUS).indexOf(t.status),
  priority: t => PRIORITY_ORDER[t.priority] || 0,
  assignee: t => t.assignee?.name || 'zz',
  sla: t => t.slaDueAt ? new Date(t.slaDueAt).getTime() : Infinity,
  created: t => new Date(t.createdAt).getTime()
}

export default function Support() {
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)
  const brandHex = brandForEmail(me?.email).hex500
  const [filters, setFilters] = useState({ status: 'ACTIVE', priority: '', assigneeId: '', q: '', mine: false })
  const [showNew, setShowNew] = useState(false)

  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
  if (filters.q) params.set('q', filters.q)
  if (filters.mine) params.set('mine', '1')

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', params.toString()],
    queryFn: () => api.get(`/support/tickets?${params}`).then(r => r.data),
    refetchInterval: 20000
  })
  const { data: metrics } = useQuery({
    queryKey: ['support-metrics'],
    queryFn: () => api.get('/support/metrics').then(r => r.data),
    refetchInterval: 60000
  })
  const { data: users } = useQuery({ queryKey: ['support-users'], queryFn: () => api.get('/support/users').then(r => r.data) })

  const { sorted, sortKey, sortDir, toggle } = useSort(tickets, TICKET_SORTERS, 'created')
  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white"
  const c = metrics?.counts

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><LifeBuoy size={22} className="text-brand-500" /> Soporte</h1>
          <p className="text-sm text-gray-500 mt-1">Tickets de clientes — atención, visitas y trazabilidad completa</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nuevo ticket
        </button>
      </div>

      {/* Métricas */}
      {c && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <Metric icon={Inbox} label="Activos" value={c.active} sub={`${c.OPEN} abiertos · ${c.IN_PROGRESS} en atención`} onClick={() => setFilters(f => ({ ...f, status: 'ACTIVE', assigneeId: '' }))} />
          <Metric icon={AlertTriangle} label="SLA vencido" value={c.overdue} danger={c.overdue > 0} sub="requieren acción" />
          <Metric icon={UserCheck} label="Sin asignar" value={c.unassigned} warn={c.unassigned > 0} onClick={() => setFilters(f => ({ ...f, status: 'ACTIVE', assigneeId: 'none' }))} />
          <Metric icon={Clock} label="1ª respuesta" value={metrics.avgFirstResponseHours != null ? `${metrics.avgFirstResponseHours.toFixed(1)} h` : '—'} sub="promedio 90 días" />
          <Metric icon={CheckCircle2} label="Resolución" value={metrics.avgResolutionHours != null ? `${metrics.avgResolutionHours.toFixed(0)} h` : '—'} sub={`${c.resolvedThisMonth} resueltos este mes`} />
          <Metric icon={Star} label="Satisfacción" value={metrics.avgRating != null ? `${metrics.avgRating.toFixed(1)} ★` : '—'} sub={`${metrics.ratingCount} calificaciones`} />
        </div>
      )}

      {/* Gráficas + próximas visitas */}
      {metrics && metrics.counts.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Tickets por mes</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.perMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="creados" name="Creados" fill={brandHex} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="resueltos" name="Resueltos" fill="#22C55E" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Por categoría</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.byCategory.map(x => ({ ...x, label: CATEGORY[x.name]?.label || x.name }))} dataKey="value" nameKey="label" innerRadius={38} outerRadius={62} paddingAngle={3}>
                    {metrics.byCategory.map((_, i) => <Cell key={i} fill={['#0EA5E9', '#F59E0B', '#8B5CF6', '#22C55E', '#DC2626', '#64748B'][i % 6]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><CalendarClock size={15} className="text-purple-500" /> Próximas visitas (7 días)</p>
            {metrics.upcomingVisits.length === 0 ? <p className="text-xs text-gray-400 py-8 text-center">Sin visitas programadas</p> : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {metrics.upcomingVisits.map(v => (
                  <button key={v.id} onClick={() => navigate(`/support/${v.ticket.id}`)} className="w-full text-left text-xs bg-purple-50/60 hover:bg-purple-50 rounded-lg px-2.5 py-2">
                    <p className="font-medium text-gray-900">{fmtDateTime(v.scheduledAt)}</p>
                    <p className="text-gray-500 truncate">{v.ticket.folio} · {v.ticket.company || v.ticket.title}{v.technician ? ` · ${v.technician.name}` : ''}</p>
                  </button>
                ))}
              </div>
            )}
            {metrics.byAssignee.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <p className="text-[10px] text-gray-400 mb-1">Carga activa por técnico</p>
                <div className="flex flex-wrap gap-1">
                  {metrics.byAssignee.map(a => <span key={a.name} className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5">{a.name}: <b>{a.value}</b></span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input value={filters.q} onChange={set('q')} placeholder="Folio, título, empresa, equipo..." className={inputCls + ' pl-8 w-60'} />
        </div>
        <select value={filters.status} onChange={set('status')} className={inputCls}>
          <option value="ACTIVE">Activos</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          <option value="">Todos</option>
        </select>
        <select value={filters.priority} onChange={set('priority')} className={inputCls}>
          <option value="">Toda prioridad</option>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filters.assigneeId} onChange={set('assigneeId')} className={inputCls}>
          <option value="">Todos los técnicos</option>
          <option value="none">Sin asignar</option>
          {users?.technicians.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={filters.mine} onChange={set('mine')} /> Mis tickets</label>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 whitespace-nowrap">
              <SortTh label="Folio" k="folio" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Ticket" k="title" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Cliente" k="company" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Estado" k="status" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Prioridad" k="priority" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Técnico" k="assignee" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="SLA" k="sla" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} />
              <SortTh label="Creado" k="created" {...{ sortKey, sortDir, onToggle: toggle }} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && sorted.length === 0 && <tr><td colSpan="8" className="px-4 py-12 text-center text-gray-400">Sin tickets con estos filtros 🎉</td></tr>}
            {sorted.map(t => {
              const st = STATUS[t.status], pr = PRIORITY[t.priority]
              return (
                <tr key={t.id} onClick={() => navigate(`/support/${t.id}`)} className={`cursor-pointer hover:bg-gray-50 ${t.slaOverdue ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{t.folio}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-900 line-clamp-1">{t.title}</p>
                    <p className="text-[10px] text-gray-400">{CATEGORY[t.category]?.icon} {CATEGORY[t.category]?.label} · {t._count.messages} msg{t._count.visits ? ` · ${t._count.visits} visita${t._count.visits > 1 ? 's' : ''}` : ''}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="flex items-center gap-1 text-gray-800"><Building2 size={12} className="text-gray-400" /> {t.company || '—'}</span>
                    <span className="text-gray-400">{t.createdBy?.name}</span>
                  </td>
                  <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${st?.chip}`}>{st?.label}</span></td>
                  <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pr?.chip}`}>{pr?.label}</span></td>
                  <td className="px-3 py-2.5 text-xs">
                    {t.assignee ? <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-full text-white text-[9px] font-semibold flex items-center justify-center" style={{ background: avatarColor(t.assignee.name) }}>{initials(t.assignee.name)}</span>{t.assignee.name}</span> : <span className="text-amber-600">Sin asignar</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {!t.isOpen ? <span className="text-gray-400">—</span>
                      : t.status === 'WAITING_CLIENT' ? <span className="text-purple-600">en pausa</span>
                      : t.slaOverdue ? <span className="text-red-600 font-semibold flex items-center gap-1"><AlertTriangle size={11} /> vencido {relTime(t.slaDueAt)}</span>
                      : <span className="text-gray-600">{relTime(t.slaDueAt)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{relTime(t.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showNew && <NewTicketModal users={users} onClose={() => setShowNew(false)} />}
    </div>
  )
}

function Metric({ icon: Icon, label, value, sub, danger, warn, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={`text-left rounded-xl border p-3 ${danger ? 'bg-red-50 border-red-200' : warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'} ${onClick ? 'hover:shadow-sm' : 'cursor-default'}`}>
      <p className="text-[11px] text-gray-500 flex items-center gap-1"><Icon size={12} className={danger ? 'text-red-500' : warn ? 'text-amber-500' : 'text-brand-500'} /> {label}</p>
      <p className={`text-xl font-semibold ${danger ? 'text-red-700' : warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
    </button>
  )
}

// Nuevo ticket a nombre de un cliente (reporte telefónico, visita, correo...)
function NewTicketModal({ users, onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({ clientId: '', company: '', title: '', description: '', category: 'FAILURE', priority: 'MEDIUM', location: '', equipment: '', assigneeId: '' })
  const create = useMutation({
    mutationFn: () => api.post('/support/tickets', form),
    onSuccess: (r) => { qc.invalidateQueries(['tickets']); qc.invalidateQueries(['support-metrics']); onClose(); navigate(`/support/${r.data.id}`) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
  const selectedClient = users?.clients.find(c => c.id === form.clientId)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Nuevo ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cliente registrado</label>
            <select value={form.clientId} onChange={set('clientId')} className={inputCls}>
              <option value="">Sin cuenta de cliente (reporte interno)</option>
              {users?.clients.map(c => <option key={c.id} value={c.id}>{c.company} — {c.name}</option>)}
            </select>
            {selectedClient ? <p className="text-[10px] text-gray-400 mt-1">El cliente verá este ticket en su portal y recibirá las notificaciones.</p>
              : <input value={form.company} onChange={set('company')} placeholder="Empresa (texto libre)" className={inputCls + ' mt-2'} />}
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Título *</label><input value={form.title} onChange={set('title')} placeholder="Ej: Medidor sin comunicación en subestación 3" className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Descripción *</label><textarea rows={3} value={form.description} onChange={set('description')} className={inputCls + ' resize-none'} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Categoría</label>
              <select value={form.category} onChange={set('category')} className={inputCls}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Prioridad</label>
              <select value={form.priority} onChange={set('priority')} className={inputCls}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label} · SLA {v.sla}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Ubicación / sitio</label><input value={form.location} onChange={set('location')} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Equipo / serie</label><input value={form.equipment} onChange={set('equipment')} className={inputCls} /></div>
            <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Asignar a</label>
              <select value={form.assigneeId} onChange={set('assigneeId')} className={inputCls}>
                <option value="">Sin asignar por ahora</option>
                {users?.technicians.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
          </div>
        </div>
        <button onClick={() => create.mutate()} disabled={!form.title.trim() || !form.description.trim() || create.isPending}
          className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
          {create.isPending ? 'Creando...' : 'Crear ticket'}
        </button>
      </div>
    </div>
  )
}
