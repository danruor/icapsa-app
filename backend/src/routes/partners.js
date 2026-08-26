import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// Acceso ULTRA restringido: SOLO super admin o usuarios con la pestaña 'partners'
const requirePartners = (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') return next()
  const allowed = (req.user.visibleTabs || '').split(',').map(t => t.trim())
  if (allowed.includes('partners')) return next()
  res.status(403).json({ error: 'Sin acceso a esta sección' })
}
router.use(requirePartners)

const num = (v, { min = -Infinity, max = Infinity } = {}) => {
  const n = parseFloat(v)
  if (isNaN(n) || !isFinite(n) || n < min || n > max) return null
  return n
}

async function getSettings() {
  let s = await prisma.partnerSettings.findUnique({ where: { id: 'main' } })
  if (!s) s = await prisma.partnerSettings.create({ data: { id: 'main' } })
  return s
}

// Cálculo de un concepto individual con las tasas del contrato
function computeItem(it, deal) {
  const costUnitMXN = it.costCurrency === 'USD' ? it.costUnit * deal.fx : it.costUnit
  const saleUnitMXN = it.saleCurrency === 'USD' ? it.saleUnit * deal.fx : it.saleUnit
  const costTotal = costUnitMXN * it.quantity
  const saleTotal = saleUnitMXN * it.quantity
  const utility = saleTotal - costTotal
  const isr = utility > 0 ? utility * (deal.isrRate / 100) : 0
  const net = utility - isr
  const partnerShare = net > 0 ? net * (deal.partnerRate / 100) : 0
  const icapsaShare = net - partnerShare
  return { costUnitMXN, saleUnitMXN, costTotal, saleTotal, utility, isr, net, partnerShare, icapsaShare }
}

// Cálculo agregado de un contrato (suma de sus conceptos)
function computeDeal(deal) {
  const totals = { costTotal: 0, saleTotal: 0, utility: 0, isr: 0, net: 0, partnerShare: 0, icapsaShare: 0 }
  for (const it of deal.items || []) {
    const c = computeItem(it, deal)
    for (const k of Object.keys(totals)) totals[k] += c[k]
  }
  return totals
}

// Migración perezosa: partidas viejas (una línea plana) → concepto hijo
async function backfillLegacy(deals) {
  for (const d of deals) {
    if ((d.items?.length || 0) === 0 && (d.quantity > 0 && (d.costUnit > 0 || d.saleUnit > 0))) {
      const item = await prisma.partnerDealItem.create({
        data: {
          dealId: d.id, name: 'Concepto único',
          quantity: d.quantity, costUnit: d.costUnit, costCurrency: d.costCurrency,
          saleUnit: d.saleUnit, saleCurrency: d.saleCurrency
        }
      })
      d.items = [item]
    }
  }
}

// Validar y normalizar la lista de conceptos de un contrato
function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Agrega al menos un concepto' }
  const items = []
  for (const [i, it] of raw.entries()) {
    if (!it.name?.trim()) return { error: `El concepto ${i + 1} necesita nombre` }
    const quantity = num(it.quantity, { min: 0, max: 1e9 })
    const costUnit = num(it.costUnit ?? 0, { min: 0, max: 1e12 })
    const saleUnit = num(it.saleUnit ?? 0, { min: 0, max: 1e12 })
    if ([quantity, costUnit, saleUnit].some(v => v === null))
      return { error: `Revisa los números del concepto «${it.name}»` }
    items.push({
      name: it.name.trim().slice(0, 120),
      quantity: Math.round(quantity),
      costUnit,
      costCurrency: it.costCurrency === 'MXN' ? 'MXN' : 'USD',
      saleUnit,
      saleCurrency: it.saleCurrency === 'MXN' ? 'MXN' : 'USD',
      position: i
    })
  }
  return { items }
}

