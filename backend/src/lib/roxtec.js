// ===================================================================
// ROXTEC — reglas del sistema de sellado rectangular (marcos B / GKO + módulos RM Multidiameter)
// Archivo COMPARTIDO: backend/src/lib/roxtec.js y frontend/src/lib/roxtec.js deben ser idénticos
// (la prueba de integración lo verifica). Sin imports: JS puro.
//
// Fuentes (fichas técnicas roxtec.com, oct-2026):
//  · Marco B: cada abertura mide 120 mm de ancho; la altura de empaque depende del tamaño:
//    B 2x_ = 60 mm · B 4x_ = 120 mm · B 6x_ = 180 mm · B 8x_ = 240 mm  (30 mm × tamaño).
//    El segundo número son las aberturas lado a lado (1 a 5). Profundidad 60 mm.
//  · Wedge 120: 124 × 38 × 133 mm, una unidad de compresión por abertura. Wedge clip verifica apriete.
//  · Instrucción oficial: "la suma de alturas de los módulos = altura de empaque"; una stayplate
//    entre cada fila y la última fila va ENTRE DOS stayplates (⇒ stayplates = filas por abertura).
//  · Un módulo con su núcleo sólido funciona como módulo de RESERVA para capacidad futura.
// ===================================================================

export const OPENING_WIDTH = 120  // mm, ancho útil de cada abertura
export const WEDGE_HEIGHT = 38    // mm, altura nominal del wedge (dibujo)
export const BAR = 10             // mm, grosor visual de los travesaños del marco (dibujo)
export const MAX_FRAMES = 6
export const MAX_ROWS = 16

export const FRAME_TYPES = {
  B:      { label: 'Marco B', help: 'Atornillado al muro o a placa; el más común en bóvedas.' },
  GKO:    { label: 'Marco GKO', help: 'Se arma alrededor de cables ya tendidos (lados + travesaños).' },
  CUSTOM: { label: 'Otro marco', help: 'Cualquier marco de 120 mm de ancho por abertura (SF, S, GH...). Indica la altura de empaque.' }
}
export const FRAME_SIZES = [2, 4, 6, 8]
export const MAX_COLS = 5
export const packingHeightForSize = (size) => size * 30

// Módulos RM (ancho × alto en mm, cables por módulo y rango de diámetro que sellan)
export const MODULES = {
  'RM-15':       { name: 'RM 15',       w: 15,  h: 15,  cables: 1, dMin: 3,    dMax: 11 },
  'RM-15w40':    { name: 'RM 15w40',    w: 40,  h: 15,  cables: 3, dMin: 3.5,  dMax: 10.5, twin: true },
  'RM-20':       { name: 'RM 20',       w: 20,  h: 20,  cables: 1, dMin: 4,    dMax: 14.5 },
  'RM-20w40':    { name: 'RM 20w40',    w: 40,  h: 20,  cables: 2, dMin: 3.5,  dMax: 16.5, twin: true },
  'RM-30':       { name: 'RM 30',       w: 30,  h: 30,  cables: 1, dMin: 10,   dMax: 25 },
  'RM-40':       { name: 'RM 40',       w: 40,  h: 40,  cables: 1, dMin: 21.5, dMax: 34.5 },
  'RM-40-10-32': { name: 'RM 40 10-32', w: 40,  h: 40,  cables: 1, dMin: 9.5,  dMax: 32.5, variantOf: 'RM-40' },
  'RM-60':       { name: 'RM 60',       w: 60,  h: 60,  cables: 1, dMin: 28,   dMax: 54 },
  'RM-60-24-54': { name: 'RM 60 24-54', w: 60,  h: 60,  cables: 1, dMin: 24,   dMax: 54, variantOf: 'RM-60' },
  'RM-80':       { name: 'RM 80',       w: 80,  h: 80,  cables: 1, dMin: 48,   dMax: 71 },
  'RM-40H80':    { name: 'RM 40H80',    w: 40,  h: 80,  cables: 1, dMin: 21.5, dMax: 34.5 },
  'RM-120':      { name: 'RM 120',      w: 120, h: 120, cables: 1, dMin: 67.5, dMax: 99 }
}
// Módulos ciegos (sólidos, sin núcleo desmontable) disponibles en catálogo "x/0"
export const BLIND_SKU = { 'RM-20': 'RM-20_0', 'RM-30': 'RM-30_0', 'RM-40': 'RM-40_0', 'RM-60': 'RM-60_0' }

