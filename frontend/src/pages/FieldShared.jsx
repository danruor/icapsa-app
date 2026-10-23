import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, CheckCircle2, AlertTriangle, Users, Clock, ChevronLeft, ChevronRight, MapPin, History, CalendarDays, Save } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { STAGE, STAGE_ORDER, LOG_KIND, HEALTH, INFILTRATION, SITE_TYPE, fmtDate, fmtDateTime, todayInput, dateInput, dayDiff } from '../lib/field'

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

// ===================================================================
// BITÁCORA DIARIA
// ===================================================================
export function LogBook({ projectId, siteId, sites = [], compact = false }) {
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const isSuper = me?.role === 'SUPER_ADMIN'
  const [form, setForm] = useState({ kind: 'NOTE', body: '', blocking: false, logDate: todayInput(), siteId: siteId || '' })
  const [filter, setFilter] = useState('ALL')
  const q = siteId ? `siteId=${siteId}` : `projectId=${projectId}`
  const { data: logs = [], isLoading } = useQuery({ queryKey: ['field-logs', q], queryFn: () => api.get(`/field/logs?${q}`).then(r => r.data) })
  const inv = () => { qc.invalidateQueries(['field-logs']); qc.invalidateQueries(['field-site']); qc.invalidateQueries(['field-project']); qc.invalidateQueries(['field-schedule']) }
  const create = useMutation({
    mutationFn: () => api.post('/field/logs', { ...form, projectId, siteId: form.siteId || siteId || null }),
    onSuccess: () => { setForm(f => ({ ...f, body: '', blocking: false })); inv() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const resolve = useMutation({ mutationFn: ({ id, resolved }) => api.patch(`/field/logs/${id}`, { resolved }), onSuccess: inv })
  const remove = useMutation({ mutationFn: (id) => api.delete(`/field/logs/${id}`), onSuccess: inv, onError: (e) => alert(e.response?.data?.error || 'Error') })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const shown = filter === 'ALL' ? logs : filter === 'OPEN' ? logs.filter(l => l.blocking && !l.resolvedAt) : logs.filter(l => l.kind === filter)
  const openBlocking = logs.filter(l => l.blocking && !l.resolvedAt).length

  return (
    <div className="space-y-3">
      {/* Captura */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex gap-1 flex-wrap">
          {Object.entries(LOG_KIND).map(([k, v]) => (
            <button key={k} onClick={() => setForm(f => ({ ...f, kind: k }))} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${form.kind === k ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600'}`}>{v.icon} {v.label}</button>
          ))}
        </div>
        <textarea rows={compact ? 2 : 3} value={form.body} onChange={set('body')}
          placeholder={form.kind === 'DELAY' ? '¿Por qué no se está avanzando? (ej. CFE no liberó la bóveda, faltó material, lluvia...)' : form.kind === 'ISSUE' ? 'Describe el problema encontrado...' : 'Qué pasó hoy...'}
          className={inputCls + ' resize-none text-base'} />
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={form.logDate} onChange={set('logDate')} max={todayInput()} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          {!siteId && sites.length > 0 && (
            <select value={form.siteId} onChange={set('siteId')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]">
              <option value="">Toda la obra</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          )}
          {['ISSUE', 'DELAY', 'SAFETY', 'CLIENT'].includes(form.kind) && (
            <label className="flex items-center gap-1.5 text-xs text-red-700 font-medium cursor-pointer"><input type="checkbox" checked={form.blocking} onChange={set('blocking')} /> 🛑 Detiene el avance</label>
          )}
          <button onClick={() => create.mutate()} disabled={!form.body.trim() || create.isPending} className="ml-auto bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40">{create.isPending ? '...' : 'Registrar'}</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap items-center">
        {[{ k: 'ALL', l: `Todo (${logs.length})` }, { k: 'OPEN', l: `🛑 Bloqueos abiertos (${openBlocking})` }, { k: 'ISSUE', l: 'Problemas' }, { k: 'DELAY', l: 'Retrasos' }, { k: 'PROGRESS', l: 'Avances' }].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${filter === f.k ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-100'} ${f.k === 'OPEN' && openBlocking ? 'text-red-600' : ''}`}>{f.l}</button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {isLoading && <p className="text-center text-gray-400 text-sm py-6">Cargando...</p>}
        {!isLoading && shown.length === 0 && <p className="text-center text-gray-400 text-sm py-6">Sin notas</p>}
        {shown.map(l => {
          const k = LOG_KIND[l.kind] || LOG_KIND.NOTE
          const open = l.blocking && !l.resolvedAt
          return (
            <div key={l.id} className={`bg-white rounded-xl border p-3 ${open ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`px-1.5 py-0.5 rounded font-medium ${k.chip}`}>{k.icon} {k.label}</span>
                {l.blocking && <span className={`px-1.5 py-0.5 rounded font-semibold ${open ? 'bg-red-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>{open ? '🛑 Bloqueante' : '✅ Resuelto'}</span>}
                {!siteId && l.site && <span className="text-gray-500">{l.site.code}</span>}
                <span className="text-gray-400 ml-auto">{fmtDate(l.logDate)} · {l.author?.name}</span>
              </div>
              <p className="text-sm text-gray-800 mt-1.5 whitespace-pre-wrap">{l.body}</p>
              <div className="flex gap-3 mt-1.5 text-xs">
                {l.blocking && <button onClick={() => resolve.mutate({ id: l.id, resolved: open })} className={open ? 'text-emerald-700 font-medium' : 'text-gray-400'}>{open ? 'Marcar resuelto' : 'Reabrir'}</button>}
                {(l.author?.id === me?.id || isSuper) && <button onClick={() => { if (confirm('¿Eliminar esta nota?')) remove.mutate(l.id) }} className="text-gray-300 hover:text-red-500">Eliminar</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===================================================================
// ASISTENCIA DIARIA — quién trabajó, en qué bóveda
// ===================================================================
export function AttendanceSheet({ projectId, sites = [] }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(todayInput())
  const [rows, setRows] = useState(null)
  const { data: crew = [] } = useQuery({ queryKey: ['field-crew', projectId], queryFn: () => api.get(`/field/crew?projectId=${projectId}`).then(r => r.data) })
  const { data: saved = [], isFetching } = useQuery({ queryKey: ['field-attendance', projectId, date], queryFn: () => api.get(`/field/attendance?projectId=${projectId}&date=${date}`).then(r => r.data) })
  const { data: history = [] } = useQuery({ queryKey: ['field-attendance', projectId, 'all'], queryFn: () => api.get(`/field/attendance?projectId=${projectId}`).then(r => r.data) })

  // Inicializar renglones del día desde lo guardado (o cuadrilla habitual si el día está vacío)
  const current = rows ?? (saved.length
    ? saved.map(a => ({ workerName: a.workerName, workerId: a.workerId || '', siteId: a.siteId || '', hours: a.hours ?? '', role: a.role || '' }))
    : [])
  const save = useMutation({
    mutationFn: () => api.post('/field/attendance', { projectId, workDate: date, entries: current.filter(r => r.workerName.trim()) }),
    onSuccess: () => { setRows(null); qc.invalidateQueries(['field-attendance']); qc.invalidateQueries(['field-crew']); qc.invalidateQueries(['field-schedule']); qc.invalidateQueries(['field-site']) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const upd = (i, k, v) => setRows(arr => (arr ?? current).map((r, j) => j === i ? { ...r, [k]: v } : r))
  const add = (preset) => setRows(arr => [...(arr ?? current), { workerName: preset?.workerName || '', workerId: preset?.workerId || '', siteId: '', hours: 8, role: preset?.role || '' }])
  const del = (i) => setRows(arr => (arr ?? current).filter((_, j) => j !== i))
  const notAdded = crew.filter(c => !current.some(r => r.workerName === c.workerName))

  // Resumen por día (últimos 14)
  const byDay = useMemo(() => {
    const m = {}
    for (const a of history) { const d = dateInput(a.workDate); m[d] = m[d] || { workers: new Set(), hours: 0, sites: new Set() }; m[d].workers.add(a.workerName); m[d].hours += a.hours || 0; if (a.site) m[d].sites.add(a.site.code) }
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)
  }, [history])

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Users size={16} className="text-brand-500" /><p className="text-sm font-semibold text-gray-800">¿Quién trabajó?</p>
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setRows(null) }} max={todayInput()} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm ml-auto" />
        </div>
        {isFetching && rows === null && <p className="text-xs text-gray-400 mb-2">Cargando el día...</p>}
        <div className="space-y-2">
          {current.map((r, i) => (
            <div key={i} className="flex gap-1.5 items-center bg-gray-50 rounded-lg p-2">
              <input value={r.workerName} onChange={e => upd(i, 'workerName', e.target.value)} placeholder="Nombre" list="crew-names" className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white" />
              <select value={r.siteId} onChange={e => upd(i, 'siteId', e.target.value)} className="w-28 border border-gray-200 rounded px-1 py-1.5 text-xs bg-white">
                <option value="">Sin bóveda</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
              <input type="number" inputMode="decimal" step="0.5" min="0" max="24" value={r.hours} onChange={e => upd(i, 'hours', e.target.value)} className="w-14 border border-gray-200 rounded px-1 py-1.5 text-sm text-center bg-white" title="Horas" />
              <button onClick={() => del(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
          <datalist id="crew-names">{crew.map(c => <option key={c.workerName} value={c.workerName} />)}</datalist>
        </div>
        {notAdded.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {notAdded.map(c => <button key={c.workerName} onClick={() => add(c)} className="text-xs bg-brand-50 text-brand-700 rounded-full px-2.5 py-1 flex items-center gap-1"><Plus size={11} /> {c.workerName}</button>)}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => add()} className="flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-2"><Plus size={13} /> Otra persona</button>
          <span className="text-xs text-gray-400 ml-auto">{current.length} personas · {current.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0)} h</span>
          <button onClick={() => save.mutate()} disabled={save.isPending || current.length === 0} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"><Save size={14} /> {save.isPending ? '...' : 'Guardar día'}</button>
        </div>
      </div>

      {byDay.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pt-3 pb-1">Últimos días</p>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 text-left border-b border-gray-100"><th className="px-3 py-2">Día</th><th className="px-3 py-2 text-right">Personas</th><th className="px-3 py-2 text-right">Horas</th><th className="px-3 py-2">Bóvedas</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {byDay.map(([d, v]) => (
                <tr key={d} className="cursor-pointer hover:bg-gray-50" onClick={() => { setDate(d); setRows(null) }}>
                  <td className="px-3 py-2">{fmtDate(d)}</td><td className="px-3 py-2 text-right">{v.workers.size}</td><td className="px-3 py-2 text-right">{v.hours}</td><td className="px-3 py-2 text-xs text-gray-500">{[...v.sites].join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ===================================================================
// PROGRAMA DE OBRA — tabla + Gantt (planeado vs real)
// ===================================================================
export function ScheduleView({ projectId, editable, onOpenSite }) {
  const qc = useQueryClient()
  const [view, setView] = useState('gantt')
  const { data, isLoading } = useQuery({ queryKey: ['field-schedule', projectId], queryFn: () => api.get(`/field/projects/${projectId}/schedule`).then(r => r.data) })
  const patch = useMutation({ mutationFn: ({ id, body }) => api.patch(`/field/sites/${id}`, body), onSuccess: () => { qc.invalidateQueries(['field-schedule', projectId]); qc.invalidateQueries(['field-project', projectId]) }, onError: (e) => alert(e.response?.data?.error || 'Error') })
  if (isLoading || !data) return <p className="text-center text-gray-400 text-sm py-8">Calculando programa...</p>
  const { sites, totals } = data
  if (sites.length === 0) return <p className="text-center text-gray-400 text-sm py-8">Sin bóvedas en la obra</p>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Bóvedas" value={`${totals.done}/${totals.sites}`} sub="terminadas" />
        <Kpi label="Días planeados" value={totals.plannedDays || '—'} sub={totals.avgPlannedDays ? `prom. ${totals.avgPlannedDays.toFixed(1)}/bóveda` : 'sin programa'} />
        <Kpi label="Días reales" value={totals.actualDays} sub={totals.avgActualDays ? `prom. ${totals.avgActualDays.toFixed(1)}/bóveda terminada` : ''} warn={totals.plannedDays && totals.actualDays > totals.plannedDays} />
        <Kpi label="Alertas" value={totals.blocked + totals.overdue} sub={`${totals.blocked} bloqueadas · ${totals.overdue} vencidas`} warn={totals.blocked + totals.overdue > 0} />
      </div>
      <div className="flex gap-1">
        {[{ k: 'gantt', l: 'Gantt' }, { k: 'table', l: 'Tabla' }].map(v => <button key={v.k} onClick={() => setView(v.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === v.k ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{v.l}</button>)}
        <div className="ml-auto flex gap-2 text-[10px] text-gray-500 items-center flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-gray-300 inline-block" /> planeado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-brand-500 inline-block" /> real</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-500 inline-block" /> retraso</span>
        </div>
      </div>
      {view === 'gantt' ? <Gantt sites={sites} onOpenSite={onOpenSite} /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead><tr className="text-xs text-gray-500 text-left border-b border-gray-100">
              <th className="px-3 py-2.5">Bóveda</th><th className="px-3 py-2.5">Etapa</th><th className="px-3 py-2.5">Inicio plan.</th><th className="px-3 py-2.5">Fin plan.</th><th className="px-3 py-2.5 text-right">Días plan.</th><th className="px-3 py-2.5">Inicio real</th><th className="px-3 py-2.5">Fin real</th><th className="px-3 py-2.5 text-right">Días reales</th><th className="px-3 py-2.5 text-right">Horas</th><th className="px-3 py-2.5 text-right">Desv.</th><th className="px-3 py-2.5">Estado</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {sites.map(s => {
                const h = HEALTH[s.health]
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2"><button onClick={() => onOpenSite?.(s.id)} className="font-medium text-gray-900 hover:text-brand-600 text-left">{s.code}</button><div className="text-[10px] text-gray-400 truncate max-w-[160px]">{s.name}</div></td>
                    <td className="px-3 py-2"><span className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium" style={{ background: STAGE[s.stage]?.color }}>{STAGE[s.stage]?.short}</span></td>
                    <td className="px-3 py-2">{editable ? <input type="date" value={dateInput(s.plannedStart)} onChange={e => patch.mutate({ id: s.id, body: { plannedStart: e.target.value || null } })} className="border border-gray-200 rounded px-1 py-0.5 text-xs" /> : fmtDate(s.plannedStart)}</td>
                    <td className="px-3 py-2">{editable ? <input type="date" value={dateInput(s.plannedEnd)} onChange={e => patch.mutate({ id: s.id, body: { plannedEnd: e.target.value || null } })} className="border border-gray-200 rounded px-1 py-0.5 text-xs" /> : fmtDate(s.plannedEnd)}</td>
                    <td className="px-3 py-2 text-right">{editable ? <input type="number" min="0" value={s.plannedDays ?? ''} onChange={e => patch.mutate({ id: s.id, body: { plannedDays: e.target.value } })} className="w-14 border border-gray-200 rounded px-1 py-0.5 text-xs text-right" /> : (s.plannedDays ?? '—')}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(s.actualStart)}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(s.actualEnd)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${s.plannedDays && s.actualDays > s.plannedDays ? 'text-red-600' : ''}`}>{s.actualDays}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{s.hours ? s.hours.toFixed(0) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-medium ${s.delayDays > 0 ? 'text-red-600' : s.delayDays < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{s.delayDays === null ? '—' : s.delayDays > 0 ? `+${s.delayDays} d` : `${s.delayDays} d`}</td>
                    <td className="px-3 py-2"><span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ background: h?.color }}>{h?.label}</span>{s.openBlocking > 0 && <span className="text-[10px] text-red-600 ml-1">🛑 {s.openBlocking}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, warn }) {
  return <div className={`rounded-xl border p-3 ${warn ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}><p className="text-[11px] text-gray-500">{label}</p><p className={`text-lg font-semibold ${warn ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>{sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}</div>
}

function Gantt({ sites, onOpenSite }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dates = []
  for (const s of sites) for (const d of [s.plannedStart, s.plannedEnd, s.actualStart, s.actualEnd]) if (d) dates.push(new Date(d))
  if (dates.length === 0) return <p className="text-center text-gray-400 text-sm py-8">Captura fechas planeadas o registra actividad para ver el Gantt</p>
  dates.push(today)
  const min = new Date(Math.min(...dates)); min.setDate(min.getDate() - 2)
  const max = new Date(Math.max(...dates)); max.setDate(max.getDate() + 3)
  const total = Math.max(7, dayDiff(min, max))
  const pct = (d) => `${(dayDiff(min, d) / total) * 100}%`
  const width = (a, b) => `${Math.max(0.8, (dayDiff(a, b) + 1) / total * 100)}%`
  // marcas de semanas
  const ticks = []
  for (let d = new Date(min); d <= max; d.setDate(d.getDate() + 1)) if (d.getDay() === 1 || ticks.length === 0) ticks.push(new Date(d))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="flex border-b border-gray-100">
          <div className="w-40 flex-shrink-0 px-3 py-2 text-xs text-gray-500">Bóveda</div>
          <div className="flex-1 relative h-8">
            {ticks.map((t, i) => <div key={i} className="absolute top-0 h-full border-l border-gray-100 text-[9px] text-gray-400 pl-1 pt-1" style={{ left: pct(t) }}>{t.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</div>)}
            <div className="absolute top-0 h-full border-l-2 border-dashed border-brand-500" style={{ left: pct(today) }} title="Hoy" />
          </div>
        </div>
        {sites.map(s => {
          const h = HEALTH[s.health]
          const actualEnd = s.actualEnd || (s.actualStart ? today : null)
          const late = s.plannedEnd && actualEnd && new Date(actualEnd) > new Date(s.plannedEnd)
          return (
            <div key={s.id} className="flex border-b border-gray-50 hover:bg-gray-50/60">
              <button onClick={() => onOpenSite?.(s.id)} className="w-40 flex-shrink-0 px-3 py-2 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">{s.code}</p>
                <p className="text-[10px] truncate" style={{ color: h?.color }}>{h?.label}{s.openBlocking ? ` · 🛑${s.openBlocking}` : ''}</p>
              </button>
              <div className="flex-1 relative h-12">
                <div className="absolute top-0 h-full border-l-2 border-dashed border-brand-300/50" style={{ left: pct(today) }} />
                {s.plannedStart && s.plannedEnd && <div className="absolute top-2 h-2.5 rounded-sm bg-gray-300" style={{ left: pct(s.plannedStart), width: width(s.plannedStart, s.plannedEnd) }} title={`Planeado: ${fmtDate(s.plannedStart)} → ${fmtDate(s.plannedEnd)} (${s.plannedDays} d)`} />}
                {s.actualStart && (
                  <>
                    <div className="absolute top-6 h-3 rounded-sm" style={{ left: pct(s.actualStart), width: width(s.actualStart, late && s.plannedEnd ? s.plannedEnd : actualEnd), background: STAGE[s.stage]?.color || '#2563EB' }} title={`Real: ${fmtDate(s.actualStart)} → ${s.actualEnd ? fmtDate(s.actualEnd) : 'en curso'} (${s.actualDays} días trabajados)`} />
                    {late && <div className="absolute top-6 h-3 rounded-r-sm bg-red-500" style={{ left: pct(new Date(new Date(s.plannedEnd).getTime() + 86400000)), width: width(new Date(new Date(s.plannedEnd).getTime() + 86400000), actualEnd) }} title={`Retraso: +${s.delayDays} días`} />}
                  </>
                )}
                {s.status === 'DONE' && s.actualEnd && <CheckCircle2 size={12} className="absolute top-6 text-emerald-600" style={{ left: `calc(${pct(s.actualEnd)} + 4px)` }} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===================================================================
// CALENDARIO DE CAMPO (mes): programa + reportes + bitácora + asistencia
// ===================================================================
export function FieldCalendar({ projectId, onOpenSite, onOpenReport }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [sel, setSel] = useState(null)
  const { data, isLoading } = useQuery({ queryKey: ['field-calendar', projectId || 'all', month], queryFn: () => api.get(`/field/calendar?month=${month}${projectId ? `&projectId=${projectId}` : ''}`).then(r => r.data) })
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1); const daysInMonth = new Date(y, m, 0).getDate()
  const offset = (first.getDay() + 6) % 7 // lunes = 0
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); setSel(null) }
  const key = (day) => `${month}-${String(day).padStart(2, '0')}`
  const byDay = useMemo(() => {
    const map = {}
    const push = (d, item) => { (map[d] = map[d] || []).push(item) }
    if (!data) return map
    for (const r of data.reports) push(dateInput(r.reportDate), { t: 'report', ...r })
    for (const l of data.logs) push(dateInput(l.logDate), { t: 'log', ...l })
    for (const a of data.attendance) push(a.day, { t: 'att', ...a })
    for (const s of data.sites) {
      if (s.plannedStart) push(dateInput(s.plannedStart), { t: 'plan-start', ...s })
      if (s.plannedEnd) push(dateInput(s.plannedEnd), { t: 'plan-end', ...s })
      if (s.actualEnd) push(dateInput(s.actualEnd), { t: 'done', ...s })
    }
    return map
  }, [data])
  const todayKey = todayInput()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
        <p className="text-sm font-semibold text-gray-800 capitalize">{first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</p>
        <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} /></button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-2">
        <div className="grid grid-cols-7 text-[10px] text-gray-400 text-center mb-1">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => <div key={'e' + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const k = key(i + 1); const items = byDay[k] || []
            const att = items.find(x => x.t === 'att'); const reports = items.filter(x => x.t === 'report').length
            const block = items.some(x => x.t === 'log' && x.blocking && !x.resolvedAt); const issues = items.filter(x => x.t === 'log' && ['ISSUE', 'DELAY', 'SAFETY'].includes(x.kind)).length
            const plan = items.filter(x => x.t === 'plan-start' || x.t === 'plan-end').length; const done = items.filter(x => x.t === 'done').length
            return (
              <button key={k} onClick={() => setSel(sel === k ? null : k)} className={`min-h-[52px] rounded-lg border p-1 text-left ${sel === k ? 'border-brand-500 bg-brand-50' : k === todayKey ? 'border-brand-300' : 'border-gray-100'} ${items.length ? 'bg-white' : 'bg-gray-50/50'}`}>
                <p className={`text-[11px] ${k === todayKey ? 'font-bold text-brand-600' : 'text-gray-600'}`}>{i + 1}</p>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {att && <span className="text-[9px] bg-sky-100 text-sky-700 rounded px-1" title={`${att.workers.length} personas`}>👷{att.workers.length}</span>}
                  {reports > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-700 rounded px-1">📋{reports}</span>}
                  {block && <span className="text-[9px] bg-red-600 text-white rounded px-1">🛑</span>}
                  {!block && issues > 0 && <span className="text-[9px] bg-amber-100 text-amber-700 rounded px-1">⚠️{issues}</span>}
                  {plan > 0 && <span className="text-[9px] bg-gray-200 text-gray-600 rounded px-1">📅</span>}
                  {done > 0 && <span className="text-[9px] bg-emerald-600 text-white rounded px-1">✓</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      {isLoading && <p className="text-center text-gray-400 text-xs">Cargando...</p>}
      {sel && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-800">{fmtDate(sel)}</p>
          {(byDay[sel] || []).length === 0 && <p className="text-xs text-gray-400">Sin actividad registrada</p>}
          {(byDay[sel] || []).map((x, i) => {
            if (x.t === 'att') return <p key={i} className="text-xs text-sky-800 bg-sky-50 rounded-lg px-2 py-1.5">👷 {x.workers.join(', ')} · {x.hours} h{x.sites.length ? ` · ${x.sites.join(', ')}` : ''}</p>
            if (x.t === 'report') return <button key={i} onClick={() => onOpenReport?.(x.id)} className="w-full text-left text-xs text-emerald-800 bg-emerald-50 rounded-lg px-2 py-1.5">📋 {x.folio} · {x.site?.code} · {STAGE[x.stage]?.label} · {x.author?.name}</button>
            if (x.t === 'log') { const k = LOG_KIND[x.kind]; return <p key={i} className={`text-xs rounded-lg px-2 py-1.5 ${x.blocking && !x.resolvedAt ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'}`}>{k?.icon} {x.site?.code ? `${x.site.code} · ` : ''}{x.body.slice(0, 140)} <span className="text-gray-400">· {x.author?.name}</span></p> }
            if (x.t === 'plan-start') return <button key={i} onClick={() => onOpenSite?.(x.id)} className="w-full text-left text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5">📅 Inicio planeado: {x.code}</button>
            if (x.t === 'plan-end') return <button key={i} onClick={() => onOpenSite?.(x.id)} className="w-full text-left text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5">🏁 Fin planeado: {x.code}</button>
            if (x.t === 'done') return <button key={i} onClick={() => onOpenSite?.(x.id)} className="w-full text-left text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5">✓ Terminada: {x.code}</button>
            return null
          })}
        </div>
      )}
    </div>
  )
}

// ===================================================================
// HISTORIAL (trazabilidad inmutable de la bóveda)
// ===================================================================
export function EventHistory({ events = [] }) {
  if (!events.length) return <p className="text-center text-gray-400 text-sm py-6">Sin historial</p>
  const icon = { SITE_CREATED: '🆕', SITE_UPDATED: '✏️', STAGE: '🔄', SCHEDULE: '📅', REPORT_SUBMITTED: '📋', REPORT_REVIEWED: '✅', LOG: '📝', ATTENDANCE: '👷', OPENING: '🪟', PHOTO: '📷' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
      {events.map(e => (
        <div key={e.id} className="flex gap-2 px-3 py-2 text-xs">
          <span className="flex-shrink-0">{icon[e.action] || '•'}</span>
          <div className="flex-1 min-w-0"><p className="text-gray-800">{e.detail}</p><p className="text-gray-400">{fmtDateTime(e.createdAt)}</p></div>
        </div>
      ))}
    </div>
  )
}

// ===================================================================
// FORMULARIO DE BÓVEDA (compartido: instalador en celular / oficina)
// ===================================================================
export function SiteForm({ projectId, site, installerMode, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: site?.code || '', name: site?.name || '', address: site?.address || '', siteType: site?.siteType || 'VAULT',
    equipment: site?.equipment || '', infiltration: (site?.infiltration || '').split(',').filter(Boolean), stage: site?.stage || 'PENDING', notes: site?.notes || '',
    latitude: site?.latitude ?? null, longitude: site?.longitude ?? null,
    plannedStart: dateInput(site?.plannedStart), plannedEnd: dateInput(site?.plannedEnd), plannedDays: site?.plannedDays ?? ''
  })
  const [openings, setOpenings] = useState(site ? [] : ['Ventana pasamuros'])
  const [locating, setLocating] = useState(false)
  const save = useMutation({
    mutationFn: () => site ? api.patch(`/field/sites/${site.id}`, form) : api.post(`/field/projects/${projectId}/sites`, { ...form, openings: openings.filter(Boolean) }),
    onSuccess: (r) => { onSaved?.(r.data); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggleInf = (k) => setForm(f => ({ ...f, infiltration: f.infiltration.includes(k) ? f.infiltration.filter(x => x !== k) : [...f.infiltration, k] }))
  const locate = () => {
    if (!navigator.geolocation) return alert('Tu navegador no permite ubicación')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(p => { setForm(f => ({ ...f, latitude: +p.coords.latitude.toFixed(6), longitude: +p.coords.longitude.toFixed(6) })); setLocating(false) }, () => { setLocating(false); alert('No se pudo obtener la ubicación. Activa el GPS.') }, { enableHighAccuracy: true, timeout: 10000 })
  }
  const big = installerMode ? ' text-base py-2.5' : ''
  const meId = useAuthStore(s => s.user?.id)
  const codeLocked = installerMode && site && site.createdById && site.createdById !== meId
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{site ? `Editar ${site.code}` : 'Nueva bóveda'}</h2><button onClick={onClose} className="text-gray-400"><X size={22} /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Código *</label><input value={form.code} onChange={set('code')} placeholder="Bóveda 7" className={inputCls + big} disabled={!!codeLocked} title={codeLocked ? 'Solo oficina o quien la creó puede cambiar el código' : ''} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Tipo</label><select value={form.siteType} onChange={set('siteType')} className={inputCls + big}>{Object.entries(SITE_TYPE).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Nombre / cruce</label><input value={form.name} onChange={set('name')} placeholder="Seminario No. 181 y Moneda" className={inputCls + big} /></div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Ubicación</label>
            <div className="flex gap-2">
              <input value={form.address} onChange={set('address')} placeholder="Dirección" className={inputCls + big} />
              <button type="button" onClick={locate} disabled={locating} className={`flex items-center gap-1 px-3 rounded-lg text-xs font-medium border flex-shrink-0 ${form.latitude ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-gray-200 text-gray-600'}`}><MapPin size={14} /> {locating ? '...' : form.latitude ? 'GPS ✓' : 'GPS'}</button>
            </div>
            {form.latitude && <p className="text-[10px] text-gray-400 mt-1">{form.latitude}, {form.longitude} · <a className="text-brand-600" href={`https://maps.google.com/?q=${form.latitude},${form.longitude}`} target="_blank" rel="noreferrer">ver en mapa</a></p>}
          </div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Equipo en la bóveda</label><input value={form.equipment} onChange={set('equipment')} placeholder="Seccionador, derivador, transformador, gabinete..." className={inputCls + big} /></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1.5">Tipo de filtración</label>
            <div className="flex flex-wrap gap-2">{Object.entries(INFILTRATION).map(([k, v]) => <button key={k} type="button" onClick={() => toggleInf(k)} className={`px-3 py-2 rounded-lg text-xs font-medium border ${form.infiltration.includes(k) ? 'bg-sky-600 text-white border-sky-600' : 'border-gray-200 text-gray-600'}`}>{v.icon} {v.label}</button>)}</div></div>
          <div className="col-span-2 bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><CalendarDays size={13} /> Programa de obra</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-[10px] text-gray-500 mb-1">Inicio planeado</label><input type="date" value={form.plannedStart} onChange={set('plannedStart')} className={inputCls} /></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">Fin planeado</label><input type="date" value={form.plannedEnd} onChange={set('plannedEnd')} className={inputCls} /></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">Días estimados</label><input type="number" inputMode="numeric" min="0" value={form.plannedDays} onChange={set('plannedDays')} placeholder={form.plannedStart && form.plannedEnd ? String(dayDiff(form.plannedStart, form.plannedEnd) + 1) : ''} className={inputCls} /></div>
            </div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Etapa actual</label><select value={form.stage} onChange={set('stage')} className={inputCls}>{STAGE_ORDER.map(k => <option key={k} value={k}>{STAGE[k].label}</option>)}</select></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Notas</label><textarea rows={2} value={form.notes} onChange={set('notes')} className={inputCls + ' resize-none'} placeholder="Acceso, contacto CFE, precauciones..." /></div>
          {!site && (
            <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Ventanas / puntos de sellado</label>
              {openings.map((o, i) => <div key={i} className="flex gap-1.5 mb-1.5"><input value={o} onChange={e => setOpenings(arr => arr.map((x, j) => j === i ? e.target.value : x))} className={inputCls} /><button onClick={() => setOpenings(arr => arr.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></div>)}
              <button onClick={() => setOpenings(arr => [...arr, ''])} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus size={12} /> Agregar ventana</button></div>
          )}
        </div>
        <button onClick={() => save.mutate()} disabled={!form.code.trim() || save.isPending} className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 rounded-xl disabled:opacity-40">{save.isPending ? 'Guardando...' : site ? 'Guardar cambios' : 'Crear bóveda'}</button>
      </div>
    </div>
  )
}
