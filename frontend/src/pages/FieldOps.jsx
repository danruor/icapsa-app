import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Cell } from 'recharts'
import {
  HardHat, Plus, X, Pencil, Trash2, ChevronRight, ArrowLeft, CheckCircle2, RotateCcw, Package, FileSpreadsheet,
  ClipboardList, Users, MapPin, Wrench, Droplets, AlertTriangle, Camera, Lock
} from 'lucide-react'
import api, { downloadFile } from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { brandForEmail } from '../lib/brand'
import { useSort, SortTh } from '../components/sortable'
import { MATERIAL_CATEGORY, SITE_TYPE, STAGE, STAGE_ORDER, INFILTRATION, REPORT_STATUS, PHOTO_KIND, money, fmtDate, fmtDateTime } from '../lib/field'
import { StageBar, PhotoGrid } from './InstallerPortal'

const moneyShort = (n) => Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${(n || 0).toFixed(0)}`
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

// ===================================================================
// /field — Panel de Instalaciones (oficina)
// ===================================================================
export default function FieldOps() {
  const [tab, setTab] = useState('projects')
  const { data: summary } = useQuery({ queryKey: ['field-summary'], queryFn: () => api.get('/field/summary').then(r => r.data), refetchInterval: 60000 })
  const t = summary?.totals

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><HardHat size={22} className="text-brand-500" /> Instalaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Sellado de bóvedas ROXTEC — reportes diarios, material consumido y costo real por obra</p>
        </div>
        <button onClick={() => downloadFile('/field/export.xlsx', 'Campo-material.xlsx')} className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg">
          <FileSpreadsheet size={15} /> Excel
        </button>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <Stat label="Por revisar" value={t.pendingReview} warn={t.pendingReview > 0} onClick={() => setTab('review')} />
          <Stat label="Reportes enviados" value={t.reports} />
          <Stat label="Bóvedas" value={`${t.sitesDone}/${t.sites}`} sub="terminadas" />
          <Stat label="Horas reportadas" value={t.hours.toFixed(0)} />
          <Stat label="Costo de material" value={money(t.cost)} sub="reportes enviados y aprobados" highlight />
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {[{ k: 'projects', l: 'Obras' }, { k: 'review', l: `Revisión${t?.pendingReview ? ` (${t.pendingReview})` : ''}` }, { k: 'materials', l: 'Catálogo ROXTEC' }, { k: 'analytics', l: 'Recuento 📊' }].map(x => (
          <button key={x.k} onClick={() => setTab(x.k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{x.l}</button>
        ))}
      </div>

      {tab === 'projects' && <ProjectsView />}
      {tab === 'review' && <ReviewView />}
      {tab === 'materials' && <MaterialsView />}
      {tab === 'analytics' && <AnalyticsView summary={summary} />}
    </div>
  )
}

function Stat({ label, value, sub, warn, highlight, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={`text-left rounded-xl border p-3 ${warn ? 'bg-amber-50 border-amber-200' : highlight ? 'bg-brand-50 border-brand-200' : 'bg-white border-gray-200'} ${onClick ? 'hover:shadow-sm' : 'cursor-default'}`}>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
    </button>
  )
}

// ---------- Obras ----------
function ProjectsView() {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['field-projects', showAll], queryFn: () => api.get(`/field/projects${showAll ? '?all=1' : ''}`).then(r => r.data) })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Obras con bóvedas o instaladores asignados. Las obras se crean en Proyectos.</p>
        <label className="text-xs text-gray-600 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Mostrar todos los proyectos</label>
      </div>
      {isLoading && <p className="text-center text-gray-400 py-8">Cargando...</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects.map(p => (
          <button key={p.id} onClick={() => navigate(`/field/obras/${p.id}`)} className="text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 hover:shadow-sm p-4">
            <div className="flex items-start gap-3">
              <span className="w-2.5 h-12 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500 truncate">{p.client || '—'}{p.address ? ` · ${p.address}` : ''}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${p.sitesTotal ? (p.sitesDone / p.sitesTotal) * 100 : 0}%` }} /></div>
                  <span className="text-[11px] text-gray-500">{p.sitesDone}/{p.sitesTotal} bóvedas</span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><Users size={12} /> {p.installers.length ? p.installers.map(i => i.name.split(' ')[0]).join(', ') : 'sin instaladores'}</span>
                  <span className="flex items-center gap-1"><ClipboardList size={12} /> {p.reportsCount} reportes</span>
                  <span className="ml-auto font-semibold text-gray-900">{money(p.costConsumed)}</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-3" />
            </div>
          </button>
        ))}
        {!isLoading && projects.length === 0 && <p className="text-center text-gray-400 py-10 col-span-2">Sin obras de campo todavía. Activa "Mostrar todos" y abre un proyecto para agregarle bóvedas e instaladores.</p>}
      </div>
    </div>
  )
}

