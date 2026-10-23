// ===================================================================
// Plano de sellado ROXTEC — equivalente al "packing plan" de Roxtec Transit Designer
//  · TransitDrawing: dibujo SVG a escala (marcos, aberturas, filas de módulos RM, cables, reservas, stayplates, wedge)
//  · SealingPlanEditor: editor táctil (marcos → filas → módulos) con reglas Roxtec y lista de material en vivo
//  · BomTable / BomDiffTable / OpeningThumb: tablas y miniaturas para listas y comparaciones
// Reglas compartidas con el backend en lib/roxtec.js (archivo idéntico en ambos lados)
// ===================================================================
import { useState, useMemo, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, X, Trash2, ChevronUp, ChevronDown, Save, Copy, Wand2, AlertTriangle, CheckCircle2, Info, Cable, CircleDashed, Square } from 'lucide-react'
import api from '../lib/api'
import {
  MODULES, FRAME_TYPES, FRAME_SIZES, MAX_COLS, MAX_FRAMES, ROW_PRESETS, BLIND_SKU, OPENING_WIDTH, WEDGE_HEIGHT, BAR,
  packingHeightForSize, framePacking, frameSku, normalizeLayout, computeBom, compareBoms, layoutGeometry, moduleColor, suggestModule
} from '../lib/roxtec'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white'
const emptyLayout = () => ({ frames: [], extras: [], notes: '' })
const newBay = () => ({ rows: [] })
export const frameTitle = (f) => f.type === 'CUSTOM' ? `${f.sku || 'Marco'} · ${f.packingHeight} mm` : `${f.type} ${f.size}x${f.cols}`

