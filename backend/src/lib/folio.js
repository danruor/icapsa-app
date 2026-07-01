import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

/**
 * Genera un folio secuencial seguro tipo PREFIJO-AÑO-NNNN.
 * Busca el número MÁS ALTO ya usado para ese prefijo+año (no el conteo),
 * así no choca aunque se hayan borrado registros intermedios.
 *
 * @param {string} model  - nombre del modelo Prisma ('quote', 'purchaseOrder', 'delivery')
 * @param {string} prefix - prefijo del folio ('COT', 'OC', 'ENT')
 */
export async function nextFolio(model, prefix) {
  const year = new Date().getFullYear()
  const like = `${prefix}-${year}-`

  // Traer los folios existentes de ese prefijo+año
  const rows = await prisma[model].findMany({
    where: { folio: { startsWith: like } },
    select: { folio: true }
  })

  // Encontrar el número consecutivo más alto usado
  let max = 0
  for (const r of rows) {
    const n = parseInt(r.folio.slice(like.length), 10)
    if (!isNaN(n) && n > max) max = n
  }

  return `${like}${String(max + 1).padStart(4, '0')}`
}