// ===================================================================
// /field/obras/:projectId — Detalle de obra (oficina)
// ===================================================================
export function FieldProject() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(me?.role)
  const { data: p, isLoading } = useQuery({ queryKey: ['field-project', projectId], queryFn: () => api.get(`/field/projects/${projectId}`).then(r => r.data) })
  const { data: installers = [] } = useQuery({ queryKey: ['field-installers'], queryFn: () => api.get('/field/installers').then(r => r.data) })
  const { data: materials = [] } = useQuery({ queryKey: ['field-materials'], queryFn: () => api.get('/field/materials').then(r => r.data) })
  const [siteModal, setSiteModal] = useState(null) // 'new' | site
  const [alloc, setAlloc] = useState({ materialId: '', quantity: '', note: '' })
  const [assignId, setAssignId] = useState('')
  const inv = () => { qc.invalidateQueries(['field-project', projectId]); qc.invalidateQueries(['field-projects']); qc.invalidateQueries(['field-summary']) }

  const assign = useMutation({ mutationFn: (userId) => api.post(`/field/projects/${projectId}/installers`, { userId }), onSuccess: () => { setAssignId(''); inv() }, onError: (e) => alert(e.response?.data?.error || 'Error') })
  const unassign = useMutation({ mutationFn: (userId) => api.delete(`/field/projects/${projectId}/installers/${userId}`), onSuccess: inv })
  const allocate = useMutation({ mutationFn: () => api.post(`/field/projects/${projectId}/allocations`, alloc), onSuccess: () => { setAlloc({ materialId: '', quantity: '', note: '' }); inv() }, onError: (e) => alert(e.response?.data?.error || 'Error') })
  const delSite = useMutation({ mutationFn: (id) => api.delete(`/field/sites/${id}`), onSuccess: inv, onError: (e) => alert(e.response?.data?.error || 'Error') })

  if (isLoading) return <p className="text-center text-gray-400 py-16">Cargando obra...</p>
  if (!p) return <p className="text-center text-gray-400 py-16">Obra no encontrada</p>

  return (
    <div className="p-4 md:p-8">
      <button onClick={() => navigate('/field')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft size={15} /> Instalaciones</button>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: p.color }} /> {p.name}</h1>
          <p className="text-sm text-gray-500">{p.client || ''}{p.address ? ` · ${p.address}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadFile(`/field/export.xlsx?projectId=${p.id}`, `Campo-${p.name.slice(0, 30)}.xlsx`)} className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg"><FileSpreadsheet size={15} /> Excel</button>
          <button onClick={() => setSiteModal('new')} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg"><Plus size={16} /> Bóveda</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Bóvedas terminadas" value={`${p.fieldSites.filter(s => s.status === 'DONE').length}/${p.fieldSites.length}`} />
        <Stat label="Material asignado" value={money(p.costAllocated)} sub="valor a costo de catálogo" />
        <Stat label="Material consumido" value={money(p.costConsumed)} sub="según reportes" highlight />
        <Stat label="Diferencia" value={money(p.costAllocated - p.costConsumed)} sub={p.costAllocated - p.costConsumed < 0 ? '⚠️ consumo mayor al asignado' : 'disponible'} warn={p.costAllocated - p.costConsumed < 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bóvedas */}
        <div className="lg:col-span-2 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bóvedas / subestaciones ({p.fieldSites.length})</p>
          {p.fieldSites.length === 0 && <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">Agrega las bóvedas de esta obra (código, dirección, equipo, tipo de filtración y ventanas).</div>}
          {p.fieldSites.map(s => {
            const st = STAGE[s.stage] || STAGE.PENDING
            const inf = (s.infiltration || '').split(',').filter(Boolean)
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-start gap-3">
                  <button onClick={() => navigate(`/field/bovedas/${s.id}`)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{SITE_TYPE[s.siteType]?.icon} {s.code}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ background: st.color }}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-600 truncate">{s.name || s.address || '—'}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{s.equipment ? `${s.equipment} · ` : ''}{inf.map(i => `${INFILTRATION[i]?.icon} ${INFILTRATION[i]?.label}`).join(', ')} · {s.openings.length} ventanas · {s._count.reports} reportes · {s._count.photos} fotos</p>
                    <StageBar stage={s.stage} />
                  </button>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setSiteModal(s)} className="text-gray-400 hover:text-brand-600 p-1"><Pencil size={14} /></button>
                    {isAdmin && <button onClick={() => { if (confirm(`¿Eliminar ${s.code} con sus ${s._count.reports} reportes y fotos?`)) delSite.mutate(s.id) }} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="space-y-4">
          {/* Instaladores */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Instaladores asignados</p>
            <div className="space-y-1.5 mb-3">
              {p.installers.length === 0 && <p className="text-xs text-gray-400">Nadie asignado — los instaladores solo ven las obras donde están asignados.</p>}
              {p.installers.map(u => (
                <div key={u.id} className="flex items-center gap-2 text-sm">
                  <HardHat size={14} className="text-amber-500" /><span className="flex-1 text-gray-800">{u.name}{u.isLead ? ' · responsable' : ''}</span>
                  <button onClick={() => unassign.mutate(u.id)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <select value={assignId} onChange={e => setAssignId(e.target.value)} className={inputCls}>
                <option value="">Asignar instalador...</option>
                {installers.filter(i => !p.installers.some(x => x.id === i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <button onClick={() => assignId && assign.mutate(assignId)} disabled={!assignId} className="bg-brand-500 text-white px-3 rounded-lg disabled:opacity-40"><Plus size={16} /></button>
            </div>
            {installers.length === 0 && <p className="text-[10px] text-gray-400 mt-2">Crea usuarios con rol <b>Instalador</b> en Administración.</p>}
          </div>

          {/* Material asignado vs consumido */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Material: asignado vs consumido</p>
            {(!p.materials || p.materials.length === 0) && <p className="text-xs text-gray-400 mb-2">Sin material asignado ni consumido.</p>}
            <div className="space-y-1.5 mb-3">
              {p.materials?.map(m => (
                <div key={m.material.id} className="text-xs">
                  <div className="flex justify-between gap-2"><span className="text-gray-800 truncate">{MATERIAL_CATEGORY[m.material.category]?.icon} {m.material.name}</span><span className="text-gray-900 font-medium whitespace-nowrap">{money(m.cost)}</span></div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${m.allocated && m.used > m.allocated ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${m.allocated ? Math.min(100, (m.used / m.allocated) * 100) : (m.used ? 100 : 0)}%` }} /></div>
                    <span className={`text-[10px] whitespace-nowrap ${m.allocated && m.used > m.allocated ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{m.used} / {m.allocated || '∞'} {m.material.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-2 space-y-1.5">
              <select value={alloc.materialId} onChange={e => setAlloc(a => ({ ...a, materialId: e.target.value }))} className={inputCls}>
                <option value="">Asignar material a la obra...</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({money(m.unitCost)}/{m.unit})</option>)}
              </select>
              <div className="flex gap-2">
                <input type="number" step="any" value={alloc.quantity} onChange={e => setAlloc(a => ({ ...a, quantity: e.target.value }))} placeholder="Cantidad (negativa = retiro)" className={inputCls} />
                <button onClick={() => allocate.mutate()} disabled={!alloc.materialId || !alloc.quantity} className="bg-gray-800 text-white px-3 rounded-lg disabled:opacity-40"><Plus size={16} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {siteModal && <SiteModal projectId={p.id} site={siteModal === 'new' ? null : siteModal} onClose={() => setSiteModal(null)} onSaved={inv} />}
    </div>
  )
}

function SiteModal({ projectId, site, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: site?.code || '', name: site?.name || '', address: site?.address || '', siteType: site?.siteType || 'VAULT',
    equipment: site?.equipment || '', infiltration: (site?.infiltration || '').split(',').filter(Boolean), stage: site?.stage || 'PENDING', notes: site?.notes || ''
  })
  const [openings, setOpenings] = useState(site ? [] : ['Ventana pasamuros'])
  const save = useMutation({
    mutationFn: () => site ? api.patch(`/field/sites/${site.id}`, form) : api.post(`/field/projects/${projectId}/sites`, { ...form, openings: openings.filter(Boolean) }),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggleInf = (k) => setForm(f => ({ ...f, infiltration: f.infiltration.includes(k) ? f.infiltration.filter(x => x !== k) : [...f.infiltration, k] }))
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{site ? `Editar ${site.code}` : 'Nueva bóveda / subestación'}</h2><button onClick={onClose} className="text-gray-400"><X size={20} /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Código *</label><input value={form.code} onChange={set('code')} placeholder="Bóveda 7" className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Tipo</label><select value={form.siteType} onChange={set('siteType')} className={inputCls}>{Object.entries(SITE_TYPE).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Nombre / ubicación</label><input value={form.name} onChange={set('name')} placeholder="Seminario No. 181 y Moneda" className={inputCls} /></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Dirección</label><input value={form.address} onChange={set('address')} className={inputCls} /></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Equipo en la bóveda</label><input value={form.equipment} onChange={set('equipment')} placeholder="Seccionador, derivador, transformador, gabinete de control..." className={inputCls} /></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1.5">Tipo de filtración</label>
            <div className="flex flex-wrap gap-2">{Object.entries(INFILTRATION).map(([k, v]) => (
              <button key={k} type="button" onClick={() => toggleInf(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${form.infiltration.includes(k) ? 'bg-sky-600 text-white border-sky-600' : 'border-gray-200 text-gray-600'}`}>{v.icon} {v.label}</button>
            ))}</div></div>
          <div><label className="block text-xs text-gray-500 mb-1">Etapa actual</label><select value={form.stage} onChange={set('stage')} className={inputCls}>{STAGE_ORDER.map(k => <option key={k} value={k}>{STAGE[k].label}</option>)}</select></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Notas para el instalador</label><textarea rows={2} value={form.notes} onChange={set('notes')} className={inputCls + ' resize-none'} placeholder="Acceso, contacto CFE, precauciones..." /></div>
          {!site && (
            <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Ventanas / puntos de sellado</label>
              {openings.map((o, i) => (
                <div key={i} className="flex gap-1.5 mb-1.5"><input value={o} onChange={e => setOpenings(arr => arr.map((x, j) => j === i ? e.target.value : x))} className={inputCls} /><button onClick={() => setOpenings(arr => arr.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></div>
              ))}
              <button onClick={() => setOpenings(arr => [...arr, ''])} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus size={12} /> Agregar ventana</button></div>
          )}
        </div>
        <button onClick={() => save.mutate()} disabled={!form.code.trim() || save.isPending} className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">{save.isPending ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </div>
  )
}

