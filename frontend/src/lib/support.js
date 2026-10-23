// Catálogos y helpers del módulo de Soporte (compartidos por el portal de clientes y el equipo)

export const CATEGORY = {
  FAILURE:      { label: 'Falla / no funciona', icon: '⚡' },
  INSTALLATION: { label: 'Instalación / puesta en marcha', icon: '🔧' },
  DATA:         { label: 'Datos / comunicación (SIM)', icon: '📶' },
  BILLING:      { label: 'Facturación / pagos', icon: '🧾' },
  WARRANTY:     { label: 'Garantía / reemplazo', icon: '🛡️' },
  OTHER:        { label: 'Otro', icon: '💬' }
}

export const PRIORITY = {
  LOW:    { label: 'Baja',    chip: 'bg-gray-100 text-gray-600',   bar: 'bg-gray-300',  sla: '7 días' },
  MEDIUM: { label: 'Media',   chip: 'bg-blue-50 text-blue-600',    bar: 'bg-blue-400',  sla: '72 h' },
  HIGH:   { label: 'Alta',    chip: 'bg-amber-50 text-amber-700',  bar: 'bg-amber-400', sla: '24 h' },
  URGENT: { label: 'Urgente', chip: 'bg-red-50 text-red-600',      bar: 'bg-red-500',   sla: '4 h' }
}

export const STATUS = {
  OPEN:           { label: 'Abierto',              chip: 'bg-sky-50 text-sky-700',        dot: '#0EA5E9' },
  IN_PROGRESS:    { label: 'En atención',          chip: 'bg-amber-50 text-amber-700',    dot: '#F59E0B' },
  WAITING_CLIENT: { label: 'Esperando al cliente', chip: 'bg-purple-50 text-purple-700',  dot: '#8B5CF6' },
  RESOLVED:       { label: 'Resuelto',             chip: 'bg-emerald-50 text-emerald-700', dot: '#22C55E' },
  CLOSED:         { label: 'Cerrado',              chip: 'bg-gray-100 text-gray-500',     dot: '#9CA3AF' }
}

export const VISIT_STATUS = {
  SCHEDULED: { label: 'Programada', chip: 'bg-purple-50 text-purple-700' },
  DONE:      { label: 'Realizada',  chip: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelada',  chip: 'bg-gray-100 text-gray-500' }
}

export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// "hace 3 h" / "en 2 días"
export function relTime(d) {
  if (!d) return ''
  const diff = (new Date(d).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  const unit = abs < 3600 ? [Math.round(abs / 60), 'min'] : abs < 86400 ? [Math.round(abs / 3600), 'h'] : [Math.round(abs / 86400), 'd']
  return diff < 0 ? `hace ${unit[0]} ${unit[1]}` : `en ${unit[0]} ${unit[1]}`
}

// Cuenta regresiva del SLA en horas (negativo = vencido)
export function slaHoursLeft(ticket) {
  if (!ticket?.slaDueAt || !ticket.isOpen) return null
  return (new Date(ticket.slaDueAt).getTime() - Date.now()) / 3600000
}

export const AVATAR_COLORS = ['#22A2DE', '#2563EB', '#9333EA', '#DC2626', '#EA580C', '#0891B2', '#4F46E5', '#BE185D']
export const avatarColor = (name = '') => AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
export const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

export const fileSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

// Fecha → valor para <input type="datetime-local"> en hora LOCAL (toISOString daría UTC)
export function toLocalInput(d) {
  const x = new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}
