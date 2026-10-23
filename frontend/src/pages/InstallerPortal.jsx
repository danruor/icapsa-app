import { useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ArrowLeft, Camera, Plus, X, Trash2, Send, Save, MapPin, Wrench, CheckCircle2,
  AlertTriangle, ClipboardList, Image as ImageIcon, Lock, RotateCcw, Droplets
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { MATERIAL_CATEGORY, SITE_TYPE, STAGE, STAGE_ORDER, INFILTRATION, REPORT_STATUS, PHOTO_KIND, fmtDate, fmtDateTime, todayInput, compressImage, getPosition } from '../lib/field'
import { LogBook, AttendanceSheet, ScheduleView, FieldCalendar, EventHistory, SiteForm } from './FieldShared'
import { Users, NotebookPen, CalendarDays, History } from 'lucide-react'

// ===================================================================
// /campo — Mis obras
// ===================================================================
export function InstallerHome() {
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['field-projects'], queryFn: () => api.get('/field/projects').then(r => r.data) })
  const { data: myReports = [] } = useQuery({ queryKey: ['field-reports', 'mine'], queryFn: () => api.get('/field/reports').then(r => r.data) })
  const today = todayInput()
  const todayReports = myReports.filter(r => r.author?.id === me?.id && new Date(r.reportDate).toISOString().slice(0, 10) === today)
  const drafts = myReports.filter(r => r.author?.id === me?.id && (r.status === 'DRAFT' || r.status === 'REJECTED'))

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Hola, {me?.name?.split(' ')[0]} 👷</h1>
        <p className="text-sm text-gray-500">{todayReports.length === 0 ? 'Aún no registras tu reporte de hoy.' : `Hoy llevas ${todayReports.length} reporte${todayReports.length > 1 ? 's' : ''}.`}</p>
      </div>

      {drafts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1"><AlertTriangle size={13} /> Pendientes de enviar</p>
          {drafts.map(r => (
            <button key={r.id} onClick={() => navigate(`/campo/reportes/${r.id}`)} className="w-full text-left text-sm text-amber-900 flex items-center gap-2 py-1 hover:underline">
              <ChevronRight size={14} /> <span className="font-mono text-xs">{r.folio}</span> {r.site?.code} · {fmtDate(r.reportDate)}
              <span className="ml-auto text-xs">{r.status === 'REJECTED' ? '↩️ devuelto' : 'borrador'}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Mis obras</p>
        {isLoading && <p className="text-center text-gray-400 py-8">Cargando...</p>}
        {!isLoading && projects.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">Todavía no tienes obras asignadas. Pide a oficina que te asigne.</div>
        )}
        <div className="space-y-2">
          {projects.map(p => (
            <button key={p.id} onClick={() => navigate(`/campo/${p.id}`)} className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 active:bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-10 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.client || ''}{p.address ? ` · ${p.address}` : ''}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${p.sitesTotal ? (p.sitesDone / p.sitesTotal) * 100 : 0}%` }} /></div>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">{p.sitesDone}/{p.sitesTotal} bóvedas</span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// /campo/:projectId — Bóvedas de la obra
// ===================================================================
export function InstallerProject() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: p, isLoading } = useQuery({ queryKey: ['field-project', projectId], queryFn: () => api.get(`/field/projects/${projectId}`).then(r => r.data) })
  const [filter, setFilter] = useState('ALL')
  const [tab, setTab] = useState('sites')
  const [newSite, setNewSite] = useState(false)
  if (isLoading) return <p className="text-center text-gray-400 py-10">Cargando obra...</p>
  if (!p) return <p className="text-center text-gray-400 py-10">Obra no encontrada</p>
  const sites = (p.fieldSites || []).filter(s => filter === 'ALL' ? true : filter === 'OPEN' ? s.status !== 'DONE' : s.status === 'DONE')
  const blocked = (p.fieldSites || []).filter(s => s.hasBlockingIssue).length

  return (
    <div className="p-4 space-y-3">
      <button onClick={() => navigate('/campo')} className="flex items-center gap-1 text-sm text-gray-500"><ArrowLeft size={15} /> Mis obras</button>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{p.name}</h1>
          <p className="text-xs text-gray-500">{p.client}{p.address ? ` · ${p.address}` : ''}</p>
        </div>
        <button onClick={() => setNewSite(true)} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-3 py-2 rounded-lg flex-shrink-0"><Plus size={16} /> Bóveda</button>
      </div>
      {blocked > 0 && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-800 flex items-center gap-2"><AlertTriangle size={14} /> {blocked} bóveda{blocked > 1 ? 's' : ''} con bloqueo abierto</div>}

      <div className="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1">
        {[{ k: 'sites', l: `Bóvedas (${p.fieldSites.length})`, i: ClipboardList }, { k: 'logs', l: 'Bitácora', i: NotebookPen }, { k: 'attendance', l: 'Asistencia', i: Users }, { k: 'schedule', l: 'Programa', i: CalendarDays }, { k: 'calendar', l: 'Calendario', i: CalendarDays }].map(x => (
          <button key={x.k} onClick={() => setTab(x.k)} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${tab === x.k ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}><x.i size={13} /> {x.l}</button>
        ))}
      </div>

      {tab === 'sites' && (
        <>
          <div className="flex gap-1">
            {[{ k: 'ALL', l: 'Todas' }, { k: 'OPEN', l: 'En proceso' }, { k: 'DONE', l: 'Terminadas' }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f.k ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{f.l}</button>
            ))}
          </div>
          <div className="space-y-2">
            {sites.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                {p.fieldSites.length === 0 ? <>Esta obra aún no tiene bóvedas.<br /><button onClick={() => setNewSite(true)} className="mt-2 text-brand-600 font-medium">Dar de alta la primera</button></> : 'Sin bóvedas en este filtro'}
              </div>
            )}
            {sites.map(s => <SiteCard key={s.id} s={s} onClick={() => navigate(`/campo/bovedas/${s.id}`)} />)}
          </div>
        </>
      )}
      {tab === 'logs' && <LogBook projectId={p.id} sites={p.fieldSites} compact />}
      {tab === 'attendance' && <AttendanceSheet projectId={p.id} sites={p.fieldSites} />}
      {tab === 'schedule' && <ScheduleView projectId={p.id} editable onOpenSite={(id) => navigate(`/campo/bovedas/${id}`)} />}
      {tab === 'calendar' && <FieldCalendar projectId={p.id} onOpenSite={(id) => navigate(`/campo/bovedas/${id}`)} onOpenReport={(id) => navigate(`/campo/reportes/${id}`)} />}

      {newSite && <SiteForm projectId={p.id} installerMode onClose={() => setNewSite(false)} onSaved={(s) => { qc.invalidateQueries(['field-project', projectId]); navigate(`/campo/bovedas/${s.id}`) }} />}
    </div>
  )
}

function SiteCard({ s, onClick }) {
  const st = STAGE[s.stage] || STAGE.PENDING
  const inf = (s.infiltration || '').split(',').filter(Boolean)
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 active:bg-gray-50 p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: st.color + '22' }}>{SITE_TYPE[s.siteType]?.icon || '📍'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{s.code}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ background: st.color }}>{st.short}</span>
          </div>
          <p className="text-xs text-gray-600 truncate">{s.name || s.address || '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {s.equipment ? `${s.equipment} · ` : ''}{inf.map(i => INFILTRATION[i]?.icon).join(' ')} {s.openings?.length ? `· ${s.openings.length} ventana${s.openings.length > 1 ? 's' : ''}` : ''} {s._count?.reports ? `· ${s._count.reports} reportes` : ''}
          </p>
          {(s.plannedEnd || s.hasBlockingIssue) && (
            <p className="text-[11px] mt-0.5 flex gap-2">
              {s.hasBlockingIssue && <span className="text-red-600 font-semibold">🛑 bloqueada</span>}
              {s.plannedEnd && s.status !== 'DONE' && <span className={new Date(s.plannedEnd) < new Date() ? 'text-red-600' : 'text-gray-500'}>📅 fin plan. {fmtDate(s.plannedEnd)}</span>}
            </p>
          )}
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-2" />
      </div>
      <StageBar stage={s.stage} />
    </button>
  )
}

export function StageBar({ stage }) {
  const step = STAGE[stage]?.step ?? 0
  return (
    <div className="flex gap-0.5 mt-2.5">
      {STAGE_ORDER.slice(1).map((k, i) => <div key={k} className="flex-1 h-1 rounded-full" style={{ background: i < step ? STAGE[k].color : '#E5E7EB' }} title={STAGE[k].label} />)}
    </div>
  )
}

// ===================================================================
// /campo/bovedas/:siteId — Ficha de la bóveda (reportes, fotos, ventanas)
// ===================================================================
export function InstallerSite() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const { data: site, isLoading } = useQuery({ queryKey: ['field-site', siteId], queryFn: () => api.get(`/field/sites/${siteId}`).then(r => r.data) })
  const [tab, setTab] = useState('reports')
  const [editSite, setEditSite] = useState(false)
  const [newOpening, setNewOpening] = useState('')
  const addOpening = useMutation({
    mutationFn: () => api.post(`/field/sites/${siteId}/openings`, { label: newOpening }),
    onSuccess: () => { setNewOpening(''); qc.invalidateQueries(['field-site', siteId]) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  if (isLoading) return <p className="text-center text-gray-400 py-10">Cargando bóveda...</p>
  if (!site) return <p className="text-center text-gray-400 py-10">Bóveda no encontrada</p>
  const st = STAGE[site.stage] || STAGE.PENDING
  const inf = (site.infiltration || '').split(',').filter(Boolean)
  const draft = site.reports.find(r => r.author?.id === me?.id && ['DRAFT', 'REJECTED'].includes(r.status))

  return (
    <div className="p-4 space-y-3">
      <button onClick={() => navigate(`/campo/${site.projectId}`)} className="flex items-center gap-1 text-sm text-gray-500"><ArrowLeft size={15} /> {site.project?.name}</button>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{SITE_TYPE[site.siteType]?.icon} {site.code}</h1>
            <p className="text-sm text-gray-600">{site.name}</p>
            {site.address && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {site.address}</p>}
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-medium text-white flex-shrink-0" style={{ background: st.color }}>{st.label}</span>
        </div>
        <StageBar stage={site.stage} />
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-600">
          {site.equipment && <span className="flex items-center gap-1"><Wrench size={12} /> {site.equipment}</span>}
          {inf.length > 0 && <span className="flex items-center gap-1"><Droplets size={12} /> {inf.map(i => INFILTRATION[i]?.label).join(', ')}</span>}
          {site.latitude && <a href={`https://maps.google.com/?q=${site.latitude},${site.longitude}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand-600"><MapPin size={12} /> mapa</a>}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[10px] text-gray-400">Planeado</p><p className="text-sm font-semibold text-gray-800">{site.plannedDays ?? (site.plannedStart && site.plannedEnd ? Math.round((new Date(site.plannedEnd) - new Date(site.plannedStart)) / 86400000) + 1 : '—')} d</p></div>
          <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[10px] text-gray-400">Días reales</p><p className={`text-sm font-semibold ${site.plannedDays && site.actualDays > site.plannedDays ? 'text-red-600' : 'text-gray-800'}`}>{site.actualDays ?? 0} d</p></div>
          <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[10px] text-gray-400">Horas</p><p className="text-sm font-semibold text-gray-800">{site.hoursWorked ? site.hoursWorked.toFixed(0) : '—'}</p></div>
        </div>
        {site.notes && <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg p-2">{site.notes}</p>}
        <button onClick={() => setEditSite(true)} className="mt-2 text-xs text-brand-600 font-medium">Editar datos / ubicación / programa</button>
      </div>

      {/* Acción principal */}
      {site.status !== 'DONE' || draft ? (
        <button onClick={() => navigate(draft ? `/campo/reportes/${draft.id}` : `/campo/bovedas/${site.id}/nuevo`)}
          className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3.5 rounded-xl text-base shadow-sm">
          <ClipboardList size={20} /> {draft ? (draft.status === 'REJECTED' ? 'Corregir reporte devuelto' : 'Continuar borrador') : 'Registrar reporte de hoy'}
        </button>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 size={18} /> Bóveda terminada</div>
      )}

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto -mx-4 px-4">
        {[{ k: 'reports', l: `Reportes (${site.reports.length})` }, { k: 'logs', l: `Bitácora (${site.logs?.length || 0})` }, { k: 'photos', l: `Fotos (${site.photos.length})` }, { k: 'openings', l: `Ventanas (${site.openings.length})` }, { k: 'history', l: 'Historial' }].map(x => (
          <button key={x.k} onClick={() => setTab(x.k)} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'}`}>{x.l}</button>
        ))}
      </div>

      {tab === 'reports' && (
        <div className="space-y-2">
          {site.reports.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Sin reportes todavía</p>}
          {site.reports.map(r => <ReportCard key={r.id} r={r} onClick={() => navigate(`/campo/reportes/${r.id}`)} />)}
        </div>
      )}
      {tab === 'logs' && <LogBook projectId={site.projectId} siteId={site.id} compact />}
      {tab === 'history' && <EventHistory events={site.events} />}
      {tab === 'photos' && <PhotoGrid photos={site.photos} />}
      {tab === 'openings' && (
        <div className="space-y-2">
          {site.openings.map(o => (
            <div key={o.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${o.status === 'SEALED' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0"><p className="text-sm text-gray-900">{o.label}</p>{o.description && <p className="text-xs text-gray-400">{o.description}</p>}</div>
              <span className="text-[10px] text-gray-400">{o.status === 'SEALED' ? 'Sellada' : 'Pendiente'}</span>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newOpening} onChange={e => setNewOpening(e.target.value)} placeholder="Nueva ventana (ej. Ducto 4 lado norte)" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
            <button onClick={() => newOpening.trim() && addOpening.mutate()} className="bg-gray-800 text-white px-3 rounded-lg"><Plus size={16} /></button>
          </div>
          <p className="text-[10px] text-gray-400">Agrega las ventanas que encuentres en sitio aunque no estuvieran previstas.</p>
        </div>
      )}
      {editSite && <SiteForm projectId={site.projectId} site={site} installerMode onClose={() => setEditSite(false)} onSaved={() => qc.invalidateQueries(['field-site', siteId])} />}
    </div>
  )
}

function ReportCard({ r, onClick }) {
  const rs = REPORT_STATUS[r.status], st = STAGE[r.stage]
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{r.folio}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rs?.chip}`}>{rs?.label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ background: st?.color }}>{st?.short}</span>
        <span className="text-xs text-gray-400 ml-auto">{fmtDate(r.reportDate)}</span>
      </div>
      <p className="text-sm text-gray-800 mt-1 line-clamp-2">{r.summary}</p>
      <p className="text-[11px] text-gray-400 mt-1">{r.author?.name} · {r.usages?.length || 0} materiales · {r._count?.photos ?? r.photos?.length ?? 0} fotos</p>
      {r.status === 'REJECTED' && r.reviewNote && <p className="text-xs text-red-600 mt-1">↩️ {r.reviewNote}</p>}
    </button>
  )
}

export function PhotoGrid({ photos, onDelete }) {
  const [open, setOpen] = useState(null)
  if (!photos?.length) return <p className="text-center text-sm text-gray-400 py-8">Sin fotos</p>
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {photos.map(p => (
          <button key={p.id} onClick={() => setOpen(p)} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={p.url} alt={p.caption || ''} className="w-full h-full object-cover" loading="lazy" />
            <span className={`absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded font-semibold ${PHOTO_KIND[p.kind]?.chip}`}>{PHOTO_KIND[p.kind]?.label}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between p-3 text-white">
            <div className="text-xs"><span className={`px-1.5 py-0.5 rounded font-semibold mr-2 ${PHOTO_KIND[open.kind]?.chip}`}>{PHOTO_KIND[open.kind]?.label}</span>{fmtDateTime(open.takenAt)}{open.opening ? ` · ${open.opening.label}` : ''}</div>
            <div className="flex items-center gap-3">
              {onDelete && <button onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar esta foto?')) { onDelete(open.id); setOpen(null) } }} className="text-red-400"><Trash2 size={18} /></button>}
              <X size={22} />
            </div>
          </div>
          <img src={open.url} alt="" className="flex-1 object-contain min-h-0" />
          {open.caption && <p className="text-white text-sm text-center p-3">{open.caption}</p>}
        </div>
      )}
    </>
  )
}

// ===================================================================
// /campo/bovedas/:siteId/nuevo  y  /campo/reportes/:reportId — Reporte diario
// ===================================================================
export function InstallerReport() {
  const { siteId: siteIdParam, reportId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)

  const { data: existing, isLoading: loadingReport } = useQuery({ queryKey: ['field-report', reportId], queryFn: () => api.get(`/field/reports/${reportId}`).then(r => r.data), enabled: !!reportId })
  const siteId = siteIdParam || existing?.siteId
  const { data: site } = useQuery({ queryKey: ['field-site', siteId], queryFn: () => api.get(`/field/sites/${siteId}`).then(r => r.data), enabled: !!siteId })
  const { data: materials = [] } = useQuery({ queryKey: ['field-materials'], queryFn: () => api.get('/field/materials').then(r => r.data) })

  const editable = !existing || (['DRAFT', 'REJECTED'].includes(existing.status) && existing.author?.id === me?.id)
  const [form, setForm] = useState(null)
  const [usages, setUsages] = useState([])
  const [pendingPhotos, setPendingPhotos] = useState([]) // fotos aún no subidas (reporte nuevo)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const [photoKind, setPhotoKind] = useState('DURING')

  // Inicializar formulario
  if (form === null && (existing || (!reportId && site))) {
    setForm({
      reportDate: existing ? new Date(existing.reportDate).toISOString().slice(0, 10) : todayInput(),
      stage: existing?.stage || (site?.stage === 'PENDING' ? 'DEWATERING' : site?.stage) || 'SEALING',
      summary: existing?.summary || '', issues: existing?.issues || '',
      hoursWorked: existing?.hoursWorked ?? '', crewSize: existing?.crewSize ?? ''
    })
    setUsages(existing?.usages?.map(u => ({ materialId: u.materialId, quantity: u.quantity, openingId: u.openingId || '', note: u.note || '' })) || [])
  }

  const matByCat = useMemo(() => {
    const g = {}
    for (const m of materials) { (g[m.category] = g[m.category] || []).push(m) }
    return g
  }, [materials])

  const save = async (submit) => {
    if (!form.summary.trim()) return alert('Describe el trabajo realizado')
    if (submit && usages.length === 0 && !confirm('No registraste material. ¿Enviar de todas formas?')) return
    if (submit && !confirm('Al enviar, el reporte queda registrado y ya no se puede editar. ¿Enviar?')) return
    setBusy(true)
    try {
      const payload = { ...form, siteId, usages: usages.filter(u => u.materialId && u.quantity), submit }
      let r
      if (existing) r = (await api.patch(`/field/reports/${existing.id}`, payload)).data
      else r = (await api.post('/field/reports', payload)).data
      // Subir fotos pendientes ligadas al reporte
      for (const ph of pendingPhotos) {
        const fd = new FormData()
        fd.append('file', ph.file); fd.append('kind', ph.kind); fd.append('reportId', r.id)
        if (ph.caption) fd.append('caption', ph.caption)
        if (ph.pos) { fd.append('latitude', ph.pos.latitude); fd.append('longitude', ph.pos.longitude) }
        await api.post(`/field/sites/${siteId}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      qc.invalidateQueries(['field-site', siteId]); qc.invalidateQueries(['field-reports']); qc.invalidateQueries(['field-report', r.id])
      if (submit) { alert(`Reporte ${r.folio} enviado ✅`); navigate(`/campo/bovedas/${siteId}`) }
      else navigate(`/campo/reportes/${r.id}`, { replace: true })
    } catch (e) { alert(e.response?.data?.error || 'Error al guardar') }
    finally { setBusy(false) }
  }

  const addPhotos = async (files) => {
    const pos = await getPosition()
    const list = []
    for (const f of Array.from(files).slice(0, 10)) list.push({ file: await compressImage(f), kind: photoKind, caption: '', pos, preview: URL.createObjectURL(f) })
    if (existing) {
      setBusy(true)
      try {
        for (const ph of list) {
          const fd = new FormData(); fd.append('file', ph.file); fd.append('kind', ph.kind); fd.append('reportId', existing.id)
          if (pos) { fd.append('latitude', pos.latitude); fd.append('longitude', pos.longitude) }
          await api.post(`/field/sites/${siteId}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        }
        qc.invalidateQueries(['field-report', existing.id]); qc.invalidateQueries(['field-site', siteId])
      } catch (e) { alert(e.response?.data?.error || 'Error al subir foto') } finally { setBusy(false) }
    } else setPendingPhotos(arr => [...arr, ...list])
  }
  const deletePhoto = useMutation({ mutationFn: (id) => api.delete(`/field/photos/${id}`), onSuccess: () => { qc.invalidateQueries(['field-report', reportId]); qc.invalidateQueries(['field-site', siteId]) } })
  const removeReport = useMutation({ mutationFn: () => api.delete(`/field/reports/${existing.id}`), onSuccess: () => navigate(`/campo/bovedas/${siteId}`), onError: (e) => alert(e.response?.data?.error || 'Error') })

  if ((reportId && loadingReport) || !form || !site) return <p className="text-center text-gray-400 py-10">Cargando...</p>
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-brand-500"
  const rs = existing && REPORT_STATUS[existing.status]

  return (
    <div className="p-4 space-y-4">
      <button onClick={() => navigate(`/campo/bovedas/${siteId}`)} className="flex items-center gap-1 text-sm text-gray-500"><ArrowLeft size={15} /> {site.code}</button>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{existing ? `Reporte ${existing.folio}` : 'Reporte del día'}</h1>
          <p className="text-xs text-gray-500">{site.code} · {site.name || site.address || ''}</p>
        </div>
        {rs && <span className={`text-xs px-2 py-1 rounded-full font-medium ${rs.chip}`}>{rs.label}</span>}
      </div>
      {existing?.status === 'REJECTED' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800"><b>Devuelto por oficina:</b> {existing.reviewNote || 'corrige y vuelve a enviar'}</div>
      )}
      {existing?.status === 'APPROVED' && existing.reviewNote && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">✅ {existing.reviewNote}</div>
      )}
      {!editable && <p className="text-xs text-gray-500 flex items-center gap-1"><Lock size={12} /> Reporte enviado: solo lectura</p>}

      {/* Datos del día */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Fecha</label><input type="date" value={form.reportDate} onChange={set('reportDate')} disabled={!editable} max={todayInput()} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Etapa trabajada</label>
            <select value={form.stage} onChange={set('stage')} disabled={!editable} className={inputCls}>
              {STAGE_ORDER.filter(k => k !== 'PENDING').map(k => <option key={k} value={k}>{STAGE[k].label}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Personas en cuadrilla</label><input type="number" inputMode="numeric" min="1" value={form.crewSize} onChange={set('crewSize')} disabled={!editable} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Horas trabajadas</label><input type="number" inputMode="decimal" step="0.5" min="0" max="24" value={form.hoursWorked} onChange={set('hoursWorked')} disabled={!editable} className={inputCls} /></div>
        </div>
        <div><label className="block text-xs text-gray-500 mb-1">¿Qué se hizo hoy? *</label>
          <textarea rows={4} value={form.summary} onChange={set('summary')} disabled={!editable} placeholder="Ej: Achique de agua del pozo, limpieza del muro norte y colocación de 2 marcos GKO 4 en la ventana pasamuros..." className={inputCls + ' resize-none'} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Problemas o bloqueos</label>
          <textarea rows={2} value={form.issues} onChange={set('issues')} disabled={!editable} placeholder="Falta de material, acceso, clima, CFE no abrió la bóveda..." className={inputCls + ' resize-none'} /></div>
      </div>

      {/* Material usado */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">Material ROXTEC usado</p>
          {editable && <button onClick={() => setUsages(u => [...u, { materialId: '', quantity: 1, openingId: '', note: '' }])} className="flex items-center gap-1 text-xs font-medium text-brand-600"><Plus size={14} /> Agregar</button>}
        </div>
        {usages.length === 0 && <p className="text-xs text-gray-400 py-3 text-center">Sin material registrado. Agrega cada marco, sello, módulo o cubeta que usaste hoy.</p>}
        <div className="space-y-2">
          {usages.map((u, i) => {
            const m = materials.find(x => x.id === u.materialId)
            return (
              <div key={i} className="bg-gray-50 rounded-lg p-2.5 space-y-2">
                <div className="flex gap-2">
                  <select value={u.materialId} onChange={e => setUsages(arr => arr.map((x, j) => j === i ? { ...x, materialId: e.target.value } : x))} disabled={!editable} className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none bg-white">
                    <option value="">Elige el material...</option>
                    {Object.entries(matByCat).map(([cat, list]) => (
                      <optgroup key={cat} label={`${MATERIAL_CATEGORY[cat]?.icon || ''} ${MATERIAL_CATEGORY[cat]?.label || cat}`}>
                        {list.map(x => <option key={x.id} value={x.id}>{x.name}{x.sku ? ` (${x.sku})` : ''}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {editable && <button onClick={() => setUsages(arr => arr.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 px-1"><Trash2 size={16} /></button>}
                </div>
                <div className="flex gap-2">
                  <div className="w-28 flex items-center gap-1">
                    <input type="number" inputMode="decimal" min="0" step="any" value={u.quantity} onChange={e => setUsages(arr => arr.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} disabled={!editable} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none bg-white" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">{m?.unit || 'pza'}</span>
                  </div>
                  <select value={u.openingId} onChange={e => setUsages(arr => arr.map((x, j) => j === i ? { ...x, openingId: e.target.value } : x))} disabled={!editable} className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none bg-white">
                    <option value="">Toda la bóveda</option>
                    {site.openings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Fotos */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">Evidencia fotográfica</p>
          <span className="text-xs text-gray-400">{(existing?.photos?.length || 0) + pendingPhotos.length} fotos</span>
        </div>
        {editable && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1 flex-1">
              {Object.entries(PHOTO_KIND).map(([k, v]) => (
                <button key={k} onClick={() => setPhotoKind(k)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${photoKind === k ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600'}`}>{v.label}</button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"><Camera size={16} /> Foto</button>
          </div>
        )}
        {pendingPhotos.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {pendingPhotos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img src={p.preview} alt="" className="w-full h-full object-cover" />
                <span className={`absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded font-semibold ${PHOTO_KIND[p.kind]?.chip}`}>{PHOTO_KIND[p.kind]?.label}</span>
                <button onClick={() => setPendingPhotos(arr => arr.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <PhotoGrid photos={existing?.photos || []} onDelete={editable ? (id) => deletePhoto.mutate(id) : undefined} />
        {editable && <p className="text-[10px] text-gray-400 mt-2">Toma fotos del antes, durante y después. Se comprimen automáticamente para ahorrar datos.</p>}
      </div>

      {editable && (
        <div className="sticky bottom-0 bg-gray-50 pt-2 pb-2 safe-bottom space-y-2">
          <button onClick={() => save(true)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl text-base shadow-sm disabled:opacity-50">
            <Send size={18} /> {busy ? 'Enviando...' : 'Enviar reporte a oficina'}
          </button>
          <div className="flex gap-2">
            <button onClick={() => save(false)} disabled={busy} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm disabled:opacity-50"><Save size={15} /> Guardar borrador</button>
            {existing && existing.status === 'DRAFT' && <button onClick={() => { if (confirm('¿Eliminar este borrador?')) removeReport.mutate() }} className="px-4 bg-white border border-red-200 text-red-600 rounded-xl"><Trash2 size={16} /></button>}
          </div>
        </div>
      )}
    </div>
  )
}