// GET /api/partners/summary
router.get('/summary', async (req, res) => {
  try {
    const [settings, deals, payments, dataCharges] = await Promise.all([
      getSettings(),
      prisma.partnerDeal.findMany({ include: { items: true } }),
      prisma.partnerPayment.findMany(),
      prisma.partnerDataCharge.findMany()
    ])
    await backfillLegacy(deals)

    const totals = { costTotal: 0, saleTotal: 0, utility: 0, isr: 0, net: 0, partnerShare: 0, icapsaShare: 0 }
    for (const d of deals) {
      const c = computeDeal(d)
      for (const k of Object.keys(totals)) totals[k] += c[k]
    }
    const dataOwed = dataCharges.reduce((s, c) => s + c.amountToPartner, 0)
    const paidToPartner = payments.filter(p => p.direction === 'TO_PARTNER').reduce((s, p) => s + p.amount, 0)
    const paidFromPartner = payments.filter(p => p.direction === 'FROM_PARTNER').reduce((s, p) => s + p.amount, 0)
    const netPaid = paidToPartner - paidFromPartner
    // Saldo con el socio = comisión de contratos + datos consumidos − pagos netos
    const balance = totals.partnerShare + dataOwed - netPaid

    res.json({ settings, totals, dataOwed, paidToPartner, paidFromPartner, netPaid, balance, dealCount: deals.length })
  } catch (err) {
    console.error('Error resumen sociedad:', err.message)
    res.status(500).json({ error: 'Error al obtener el resumen' })
  }
})

// PATCH /api/partners/settings — solo SUPER_ADMIN
router.patch('/settings', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador' })
    const data = {}
    if (req.body.partnerName !== undefined) data.partnerName = String(req.body.partnerName).slice(0, 40)
    for (const [k, lim] of [['defaultFx', { min: 0.01, max: 1000 }], ['defaultIsr', { min: 0, max: 100 }], ['defaultPartnerRate', { min: 0, max: 100 }], ['defaultIva', { min: 0, max: 100 }]]) {
      if (req.body[k] !== undefined) {
        const n = num(req.body[k], lim)
        if (n === null) return res.status(400).json({ error: `Valor inválido en ${k}` })
        data[k] = n
      }
    }
    await getSettings()
    res.json(await prisma.partnerSettings.update({ where: { id: 'main' }, data }))
  } catch (err) {
    console.error('Error ajustes sociedad:', err.message)
    res.status(500).json({ error: 'Error al guardar ajustes' })
  }
})

