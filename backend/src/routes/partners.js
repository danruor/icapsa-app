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
      position: i,
      conceptId: typeof it.conceptId === 'string' && it.conceptId.length < 40 ? it.conceptId : null,
      _save: !!it.saveToCatalog
    })
  }
  return { items }
}


// Si un concepto del contrato se marcó "guardar en catálogo", se crea ahí primero
async function materializeCatalog(items, userId) {
  for (const it of items) {
    if (it._save && !it.conceptId) {
      const c = await prisma.partnerConcept.create({
        data: {
          name: it.name, costingMode: 'TOTAL',
          costUnit: it.costUnit, costCurrency: it.costCurrency,
          saleUnit: it.saleUnit, saleCurrency: it.saleCurrency,
          createdById: userId
        }
      })
      it.conceptId = c.id
    }
    delete it._save
  }
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
  if (body.dealDate !== undefined && body.dealDate) {
    const dd = new Date(body.dealDate)
    if (!isNaN(dd.getTime())) out.dealDate = dd
  }
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
    await materializeCatalog(parsed.items, req.user.id)

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
      await materializeCatalog(parsed.items, req.user.id)
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


// ===== CATÁLOGO DE CONCEPTOS =====

// Costo unitario del concepto en MXN (según su modo de costeo)
function conceptCostMXN(c, fx) {
  if (c.costingMode === 'BREAKDOWN' && c.costParts?.length)
    return c.costParts.reduce((s, p) => s + (p.currency === 'USD' ? p.amount * fx : p.amount), 0)
  return c.costCurrency === 'USD' ? c.costUnit * fx : c.costUnit
}

function parseCostParts(raw) {
  if (!Array.isArray(raw)) return { parts: [] }
  const parts = []
  for (const [i, p] of raw.entries()) {
    if (!p.label?.trim()) return { error: `La parte ${i + 1} necesita nombre` }
    const amount = num(p.amount ?? 0, { min: 0, max: 1e12 })
    if (amount === null) return { error: `Monto inválido en «${p.label}»` }
    parts.push({ label: p.label.trim().slice(0, 60), amount, currency: p.currency === 'MXN' ? 'MXN' : 'USD', position: i })
  }
  return { parts }
}

// GET /api/partners/concepts — catálogo con cálculos y uso
router.get('/concepts', async (req, res) => {
  try {
    const [s, concepts] = await Promise.all([
      getSettings(),
      prisma.partnerConcept.findMany({
        include: { costParts: { orderBy: { position: 'asc' } }, _count: { select: { dealItems: true, competitorPrices: true } } },
        orderBy: { name: 'asc' }
      })
    ])
    res.json(concepts.map(c => {
      const costMXN = conceptCostMXN(c, s.defaultFx)
      const saleMXN = c.saleCurrency === 'USD' ? c.saleUnit * s.defaultFx : c.saleUnit
      return { ...c, calc: { costMXN, saleMXN, marginPct: saleMXN > 0 ? ((saleMXN - costMXN) / saleMXN) * 100 : 0 } }
    }))
  } catch (err) {
    console.error('Error catálogo:', err.message)
    res.status(500).json({ error: 'Error al obtener el catálogo' })
  }
})

// POST /api/partners/concepts
router.post('/concepts', async (req, res) => {
  try {
    const { name, description, costingMode, costCurrency, saleCurrency } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'El concepto necesita nombre' })
    const saleUnit = num(req.body.saleUnit ?? 0, { min: 0, max: 1e12 })
    let costUnit = num(req.body.costUnit ?? 0, { min: 0, max: 1e12 })
    if ([saleUnit, costUnit].some(v => v === null)) return res.status(400).json({ error: 'Revisa los precios' })

    const mode = costingMode === 'BREAKDOWN' ? 'BREAKDOWN' : 'TOTAL'
    const parsed = parseCostParts(req.body.costParts)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    if (mode === 'BREAKDOWN' && parsed.parts.length === 0)
      return res.status(400).json({ error: 'El modo desglosado requiere al menos una parte de costo' })

    const concept = await prisma.partnerConcept.create({
      data: {
        name: name.trim().slice(0, 120),
        description: description?.trim().slice(0, 300) || null,
        costingMode: mode,
        costUnit, costCurrency: costCurrency === 'MXN' ? 'MXN' : 'USD',
        saleUnit, saleCurrency: saleCurrency === 'MXN' ? 'MXN' : 'USD',
        createdById: req.user.id,
        ...(mode === 'BREAKDOWN' && { costParts: { create: parsed.parts } })
      },
      include: { costParts: true }
    })
    await logActivity({ userId: req.user.id, action: 'partner_concept', detail: `agregó «${concept.name}» al catálogo de Sociedad` })
    res.status(201).json(concept)
  } catch (err) {
    console.error('Error crear concepto:', err.message)
    res.status(500).json({ error: 'Error al crear el concepto' })
  }
})

