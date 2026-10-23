// ===================================================================
// Ficha de una VENTANA (punto de sellado) con su plano de sellado ROXTEC
//   /campo/ventanas/:openingId  → instalador: registra lo INSTALADO, consulta el proyecto
//   /field/ventanas/:openingId  → oficina: define el plano del PROYECTO, revisa lo instalado, historial
// ===================================================================
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, Copy, AlertTriangle, CheckCircle2, Download, Package, Camera } from 'lucide-react'
import api, { downloadFile } from '../lib/api'
import { fmtDate, fmtDateTime, money } from '../lib/field'
import { SealingPlanEditor, SealingPlanView, BomDiffTable, TransitDrawing, OpeningThumb } from '../components/SealingPlan'
import { compareBoms } from '../lib/roxtec'
import { PhotoGrid } from './InstallerPortal'

export default function OpeningPage({ mode = 'installer' }) {
  const { openingId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const office = mode === 'office'
  const { data: o, isLoading } = useQuery({ queryKey: ['field-opening', openingId], queryFn: () => api.get(`/field/openings/${openingId}`).then(r => r.data) })
  const { data: materials = [] } = useQuery({ queryKey: ['field-materials'], queryFn: () => api.get('/field/materials').then(r => r.data) })
  const [tab, setTab] = useState(office ? 'planned' : 'built')
  const [copyFromPlanned, setCopyFromPlanned] = useState(0) // contador para forzar el "copiar del proyecto"
  const [seed, setSeed] = useState(null)
  const [rev, setRev] = useState(null)
  if (isLoading) return <p className="text-center text-gray-400 py-10">Cargando ventana...</p>
  if (!o) return <p className="text-center text-gray-400 py-10">Ventana no encontrada</p>
  const back = office ? `/field/bovedas/${o.siteId}` : `/campo/bovedas/${o.siteId}`
  const inv = () => { qc.invalidateQueries(['field-opening', openingId]); qc.invalidateQueries(['field-site', o.siteId]); qc.invalidateQueries(['field-project']); qc.invalidateQueries(['field-bom']) }
  const tabs = office
    ? [{ k: 'planned', l: 'Proyecto' }, { k: 'built', l: 'Instalado' }, { k: 'compare', l: 'Comparar' }, { k: 'history', l: `Historial (${o.revisions.length})` }]
    : [{ k: 'built', l: 'Instalado' }, { k: 'planned', l: 'Proyecto' }, { k: 'compare', l: 'Comparar' }, { k: 'history', l: 'Historial' }]
  const builtInitial = seed || o.builtLayout

  return (
    <div className={office ? 'p-4 md:p-8 max-w-5xl mx-auto' : 'p-4'}>
      <button onClick={() => navigate(back)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft size={15} /> {o.site.code}{o.site.name ? ` · ${o.site.name}` : ''}</button>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Ventana: {o.label}</h1>
            {o.description && <p className="text-sm text-gray-500">{o.description}</p>}
            <p className="text-xs text-gray-400 mt-1">{o.site.project?.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${o.status === 'SEALED' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{o.status === 'SEALED' ? '● Sellada' : '○ Pendiente'}</span>
            {o.diff && <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${o.diff.hasDeviation ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{o.diff.hasDeviation ? <><AlertTriangle size={12} /> {o.diff.changed.length} cambio{o.diff.changed.length > 1 ? 's' : ''} vs proyecto</> : <><CheckCircle2 size={12} /> Igual al proyecto</>}</span>}
            {office && <button onClick={() => downloadFile(`/field/sites/${o.siteId}/sealing-plan.pdf`, `Plano-sellado-${o.site.code}.pdf`).catch(() => alert('Error al descargar'))} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1 text-gray-700 hover:border-brand-400"><Download size={13} /> PDF de la bóveda</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <OpeningThumb layout={o.plannedLayout} label={`Proyecto${o.plannedAt ? ` · ${fmtDate(o.plannedAt)}` : ''}`} empty="Oficina no ha definido el plano" />
          <OpeningThumb layout={o.builtLayout} label={`Instalado${o.builtAt ? ` · ${fmtDate(o.builtAt)}` : ''}`} empty="Aún no se registra lo instalado" />
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto mb-3 -mx-4 px-4 md:mx-0 md:px-0">
        {tabs.map(x => <button key={x.k} onClick={() => setTab(x.k)} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'}`}>{x.l}</button>)}
      </div>

      {tab === 'built' && (
        <div className="space-y-3">
          {!o.builtLayout && o.plannedLayout && !seed && (
            <button onClick={() => { setSeed(structuredClone(o.plannedLayout)); setCopyFromPlanned(c => c + 1) }} className="w-full flex items-center justify-center gap-2 border border-dashed border-brand-300 bg-brand-50 text-brand-700 rounded-xl py-3 text-sm font-medium"><Copy size={16} /> Empezar copiando el plano del proyecto y ajustar lo que cambió</button>
          )}
          <SealingPlanEditor key={`built-${copyFromPlanned}`} openingId={o.id} kind="BUILT" initial={builtInitial} planned={o.plannedBom} materials={materials} status={o.status} onSaved={() => { setSeed(null); inv() }} />
          {o.photos?.length > 0 && <div className="bg-white rounded-xl border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Camera size={12} /> Fotos de esta ventana ({o.photos.length})</p><PhotoGrid photos={o.photos} /></div>}
        </div>
      )}
      {tab === 'planned' && (office
        ? <SealingPlanEditor openingId={o.id} kind="PLANNED" initial={o.plannedLayout} materials={materials} onSaved={inv} />
        : <div className="space-y-3">
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-800">Así lo indica el proyecto. Si en sitio encontraste algo distinto (más cables, otro marco, cables de otro diámetro), regístralo en la pestaña <b>Instalado</b> y escribe en las notas por qué cambió.</div>
            <SealingPlanView layout={o.plannedLayout} title="Plano del proyecto" bom={o.plannedBom} />
          </div>)}
      {tab === 'compare' && (
        <div className="space-y-3">
          {o.plannedBom && o.builtBom ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-3"><p className="text-xs font-semibold text-blue-700 mb-1">PROYECTO</p><TransitDrawing layout={o.plannedLayout} /></div>
                <div className="bg-white rounded-xl border border-gray-200 p-3"><p className="text-xs font-semibold text-emerald-700 mb-1">INSTALADO</p><TransitDrawing layout={o.builtLayout} /></div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3"><BomDiffTable planned={o.plannedBom} built={o.builtBom} title="Material: proyecto vs instalado" /></div>
              {o.builtLayout?.notes && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900"><b>Notas del instalador:</b> {o.builtLayout.notes}</div>}
            </>
          ) : <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">Para comparar hacen falta los dos planos: {!o.plannedBom && 'el del proyecto'}{!o.plannedBom && !o.builtBom && ' y '}{!o.builtBom && 'el instalado'}.</div>}
        </div>
      )}
      {tab === 'history' && (
        <div className="space-y-2">
          {o.revisions.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Sin versiones guardadas</p>}
          {o.revisions.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${r.kind === 'PLANNED' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.kind === 'PLANNED' ? 'Proyecto' : 'Instalado'}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1"><History size={11} /> {fmtDateTime(r.createdAt)} · {r.author?.name}</span>
                <button onClick={() => api.get(`/field/openings/revisions/${r.id}`).then(x => setRev(x.data))} className="ml-auto text-xs text-brand-600 font-medium">Ver</button>
              </div>
              <p className="text-xs text-gray-700 mt-1">{r.summary}</p>
              {r.note && <p className="text-xs text-gray-500 italic mt-0.5">“{r.note}”</p>}
            </div>
          ))}
          {rev && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setRev(null)}>
              <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-semibold">Versión del {fmtDateTime(rev.createdAt)} · {rev.author?.name}</p><button onClick={() => setRev(null)} className="text-gray-400 text-xl leading-none">×</button></div>
                <SealingPlanView layout={rev.layout} bom={rev.bom} title={rev.kind === 'PLANNED' ? 'Proyecto' : 'Instalado'} />
                {rev.note && <p className="text-xs text-gray-500 italic mt-2">“{rev.note}”</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ===================================================================
// Comparación a nivel OBRA (oficina): asignado · proyecto · instalado · reportado
// ===================================================================
const FLAG = {
  DEVIATION: { label: 'Cambio vs proyecto', chip: 'bg-red-50 text-red-700' },
  UNREPORTED: { label: 'Dibujado, no reportado', chip: 'bg-amber-50 text-amber-700' },
  OVER_REPORTED: { label: 'Reportado de más', chip: 'bg-orange-50 text-orange-700' },
  OK: { label: 'OK', chip: 'bg-emerald-50 text-emerald-700' }
}
export function ProjectBomCompare({ projectId }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['field-bom', projectId], queryFn: () => api.get(`/field/projects/${projectId}/bom-compare`).then(r => r.data) })
  const [onlyIssues, setOnlyIssues] = useState(false)
  if (isLoading) return <p className="text-center text-gray-400 text-sm py-8">Comparando...</p>
  if (!data) return null
  const t = data.totals
  const rows = onlyIssues ? data.rows.filter(r => r.flag !== 'OK') : data.rows
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: 'Ventanas', v: t.openings, s: `${t.sealed} selladas` },
          { l: 'Con plano de proyecto', v: t.withPlanned, s: `${t.openings - t.withPlanned} sin definir` },
          { l: 'Con plano instalado', v: t.withBuilt, s: `${t.openings - t.withBuilt} pendientes` },
          { l: 'Ventanas con cambios', v: t.deviations, s: `${t.materialsDeviated} materiales difieren`, warn: t.deviations > 0 }
        ].map(k => <div key={k.l} className={`rounded-xl border p-3 ${k.warn ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}><p className="text-[10px] text-gray-500 uppercase tracking-wide">{k.l}</p><p className={`text-2xl font-semibold ${k.warn ? 'text-red-700' : 'text-gray-900'}`}>{k.v}</p><p className="text-[10px] text-gray-400">{k.s}</p></div>)}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Costo según proyecto', t.costPlanned], ['Costo según instalado', t.costBuilt], ['Costo reportado en campo', t.costReported]].map(([l, v]) => <div key={l} className="bg-white rounded-xl border border-gray-200 py-2"><p className="text-[10px] text-gray-400">{l}</p><p className="text-sm font-semibold text-gray-900">{money(v)}</p></div>)}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-3 gap-2 flex-wrap">
          <p className="text-xs text-gray-500">Por material: lo <b>asignado</b> a la obra, lo que indica el <b>proyecto</b> (planos), lo <b>instalado</b> (planos de campo) y lo <b>reportado</b> en reportes diarios. Las ventanas sin plano de proyecto cuentan como 0 en "Proyecto".</p>
          <label className="text-xs text-gray-600 flex items-center gap-1.5"><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} className="rounded" /> Solo diferencias</label>
        </div>
        <table className="w-full text-xs mt-2">
          <thead><tr className="border-y border-gray-100 text-gray-500 text-left"><th className="px-4 py-2">Material</th><th className="px-2 py-2 text-right">Asignado</th><th className="px-2 py-2 text-right">Proyecto</th><th className="px-2 py-2 text-right">Instalado</th><th className="px-2 py-2 text-right">Δ inst.−proy.</th><th className="px-2 py-2 text-right">Reportado</th><th className="px-2 py-2 text-right">Δ rep.−inst.</th><th className="px-4 py-2">Estado</th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={r.key} className="hover:bg-gray-50">
                <td className="px-4 py-1.5 text-gray-900">{r.name}{r.sku && <span className="text-gray-400 ml-1">{r.sku}</span>}{!r.material && <span className="block text-[10px] text-amber-600">sin SKU en catálogo</span>}</td>
                <td className="px-2 py-1.5 text-right text-gray-500">{r.allocated || '—'}</td>
                <td className="px-2 py-1.5 text-right">{r.planned || '—'}</td>
                <td className="px-2 py-1.5 text-right font-medium">{r.built || '—'}</td>
                <td className={`px-2 py-1.5 text-right font-semibold ${r.deltaBuilt > 0 ? 'text-red-600' : r.deltaBuilt < 0 ? 'text-amber-600' : 'text-gray-300'}`}>{r.deltaBuilt > 0 ? `+${r.deltaBuilt}` : r.deltaBuilt || '='}</td>
                <td className="px-2 py-1.5 text-right">{r.reported || '—'}</td>
                <td className={`px-2 py-1.5 text-right font-semibold ${r.deltaReported ? 'text-amber-600' : 'text-gray-300'}`}>{r.deltaReported > 0 ? `+${r.deltaReported}` : r.deltaReported || '='}</td>
                <td className="px-4 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FLAG[r.flag].chip}`}>{FLAG[r.flag].label}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">{onlyIssues ? 'Sin diferencias 🎉' : 'Todavía no hay planos ni material en esta obra'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-3 pb-2 flex items-center gap-1"><Package size={12} /> Ventanas ({data.openings.length})</p>
        <div className="divide-y divide-gray-50">
          {data.openings.map(o => (
            <button key={o.id} onClick={() => navigate(`/field/ventanas/${o.id}`)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${o.status === 'SEALED' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900"><span className="text-gray-500">{o.site.code} ·</span> {o.label}</p>
                <p className="text-[11px] text-gray-500 truncate">{o.built || o.planned || 'Sin plano'}</p>
                {o.changes?.length > 0 && <p className="text-[11px] text-red-600 mt-0.5">{o.changes.slice(0, 4).join(' · ')}{o.changes.length > 4 ? ` · +${o.changes.length - 4}` : ''}</p>}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${o.deviation === true ? 'bg-red-50 text-red-700' : o.deviation === false ? 'bg-emerald-50 text-emerald-700' : !o.hasPlanned ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'}`}>
                {o.deviation === true ? 'Cambios' : o.deviation === false ? 'Igual' : !o.hasPlanned ? 'Sin proyecto' : 'Sin instalar'}
              </span>
            </button>
          ))}
          {data.openings.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">Sin ventanas registradas</p>}
        </div>
      </div>
    </div>
  )
}

// Tarjeta de ventana para listas (bóveda): miniaturas proyecto / instalado + estado
export function OpeningCard({ o, onClick }) {
  const dev = o.plannedBom && o.builtBom ? compareBoms(o.plannedBom, o.builtBom).hasDeviation : null
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${o.status === 'SEALED' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        <p className="text-sm font-medium text-gray-900 flex-1 truncate">{o.label}</p>
        {dev === true && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium flex items-center gap-1"><AlertTriangle size={10} /> Cambios</span>}
        {dev === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">Igual al proyecto</span>}
        <span className="text-[10px] text-gray-400">{o.status === 'SEALED' ? 'Sellada' : 'Pendiente'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <OpeningThumb layout={o.plannedLayout} label="Proyecto" empty="Sin definir" />
        <OpeningThumb layout={o.builtLayout} label="Instalado" empty="Pendiente" />
      </div>
      {(o.builtBom?.summary || o.plannedBom?.summary) && <p className="text-[10px] text-gray-400 mt-1.5">{(o.builtBom || o.plannedBom).summary.cables} cables · {(o.builtBom || o.plannedBom).summary.modules} módulos · {(o.builtBom || o.plannedBom).summary.frames} marco{(o.builtBom || o.plannedBom).summary.frames !== 1 ? 's' : ''}</p>}
    </button>
  )
}