export const ROW_HEIGHTS = [...new Set(Object.values(MODULES).map(m => m.h))].sort((a, b) => a - b)

// Combinaciones válidas de una fila (siempre suman 120 mm de ancho)
export const ROW_PRESETS = [
  { id: 'h15-8',   h: 15,  skus: Array(8).fill('RM-15'),                     label: 'RM 15 ×8' },
  { id: 'h15-tw',  h: 15,  skus: Array(3).fill('RM-15w40'),                  label: 'RM 15w40 ×3 (3 cables c/u)' },
  { id: 'h20-6',   h: 20,  skus: Array(6).fill('RM-20'),                     label: 'RM 20 ×6' },
  { id: 'h20-tw',  h: 20,  skus: Array(3).fill('RM-20w40'),                  label: 'RM 20w40 ×3 (2 cables c/u)' },
  { id: 'h20-mix', h: 20,  skus: ['RM-20w40', 'RM-20', 'RM-20', 'RM-20', 'RM-20'], label: 'RM 20w40 ×1 + RM 20 ×4' },
  { id: 'h30-4',   h: 30,  skus: Array(4).fill('RM-30'),                     label: 'RM 30 ×4' },
  { id: 'h40-3',   h: 40,  skus: Array(3).fill('RM-40'),                     label: 'RM 40 ×3' },
  { id: 'h60-2',   h: 60,  skus: Array(2).fill('RM-60'),                     label: 'RM 60 ×2' },
  { id: 'h80-mix', h: 80,  skus: ['RM-80', 'RM-40H80'],                      label: 'RM 80 + RM 40H80' },
  { id: 'h80-3',   h: 80,  skus: Array(3).fill('RM-40H80'),                  label: 'RM 40H80 ×3' },
  { id: 'h120-1',  h: 120, skus: ['RM-120'],                                 label: 'RM 120 ×1' }
]

// Material fijo
export const STAYPLATE_SKU = 'STAYPLATE-120'
export const WEDGE_SKU = 'WEDGE-120'
export const WEDGE_CLIP_SKU = 'WEDGE-CLIP'
const FIXED_NAMES = { [STAYPLATE_SKU]: 'Stayplate 120', [WEDGE_SKU]: 'Wedge 120 (unidad de compresión)', [WEDGE_CLIP_SKU]: 'Wedge clip' }

// Normaliza un SKU para comparar con el catálogo: mayúsculas, sin espacios/guiones, "_" → "/"
export const normSku = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/_/g, '/')

export const frameSku = (f) => f.type === 'CUSTOM' ? (f.sku || 'MARCO') : `${f.type}-${f.size}x${f.cols}`
export const frameName = (f) => f.type === 'CUSTOM' ? `Marco ${f.sku || ''}`.trim() : `Marco Roxtec ${f.type} ${f.size}x${f.cols}`
export const framePacking = (f) => f.type === 'CUSTOM' ? f.packingHeight : packingHeightForSize(f.size)