// PATCH /api/partners/concepts/:id
router.patch('/concepts/:id', async (req, res) => {
  try {
    const existing = await prisma.partnerConcept.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })

    const data = {}
    if (req.body.name !== undefined) {
      if (!req.body.name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      data.name = req.body.name.trim().slice(0, 120)
    }
    if (req.body.description !== undefined) data.description = req.body.description?.trim().slice(0, 300) || null
    if (req.body.costingMode !== undefined) data.costingMode = req.body.costingMode === 'BREAKDOWN' ? 'BREAKDOWN' : 'TOTAL'
    if (req.body.costCurrency !== undefined) data.costCurrency = req.body.costCurrency === 'MXN' ? 'MXN' : 'USD'
    if (req.body.saleCurrency !== undefined) data.saleCurrency = req.body.saleCurrency === 'MXN' ? 'MXN' : 'USD'
    for (const k of ['costUnit', 'saleUnit']) {
      if (req.body[k] !== undefined) {
        const n = num(req.body[k], { min: 0, max: 1e12 })
        if (n === null) return res.status(400).json({ error: `Valor inválido en ${k}` })
        data[k] = n
      }
    }
    let partOps = {}
    if (req.body.costParts !== undefined) {
      const parsed = parseCostParts(req.body.costParts)
      if (parsed.error) return res.status(400).json({ error: parsed.error })
      partOps = { costParts: { deleteMany: {}, create: parsed.parts } }
    }
    const concept = await prisma.partnerConcept.update({
      where: { id: req.params.id },
      data: { ...data, ...partOps },
      include: { costParts: { orderBy: { position: 'asc' } } }
    })
    res.json(concept)
  } catch (err) {
    console.error('Error editar concepto:', err.message)
    res.status(500).json({ error: 'Error al actualizar' })
  }
})

