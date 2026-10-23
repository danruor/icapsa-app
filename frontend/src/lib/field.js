// Catálogos y helpers del módulo de Instalación en campo (sellado de bóvedas ROXTEC)

export const MATERIAL_CATEGORY = {
  FRAME:      { label: 'Marco (B / GKO)',          icon: '🟦' },
  MODULE:     { label: 'Módulo RM Multidiameter', icon: '🧩' },
  STAYPLATE:  { label: 'Stayplate',               icon: '➖' },
  WEDGE:      { label: 'Wedge / compresión',      icon: '🔧' },
  SEAL:       { label: 'Sello redondo (RS)',       icon: '⭕' },
  LUBRICANT:  { label: 'Lubricante',              icon: '🧴' },
  COATING:    { label: 'Impermeabilizante',       icon: '🪣' },
  ACCESSORY:  { label: 'Accesorio',               icon: '🔩' },
  CONSUMABLE: { label: 'Consumible',              icon: '🧰' },
  OTHER:      { label: 'Otro',                    icon: '📦' }
}

export const LOG_KIND = {
  NOTE:     { label: 'Nota',          icon: '📝', chip: 'bg-gray-100 text-gray-700' },
  PROGRESS: { label: 'Avance',        icon: '📈', chip: 'bg-emerald-50 text-emerald-700' },
  ISSUE:    { label: 'Problema',      icon: '⚠️', chip: 'bg-amber-50 text-amber-700' },
  DELAY:    { label: 'Retraso',       icon: '⏳', chip: 'bg-orange-50 text-orange-700' },
  SAFETY:   { label: 'Seguridad',     icon: '🦺', chip: 'bg-red-50 text-red-700' },
  CLIENT:   { label: 'Cliente / CFE', icon: '🏢', chip: 'bg-sky-50 text-sky-700' }
}

export const HEALTH = {
  ON_TRACK:    { label: 'En tiempo',        color: '#22C55E' },
  UNPLANNED:   { label: 'Sin programar',    color: '#9CA3AF' },
  OVER_BUDGET: { label: 'Excede días',      color: '#F59E0B' },
  OVERDUE:     { label: 'Vencida',          color: '#DC2626' },
  BLOCKED:     { label: 'Bloqueada',        color: '#7C3AED' },
  DONE:        { label: 'Terminada',        color: '#16A34A' },
  LATE_DONE:   { label: 'Terminada tarde',  color: '#CA8A04' }
}

export const dateInput = (d) => d ? new Date(d).toISOString().slice(0, 10) : ''
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

export const SITE_TYPE = {
  VAULT:      { label: 'Bóveda',      icon: '🕳️' },
  SUBSTATION: { label: 'Subestación', icon: '⚡' },
  MANHOLE:    { label: 'Pozo de visita', icon: '🔘' },
  OTHER:      { label: 'Otro',        icon: '📍' }
}

// Etapas del proceso (en orden) — tomadas del procedimiento real de ICAPSA
export const STAGE = {
  PENDING:    { label: 'Pendiente',             short: 'Pendiente',   color: '#9CA3AF', step: 0 },
  DEWATERING: { label: 'Achique y limpieza',    short: 'Achique',     color: '#0EA5E9', step: 1 },
  WALL_PREP:  { label: 'Preparación de muro',   short: 'Muro',        color: '#F59E0B', step: 2 },
  FORMWORK:   { label: 'Armado y cimbrado',     short: 'Cimbrado',    color: '#F97316', step: 3 },
  SEALING:    { label: 'Sellado ROXTEC',        short: 'Sellado',     color: '#2563EB', step: 4 },
  COATING:    { label: 'Impermeabilizante',     short: 'Impermeab.',  color: '#8B5CF6', step: 5 },
  DONE:       { label: 'Terminada',             short: 'Terminada',   color: '#22C55E', step: 6 }
}
export const STAGE_ORDER = Object.keys(STAGE)

export const INFILTRATION = {
  RAIN:        { label: 'Agua pluvial',  icon: '🌧️' },
  POTABLE:     { label: 'Agua potable',  icon: '🚰' },
  SEWAGE:      { label: 'Aguas negras',  icon: '🟫' },
  GROUNDWATER: { label: 'Nivel freático', icon: '💧' }
}

export const REPORT_STATUS = {
  DRAFT:     { label: 'Borrador',  chip: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'Enviado',   chip: 'bg-sky-50 text-sky-700' },
  APPROVED:  { label: 'Aprobado',  chip: 'bg-emerald-50 text-emerald-700' },
  REJECTED:  { label: 'Devuelto',  chip: 'bg-red-50 text-red-600' }
}

export const PHOTO_KIND = {
  BEFORE: { label: 'Antes',   chip: 'bg-red-50 text-red-600' },
  DURING: { label: 'Durante', chip: 'bg-amber-50 text-amber-700' },
  AFTER:  { label: 'Después', chip: 'bg-emerald-50 text-emerald-700' }
}

export const money = (n) => '$' + (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
export const todayInput = () => { const x = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}` }

// Comprime una foto en el navegador antes de subirla (ahorra datos en campo)
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality))
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return file }
}

// Ubicación del teléfono (opcional, silenciosa si no hay permiso)
export function getPosition(timeout = 4000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null), { timeout, maximumAge: 60000 })
  })
}