// GET /api/partners/deals — contratos con conceptos y cálculos (por concepto y agregado)
router.get('/deals', async (req, res) => {
  try {
    const deals = await prisma.partnerDeal.findMany({
      include: {
        items: { orderBy: { position: 'asc' } },
        project: { select: { id: true, name: true, color: true } },
        createdBy: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    await backfillLegacy(deals)
    res.json(deals.map(d => ({
      ...d,
      items: d.items.map(it => ({ ...it, calc: computeItem(it, d) })),
      calc: computeDeal(d)
    })))
  } catch (err) {
    console.error('Error contratos:', err.message)
    res.status(500).json({ error: 'Error al obtener contratos' })
  }
})

// Campos comunes de contrato desde el body (validados)
async function parseDealFields(body, settings, partial = false) {
  const out = {}
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) return { error: 'El contrato necesita un nombre' }
    out.name = body.name.trim().slice(0, 120)
  }
  if (body.clientType !== undefined || !partial)
    out.clientType = body.clientType === 'CFE' ? 'CFE' : 'PRIVATE'
  if (body.clientName !== undefined) out.clientName = body.clientName?.trim().slice(0, 80) || null
  if (body.division !== undefined) out.division = body.division?.trim().slice(0, 60) || null
  if (body.state !== undefined) out.state = body.state?.trim().slice(0, 40) || null
  if (body.contractRef !== undefined) out.contractRef = body.contractRef?.trim().slice(0, 80) || null
  if (body.includesData !== undefined) out.includesData = !!body.includesData
  if (body.dataNotes !== undefined) out.dataNotes = body.dataNotes?.trim().slice(0, 300) || null
  if (body.notes !== undefined) out.notes = body.notes || null
  if (body.projectId !== undefined) out.projectId = body.projectId || null
  if (body.status !== undefined) out.status = body.status === 'CLOSED' ? 'CLOSED' : 'OPEN'

  for (const [k, lim] of [['fx', { min: 0.01, max: 1000 }], ['isrRate', { min: 0, max: 100 }], ['partnerRate', { min: 0, max: 100 }], ['ivaRate', { min: 0, max: 100 }]]) {
    const fallback = { fx: settings.defaultFx, isrRate: settings.defaultIsr, partnerRate: settings.defaultPartnerRate, ivaRate: settings.defaultIva }[k]
    if (body[k] !== undefined || !partial) {
      const n = num(body[k] ?? fallback, lim)
      if (n === null) return { error: `Valor inválido en ${k}` }
      out[k] = n
    }
  }
  // Coherencia: CFE lleva división; privado lleva estado
  if (out.clientType === 'CFE') { out.state = null; if (!out.clientName) out.clientName = 'CFE' }
  if (out.clientType === 'PRIVATE') out.division = null
  return { out }
}

// POST /api/partners/deals — nuevo contrato con conceptos
router.post('/deals', async (req, res) => {
  try {
    const s = await getSettings()
    const fields = await parseDealFields(req.body, s)
    if (fields.error) return res.status(400).json({ error: fields.error })
    const parsed = parseItems(req.body.items)
    if (parsed.error) return res.status(400).json({ error: parsed.error })

    const deal = await prisma.partnerDeal.create({
      data: {
        ...fields.out,
        createdById: req.user.id,
        items: { create: parsed.items }
      },
      include: { items: { orderBy: { position: 'asc' } } }
    })
    await logActivity({ userId: req.user.id, action: 'partner_deal', detail: `registró el contrato «${deal.name}» (${parsed.items.length} conceptos) en Sociedad` })
    res.status(201).json({ ...deal, items: deal.items.map(it => ({ ...it, calc: computeItem(it, deal) })), calc: computeDeal(deal) })
  } catch (err) {
    console.error('Error crear contrato:', err.message)
    res.status(500).json({ error: 'Error al crear el contrato' })
  }
})

// PATCH /api/partners/deals/:id — editar contrato (si llegan items, se reemplazan)
router.patch('/deals/:id', async (req, res) => {
  try {
    const existing = await prisma.partnerDeal.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })
    const s = await getSettings()
    const fields = await parseDealFields(req.body, s, true)
    if (fields.error) return res.status(400).json({ error: fields.error })

    let itemOps = {}
    if (req.body.items !== undefined) {
      const parsed = parseItems(req.body.items)
      if (parsed.error) return res.status(400).json({ error: parsed.error })
      itemOps = { items: { deleteMany: {}, create: parsed.items } }
    }

    const deal = await prisma.partnerDeal.update({
      where: { id: req.params.id },
      data: { ...fields.out, ...itemOps },
      include: { items: { orderBy: { position: 'asc' } } }
    })
    res.json({ ...deal, items: deal.items.map(it => ({ ...it, calc: computeItem(it, deal) })), calc: computeDeal(deal) })
  } catch (err) {
    console.error('Error editar contrato:', err.message)
    res.status(500).json({ error: 'Error al actualizar' })
  }
})