// DELETE /api/partners/concepts/:id — solo SUPER_ADMIN (dato maestro)
router.delete('/concepts/:id', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador' })
    const c = await prisma.partnerConcept.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'partner_concept_deleted', detail: `eliminó «${c.name}» del catálogo de Sociedad` })
    res.json({ message: 'Concepto eliminado del catálogo' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

// GET /api/partners/concepts/:id/history — precios reales en contratos
router.get('/concepts/:id/history', async (req, res) => {
  try {
    const items = await prisma.partnerDealItem.findMany({
      where: { conceptId: req.params.id },
      include: { deal: { select: { dealDate: true, createdAt: true, clientType: true, clientName: true, division: true, state: true, fx: true, name: true } } }
    })
    const history = items.map(it => {
      const fx = it.deal.fx
      return {
        date: it.deal.dealDate || it.deal.createdAt,
        deal: it.deal.name,
        client: it.deal.clientType === 'CFE' ? `CFE · ${it.deal.division || ''}` : (it.deal.clientName || 'Privado'),
        quantity: it.quantity,
        costMXN: it.costCurrency === 'USD' ? it.costUnit * fx : it.costUnit,
        saleMXN: it.saleCurrency === 'USD' ? it.saleUnit * fx : it.saleUnit
      }
    }).sort((a, b) => new Date(a.date) - new Date(b.date))
    res.json(history)
  } catch {
    res.status(500).json({ error: 'Error al obtener historial' })
  }
})

// ===== ANÁLISIS (gráficas) =====

// GET /api/partners/analytics?granularity=day|month|year
router.get('/analytics', async (req, res) => {
  try {
    const gran = ['day', 'month', 'year'].includes(req.query.granularity) ? req.query.granularity : 'month'
    const deals = await prisma.partnerDeal.findMany({ include: { items: true } })
    await backfillLegacy(deals)

    const zero = () => ({ sale: 0, cost: 0, utility: 0, net: 0, icapsa: 0, partner: 0, count: 0 })
    const byPeriod = {}, byClient = {}, byDivision = {}
    const byType = { CFE: zero(), PRIVATE: zero() }

    for (const d of deals) {
      const c = computeDeal(d)
      const dt = new Date(d.dealDate || d.createdAt)
      const key = gran === 'day' ? dt.toISOString().slice(0, 10)
        : gran === 'year' ? String(dt.getFullYear())
        : dt.toISOString().slice(0, 7)
      const clientKey = d.clientType === 'CFE' ? 'CFE' : (d.clientName || 'Privado s/n')

      for (const [bucket, k] of [[byPeriod, key], [byClient, clientKey]]) {
        if (!bucket[k]) bucket[k] = zero()
        const b = bucket[k]
        b.sale += c.saleTotal; b.cost += c.costTotal; b.utility += c.utility
        b.net += c.net; b.icapsa += c.icapsaShare; b.partner += c.partnerShare; b.count++
      }
      if (d.clientType === 'CFE' && d.division) {
        if (!byDivision[d.division]) byDivision[d.division] = zero()
        const b = byDivision[d.division]
        b.sale += c.saleTotal; b.cost += c.costTotal; b.utility += c.utility
        b.net += c.net; b.icapsa += c.icapsaShare; b.partner += c.partnerShare; b.count++
      }
      const t = byType[d.clientType === 'CFE' ? 'CFE' : 'PRIVATE']
      t.sale += c.saleTotal; t.cost += c.costTotal; t.utility += c.utility
      t.net += c.net; t.count++
    }

    res.json({
      granularity: gran,
      byPeriod: Object.entries(byPeriod).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ period: k, ...v })),
      byClient: Object.entries(byClient).sort((a, b) => b[1].sale - a[1].sale).map(([k, v]) => ({ client: k, ...v })),
      byDivision: Object.entries(byDivision).sort((a, b) => b[1].sale - a[1].sale).map(([k, v]) => ({ division: k, ...v })),
      byType: [{ type: 'CFE', ...byType.CFE }, { type: 'Privados', ...byType.PRIVATE }]
    })
  } catch (err) {
    console.error('Error analytics:', err.message)
    res.status(500).json({ error: 'Error al calcular el análisis' })
  }
})

// ===== COMPETENCIA =====

// GET /api/partners/competitor-prices?conceptId=...
router.get('/competitor-prices', async (req, res) => {
  try {
    const where = req.query.conceptId ? { conceptId: String(req.query.conceptId).slice(0, 40) } : {}
    const prices = await prisma.partnerCompetitorPrice.findMany({
      where,
      include: { concept: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      orderBy: { date: 'desc' }
    })
    res.json(prices)
  } catch {
    res.status(500).json({ error: 'Error al obtener precios de competencia' })
  }
})

// POST /api/partners/competitor-prices
router.post('/competitor-prices', async (req, res) => {
  try {
    const { competitor, currency, priceType, context, notes, conceptId, date } = req.body
    if (!competitor?.trim()) return res.status(400).json({ error: 'El nombre del competidor es requerido' })
    const price = num(req.body.price, { min: 0, max: 1e12 })
    if (price === null) return res.status(400).json({ error: 'Precio inválido' })

    const rec = await prisma.partnerCompetitorPrice.create({
      data: {
        competitor: competitor.trim().slice(0, 80),
        price,
        currency: currency === 'USD' ? 'USD' : 'MXN',
        priceType: priceType === 'COST' ? 'COST' : 'SALE',
        context: context?.trim().slice(0, 200) || null,
        notes: notes?.trim().slice(0, 300) || null,
        conceptId: typeof conceptId === 'string' && conceptId ? conceptId.slice(0, 40) : null,
        date: date ? new Date(date) : new Date(),
        createdById: req.user.id
      }
    })
    await logActivity({ userId: req.user.id, action: 'partner_competitor', detail: `registró precio de ${rec.competitor} ($${price.toLocaleString('es-MX')}) en análisis de competencia` })
    res.status(201).json(rec)
  } catch (err) {
    console.error('Error precio competencia:', err.message)
    res.status(500).json({ error: 'Error al registrar el precio' })
  }
})

// DELETE /api/partners/competitor-prices/:id — solo SUPER_ADMIN
router.delete('/competitor-prices/:id', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador' })
    await prisma.partnerCompetitorPrice.delete({ where: { id: req.params.id } })
    res.json({ message: 'Registro eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

export default router