// Sugerencia de módulo para un diámetro de cable (el más pequeño que lo selle)
export function suggestModule(d) {
  if (!(d > 0)) return null
  const fit = Object.entries(MODULES).filter(([sku, m]) => !m.twin && !m.variantOf && sku !== 'RM-40H80' && d >= m.dMin && d <= m.dMax).sort((a, b) => a[1].w - b[1].w)
  return fit.length ? { sku: fit[0][0], ...fit[0][1] } : null
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// ===================================================================
// normalizeLayout(raw) → { layout, errors, warnings }
//   Acepta el JSON del cliente, lo limpia y aplica las reglas Roxtec.
//   errors   → el layout NO se guarda (estructura inválida, ancho ≠ 120, excede altura…)
//   warnings → se guarda pero se avisa (altura incompleta, Ø fuera de rango, abertura vacía…)
// ===================================================================
export function normalizeLayout(raw) {
  const errors = [], warnings = []
  if (!raw || typeof raw !== 'object') return { errors: ['Plano inválido'], warnings, layout: null }
  const frames = Array.isArray(raw.frames) ? raw.frames : []
  if (frames.length > MAX_FRAMES) errors.push(`Máximo ${MAX_FRAMES} marcos por ventana`)
  const outFrames = []
  frames.slice(0, MAX_FRAMES).forEach((f, fi) => {
    const F = `Marco ${fi + 1}`
    const type = FRAME_TYPES[f?.type] ? f.type : 'B'
    const cols = Math.min(MAX_COLS, Math.max(1, Math.round(Number(f?.cols) || 1)))
    let size = Number(f?.size), packingHeight
    if (type === 'CUSTOM') {
      packingHeight = Math.round(Number(f?.packingHeight))
      if (!(packingHeight >= 30 && packingHeight <= 600)) { errors.push(`${F}: altura de empaque inválida (30–600 mm)`); packingHeight = 120 }
      size = null
    } else {
      if (!FRAME_SIZES.includes(size)) { errors.push(`${F}: tamaño inválido (usa 2, 4, 6 u 8)`); size = 4 }
      packingHeight = packingHeightForSize(size)
    }
    const frame = { type, size, cols, packingHeight, label: str(f?.label, 40) || null, sku: type === 'CUSTOM' ? (str(f?.sku, 40) || 'MARCO') : `${type}-${size}x${cols}`, bays: [] }
    const bays = Array.isArray(f?.bays) ? f.bays : []
    for (let bi = 0; bi < cols; bi++) {
      const B = `${F}, abertura ${bi + 1}`
      const rows = Array.isArray(bays[bi]?.rows) ? bays[bi].rows : []
      if (rows.length > MAX_ROWS) errors.push(`${B}: demasiadas filas`)
      const outRows = []
      let used = 0
      rows.slice(0, MAX_ROWS).forEach((r, ri) => {
        const R = `${B}, fila ${ri + 1}`
        const mods = Array.isArray(r?.modules) ? r.modules : []
        if (!mods.length) { errors.push(`${R}: sin módulos`); return }
        const h = Number(r?.h) || MODULES[mods[0]?.sku]?.h
        if (!ROW_HEIGHTS.includes(h)) { errors.push(`${R}: altura de fila inválida`); return }
        let width = 0
        const outMods = []
        for (const m of mods.slice(0, 8)) {
          const spec = MODULES[m?.sku]
          if (!spec) { errors.push(`${R}: módulo desconocido «${m?.sku}»`); continue }
          if (spec.h !== h) { errors.push(`${R}: ${spec.name} no mide ${h} mm de alto`); continue }
          width += spec.w
          const cables = (Array.isArray(m.cables) ? m.cables : []).slice(0, spec.cables).map(c => {
            const d = Number(c?.d); const tag = str(c?.tag, 40)
            if (!(d > 0) && !tag) return null
            if (d > 0 && (d < spec.dMin || d > spec.dMax)) warnings.push(`${R}: cable Ø ${d} mm fuera del rango de ${spec.name} (${spec.dMin}–${spec.dMax} mm)`)
            return { d: d > 0 ? Math.round(d * 10) / 10 : null, tag: tag || null }
          }).filter(Boolean)
          const solid = !!m.solid && !cables.length && !!BLIND_SKU[m.sku]
          outMods.push({ sku: m.sku, cables, solid })
        }
        if (width !== OPENING_WIDTH) errors.push(`${R}: los módulos suman ${width} mm y la abertura mide ${OPENING_WIDTH} mm`)
        used += h
        outRows.push({ h, modules: outMods })
      })
      if (used > packingHeight) errors.push(`${B}: las filas suman ${used} mm y el marco solo tiene ${packingHeight} mm de empaque`)
      else if (outRows.length === 0) warnings.push(`${B}: abertura vacía (debe llenarse con módulos de reserva)`)
      else if (used < packingHeight) warnings.push(`${B}: faltan ${packingHeight - used} mm por llenar (completa con módulos de reserva)`)
      frame.bays.push({ rows: outRows })
    }
    outFrames.push(frame)
  })
  const extras = (Array.isArray(raw.extras) ? raw.extras : []).slice(0, 30).map(e => {
    const qty = Number(e?.qty)
    const sku = str(e?.sku, 40), name = str(e?.name, 120)
    if (!(qty > 0) || !(sku || name)) return null
    return { sku: sku || null, name: name || sku, qty: Math.round(qty * 100) / 100, note: str(e?.note, 120) || null }
  }).filter(Boolean)
  if (!outFrames.length && !extras.length) warnings.push('Plano vacío')
  return { errors, warnings, layout: { frames: outFrames, extras, notes: str(raw.notes, 1000) || null } }
}

// ===================================================================
// computeBom(layout) → { lines: [{sku,name,category,qty,withCable,spare,solid}], summary }
// ===================================================================
export function computeBom(layout) {
  const lines = {}
  const add = (sku, name, category, qty, extra = {}) => {
    const k = sku || name
    lines[k] = lines[k] || { sku: sku || null, name, category, qty: 0, withCable: 0, spare: 0, solid: 0 }
    lines[k].qty += qty
    for (const [kk, v] of Object.entries(extra)) lines[k][kk] += v
  }
  const summary = { frames: 0, bays: 0, rows: 0, modules: 0, cables: 0, spareModules: 0, solidModules: 0, moduleArea: 0, spareArea: 0, packingArea: 0, filledArea: 0, complete: true, emptyBays: 0 }
  for (const f of layout?.frames || []) {
    summary.frames++
    add(frameSku(f), frameName(f), 'FRAME', 1)
    for (const bay of f.bays) {
      summary.bays++
      const pk = framePacking(f) * OPENING_WIDTH
      summary.packingArea += pk
      let used = 0
      if (!bay.rows.length) { summary.emptyBays++; summary.complete = false; continue }
      add(WEDGE_SKU, FIXED_NAMES[WEDGE_SKU], 'WEDGE', 1)
      add(WEDGE_CLIP_SKU, FIXED_NAMES[WEDGE_CLIP_SKU], 'WEDGE', 1)
      add(STAYPLATE_SKU, FIXED_NAMES[STAYPLATE_SKU], 'STAYPLATE', bay.rows.length)
      for (const r of bay.rows) {
        summary.rows++
        used += r.h
        for (const m of r.modules) {
          const spec = MODULES[m.sku]
          const area = spec.w * spec.h
          summary.modules++; summary.moduleArea += area
          const nC = m.cables.length
          summary.cables += nC
          if (m.solid) { summary.solidModules++; summary.spareArea += area; add(BLIND_SKU[m.sku], `Módulo ciego ${spec.name}/0`, 'MODULE', 1, { solid: 1 }) }
          else {
            if (!nC) { summary.spareModules++; summary.spareArea += area }
            add(m.sku, `Módulo ${spec.name} Multidiameter`, 'MODULE', 1, nC ? { withCable: 1 } : { spare: 1 })
          }
        }
      }
      summary.filledArea += used * OPENING_WIDTH
      if (used !== framePacking(f)) summary.complete = false
    }
  }
  for (const e of layout?.extras || []) add(e.sku, e.name, 'EXTRA', e.qty)
  summary.sparePct = summary.moduleArea ? Math.round((summary.spareArea / summary.moduleArea) * 100) : 0
  summary.fillPct = summary.packingArea ? Math.round((summary.filledArea / summary.packingArea) * 100) : 0
  const order = { FRAME: 0, MODULE: 1, STAYPLATE: 2, WEDGE: 3, EXTRA: 4 }
  return { lines: Object.values(lines).sort((a, b) => (order[a.category] - order[b.category]) || String(a.sku || a.name).localeCompare(String(b.sku || b.name), undefined, { numeric: true })), summary }
}

// Texto corto para historial / notificaciones: "2 marcos B 4x1 · 4 RM 60, 6 RM 40 · 6 stayplates, 2 wedges · 9 cables, 1 reserva"
export function describeLayout(layout) { return describeBom(computeBom(layout)) }
export function describeBom(bom) {
  if (!bom?.lines) return null
  const { lines, summary } = bom
  const frames = lines.filter(l => l.category === 'FRAME').map(l => `${l.qty} ${l.name.replace('Marco Roxtec ', '').replace('Marco ', '')}`).join(', ')
  const mods = lines.filter(l => l.category === 'MODULE').map(l => `${l.qty} ${l.name.replace('Módulo ', '').replace(' Multidiameter', '')}`).join(', ')
  const fix = lines.filter(l => l.sku === STAYPLATE_SKU || l.sku === WEDGE_SKU).map(l => `${l.qty} ${l.sku === STAYPLATE_SKU ? 'stayplates' : 'wedges'}`).join(', ')
  const parts = [frames && `marcos: ${frames}`, mods && `módulos: ${mods}`, fix, `${summary.cables} cables, ${summary.spareModules + summary.solidModules} reserva`]
  if (!summary.complete) parts.push('⚠️ llenado incompleto')
  return parts.filter(Boolean).join(' · ') || 'plano vacío'
}

// ===================================================================
// compareBoms(planned, built) → diferencias por material + resumen
// ===================================================================
export function compareBoms(plannedBom, builtBom) {
  const map = {}
  const key = (l) => normSku(l.sku || l.name)
  for (const l of plannedBom?.lines || []) { const k = key(l); map[k] = map[k] || { sku: l.sku, name: l.name, category: l.category, planned: 0, built: 0 }; map[k].planned += l.qty }
  for (const l of builtBom?.lines || []) { const k = key(l); map[k] = map[k] || { sku: l.sku, name: l.name, category: l.category, planned: 0, built: 0 }; map[k].built += l.qty }
  const rows = Object.values(map).map(r => ({ ...r, delta: Math.round((r.built - r.planned) * 100) / 100 }))
  const order = { FRAME: 0, MODULE: 1, STAYPLATE: 2, WEDGE: 3, EXTRA: 4 }
  rows.sort((a, b) => (order[a.category] - order[b.category]) || String(a.sku || a.name).localeCompare(String(b.sku || b.name), undefined, { numeric: true }))
  const changed = rows.filter(r => r.delta !== 0)
  return { rows, changed, hasDeviation: changed.length > 0, framesChanged: changed.some(r => r.category === 'FRAME'), modulesChanged: changed.some(r => r.category === 'MODULE') }
}

// Suma varias listas de material (p. ej. todas las ventanas de una bóveda) → { lines }
export function mergeBoms(boms) {
  const map = {}
  for (const b of boms) for (const l of b?.lines || []) {
    const k = normSku(l.sku || l.name)
    map[k] = map[k] || { sku: l.sku, name: l.name, category: l.category, qty: 0, withCable: 0, spare: 0, solid: 0 }
    map[k].qty += l.qty; map[k].withCable += l.withCable || 0; map[k].spare += l.spare || 0; map[k].solid += l.solid || 0
  }
  const order = { FRAME: 0, MODULE: 1, STAYPLATE: 2, WEDGE: 3, EXTRA: 4 }
  return { lines: Object.values(map).sort((a, b) => (order[a.category] - order[b.category]) || String(a.sku || a.name).localeCompare(String(b.sku || b.name), undefined, { numeric: true })) }
}

// Posiciones de dibujo (mm) de un layout: marcos uno junto a otro, con separación
export function layoutGeometry(layout, gap = 20) {
  let x = 0, maxH = 0
  const frames = (layout?.frames || []).map(f => {
    const pk = framePacking(f)
    const w = f.cols * OPENING_WIDTH + (f.cols + 1) * BAR
    const h = pk + WEDGE_HEIGHT + 2 * BAR
    const g = { x, y: 0, w, h, pk, bays: [] }
    for (let i = 0; i < f.cols; i++) g.bays.push({ x: x + BAR + i * (OPENING_WIDTH + BAR), y: BAR, w: OPENING_WIDTH, h: pk + WEDGE_HEIGHT })
    x += w + gap; maxH = Math.max(maxH, h)
    return g
  })
  return { frames, width: Math.max(0, x - gap), height: maxH }
}

// Colores por familia de módulo (dibujo SVG / PDF)
export const MODULE_COLORS = { 15: '#C7D2FE', 20: '#BFDBFE', 30: '#A7F3D0', 40: '#FDE68A', 60: '#FECACA', 80: '#DDD6FE', 120: '#FBCFE8' }
export const moduleColor = (sku) => MODULE_COLORS[MODULES[sku]?.h] || '#E5E7EB'