// ===================================================================
// /field/bovedas/:siteId — Ficha de bóveda (oficina)
// ===================================================================
export function FieldSite() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const { data: s, isLoading } = useQuery({ queryKey: ['field-site', siteId], queryFn: () => api.get(`/field/sites/${siteId}`).then(r => r.data) })
  const [tab, setTab] = useState('reports')
  if (isLoading) return <p className="text-center text-gray-400 py-16">Cargando...</p>
  if (!s) return <p className="text-center text-gray-400 py-16">Bóveda no encontrada</p>
  const st = STAGE[s.stage] || STAGE.PENDING
  const before = s.photos.filter(p => p.kind === 'BEFORE'), after = s.photos.filter(p => p.kind === 'AFTER')
  return (
    <div className="p-4 md:p-8">
      <button onClick={() => navigate(`/field/obras/${s.projectId}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft size={15} /> {s.project?.name}</button>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{SITE_TYPE[s.siteType]?.icon} {s.code} <span className="text-gray-500 font-normal text-base">{s.name}</span></h1>
            <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
              {s.address && <span className="flex items-center gap-1"><MapPin size={11} /> {s.address}</span>}
              {s.equipment && <span className="flex items-center gap-1"><Wrench size={11} /> {s.equipment}</span>}
              {s.infiltration && <span className="flex items-center gap-1"><Droplets size={11} /> {s.infiltration.split(',').map(i => INFILTRATION[i]?.label).join(', ')}</span>}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs px-2 py-1 rounded-full font-medium text-white" style={{ background: st.color }}>{st.label}</span>
            <p className="text-lg font-semibold text-gray-900 mt-1">{money(s.costConsumed)}</p>
            <p className="text-[10px] text-gray-400">material consumido</p>
          </div>
        </div>
        <StageBar stage={s.stage} />
      </div>

      {/* Antes / después */}
      {(before.length > 0 || after.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[['Antes', before], ['Después', after]].map(([l, list]) => (
            <div key={l} className="bg-white rounded-xl border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500 mb-2">{l} ({list.length})</p>
              {list[0] ? <img src={list[0].url} alt="" className="w-full aspect-video object-cover rounded-lg" /> : <div className="aspect-video bg-gray-50 rounded-lg flex items-center justify-center text-xs text-gray-400">Sin fotos</div>}</div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {[{ k: 'reports', l: `Reportes (${s.reports.length})` }, { k: 'materials', l: 'Material usado' }, { k: 'photos', l: `Fotos (${s.photos.length})` }, { k: 'openings', l: `Ventanas (${s.openings.length})` }].map(x => (
          <button key={x.k} onClick={() => setTab(x.k)} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'}`}>{x.l}</button>
        ))}
      </div>
      {tab === 'reports' && <div className="space-y-2">{s.reports.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">Sin reportes</p>}{s.reports.map(r => <ReportRow key={r.id} r={r} onClick={() => navigate(`/field/reports/${r.id}`)} />)}</div>}
      {tab === 'materials' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-b border-gray-100 text-left"><th className="px-4 py-2.5">Material</th><th className="px-3 py-2.5 text-right">Cantidad</th><th className="px-4 py-2.5 text-right">Costo</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{s.materials?.map(m => <tr key={m.material.id}><td className="px-4 py-2">{MATERIAL_CATEGORY[m.material.category]?.icon} {m.material.name}</td><td className="px-3 py-2 text-right">{m.used} {m.material.unit}</td><td className="px-4 py-2 text-right font-medium">{money(m.cost)}</td></tr>)}
              {(!s.materials || s.materials.length === 0) && <tr><td colSpan="3" className="px-4 py-8 text-center text-gray-400">Sin material reportado</td></tr>}</tbody></table>
        </div>
      )}
      {tab === 'photos' && <PhotoGrid photos={s.photos} />}
      {tab === 'openings' && <div className="space-y-1.5">{s.openings.map(o => <div key={o.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${o.status === 'SEALED' ? 'bg-emerald-500' : 'bg-gray-300'}`} />{o.label}<span className="ml-auto text-xs text-gray-400">{o.status === 'SEALED' ? 'Sellada' : 'Pendiente'}</span></div>)}</div>}
    </div>
  )
}

function ReportRow({ r, onClick }) {
  const rs = REPORT_STATUS[r.status], st = STAGE[r.stage]
  const cost = r.usages?.reduce((s, u) => s + u.quantity * (u.unitCost || 0), 0) || 0
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400">{r.folio}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rs?.chip}`}>{rs?.label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ background: st?.color }}>{st?.short}</span>
        {r.site && <span className="text-xs text-gray-500">{r.site.code}{r.project ? ` · ${r.project.name}` : ''}</span>}
        <span className="text-xs text-gray-400 ml-auto">{fmtDate(r.reportDate)}</span>
      </div>
      <p className="text-sm text-gray-800 mt-1 line-clamp-2">{r.summary}</p>
      <p className="text-[11px] text-gray-400 mt-1">{r.author?.name} · {r.usages?.length || 0} materiales · {r._count?.photos ?? r.photos?.length ?? 0} fotos{r.hoursWorked ? ` · ${r.hoursWorked} h` : ''} · <span className="text-gray-700 font-medium">{money(cost)}</span></p>
    </button>
  )
}

// ---------- Bandeja de revisión ----------
function ReviewView() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('SUBMITTED')
  const { data: reports = [], isLoading } = useQuery({ queryKey: ['field-reports', status], queryFn: () => api.get(`/field/reports?status=${status}`).then(r => r.data) })
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {[{ k: 'SUBMITTED', l: 'Por revisar' }, { k: 'APPROVED', l: 'Aprobados' }, { k: 'REJECTED', l: 'Devueltos' }, { k: 'DRAFT', l: 'Borradores' }].map(f => (
          <button key={f.k} onClick={() => setStatus(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${status === f.k ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{f.l}</button>
        ))}
      </div>
      {isLoading && <p className="text-center text-gray-400 py-8">Cargando...</p>}
      {!isLoading && reports.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">{status === 'SUBMITTED' ? 'Todo revisado 🎉' : 'Sin reportes'}</p>}
      <div className="space-y-2">{reports.map(r => <ReportRow key={r.id} r={r} onClick={() => navigate(`/field/reports/${r.id}`)} />)}</div>
    </div>
  )
}

// ===================================================================
// /field/reports/:reportId — Detalle y revisión del reporte (oficina)
// ===================================================================
export function FieldReportDetail() {
  const { reportId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const { data: r, isLoading } = useQuery({ queryKey: ['field-report', reportId], queryFn: () => api.get(`/field/reports/${reportId}`).then(r => r.data) })
  const [note, setNote] = useState('')
  const inv = () => { qc.invalidateQueries(['field-report', reportId]); qc.invalidateQueries(['field-reports']); qc.invalidateQueries(['field-summary']); qc.invalidateQueries(['field-site']) }
  const review = useMutation({ mutationFn: (decision) => api.patch(`/field/reports/${reportId}`, { review: decision, reviewNote: note }), onSuccess: inv, onError: (e) => alert(e.response?.data?.error || 'Error') })
  const remove = useMutation({ mutationFn: () => api.delete(`/field/reports/${reportId}`), onSuccess: () => navigate('/field'), onError: (e) => alert(e.response?.data?.error || 'Error') })
  if (isLoading) return <p className="text-center text-gray-400 py-16">Cargando...</p>
  if (!r) return <p className="text-center text-gray-400 py-16">Reporte no encontrado</p>
  const rs = REPORT_STATUS[r.status], st = STAGE[r.stage]
  const cost = r.usages.reduce((s, u) => s + u.quantity * u.unitCost, 0)
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <button onClick={() => navigate(`/field/bovedas/${r.siteId}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft size={15} /> {r.site?.code} · {r.project?.name}</button>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1"><span className="font-mono text-sm text-gray-500">{r.folio}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rs?.chip}`}>{rs?.label}</span><span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ background: st?.color }}>{st?.label}</span></div>
          <h1 className="text-xl font-semibold text-gray-900">Reporte del {fmtDate(r.reportDate)}</h1>
          <p className="text-sm text-gray-500">{r.author?.name}{r.author?.phone ? ` · ${r.author.phone}` : ''}{r.crewSize ? ` · cuadrilla de ${r.crewSize}` : ''}{r.hoursWorked ? ` · ${r.hoursWorked} h` : ''}{r.submittedAt ? ` · enviado ${fmtDateTime(r.submittedAt)}` : ''}</p>
        </div>
        <div className="text-right"><p className="text-2xl font-semibold text-gray-900">{money(cost)}</p><p className="text-[10px] text-gray-400">costo del material reportado</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Trabajo realizado</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{r.summary}</p>
            {r.issues && <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-900"><b className="flex items-center gap-1 text-xs mb-1"><AlertTriangle size={12} /> Problemas reportados</b>{r.issues}</div>}</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-4 pb-2">Material usado ({r.usages.length})</p>
            <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-y border-gray-100 text-left"><th className="px-4 py-2">Material</th><th className="px-3 py-2">Ventana</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Costo unit.</th><th className="px-4 py-2 text-right">Costo</th></tr></thead>
              <tbody className="divide-y divide-gray-50">{r.usages.map(u => <tr key={u.id}><td className="px-4 py-2">{MATERIAL_CATEGORY[u.material.category]?.icon} {u.material.name}{u.material.sku ? <span className="text-xs text-gray-400"> {u.material.sku}</span> : ''}</td><td className="px-3 py-2 text-xs text-gray-500">{u.opening?.label || 'Toda la bóveda'}</td><td className="px-3 py-2 text-right">{u.quantity} {u.material.unit}</td><td className="px-3 py-2 text-right text-gray-500">{money(u.unitCost)}</td><td className="px-4 py-2 text-right font-medium">{money(u.quantity * u.unitCost)}</td></tr>)}
                {r.usages.length === 0 && <tr><td colSpan="5" className="px-4 py-6 text-center text-gray-400">Sin material registrado</td></tr>}</tbody></table></div>
          <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1"><Camera size={12} /> Fotos ({r.photos.length})</p><PhotoGrid photos={r.photos} /></div>
        </div>
        <div className="space-y-4">
          {r.status === 'SUBMITTED' || r.status === 'APPROVED' ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Revisión</p>
              {r.status === 'APPROVED' && <p className="text-sm text-emerald-700 flex items-center gap-1 mb-2"><CheckCircle2 size={15} /> Aprobado por {r.reviewer?.name} · {fmtDateTime(r.reviewedAt)}</p>}
              <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Comentario para el instalador (opcional al aprobar, recomendado al devolver)" className={inputCls + ' resize-none mb-2'} />
              <div className="flex gap-2">
                {r.status === 'SUBMITTED' && <button onClick={() => review.mutate('APPROVED')} disabled={review.isPending} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 rounded-lg"><CheckCircle2 size={15} /> Aprobar</button>}
                <button onClick={() => { if (!note.trim() && !confirm('¿Devolver sin comentario?')) return; review.mutate('REJECTED') }} disabled={review.isPending} className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium py-2 rounded-lg"><RotateCcw size={15} /> Devolver</button>
              </div>
            </div>
          ) : r.status === 'REJECTED' ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800"><b>Devuelto</b> por {r.reviewer?.name} · {fmtDateTime(r.reviewedAt)}<br />{r.reviewNote}</div>
          ) : <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 flex items-center gap-2"><Pencil size={14} /> Borrador: el instalador aún no lo envía</div>}
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs space-y-1.5">
            <p className="font-semibold text-gray-400 uppercase tracking-wide mb-1">Trazabilidad</p>
            <p><span className="text-gray-400">Creado:</span> {fmtDateTime(r.createdAt)}</p>
            {r.submittedAt && <p><span className="text-gray-400">Enviado:</span> {fmtDateTime(r.submittedAt)} <Lock size={10} className="inline text-gray-400" /></p>}
            {r.reviewedAt && <p><span className="text-gray-400">Revisado:</span> {fmtDateTime(r.reviewedAt)} · {r.reviewer?.name}</p>}
            {r.photos.some(p => p.latitude) && <p><span className="text-gray-400">GPS:</span> {r.photos.filter(p => p.latitude).length} fotos con ubicación</p>}
          </div>
          {me?.role === 'SUPER_ADMIN' && <button onClick={() => { if (confirm(`¿Eliminar el reporte ${r.folio}?`)) remove.mutate() }} className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:bg-red-50 py-2 rounded-lg"><Trash2 size={13} /> Eliminar reporte</button>}
        </div>
      </div>
    </div>
  )
}

// ---------- Catálogo ROXTEC ----------
const MAT_SORTERS = { name: m => m.name, category: m => m.category, unitCost: m => m.unitCost, sku: m => m.sku || '' }
function MaterialsView() {
  const qc = useQueryClient()
  const [edit, setEdit] = useState(null)
  const { data: materials = [], isLoading } = useQuery({ queryKey: ['field-materials', 'all'], queryFn: () => api.get('/field/materials?all=1').then(r => r.data) })
  const { sorted, sortKey, sortDir, toggle } = useSort(materials, MAT_SORTERS, 'category', 'asc')
  const patch = useMutation({ mutationFn: ({ id, data }) => api.patch(`/field/materials/${id}`, data), onSuccess: () => qc.invalidateQueries(['field-materials']) })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Marcos GKO, sellos RS, módulos, impermeabilizante... El costo unitario se "congela" en cada reporte al momento de registrarlo.</p>
        <button onClick={() => setEdit('new')} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex-shrink-0"><Plus size={16} /> Material</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]"><thead><tr className="border-b border-gray-100 text-xs text-gray-500">
          <SortTh label="SKU" k="sku" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} /><SortTh label="Material" k="name" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} /><SortTh label="Categoría" k="category" defaultDir="asc" {...{ sortKey, sortDir, onToggle: toggle }} /><th className="px-3 py-3 font-medium text-left">Unidad</th><SortTh label="Costo unit." k="unitCost" align="right" {...{ sortKey, sortDir, onToggle: toggle }} /><th className="px-3 py-3 font-medium text-center">Activo</th><th></th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && sorted.length === 0 && <tr><td colSpan="7" className="px-4 py-10 text-center text-gray-400">Catálogo vacío — registra tus productos ROXTEC con su costo</td></tr>}
            {sorted.map(m => (
              <tr key={m.id} className={`hover:bg-gray-50 ${!m.isActive ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{m.sku || '—'}</td>
                <td className="px-3 py-2.5 font-medium text-gray-900">{m.name}{m.notes && <div className="text-xs text-gray-400 font-normal">{m.notes}</div>}</td>
                <td className="px-3 py-2.5 text-xs">{MATERIAL_CATEGORY[m.category]?.icon} {MATERIAL_CATEGORY[m.category]?.label}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{m.unit}</td>
                <td className="px-3 py-2.5 text-right">{money(m.unitCost)} <span className="text-[10px] text-gray-400">{m.currency}</span></td>
                <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={m.isActive} onChange={e => patch.mutate({ id: m.id, data: { isActive: e.target.checked } })} /></td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => setEdit(m)} className="text-gray-400 hover:text-brand-600"><Pencil size={14} /></button></td>
              </tr>
            ))}
          </tbody></table>
      </div>
      {edit && <MaterialModal material={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function MaterialModal({ material, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: material?.name || '', sku: material?.sku || '', category: material?.category || 'FRAME', unit: material?.unit || 'pza', unitCost: material?.unitCost ?? '', currency: material?.currency || 'MXN', notes: material?.notes || '' })
  const save = useMutation({ mutationFn: () => material ? api.patch(`/field/materials/${material.id}`, form) : api.post('/field/materials', form), onSuccess: () => { qc.invalidateQueries(['field-materials']); onClose() }, onError: (e) => alert(e.response?.data?.error || 'Error') })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{material ? 'Editar material' : 'Nuevo material'}</h2><button onClick={onClose} className="text-gray-400"><X size={20} /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Nombre *</label><input value={form.name} onChange={set('name')} placeholder="Marco GKO 4" className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">SKU / código</label><input value={form.sku} onChange={set('sku')} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Categoría</label><select value={form.category} onChange={set('category')} className={inputCls}>{Object.entries(MATERIAL_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Unidad</label><input value={form.unit} onChange={set('unit')} placeholder="pza, cubeta, m, kg" className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Costo unitario</label><div className="flex gap-1"><input type="number" step="0.01" value={form.unitCost} onChange={set('unitCost')} className={inputCls} /><select value={form.currency} onChange={set('currency')} className="border border-gray-200 rounded-lg px-2 text-sm"><option>MXN</option><option>USD</option></select></div></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Notas</label><input value={form.notes} onChange={set('notes')} placeholder="Ej: cubeta 19 L rinde 38 m²" className={inputCls} /></div>
        </div>
        <button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending} className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">{save.isPending ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </div>
  )
}

// ---------- Recuento / análisis ----------
function AnalyticsView({ summary }) {
  const me = useAuthStore(s => s.user)
  const brandHex = brandForEmail(me?.email).hex500
  if (!summary) return <p className="text-center text-gray-400 py-10">Calculando...</p>
  if (summary.totals.reports === 0) return <p className="text-center text-gray-400 py-16">Aún no hay reportes enviados que analizar</p>
  const stages = STAGE_ORDER.map(k => ({ name: STAGE[k].short, value: summary.stageCounts[k] || 0, color: STAGE[k].color }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-700 mb-1">Costo por material</p><p className="text-[10px] text-gray-400 mb-3">Dónde se va el dinero — a costo congelado de cada reporte</p>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.byMaterial.slice(0, 10)} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={moneyShort} /><YAxis type="category" dataKey="material.name" tick={{ fontSize: 10 }} width={130} /><Tooltip formatter={(v, n) => n === 'Cantidad' ? v : money(v)} /><Bar dataKey="cost" name="Costo" fill={brandHex} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-700 mb-1">Costo por obra</p><p className="text-[10px] text-gray-400 mb-3">Material consumido según reportes enviados y aprobados</p>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.byProject.slice(0, 8)} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={moneyShort} /><YAxis type="category" dataKey="project.name" tick={{ fontSize: 10 }} width={130} tickFormatter={v => v.length > 22 ? v.slice(0, 22) + '…' : v} /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="cost" name="Costo" fill="#F59E0B" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-700 mb-1">Consumo diario</p><p className="text-[10px] text-gray-400 mb-3">Costo de material reportado por día</p>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.byDay}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} /><YAxis tick={{ fontSize: 10 }} tickFormatter={moneyShort} width={48} /><Tooltip formatter={(v, n) => n === 'Reportes' ? v : money(v)} /><Area type="monotone" dataKey="cost" name="Costo" stroke={brandHex} fill={brandHex} fillOpacity={0.15} strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-700 mb-1">Bóvedas por etapa</p><p className="text-[10px] text-gray-400 mb-3">Avance del proceso en todas las obras</p>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={stages}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} /><Tooltip /><Bar dataKey="value" name="Bóvedas" radius={[3, 3, 0, 0]}>{stages.map((s, i) => <Cell key={i} fill={s.color} />)}</Bar></BarChart></ResponsiveContainer></div></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto"><p className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">Por instalador</p>
          <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-y border-gray-100 text-left"><th className="px-4 py-2">Instalador</th><th className="px-3 py-2 text-right">Reportes</th><th className="px-3 py-2 text-right">Horas</th><th className="px-3 py-2 text-right">Fotos</th><th className="px-4 py-2 text-right">Material</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{summary.byInstaller.map(i => <tr key={i.user.id}><td className="px-4 py-2">{i.user.name}</td><td className="px-3 py-2 text-right">{i.reports}</td><td className="px-3 py-2 text-right">{i.hours.toFixed(1)}</td><td className="px-3 py-2 text-right">{i.photos}</td><td className="px-4 py-2 text-right font-medium">{money(i.cost)}</td></tr>)}</tbody></table></div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto"><p className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">Bóvedas más costosas</p>
          <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-y border-gray-100 text-left"><th className="px-4 py-2">Bóveda</th><th className="px-3 py-2">Obra</th><th className="px-3 py-2 text-right">Reportes</th><th className="px-4 py-2 text-right">Material</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{summary.bySite.slice(0, 10).map(s => <tr key={s.site.id}><td className="px-4 py-2">{s.site.code} <span className="text-xs text-gray-400">{s.site.name}</span></td><td className="px-3 py-2 text-xs text-gray-500">{s.project.name}</td><td className="px-3 py-2 text-right">{s.reports}</td><td className="px-4 py-2 text-right font-medium">{money(s.cost)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  )
}
