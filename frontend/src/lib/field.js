// Catálogos y helpers del módulo de Instalación en campo (sellado de bóvedas ROXTEC)

export const MATERIAL_CATEGORY = {
  FRAME:      { label: 'Marco (GKO)',        icon: '🟦' },
  SEAL:       { label: 'Sello (RS)',         icon: '⭕' },
  MODULE:     { label: 'Módulo de sellado',  icon: '🧩' },
  COATING:    { label: 'Impermeabilizante',  icon: '🪣' },
  ACCESSORY:  { label: 'Accesorio',          icon: '🔩' },
  CONSUMABLE: { label: 'Consumible',         icon: '🧰' },
  OTHER:      { label: 'Otro',               icon: '📦' }
}

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
