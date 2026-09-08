// Validación central de entradas (manejamos dinero y fechas: nada pasa sin verificar)

// Fecha válida o null (acepta vacío/undefined como null; rechaza basura sin tumbar con 500)
export function parseDate(v) {
  if (v === undefined || v === null || v === '') return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Número finito dentro de límites, o null si es inválido
export function num(v, { min = -Infinity, max = Infinity } = {}) {
  const n = parseFloat(v)
  if (isNaN(n) || !isFinite(n) || n < min || n > max) return null
  return n
}