// DELETE /api/partners/deals/:id
router.delete('/deals/:id', async (req, res) => {
  try {
    const deal = await prisma.partnerDeal.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'partner_deal_deleted', detail: `eliminó el contrato «${deal.name}» de Sociedad` })
    res.json({ message: 'Contrato eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

// ===== PAGOS (cuenta corriente) =====
router.get('/payments', async (req, res) => {
  try {
    const payments = await prisma.partnerPayment.findMany({
      include: { createdBy: { select: { name: true } } },
      orderBy: { date: 'desc' }
    })
    res.json(payments)
  } catch {
    res.status(500).json({ error: 'Error al obtener pagos' })
  }
})

router.post('/payments', async (req, res) => {
  try {
    const { direction, concept, method, date } = req.body
    if (!['TO_PARTNER', 'FROM_PARTNER'].includes(direction))
      return res.status(400).json({ error: 'Dirección de pago inválida' })
    if (!concept?.trim()) return res.status(400).json({ error: 'El concepto es requerido' })
    const amount = num(req.body.amount, { min: 0.01, max: 1e12 })
    if (amount === null) return res.status(400).json({ error: 'Monto inválido' })

    const payment = await prisma.partnerPayment.create({
      data: {
        direction, amount, concept: concept.trim(),
        method: method?.trim() || null,
        date: date ? new Date(date) : new Date(),
        createdById: req.user.id
      }
    })
    const s = await getSettings()
    await logActivity({
      userId: req.user.id, action: 'partner_payment',
      detail: direction === 'TO_PARTNER'
        ? `registró pago a ${s.partnerName} por $${amount.toLocaleString('es-MX')} (${payment.concept})`
        : `registró pago de ${s.partnerName} por $${amount.toLocaleString('es-MX')} (${payment.concept})`
    })
    res.status(201).json(payment)
  } catch (err) {
    console.error('Error crear pago:', err.message)
    res.status(500).json({ error: 'Error al registrar el pago' })
  }
})

router.delete('/payments/:id', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador puede eliminar pagos' })
    const p = await prisma.partnerPayment.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'partner_payment_deleted', detail: `eliminó un pago de $${p.amount.toLocaleString('es-MX')} (${p.concept})` })
    res.json({ message: 'Pago eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

// ===== DATOS (SIM) — consumo mensual adeudado al proveedor =====
// Hoy se registra manualmente; cuando se conecte la API del proveedor, estos
// registros se generarán automáticamente por periodo.
router.get('/data-charges', async (req, res) => {
  try {
    const charges = await prisma.partnerDataCharge.findMany({
      include: { deal: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }]
    })
    res.json(charges)
  } catch {
    res.status(500).json({ error: 'Error al obtener cargos de datos' })
  }
})

router.post('/data-charges', async (req, res) => {
  try {
    const { period, concept, dealId, notes } = req.body
    if (!/^\d{4}-\d{2}$/.test(period || '')) return res.status(400).json({ error: 'Periodo inválido (usa AAAA-MM)' })
    if (!concept?.trim()) return res.status(400).json({ error: 'El concepto es requerido' })
    const amountToPartner = num(req.body.amountToPartner, { min: 0, max: 1e12 })
    if (amountToPartner === null) return res.status(400).json({ error: 'Monto al proveedor inválido' })
    const amountFromClient = req.body.amountFromClient !== undefined && req.body.amountFromClient !== ''
      ? num(req.body.amountFromClient, { min: 0, max: 1e12 }) : null
    if (req.body.amountFromClient && amountFromClient === null) return res.status(400).json({ error: 'Monto del cliente inválido' })
    const cardsCount = req.body.cardsCount ? num(req.body.cardsCount, { min: 0, max: 1e7 }) : null

    const charge = await prisma.partnerDataCharge.create({
      data: {
        period, concept: concept.trim().slice(0, 120),
        cardsCount: cardsCount !== null ? Math.round(cardsCount) : null,
        amountToPartner, amountFromClient,
        notes: notes?.trim().slice(0, 300) || null,
        dealId: dealId || null,
        createdById: req.user.id
      }
    })
    const s = await getSettings()
    await logActivity({
      userId: req.user.id, action: 'partner_data',
      detail: `registró datos ${period}: $${amountToPartner.toLocaleString('es-MX')} a ${s.partnerName} (${charge.concept})`
    })
    res.status(201).json(charge)
  } catch (err) {
    console.error('Error cargo de datos:', err.message)
    res.status(500).json({ error: 'Error al registrar el cargo' })
  }
})

router.delete('/data-charges/:id', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador puede eliminar cargos' })
    const c = await prisma.partnerDataCharge.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'partner_data_deleted', detail: `eliminó cargo de datos ${c.period} por $${c.amountToPartner.toLocaleString('es-MX')}` })
    res.json({ message: 'Cargo eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

export default router