// ===================================================================
// Dibujo SVG a escala (unidades = mm)
// ===================================================================
export function TransitDrawing({ layout, selected, onSelectBay, onSelectModule, compact = false, className = '', maxHeight }) {
  const geo = useMemo(() => layoutGeometry(layout, compact ? 12 : 20), [layout, compact])
  const uid = useMemo(() => Math.random().toString(36).slice(2, 7), [])
  if (!layout?.frames?.length) return <div className={`flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded-lg ${compact ? 'h-16' : 'h-32'} ${className}`}>Sin marcos</div>
  const DIM = compact ? 0 : 36, FOOT = compact ? 0 : 14
  // Si la etiqueta del marco es más ancha que el marco, ampliamos el lienzo para que no se corte
  const labelW = (f) => compact ? 0 : (`${f.label ? `${f.label} · ` : ''}${frameTitle(f)} · ${f.cols} aberturas de 120 × 240 mm`).length * 3.6
  const padL = Math.max(0, (labelW(layout.frames[0]) - geo.frames[0].w) / 2 - DIM + 4)
  const padR = Math.max(0, (labelW(layout.frames.at(-1)) - geo.frames.at(-1).w) / 2 + 2)
  const vbW = geo.width + DIM + 2 + padL + padR, vbH = geo.height + FOOT + 2
  const pxPerMm = compact ? 0.55 : 1.3
  return (
    <div className={`overflow-x-auto ${className}`}>
      <svg viewBox={`${-DIM - 1 - padL} -1 ${vbW} ${vbH}`} className="block h-auto mx-auto" style={{ width: '100%', minWidth: compact ? undefined : `${vbW * pxPerMm}px`, maxWidth: compact ? undefined : `${vbW * 2.6}px`, maxHeight }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><line x1="0" y1="0" x2="0" y2="6" stroke="#9CA3AF" strokeWidth="1.2" /></pattern>
          <pattern id={`miss-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="6" height="6" fill="#FEE2E2" /><line x1="0" y1="0" x2="0" y2="6" stroke="#F87171" strokeWidth="1" /></pattern>
        </defs>
        {layout.frames.map((f, fi) => {
          const g = geo.frames[fi]; const pk = framePacking(f)
          return (
            <g key={fi}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={2} fill="#9CA3AF" stroke="#374151" strokeWidth={compact ? 0.8 : 1.2} />
              {g.bays.map((b, bi) => {
                const bay = f.bays[bi]
                const bottom = b.y + b.h, packTop = bottom - pk
                const used = bay.rows.reduce((s, r) => s + r.h, 0)
                const isSel = selected && selected.f === fi && selected.b === bi && selected.r === undefined
                let yCur = bottom
                return (
                  <g key={bi}>
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#F3F4F6" className={onSelectBay ? 'cursor-pointer' : ''} onClick={() => onSelectBay?.(fi, bi)} />
                    {used < pk && <rect x={b.x} y={packTop} width={b.w} height={pk - used} fill={`url(#miss-${uid})`} stroke="#EF4444" strokeWidth={0.6} pointerEvents="none" />}
                    {used < pk && !compact && (pk - used) >= 14 && <text x={b.x + b.w / 2} y={packTop + (pk - used) / 2 + 2.5} fontSize={6} textAnchor="middle" fill="#B91C1C" pointerEvents="none">{bay.rows.length ? `faltan ${pk - used} mm` : 'abertura vacía'}</text>}
                    {bay.rows.map((r, ri) => {
                      yCur -= r.h
                      const rowY = yCur
                      let xCur = b.x
                      return (
                        <g key={ri}>
                          {r.modules.map((m, mi) => {
                            const spec = MODULES[m.sku]; const x = xCur; xCur += spec.w
                            const spare = !m.cables.length
                            const mSel = selected && selected.f === fi && selected.b === bi && selected.r === ri && selected.m === mi
                            const n = m.cables.length
                            const fs = Math.max(3.5, Math.min(7, r.h * 0.32))
                            return (
                              <g key={mi} className={onSelectModule ? 'cursor-pointer' : ''} onClick={(e) => { e.stopPropagation(); onSelectModule?.(fi, bi, ri, mi) }}>
                                <rect x={x} y={rowY} width={spec.w} height={r.h} fill={m.solid ? '#6B7280' : spare ? `url(#hatch-${uid})` : moduleColor(m.sku)} stroke={mSel ? '#2563EB' : '#374151'} strokeWidth={mSel ? 1.6 : 0.5} />
                                {m.cables.map((c, ci) => {
                                  const cx = x + spec.w * ((ci + 0.5) / n), cy = rowY + r.h / 2
                                  const maxR = Math.min(spec.w / n, r.h) * 0.42
                                  const rad = c.d ? Math.min(c.d / 2, maxR) : maxR * 0.6
                                  const inside = !compact && n === 1 && rad >= 9 && (c.tag || c.d)
                                  return (
                                    <g key={ci} pointerEvents="none">
                                      <circle cx={cx} cy={cy} r={rad} fill="#1F2937" stroke="#111827" strokeWidth={0.4} />
                                      {inside && <text x={cx} y={cy + (c.tag && c.d ? -0.5 : 1.8)} fontSize={Math.min(fs, rad * 0.45)} textAnchor="middle" fill="#FFFFFF" fontWeight="600">{(c.tag || `Ø${c.d}`).slice(0, Math.max(4, Math.floor(rad / 1.6)))}</text>}
                                      {inside && c.tag && c.d && <text x={cx} y={cy + Math.min(fs, rad * 0.45)} fontSize={Math.min(fs - 1, rad * 0.38)} textAnchor="middle" fill="#D1D5DB">Ø{c.d}</text>}
                                    </g>
                                  )
                                })}
                                {!compact && r.h > 8 && spec.w > 12 && !(n > 0 && r.h <= 20) && <text x={x + spec.w / 2} y={rowY + fs + 0.8} fontSize={fs} textAnchor="middle" fill={m.solid ? '#F9FAFB' : '#111827'} fontWeight="600" pointerEvents="none">{spec.name.replace('RM ', '')}{m.solid ? '/0' : ''}</text>}
                                {!compact && r.h > 15 && (() => { const big = n === 1 && m.cables[0] && Math.min(m.cables[0].d ? m.cables[0].d / 2 : 0, Math.min(spec.w, r.h) * 0.42) >= 9; const tag = big ? '' : m.cables.map(c => c.tag || (c.d ? `Ø${c.d}` : '')).filter(Boolean).join(' / '); const t = tag || (spare && !m.solid ? 'reserva' : ''); return t ? <text x={x + spec.w / 2} y={rowY + r.h - 1.5} fontSize={Math.max(3, fs - 1.5)} textAnchor="middle" fill={tag ? '#111827' : '#6B7280'} pointerEvents="none">{t.length > spec.w / 2.2 ? t.slice(0, Math.max(3, Math.floor(spec.w / 2.2))) + '…' : t}</text> : null })()}
                              </g>
                            )
                          })}
                          <line x1={b.x} y1={rowY} x2={b.x + b.w} y2={rowY} stroke="#111827" strokeWidth={1.5} pointerEvents="none" />
                        </g>
                      )
                    })}
                    {bay.rows.length > 0 && (
                      <g pointerEvents="none">
                        <polygon points={`${b.x + 5},${packTop - WEDGE_HEIGHT} ${b.x + b.w - 5},${packTop - WEDGE_HEIGHT} ${b.x + b.w},${packTop} ${b.x},${packTop}`} fill="#FCD34D" stroke="#92400E" strokeWidth={0.6} />
                        {!compact && <text x={b.x + b.w / 2} y={packTop - WEDGE_HEIGHT / 2 + 2.5} fontSize={6.5} textAnchor="middle" fill="#78350F" fontWeight="600">WEDGE 120</text>}
                      </g>
                    )}
                    {isSel && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#2563EB" strokeWidth={2} pointerEvents="none" />}
                  </g>
                )
              })}
              {!compact && <text x={g.x + g.w / 2} y={g.h + 8} fontSize={6.5} textAnchor="middle" fill="#374151" fontWeight="600">{f.label ? `${f.label} · ` : ''}{frameTitle(f)} <tspan fill="#9CA3AF" fontWeight="400">· {f.cols} abertura{f.cols > 1 ? 's' : ''} de {OPENING_WIDTH} × {pk} mm</tspan></text>}
              {!compact && fi === 0 && (
                <g>
                  <line x1={-6} y1={g.h - BAR} x2={-6} y2={g.h - BAR - pk} stroke="#9CA3AF" strokeWidth={0.5} />
                  <line x1={-9} y1={g.h - BAR} x2={-3} y2={g.h - BAR} stroke="#9CA3AF" strokeWidth={0.5} /><line x1={-9} y1={g.h - BAR - pk} x2={-3} y2={g.h - BAR - pk} stroke="#9CA3AF" strokeWidth={0.5} />
                  <text x={-9} y={g.h - BAR - pk / 2 + 2} fontSize={6} textAnchor="end" fill="#6B7280">{pk} mm</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function OpeningThumb({ layout, label, empty = 'Sin plano' }) {
  return (
    <div className="bg-gray-50 rounded-lg p-1.5 min-w-0">
      {label && <p className="text-[10px] text-gray-400 font-medium mb-1">{label}</p>}
      {layout?.frames?.length ? <TransitDrawing layout={layout} compact maxHeight={70} /> : <div className="h-12 flex items-center justify-center text-[10px] text-gray-400">{empty}</div>}
    </div>
  )
}

// ===================================================================
// Lista de material
// ===================================================================
const CAT_LABEL = { FRAME: 'Marcos', MODULE: 'Módulos RM', STAYPLATE: 'Stayplates', WEDGE: 'Wedges', EXTRA: 'Otros / sellos' }
export function BomTable({ bom, compact = false }) {
  if (!bom?.lines?.length) return <p className="text-xs text-gray-400 py-3 text-center">Sin material (dibuja los marcos y filas)</p>
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-gray-50">
        {bom.lines.map((l, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2 text-gray-800">{l.name}{!compact && l.sku && <span className="text-gray-400 ml-1">{l.sku}</span>}
              {l.category === 'MODULE' && (l.spare || l.solid) ? <span className="block text-[10px] text-gray-400">{l.withCable ? `${l.withCable} con cable · ` : ''}{l.spare ? `${l.spare} reserva` : ''}{l.solid ? `${l.solid} ciego` : ''}</span> : null}</td>
            <td className="py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">{l.qty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function BomDiffTable({ planned, built, title }) {
  const cmp = useMemo(() => compareBoms(planned, built), [planned, built])
  if (!cmp.rows.length) return <p className="text-xs text-gray-400 py-3 text-center">Sin material que comparar</p>
  return (
    <div>
      {title && <p className="text-xs font-semibold text-gray-500 mb-1">{title}</p>}
      <table className="w-full text-xs">
        <thead><tr className="text-[10px] text-gray-400 uppercase"><th className="text-left py-1 font-medium">Material</th><th className="text-right py-1 font-medium">Proyecto</th><th className="text-right py-1 font-medium">Instalado</th><th className="text-right py-1 font-medium">Δ</th></tr></thead>
        <tbody className="divide-y divide-gray-50">
          {cmp.rows.map((r, i) => (
            <tr key={i} className={r.delta ? 'bg-red-50/60' : ''}>
              <td className="py-1.5 pr-2 text-gray-800">{r.name}</td>
              <td className="py-1.5 text-right text-gray-600">{r.planned || '—'}</td>
              <td className="py-1.5 text-right text-gray-900 font-medium">{r.built || '—'}</td>
              <td className={`py-1.5 text-right font-semibold ${r.delta > 0 ? 'text-red-600' : r.delta < 0 ? 'text-amber-600' : 'text-gray-300'}`}>{r.delta > 0 ? `+${r.delta}` : r.delta || '='}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`text-xs mt-2 flex items-center gap-1 ${cmp.hasDeviation ? 'text-red-600' : 'text-emerald-700'}`}>{cmp.hasDeviation ? <><AlertTriangle size={13} /> {cmp.changed.length} material{cmp.changed.length > 1 ? 'es' : ''} con diferencia respecto al proyecto{cmp.framesChanged ? ' (cambió el marco)' : ''}</> : <><CheckCircle2 size={13} /> Lo instalado coincide con el proyecto</>}</p>
    </div>
  )
}

// Rellena exactamente `remaining` mm con filas de reserva (menos filas posible, módulos grandes primero)
function fillPlan(remaining) {
  const heights = [60, 40, 30, 20, 15]
  const memo = {}
  const best = (rem) => {
    if (rem === 0) return []
    if (rem < 15 || memo[rem] !== undefined) return memo[rem] ?? null
    let res = null
    for (const h of heights) { if (h > rem) continue; const sub = best(rem - h); if (sub && (!res || sub.length + 1 < res.length)) res = [h, ...sub] }
    memo[rem] = res
    return res
  }
  return best(remaining)
}
const presetFor = (h) => ROW_PRESETS.find(p => p.h === h && !p.label.includes('w40') && !p.label.includes('H80'))
const makeRow = (preset) => ({ h: preset.h, modules: preset.skus.map(sku => ({ sku, cables: [], solid: false })) })

// ===================================================================
// Editor
// ===================================================================
export function SealingPlanEditor({ openingId, kind, initial, planned, materials = [], readOnly = false, onSaved, status }) {
  const [layout, setLayout] = useState(() => initial || emptyLayout())
  const [sel, setSel] = useState(null) // { f, b } ó { f, b, r, m }
  const [addFrame, setAddFrame] = useState(null) // { type, size, cols, packingHeight, sku }
  const [note, setNote] = useState('')
  const [markSealed, setMarkSealed] = useState(status === 'SEALED')
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setLayout(initial || emptyLayout()); setDirty(false) }, [initial])

  const check = useMemo(() => normalizeLayout(layout), [layout])
  const bom = useMemo(() => check.layout ? computeBom(check.layout) : null, [check])
  const update = (fn) => { setLayout(l => { const n = structuredClone(l); fn(n); return n }); setDirty(true) }

  const save = useMutation({
    mutationFn: () => api.put(`/field/openings/${openingId}/layout`, { kind, layout, note, ...(kind === 'BUILT' && { markSealed }) }),
    onSuccess: (r) => { setDirty(false); setNote(''); onSaved?.(r.data) },
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  // ---- marcos ----
  const commitFrame = () => {
    const f = addFrame
    const frame = { type: f.type, size: f.type === 'CUSTOM' ? null : Number(f.size), cols: Number(f.cols), packingHeight: f.type === 'CUSTOM' ? Number(f.packingHeight) || 120 : packingHeightForSize(Number(f.size)), sku: f.type === 'CUSTOM' ? (f.sku || 'MARCO') : null, label: f.label || null, bays: Array.from({ length: Number(f.cols) }, newBay) }
    if (f.index !== undefined) update(l => { const old = l.frames[f.index]; frame.bays = frame.bays.map((b, i) => old.bays[i] || b); l.frames[f.index] = frame })
    else update(l => { l.frames.push(frame) })
    setAddFrame(null); setSel({ f: f.index ?? layout.frames.length, b: 0 })
  }
  const removeFrame = (fi) => { if (!confirm('¿Quitar este marco y sus filas?')) return; update(l => { l.frames.splice(fi, 1) }); setSel(null) }

  // ---- filas ----
  const bayOf = (s) => s && layout.frames[s.f]?.bays[s.b]
  const selBay = bayOf(sel)
  const selFrame = sel && layout.frames[sel.f]
  const used = selBay ? selBay.rows.reduce((s, r) => s + r.h, 0) : 0
  const remaining = selFrame ? framePacking(selFrame) - used : 0
  const addRow = (preset) => update(l => { l.frames[sel.f].bays[sel.b].rows.push(makeRow(preset)) })
  const removeRow = (ri) => update(l => { l.frames[sel.f].bays[sel.b].rows.splice(ri, 1) })
  const moveRow = (ri, dir) => update(l => { const rows = l.frames[sel.f].bays[sel.b].rows; const j = ri + dir; if (j < 0 || j >= rows.length) return; [rows[ri], rows[j]] = [rows[j], rows[ri]] })
  const autoFill = () => { const plan = fillPlan(remaining); if (!plan) return alert(`No hay combinación de módulos que llene exactamente ${remaining} mm. Ajusta las filas.`); update(l => { for (const h of plan) l.frames[sel.f].bays[sel.b].rows.push(makeRow(presetFor(h))) }) }
  const copyBayToOthers = () => update(l => { const src = l.frames[sel.f].bays[sel.b]; l.frames.forEach((f, fi) => f.bays.forEach((b, bi) => { if ((fi !== sel.f || bi !== sel.b) && framePacking(f) === framePacking(l.frames[sel.f]) && !b.rows.length) f.bays[bi] = structuredClone(src) })) })

  // ---- módulos ----
  const selMod = sel?.r !== undefined ? layout.frames[sel.f]?.bays[sel.b]?.rows[sel.r]?.modules[sel.m] : null
  const setMod = (fn) => update(l => fn(l.frames[sel.f].bays[sel.b].rows[sel.r].modules[sel.m], l.frames[sel.f].bays[sel.b].rows[sel.r]))
  const spec = selMod && MODULES[selMod.sku]
  const variants = spec ? Object.entries(MODULES).filter(([k, v]) => k !== selMod.sku && v.w === spec.w && v.h === spec.h) : []

  const extrasCatalog = materials.filter(m => !['FRAME', 'MODULE', 'STAYPLATE', 'WEDGE'].includes(m.category) && m.isActive !== false)

  return (
    <div className="space-y-3">
      {/* Marcos */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Marcos ({layout.frames.length})</p>
          {!readOnly && layout.frames.length < MAX_FRAMES && <button onClick={() => setAddFrame({ type: 'B', size: layout.frames.at(-1)?.size || 4, cols: layout.frames.at(-1)?.cols || 1, label: '' })} className="text-xs font-medium text-brand-600 flex items-center gap-1"><Plus size={13} /> Agregar marco</button>}
        </div>
        {layout.frames.length === 0 && <p className="text-xs text-gray-400">Empieza agregando el primer marco (por ejemplo <b>B 4x1</b>: una abertura de 120 × 120 mm). Puedes poner 1, 2, 3 o más marcos en la misma ventana.</p>}
        <div className="flex flex-wrap gap-1.5">
          {layout.frames.map((f, fi) => (
            <div key={fi} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${sel?.f === fi ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
              <button onClick={() => setSel({ f: fi, b: 0 })} className="font-medium">Marco {fi + 1}: {frameTitle(f)}</button>
              {!readOnly && <><button onClick={() => setAddFrame({ index: fi, type: f.type, size: f.size || 4, cols: f.cols, packingHeight: f.packingHeight, sku: f.sku || '', label: f.label || '' })} className="text-gray-400 hover:text-gray-700 ml-1" title="Cambiar tamaño">✎</button><button onClick={() => removeFrame(fi)} className="text-gray-400 hover:text-red-500"><X size={12} /></button></>}
            </div>
          ))}
        </div>
        {addFrame && (
          <div className="mt-3 border-t border-gray-100 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] text-gray-500 mb-1">Tipo</label>
              <select value={addFrame.type} onChange={e => setAddFrame(a => ({ ...a, type: e.target.value }))} className={inputCls}>{Object.entries(FRAME_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            {addFrame.type !== 'CUSTOM' ? (
              <div><label className="block text-[10px] text-gray-500 mb-1">Tamaño (altura)</label>
                <select value={addFrame.size} onChange={e => setAddFrame(a => ({ ...a, size: e.target.value }))} className={inputCls}>{FRAME_SIZES.map(s => <option key={s} value={s}>{s} → {packingHeightForSize(s)} mm</option>)}</select></div>
            ) : (
              <><div><label className="block text-[10px] text-gray-500 mb-1">Modelo</label><input value={addFrame.sku} onChange={e => setAddFrame(a => ({ ...a, sku: e.target.value }))} placeholder="SF 4x1, S 6x1…" className={inputCls} /></div>
                <div><label className="block text-[10px] text-gray-500 mb-1">Altura empaque (mm)</label><input type="number" value={addFrame.packingHeight || ''} onChange={e => setAddFrame(a => ({ ...a, packingHeight: e.target.value }))} className={inputCls} /></div></>
            )}
            <div><label className="block text-[10px] text-gray-500 mb-1">Aberturas</label>
              <select value={addFrame.cols} onChange={e => setAddFrame(a => ({ ...a, cols: e.target.value }))} className={inputCls}>{Array.from({ length: MAX_COLS }, (_, i) => i + 1).map(c => <option key={c} value={c}>{c} × 120 mm</option>)}</select></div>
            <div><label className="block text-[10px] text-gray-500 mb-1">Etiqueta (opcional)</label><input value={addFrame.label} onChange={e => setAddFrame(a => ({ ...a, label: e.target.value }))} placeholder="Lado norte" className={inputCls} /></div>
            <div className="col-span-2 sm:col-span-4 flex items-center justify-between gap-2">
              <p className="text-[10px] text-gray-400 flex items-center gap-1"><Info size={11} /> {FRAME_TYPES[addFrame.type]?.help} {addFrame.type !== 'CUSTOM' && <>Resultado: <b className="ml-1">{addFrame.type} {addFrame.size}x{addFrame.cols}</b></>}</p>
              <div className="flex gap-2"><button onClick={() => setAddFrame(null)} className="text-xs text-gray-500 px-3 py-1.5">Cancelar</button><button onClick={commitFrame} className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-medium">{addFrame.index !== undefined ? 'Aplicar' : 'Agregar'}</button></div>
            </div>
          </div>
        )}
      </div>

      {/* Dibujo */}
      {layout.frames.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plano</p>
          <p className="text-[10px] text-gray-400 mb-1">{readOnly ? 'Solo lectura' : 'Toca una abertura para llenarla · toca un módulo para ponerle cable'}</p>
          <TransitDrawing layout={check.layout || layout} selected={sel} onSelectBay={(f, b) => setSel({ f, b })} onSelectModule={readOnly ? undefined : (f, b, r, m) => setSel({ f, b, r, m })} />
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#A7F3D0] border border-gray-400 inline-block" /> módulo con cable</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block border border-gray-400" style={{ background: 'repeating-linear-gradient(45deg,#fff 0 2px,#9CA3AF 2px 3px)' }} /> reserva</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-500 inline-block" /> ciego /0</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-300 inline-block border border-amber-800" /> wedge</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-900 inline-block" /> stayplate</span>
          </div>
        </div>
      )}

      {/* Panel de abertura seleccionada */}
      {selBay && selFrame && !readOnly && (
        <div className="bg-white rounded-xl border border-brand-200 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-gray-900">Marco {sel.f + 1} · Abertura {sel.b + 1} <span className="text-gray-400 font-normal text-xs">de {selFrame.cols}</span></p>
            <span className={`text-xs font-semibold ${remaining === 0 ? 'text-emerald-600' : remaining < 0 ? 'text-red-600' : 'text-amber-600'}`}>{used} / {framePacking(selFrame)} mm</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3"><div className={`h-full ${remaining === 0 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (used / framePacking(selFrame)) * 100)}%` }} /></div>
          {selBay.rows.length > 0 && (
            <div className="space-y-1 mb-3">
              {[...selBay.rows].map((r, ri) => ({ r, ri })).reverse().map(({ r, ri }) => (
                <div key={ri} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                  <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center" style={{ background: moduleColor(r.modules[0].sku) }}>{ri + 1}</span>
                  <span className="flex-1 text-gray-800">{Object.entries(r.modules.reduce((acc, m) => { acc[m.sku] = (acc[m.sku] || 0) + 1; return acc }, {})).map(([k, n]) => `${MODULES[k].name} ×${n}`).join(' + ')} <span className="text-gray-400">· {r.h} mm · {r.modules.reduce((s, m) => s + m.cables.length, 0)} cables</span></span>
                  <button onClick={() => moveRow(ri, 1)} disabled={ri === selBay.rows.length - 1} className="text-gray-400 disabled:opacity-20" title="Subir"><ChevronUp size={14} /></button>
                  <button onClick={() => moveRow(ri, -1)} disabled={ri === 0} className="text-gray-400 disabled:opacity-20" title="Bajar"><ChevronDown size={14} /></button>
                  <button onClick={() => removeRow(ri)} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              ))}
              <p className="text-[10px] text-gray-400">Las filas se apilan de abajo hacia arriba (fila 1 = abajo). Roxtec recomienda los módulos grandes abajo y las reservas cerca del wedge.</p>
            </div>
          )}
          {remaining > 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5">Agregar fila <span className="text-gray-400 font-normal">(caben {remaining} mm)</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {ROW_PRESETS.filter(p => p.h <= remaining).map(p => (
                  <button key={p.id} onClick={() => addRow(p)} className="text-left border border-gray-200 hover:border-brand-400 rounded-lg px-2 py-1.5 text-xs bg-white">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block border border-gray-400" style={{ background: moduleColor(p.skus[0]) }} /><b>{p.label}</b></span>
                    <span className="text-[10px] text-gray-400">{p.h} mm de alto · Ø {MODULES[p.skus[0]].dMin}–{MODULES[p.skus[0]].dMax} mm</span>
                  </button>
                ))}
                <button onClick={autoFill} className="text-left border border-dashed border-gray-300 hover:border-brand-400 rounded-lg px-2 py-1.5 text-xs bg-gray-50 flex items-center gap-1.5"><Wand2 size={13} className="text-brand-500" /><span><b>Rellenar con reserva</b><span className="block text-[10px] text-gray-400">completa los {remaining} mm con módulos vacíos</span></span></button>
              </div>
            </div>
          ) : remaining === 0 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> Abertura completa ({selBay.rows.length} filas → {selBay.rows.length} stayplates + 1 wedge)</p>
              {layout.frames.some((f, fi) => f.bays.some((b, bi) => (fi !== sel.f || bi !== sel.b) && !b.rows.length && framePacking(f) === framePacking(selFrame))) && <button onClick={copyBayToOthers} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Copy size={12} /> Copiar a aberturas vacías</button>}
            </div>
          ) : <p className="text-xs text-red-600">Las filas exceden la altura del marco: quita una fila.</p>}
        </div>
      )}

      {/* Extras (sellos redondos, lubricante...) y notas */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Otro material de la ventana</p>
          {!readOnly && <button onClick={() => update(l => { l.extras.push({ sku: extrasCatalog[0]?.sku || '', name: extrasCatalog[0]?.name || '', qty: 1, note: '' }) })} className="text-xs font-medium text-brand-600 flex items-center gap-1"><Plus size={13} /> Agregar</button>}
        </div>
        {layout.extras.length === 0 && <p className="text-xs text-gray-400">Sellos redondos RS, lubricante u otro material que no va dentro de los marcos.</p>}
        <div className="space-y-1.5">
          {layout.extras.map((e, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              {extrasCatalog.length ? (
                <select value={e.sku || `name:${e.name}`} onChange={ev => update(l => { const m = extrasCatalog.find(x => x.sku === ev.target.value); l.extras[i].sku = m?.sku || ''; l.extras[i].name = m?.name || l.extras[i].name })} disabled={readOnly} className={inputCls + ' flex-1 min-w-0'}>
                  {!e.sku && <option value={`name:${e.name}`}>{e.name || 'Elegir…'}</option>}
                  {extrasCatalog.map(m => <option key={m.id} value={m.sku || ''}>{m.name}</option>)}
                </select>
              ) : <input value={e.name} onChange={ev => update(l => { l.extras[i].name = ev.target.value })} placeholder="Sello RS 75…" disabled={readOnly} className={inputCls + ' flex-1'} />}
              <input type="number" min="0" step="any" value={e.qty} onChange={ev => update(l => { l.extras[i].qty = ev.target.value })} disabled={readOnly} className="w-20 flex-shrink-0 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white" />
              {!readOnly && <button onClick={() => update(l => { l.extras.splice(i, 1) })} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        <textarea rows={2} value={layout.notes || ''} onChange={e => update(l => { l.notes = e.target.value })} disabled={readOnly} placeholder="Notas del plano (cables sin identificar, cambios respecto al proyecto, observaciones de CFE…)" className={inputCls + ' mt-2 resize-none'} />
      </div>

      {/* Material en vivo + comparación */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Material según este plano</p>
          <BomTable bom={bom} />
          {bom && bom.summary.frames > 0 && <p className="text-[10px] text-gray-400 mt-2">{bom.summary.cables} cables · {bom.summary.spareModules + bom.summary.solidModules} módulos de reserva ({bom.summary.sparePct}% del área) · {bom.summary.rows} filas · llenado {bom.summary.fillPct}%</p>}
        </div>
        {planned && kind === 'BUILT' && (
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <BomDiffTable planned={planned} built={bom} title="Comparación con el proyecto" />
          </div>
        )}
      </div>

      {/* Avisos */}
      {(check.errors.length > 0 || check.warnings.length > 0) && (
        <div className={`rounded-xl border p-3 text-xs space-y-1 ${check.errors.length ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {check.errors.map((e, i) => <p key={`e${i}`} className="flex items-start gap-1"><X size={12} className="mt-0.5 flex-shrink-0" /> {e}</p>)}
          {check.warnings.map((w, i) => <p key={`w${i}`} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {w}</p>)}
        </div>
      )}

      {/* Guardar */}
      {!readOnly && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comentario de esta versión (opcional, queda en el historial)" className={inputCls} />
          {kind === 'BUILT' && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={markSealed} onChange={e => setMarkSealed(e.target.checked)} className="rounded" /> Ventana sellada y terminada</label>}
          <button onClick={() => save.mutate()} disabled={save.isPending || check.errors.length > 0} className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl">
            <Save size={18} /> {save.isPending ? 'Guardando…' : kind === 'PLANNED' ? 'Guardar plano del proyecto' : 'Guardar plano instalado'}
          </button>
          {dirty && <p className="text-[10px] text-amber-600 text-center">Tienes cambios sin guardar</p>}
        </div>
      )}

      {/* Hoja inferior: módulo seleccionado */}
      {selMod && spec && !readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-2xl rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{spec.name} <span className="text-gray-400 font-normal text-xs">· marco {sel.f + 1}, abertura {sel.b + 1}, fila {sel.r + 1}, módulo {sel.m + 1}</span></p>
                <p className="text-[11px] text-gray-500">Sella cables de Ø {spec.dMin} a {spec.dMax} mm{spec.twin ? ` · ${spec.cables} cables por módulo` : ''}</p>
              </div>
              <button onClick={() => setSel({ f: sel.f, b: sel.b })} className="text-gray-400 p-1"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[{ k: 'cable', l: 'Con cable', icon: <Cable size={15} />, active: selMod.cables.length > 0 }, { k: 'spare', l: 'Reserva', icon: <CircleDashed size={15} />, active: !selMod.cables.length && !selMod.solid }, { k: 'solid', l: 'Ciego /0', icon: <Square size={15} />, active: selMod.solid, disabled: !BLIND_SKU[selMod.sku] }].map(o => (
                <button key={o.k} disabled={o.disabled} onClick={() => setMod(m => { if (o.k === 'cable') { m.solid = false; if (!m.cables.length) m.cables = [{ d: null, tag: '' }] } else { m.cables = []; m.solid = o.k === 'solid' } })}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs font-medium disabled:opacity-30 ${o.active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>{o.icon}{o.l}</button>
              ))}
            </div>
            {selMod.cables.length > 0 && (
              <div className="space-y-2 mb-3">
                {selMod.cables.map((c, ci) => {
                  const d = Number(c.d); const out = d > 0 && (d < spec.dMin || d > spec.dMax); const sug = out ? suggestModule(d) : null
                  return (
                    <div key={ci} className="bg-gray-50 rounded-lg p-2">
                      <div className="flex gap-2">
                        <div className="w-28 flex-shrink-0"><label className="block text-[10px] text-gray-500 mb-0.5">Ø cable (mm)</label><input type="number" step="0.5" min="0" inputMode="decimal" value={c.d ?? ''} onChange={e => setMod(m => { m.cables[ci].d = e.target.value === '' ? null : Number(e.target.value) })} className={inputCls} /></div>
                        <div className="flex-1"><label className="block text-[10px] text-gray-500 mb-0.5">Etiqueta / circuito</label><input value={c.tag || ''} onChange={e => setMod(m => { m.cables[ci].tag = e.target.value })} placeholder="C-1 23 kV, control, fibra…" className={inputCls} /></div>
                        {spec.cables > 1 && <button onClick={() => setMod(m => { m.cables.splice(ci, 1) })} className="text-gray-300 hover:text-red-500 self-end pb-2"><Trash2 size={14} /></button>}
                      </div>
                      {out && <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1"><AlertTriangle size={11} /> Ø {d} mm está fuera del rango de {spec.name}.{sug ? ` Usa ${sug.name} (${sug.dMin}–${sug.dMax} mm).` : ' No hay módulo estándar para ese diámetro.'}</p>}
                    </div>
                  )
                })}
                {spec.cables > selMod.cables.length && <button onClick={() => setMod(m => { m.cables.push({ d: null, tag: '' }) })} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus size={12} /> Otro cable en este módulo ({selMod.cables.length}/{spec.cables})</button>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 text-xs">
              {variants.map(([k, v]) => <button key={k} onClick={() => setMod(m => { m.sku = k; if (!BLIND_SKU[k]) m.solid = false })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 hover:border-brand-400">Cambiar a <b>{v.name}</b> <span className="text-gray-400">(Ø {v.dMin}–{v.dMax})</span></button>)}
              <button onClick={() => setMod((m, row) => { const tpl = structuredClone(m); row.modules.forEach((x, i) => { if (i !== sel.m) { x.solid = tpl.solid; x.cables = tpl.cables.map(c => ({ d: c.d, tag: '' })) } }) })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 hover:border-brand-400 flex items-center gap-1"><Copy size={12} /> Aplicar a toda la fila</button>
              <button onClick={() => { const next = sel.m + 1 < layout.frames[sel.f].bays[sel.b].rows[sel.r].modules.length ? { ...sel, m: sel.m + 1 } : (sel.r + 1 < layout.frames[sel.f].bays[sel.b].rows.length ? { ...sel, r: sel.r + 1, m: 0 } : { f: sel.f, b: sel.b }); setSel(next) }} className="ml-auto bg-gray-800 text-white rounded-lg px-3 py-1.5 font-medium">Siguiente módulo →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Vista de solo lectura (dibujo + material) para proyecto / historial
export function SealingPlanView({ layout, title, bom }) {
  const b = bom || (layout ? computeBom(normalizeLayout(layout).layout) : null)
  if (!layout?.frames?.length && !layout?.extras?.length) return <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">{title ? `${title}: ` : ''}sin plano registrado</div>
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
      {title && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>}
      <TransitDrawing layout={layout} />
      <BomTable bom={b} compact />
      {layout.notes && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 whitespace-pre-wrap">{layout.notes}</p>}
    </div>
  )
}
