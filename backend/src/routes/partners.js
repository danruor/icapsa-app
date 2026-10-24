import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'
import { parseDate } from '../lib/validate.js'
import ExcelJS from 'exceljs'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// Acceso ULTRA restringido: SOLO super admin o usuarios con la pestaña 'partners'
const requirePartners = (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') return next()
  const allowed = (req.user.visibleTabs || '').split(',').map(t => t.trim())
  if (allowed.includes('partners')) return next()
  // Intento de acceso a la sección financiera sin permiso: queda en bitácora
  logActivity({ userId: req.user.id, action: 'partners_denied', detail: `intentó acceder a Sociedad (${req.method} ${req.path})` }).catch(() => {})
  res.status(403).json({ error: 'Sin acceso a esta sección' })
}
router.use(requirePartners)

// Campo vacío o ausente se trata como 0 (p. ej. costo unitario en modo desglosado)
const blankToZero = (v) => (v === '' || v === null || v === undefined) ? 0 : v

const num = (v, { min = -Infinity, max = Infinity } = {}) => {
  const n = parseFloat(v)
  if (isNaN(n) || !isFinite(n) || n < min || n > max) return null
  return n
}

// ---- Ejercicio anual ----
const parseYear = (q) => { const y = parseInt(q); return y >= 2000 && y <= 2100 ? y : null }
const yearRange = (y) => ({ gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) })
const yearOf = (d) => new Date(d).getUTCFullYear()
const closedYearsOf = (s) => new Set((s.closedYears || '').split(',').map(x => parseInt(x)).filter(Boolean))

// Bloquea escrituras sobre un ejercicio cerrado
async function assertYearOpen(dateLike, res) {
  const s = await getSettings()
  const y = yearOf(dateLike)
  if (closedYearsOf(s).has(y)) { res.status(403).json({ error: `El ejercicio ${y} está cerrado. Reábrelo en Ajustes para modificarlo.` }); return false }
  return true
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
  // Un conceptId que ya no existe en el catálogo se desvincula (evita error FK → 500)
  const ids = [...new Set(items.map(it => it.conceptId).filter(Boolean))]
  if (ids.length) {
    const found = new Set((await prisma.partnerConcept.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(c => c.id))
    for (const it of items) if (it.conceptId && !found.has(it.conceptId)) it.conceptId = null
  }
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

// GET /api/partners/summary?year=YYYY — estado de cuenta del ejercicio (+ arrastre histórico)
router.get('/summary', async (req, res) => {
  try {
    const settings = await getSettings()
    const year = parseYear(req.query.year)
    const dealWhere = year ? { dealDate: yearRange(year) } : {}
    const payWhere = year ? { date: yearRange(year) } : {}
    const dataWhere = year ? { period: { startsWith: `${year}-` } } : {}

    const [deals, payments, dataCharges, allDeals, allPays, allData] = await Promise.all([
      prisma.partnerDeal.findMany({ where: dealWhere, include: { items: true } }),
      prisma.partnerPayment.findMany({ where: payWhere }),
      prisma.partnerDataCharge.findMany({ where: dataWhere }),
      prisma.partnerDeal.findMany({ select: { dealDate: true } }),
      prisma.partnerPayment.findMany({ select: { date: true } }),
      prisma.partnerDataCharge.findMany({ select: { period: true } })
    ])
    await backfillLegacy(deals)

    const sumDeals = (list) => {
      const t = { costTotal: 0, saleTotal: 0, utility: 0, isr: 0, net: 0, partnerShare: 0, icapsaShare: 0 }
      for (const d of list) { const c = computeDeal(d); for (const k of Object.keys(t)) t[k] += c[k] }
      return t
    }
    const totals = sumDeals(deals)
    const dataOwed = dataCharges.reduce((s, c) => s + c.amountToPartner, 0)
    const dataBilled = dataCharges.reduce((s, c) => s + (c.amountFromClient || 0), 0)
    const paidToPartner = payments.filter(p => p.direction === 'TO_PARTNER').reduce((s, p) => s + p.amount, 0)
    const paidFromPartner = payments.filter(p => p.direction === 'FROM_PARTNER').reduce((s, p) => s + p.amount, 0)
    const netPaid = paidToPartner - paidFromPartner
    const balance = totals.partnerShare + dataOwed - netPaid

    // Arrastre: saldo acumulado de ejercicios anteriores al seleccionado
    let carryOver = 0
    if (year) {
      const before = new Date(Date.UTC(year, 0, 1))
      const [pd, pp, pc] = await Promise.all([
        prisma.partnerDeal.findMany({ where: { dealDate: { lt: before } }, include: { items: true } }),
        prisma.partnerPayment.findMany({ where: { date: { lt: before } } }),
        prisma.partnerDataCharge.findMany({ where: { period: { lt: `${year}-` } } })
      ])
      await backfillLegacy(pd)
      const pt = sumDeals(pd)
      const pOwed = pc.reduce((s, c) => s + c.amountToPartner, 0)
      const pNet = pp.reduce((s, p) => s + (p.direction === 'TO_PARTNER' ? p.amount : -p.amount), 0)
      carryOver = pt.partnerShare + pOwed - pNet
    }

    // Años con actividad (+ el actual)
    const years = new Set([new Date().getUTCFullYear()])
    allDeals.forEach(d => years.add(yearOf(d.dealDate)))
    allPays.forEach(p => years.add(yearOf(p.date)))
    allData.forEach(c => { const y = parseInt(c.period.slice(0, 4)); if (y) years.add(y) })

    res.json({
      settings, year, years: [...years].sort((a, b) => b - a),
      closedYears: [...closedYearsOf(settings)],
      isClosed: year ? closedYearsOf(settings).has(year) : false,
      totals, dataOwed, dataBilled, dataMargin: dataBilled - dataOwed,
      paidToPartner, paidFromPartner, netPaid,
      balance, carryOver, balanceTotal: balance + carryOver,
      dealCount: deals.length
    })
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
    for (const [k, lim] of [
      ['defaultFx', { min: 0.01, max: 1000 }], ['defaultIsr', { min: 0, max: 100 }], ['defaultPartnerRate', { min: 0, max: 100 }], ['defaultIva', { min: 0, max: 100 }],
      ['dataCostPerMB', { min: 0, max: 1e6 }], ['dataSalePerMB', { min: 0, max: 1e6 }], ['dataFixedCostPerSim', { min: 0, max: 1e6 }], ['dataFixedSalePerSim', { min: 0, max: 1e6 }]
    ]) {
      if (req.body[k] !== undefined) {
        const n = num(blankToZero(req.body[k]), lim)
        if (n === null) return res.status(400).json({ error: `Valor inválido en ${k}` })
        data[k] = n
      }
    }
    // Cierre / reapertura de ejercicios (lista de años)
    if (Array.isArray(req.body.closedYears)) {
      const ys = [...new Set(req.body.closedYears.map(y => parseYear(y)).filter(Boolean))].sort()
      data.closedYears = ys.join(',')
      await logActivity({ userId: req.user.id, action: 'partner_years', detail: `ejercicios cerrados: ${ys.join(', ') || 'ninguno'}` })
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
    const year = parseYear(req.query.year)
    const deals = await prisma.partnerDeal.findMany({
      where: year ? { dealDate: yearRange(year) } : {},
      include: {
        items: { orderBy: { position: 'asc' } },
        project: { select: { id: true, name: true, color: true } },
        createdBy: { select: { name: true } }
      },
      orderBy: { dealDate: 'desc' }
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
    if (!(await assertYearOpen(fields.out.dealDate || new Date(), res))) return
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
    if (!(await assertYearOpen(existing.dealDate, res))) return
    if (fields.out.dealDate && !(await assertYearOpen(fields.out.dealDate, res))) return

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
    const existing = await prisma.partnerDeal.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })
    if (!(await assertYearOpen(existing.dealDate, res))) return
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
    const year = parseYear(req.query.year)
    const payments = await prisma.partnerPayment.findMany({
      where: year ? { date: yearRange(year) } : {},
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
    const payDate = parseDate(date) || new Date()
    if (!(await assertYearOpen(payDate, res))) return

    const payment = await prisma.partnerPayment.create({
      data: {
        direction, amount, concept: concept.trim(),
        method: method?.trim() || null,
        date: payDate,
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
    const existing = await prisma.partnerPayment.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })
    if (!(await assertYearOpen(existing.date, res))) return
    const p = await prisma.partnerPayment.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'partner_payment_deleted', detail: `eliminó un pago de $${p.amount.toLocaleString('es-MX')} (${p.concept})` })
    res.json({ message: 'Pago eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

// ===== DATOS (SIM) — consumo variable por SIM/lote y periodo =====
// Cada registro puede calcularse desde MB consumidos (tarifas por MB + cargo fijo por SIM)
// o capturarse con montos directos. Cuando se conecte la API del proveedor, generará estos registros.

function parseDataCharge(body, s, existing = null) {
  const period = body.period ?? existing?.period
  if (!/^\d{4}-\d{2}$/.test(period || '')) return { error: 'Periodo inválido (usa AAAA-MM)' }
  const concept = (body.concept ?? existing?.concept ?? '').trim()
  if (!concept) return { error: 'El concepto es requerido' }
  const autoCalc = body.autoCalc !== undefined ? !!body.autoCalc : !!existing?.autoCalc

  const cardsCount = body.cardsCount !== undefined ? num(blankToZero(body.cardsCount), { min: 0, max: 1e7 }) : (existing?.cardsCount ?? null)
  const mbUsed = body.mbUsed !== undefined ? num(blankToZero(body.mbUsed), { min: 0, max: 1e9 }) : (existing?.mbUsed ?? null)
  if (cardsCount === null && body.cardsCount !== undefined) return { error: 'Número de tarjetas inválido' }
  if (mbUsed === null && body.mbUsed !== undefined) return { error: 'MB consumidos inválidos' }

  // Tarifas: las del registro, o las de ajustes
  const rate = (k, sk) => {
    const v = body[k] !== undefined ? blankToZero(body[k]) : (existing?.[k] ?? s[sk])
    return num(v, { min: 0, max: 1e6 })
  }
  const costPerMB = rate('costPerMB', 'dataCostPerMB')
  const salePerMB = rate('salePerMB', 'dataSalePerMB')
  const fixedCostPerSim = rate('fixedCostPerSim', 'dataFixedCostPerSim')
  const fixedSalePerSim = rate('fixedSalePerSim', 'dataFixedSalePerSim')
  if ([costPerMB, salePerMB, fixedCostPerSim, fixedSalePerSim].some(v => v === null)) return { error: 'Tarifa inválida' }

  let amountToPartner, amountFromClient
  if (autoCalc) {
    amountToPartner = (mbUsed || 0) * costPerMB + (cardsCount || 0) * fixedCostPerSim
    amountFromClient = (mbUsed || 0) * salePerMB + (cardsCount || 0) * fixedSalePerSim
  } else {
    amountToPartner = body.amountToPartner !== undefined ? num(blankToZero(body.amountToPartner), { min: 0, max: 1e12 }) : (existing?.amountToPartner ?? null)
    if (amountToPartner === null) return { error: 'Monto al proveedor inválido' }
    amountFromClient = body.amountFromClient !== undefined
      ? (blankToZero(body.amountFromClient) === 0 ? 0 : num(body.amountFromClient, { min: 0, max: 1e12 }))
      : (existing?.amountFromClient ?? 0)
    if (amountFromClient === null) return { error: 'Monto del cliente inválido' }
  }

  return {
    data: {
      period, concept: concept.slice(0, 120),
      simLabel: body.simLabel !== undefined ? (body.simLabel?.trim().slice(0, 80) || null) : (existing?.simLabel ?? null),
      cardsCount: cardsCount !== null ? Math.round(cardsCount) : null,
      mbUsed, costPerMB, salePerMB, fixedCostPerSim, fixedSalePerSim, autoCalc,
      amountToPartner, amountFromClient,
      notes: body.notes !== undefined ? (body.notes?.trim().slice(0, 300) || null) : (existing?.notes ?? null),
      dealId: body.dealId !== undefined ? (body.dealId || null) : (existing?.dealId ?? null)
    }
  }
}

// GET /api/partners/data-charges?year=YYYY
router.get('/data-charges', async (req, res) => {
  try {
    const year = parseYear(req.query.year)
    const charges = await prisma.partnerDataCharge.findMany({
      where: year ? { period: { startsWith: `${year}-` } } : {},
      include: { deal: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }]
    })
    res.json(charges)
  } catch {
    res.status(500).json({ error: 'Error al obtener cargos de datos' })
  }
})

// POST /api/partners/data-charges
router.post('/data-charges', async (req, res) => {
  try {
    const s = await getSettings()
    const parsed = parseDataCharge(req.body, s)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    if (!(await assertYearOpen(`${parsed.data.period}-15`, res))) return

    const charge = await prisma.partnerDataCharge.create({ data: { ...parsed.data, createdById: req.user.id } })
    await logActivity({
      userId: req.user.id, action: 'partner_data',
      detail: `registró datos ${charge.period}${charge.simLabel ? ` (${charge.simLabel})` : ''}: ${charge.mbUsed ? `${charge.mbUsed} MB → ` : ''}$${charge.amountToPartner.toLocaleString('es-MX')} a ${s.partnerName}`
    })
    res.status(201).json(charge)
  } catch (err) {
    console.error('Error cargo de datos:', err.message)
    res.status(500).json({ error: 'Error al registrar el cargo' })
  }
})

// PATCH /api/partners/data-charges/:id — corregir consumo/montos de un mes
router.patch('/data-charges/:id', async (req, res) => {
  try {
    const existing = await prisma.partnerDataCharge.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })
    if (!(await assertYearOpen(`${existing.period}-15`, res))) return
    const s = await getSettings()
    const parsed = parseDataCharge(req.body, s, existing)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    if (!(await assertYearOpen(`${parsed.data.period}-15`, res))) return
    const charge = await prisma.partnerDataCharge.update({ where: { id: req.params.id }, data: parsed.data })
    await logActivity({ userId: req.user.id, action: 'partner_data', detail: `corrigió datos ${charge.period}: $${charge.amountToPartner.toLocaleString('es-MX')} a ${s.partnerName}` })
    res.json(charge)
  } catch (err) {
    console.error('Error editar cargo:', err.message)
    res.status(500).json({ error: 'Error al actualizar' })
  }
})

router.delete('/data-charges/:id', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador puede eliminar cargos' })
    const existing = await prisma.partnerDataCharge.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })
    if (!(await assertYearOpen(`${existing.period}-15`, res))) return
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

// Lista de precios por división CFE / estado / cliente
function parsePrices(raw) {
  if (!Array.isArray(raw)) return { prices: [] }
  const prices = []
  for (const [i, p] of raw.entries()) {
    const scopeType = ['CFE_DIVISION', 'STATE', 'CLIENT'].includes(p.scopeType) ? p.scopeType : null
    if (!scopeType) return { error: `Alcance inválido en el precio ${i + 1}` }
    if (!p.scope?.trim()) return { error: `Falta la división/estado/cliente en el precio ${i + 1}` }
    const saleUnit = num(blankToZero(p.saleUnit), { min: 0, max: 1e12 })
    if (saleUnit === null) return { error: `Precio inválido para «${p.scope}»` }
    prices.push({ scopeType, scope: p.scope.trim().slice(0, 80), saleUnit, saleCurrency: p.saleCurrency === 'MXN' ? 'MXN' : 'USD', notes: p.notes?.trim().slice(0, 120) || null })
  }
  return { prices }
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
        include: { costParts: { orderBy: { position: 'asc' } }, prices: { orderBy: [{ scopeType: 'asc' }, { scope: 'asc' }] }, _count: { select: { dealItems: true, competitorPrices: true } } },
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
    const saleUnit = num(blankToZero(req.body.saleUnit), { min: 0, max: 1e12 })
    let costUnit = num(blankToZero(req.body.costUnit), { min: 0, max: 1e12 })
    if (saleUnit === null) return res.status(400).json({ error: 'Revisa el precio de venta' })
    if (costUnit === null) return res.status(400).json({ error: 'Revisa el costo unitario' })

    const mode = costingMode === 'BREAKDOWN' ? 'BREAKDOWN' : 'TOTAL'
    const parsed = parseCostParts(req.body.costParts)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    if (mode === 'BREAKDOWN' && parsed.parts.length === 0)
      return res.status(400).json({ error: 'El modo desglosado requiere al menos una parte de costo' })

    const parsedPrices = parsePrices(req.body.prices)
    if (parsedPrices.error) return res.status(400).json({ error: parsedPrices.error })

    // En desglosado, el costo total se calcula de las partes (en MXN) y se guarda como referencia
    let costCur = costCurrency === 'MXN' ? 'MXN' : 'USD'
    if (mode === 'BREAKDOWN') {
      const s = await getSettings()
      costUnit = parsed.parts.reduce((sum, p) => sum + (p.currency === 'USD' ? p.amount * s.defaultFx : p.amount), 0)
      costCur = 'MXN'
    }

    const concept = await prisma.partnerConcept.create({
      data: {
        name: name.trim().slice(0, 120),
        description: description?.trim().slice(0, 300) || null,
        costingMode: mode,
        costUnit, costCurrency: costCur,
        saleUnit, saleCurrency: saleCurrency === 'MXN' ? 'MXN' : 'USD',
        createdById: req.user.id,
        ...(mode === 'BREAKDOWN' && { costParts: { create: parsed.parts } }),
        ...(parsedPrices.prices.length && { prices: { create: parsedPrices.prices } })
      },
      include: { costParts: true, prices: true }
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
        const n = num(blankToZero(req.body[k]), { min: 0, max: 1e12 })
        if (n === null) return res.status(400).json({ error: k === 'saleUnit' ? 'Revisa el precio de venta' : 'Revisa el costo unitario' })
        data[k] = n
      }
    }
    let partOps = {}
    if (req.body.costParts !== undefined) {
      const parsed = parseCostParts(req.body.costParts)
      if (parsed.error) return res.status(400).json({ error: parsed.error })
      partOps = { costParts: { deleteMany: {}, create: parsed.parts } }
      // Desglosado: cachear la suma de partes como costo de referencia
      if ((data.costingMode || existing.costingMode) === 'BREAKDOWN' && parsed.parts.length) {
        const s = await getSettings()
        data.costUnit = parsed.parts.reduce((sum, p) => sum + (p.currency === 'USD' ? p.amount * s.defaultFx : p.amount), 0)
        data.costCurrency = 'MXN'
      }
    }
    let priceOps = {}
    if (req.body.prices !== undefined) {
      const pp = parsePrices(req.body.prices)
      if (pp.error) return res.status(400).json({ error: pp.error })
      priceOps = { prices: { deleteMany: {}, create: pp.prices } }
    }
    const concept = await prisma.partnerConcept.update({
      where: { id: req.params.id },
      data: { ...data, ...partOps, ...priceOps },
      include: { costParts: { orderBy: { position: 'asc' } }, prices: true }
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

// GET /api/partners/analytics?granularity=day|month|year&year=YYYY
router.get('/analytics', async (req, res) => {
  try {
    const gran = ['day', 'month', 'year'].includes(req.query.granularity) ? req.query.granularity : 'month'
    const year = parseYear(req.query.year)
    const [deals, allDeals, dataCharges] = await Promise.all([
      prisma.partnerDeal.findMany({ where: year ? { dealDate: yearRange(year) } : {}, include: { items: { include: { concept: { select: { name: true } } } } } }),
      prisma.partnerDeal.findMany({ include: { items: true } }),
      prisma.partnerDataCharge.findMany({ where: year ? { period: { startsWith: `${year}-` } } : {} })
    ])
    await backfillLegacy(deals)
    await backfillLegacy(allDeals)

    const zero = () => ({ sale: 0, cost: 0, utility: 0, net: 0, icapsa: 0, partner: 0, count: 0 })
    const add = (b, c) => { b.sale += c.saleTotal; b.cost += c.costTotal; b.utility += c.utility; b.net += c.net; b.icapsa += c.icapsaShare; b.partner += c.partnerShare; b.count++ }
    const byPeriod = {}, byClient = {}, byDivision = {}, byConcept = {}
    const byType = { CFE: zero(), PRIVATE: zero() }
    const dealMargins = []

    for (const d of deals) {
      const c = computeDeal(d)
      const dt = new Date(d.dealDate || d.createdAt)
      const key = gran === 'day' ? dt.toISOString().slice(0, 10) : gran === 'year' ? String(dt.getUTCFullYear()) : dt.toISOString().slice(0, 7)
      const clientKey = d.clientType === 'CFE' ? 'CFE' : (d.clientName || 'Privado s/n')
      if (!byPeriod[key]) byPeriod[key] = zero(); add(byPeriod[key], c)
      if (!byClient[clientKey]) byClient[clientKey] = zero(); add(byClient[clientKey], c)
      if (d.clientType === 'CFE' && d.division) { if (!byDivision[d.division]) byDivision[d.division] = zero(); add(byDivision[d.division], c) }
      add(byType[d.clientType === 'CFE' ? 'CFE' : 'PRIVATE'], c)
      dealMargins.push({ name: d.name, client: clientKey, sale: c.saleTotal, utility: c.utility, marginPct: c.saleTotal > 0 ? (c.utility / c.saleTotal) * 100 : 0 })

      // Top conceptos: por concepto de catálogo o por nombre
      for (const it of d.items) {
        const ic = computeItem(it, d)
        const name = it.concept?.name || it.name
        if (!byConcept[name]) byConcept[name] = { qty: 0, sale: 0, cost: 0, utility: 0, deals: 0 }
        const b = byConcept[name]
        b.qty += it.quantity; b.sale += ic.saleTotal; b.cost += ic.costTotal; b.utility += ic.utility; b.deals++
      }
    }

    // Comparativa año vs año (siempre completa, sin filtro)
    const byYear = {}
    for (const d of allDeals) {
      const y = String(yearOf(d.dealDate || d.createdAt))
      if (!byYear[y]) byYear[y] = zero()
      add(byYear[y], computeDeal(d))
    }

    // Consumo de datos por periodo
    const dataByPeriod = {}
    for (const c of dataCharges) {
      if (!dataByPeriod[c.period]) dataByPeriod[c.period] = { mb: 0, cost: 0, sale: 0, cards: 0 }
      const b = dataByPeriod[c.period]
      b.mb += c.mbUsed || 0; b.cost += c.amountToPartner; b.sale += c.amountFromClient || 0; b.cards += c.cardsCount || 0
    }

    res.json({
      granularity: gran, year,
      byPeriod: Object.entries(byPeriod).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ period: k, ...v })),
      byClient: Object.entries(byClient).sort((a, b) => b[1].sale - a[1].sale).map(([k, v]) => ({ client: k, ...v })),
      byDivision: Object.entries(byDivision).sort((a, b) => b[1].sale - a[1].sale).map(([k, v]) => ({ division: k, ...v })),
      byType: [{ type: 'CFE', ...byType.CFE }, { type: 'Privados', ...byType.PRIVATE }],
      byYear: Object.entries(byYear).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ year: k, ...v })),
      topConcepts: Object.entries(byConcept).sort((a, b) => b[1].utility - a[1].utility).slice(0, 10).map(([k, v]) => ({ name: k, ...v, marginPct: v.sale > 0 ? (v.utility / v.sale) * 100 : 0 })),
      dealMargins: dealMargins.sort((a, b) => a.marginPct - b.marginPct),
      dataByPeriod: Object.entries(dataByPeriod).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ period: k, ...v, margin: v.sale - v.cost }))
    })
  } catch (err) {
    console.error('Error analytics:', err.message)
    res.status(500).json({ error: 'Error al calcular el análisis' })
  }
})

// ===== EXPORTACIÓN EXCEL DEL EJERCICIO =====
// GET /api/partners/export.xlsx?year=YYYY
router.get('/export.xlsx', async (req, res) => {
  try {
    const s = await getSettings()
    const year = parseYear(req.query.year)
    const [deals, payments, charges] = await Promise.all([
      prisma.partnerDeal.findMany({ where: year ? { dealDate: yearRange(year) } : {}, include: { items: true }, orderBy: { dealDate: 'asc' } }),
      prisma.partnerPayment.findMany({ where: year ? { date: yearRange(year) } : {}, orderBy: { date: 'asc' } }),
      prisma.partnerDataCharge.findMany({ where: year ? { period: { startsWith: `${year}-` } } : {}, orderBy: { period: 'asc' } })
    ])
    await backfillLegacy(deals)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'ICAPSA'
    const money = '"$"#,##0.00'
    const head = (ws) => { ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22A2DE' } } }

    // Hoja: Contratos (una fila por concepto, con totales por contrato)
    const wsD = wb.addWorksheet('Contratos')
    wsD.columns = [
      { header: 'Fecha', key: 'date', width: 12 }, { header: 'Contrato', key: 'name', width: 34 }, { header: 'Ref', key: 'ref', width: 18 },
      { header: 'Tipo', key: 'type', width: 9 }, { header: 'Cliente / División', key: 'client', width: 26 }, { header: 'Estado', key: 'state', width: 16 },
      { header: 'Concepto', key: 'item', width: 28 }, { header: 'Cant.', key: 'qty', width: 8 },
      { header: 'PU Costo', key: 'cu', width: 12 }, { header: 'Mon.', key: 'cc', width: 6 }, { header: 'PU Venta', key: 'su', width: 12 }, { header: 'Mon.', key: 'sc', width: 6 },
      { header: 'TC', key: 'fx', width: 7 }, { header: 'Costo MXN', key: 'cost', width: 15 }, { header: 'Venta MXN', key: 'sale', width: 15 },
      { header: 'Utilidad', key: 'util', width: 15 }, { header: `ISR`, key: 'isr', width: 14 }, { header: 'Neta', key: 'net', width: 15 },
      { header: 'ICAPSA', key: 'icapsa', width: 15 }, { header: s.partnerName, key: 'partner', width: 15 }, { header: 'Estatus', key: 'status', width: 9 }
    ]
    head(wsD)
    for (const d of deals) {
      for (const it of d.items) {
        const c = computeItem(it, d)
        wsD.addRow({
          date: new Date(d.dealDate).toISOString().slice(0, 10), name: d.name, ref: d.contractRef || '', type: d.clientType === 'CFE' ? 'CFE' : 'Privado',
          client: d.clientType === 'CFE' ? (d.division || 'CFE') : (d.clientName || ''), state: d.state || '',
          item: it.name, qty: it.quantity, cu: it.costUnit, cc: it.costCurrency, su: it.saleUnit, sc: it.saleCurrency, fx: d.fx,
          cost: c.costTotal, sale: c.saleTotal, util: c.utility, isr: c.isr, net: c.net, icapsa: c.icapsaShare, partner: c.partnerShare,
          status: d.status === 'CLOSED' ? 'Cerrado' : 'Abierto'
        })
      }
    }
    ;['cu', 'su', 'cost', 'sale', 'util', 'isr', 'net', 'icapsa', 'partner'].forEach(k => { wsD.getColumn(k).numFmt = money })
    if (deals.length) {
      const tot = wsD.addRow({ name: 'TOTAL' })
      tot.font = { bold: true }
      for (const k of ['cost', 'sale', 'util', 'isr', 'net', 'icapsa', 'partner']) {
        const col = wsD.getColumn(k).letter
        tot.getCell(k).value = { formula: `SUM(${col}2:${col}${tot.number - 1})` }
        tot.getCell(k).numFmt = money
      }
    }

    // Hoja: Pagos
    const wsP = wb.addWorksheet('Pagos')
    wsP.columns = [
      { header: 'Fecha', key: 'date', width: 12 }, { header: 'Dirección', key: 'dir', width: 22 }, { header: 'Concepto', key: 'concept', width: 40 },
      { header: 'Método', key: 'method', width: 16 }, { header: 'Monto', key: 'amount', width: 15 }
    ]
    head(wsP)
    for (const p of payments) {
      wsP.addRow({ date: new Date(p.date).toISOString().slice(0, 10), dir: p.direction === 'TO_PARTNER' ? `ICAPSA → ${s.partnerName}` : `${s.partnerName} → ICAPSA`, concept: p.concept, method: p.method || '', amount: p.direction === 'TO_PARTNER' ? p.amount : -p.amount })
    }
    wsP.getColumn('amount').numFmt = money

    // Hoja: Datos (SIM)
    const wsS = wb.addWorksheet('Datos SIM')
    wsS.columns = [
      { header: 'Periodo', key: 'period', width: 10 }, { header: 'Concepto', key: 'concept', width: 30 }, { header: 'SIM / Lote', key: 'sim', width: 20 },
      { header: 'Tarjetas', key: 'cards', width: 9 }, { header: 'MB', key: 'mb', width: 10 }, { header: '$/MB prov.', key: 'cpm', width: 10 }, { header: '$/MB cliente', key: 'spm', width: 11 },
      { header: `A ${s.partnerName}`, key: 'cost', width: 14 }, { header: 'Cobrado', key: 'sale', width: 14 }, { header: 'Margen', key: 'margin', width: 14 }
    ]
    head(wsS)
    for (const c of charges) {
      wsS.addRow({ period: c.period, concept: c.concept, sim: c.simLabel || '', cards: c.cardsCount || '', mb: c.mbUsed || '', cpm: c.costPerMB ?? '', spm: c.salePerMB ?? '', cost: c.amountToPartner, sale: c.amountFromClient || 0, margin: (c.amountFromClient || 0) - c.amountToPartner })
    }
    ;['cost', 'sale', 'margin'].forEach(k => { wsS.getColumn(k).numFmt = money })

    // Hoja: Resumen
    const totals = { cost: 0, sale: 0, util: 0, isr: 0, net: 0, icapsa: 0, partner: 0 }
    for (const d of deals) { const c = computeDeal(d); totals.cost += c.costTotal; totals.sale += c.saleTotal; totals.util += c.utility; totals.isr += c.isr; totals.net += c.net; totals.icapsa += c.icapsaShare; totals.partner += c.partnerShare }
    const dataOwed = charges.reduce((a, c) => a + c.amountToPartner, 0)
    const netPaid = payments.reduce((a, p) => a + (p.direction === 'TO_PARTNER' ? p.amount : -p.amount), 0)
    const wsR = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: 'FF22A2DE' } } })
    wsR.columns = [{ header: 'Concepto', key: 'k', width: 40 }, { header: 'Monto MXN', key: 'v', width: 18 }]
    head(wsR)
    ;[
      [`Ejercicio`, year ? String(year) : 'Todos'], ['Contratos', deals.length],
      ['Venta total', totals.sale], ['Costo total', totals.cost], ['Utilidad bruta', totals.util], ['ISR', totals.isr], ['Utilidad neta', totals.net],
      [`ICAPSA (${100 - s.defaultPartnerRate}%)`, totals.icapsa], [`${s.partnerName} (${s.defaultPartnerRate}%)`, totals.partner],
      [`Datos adeudados a ${s.partnerName}`, dataOwed], ['Pagos netos realizados', netPaid],
      [`Saldo del ejercicio (por pagar a ${s.partnerName})`, totals.partner + dataOwed - netPaid]
    ].forEach(([k, v]) => { const r = wsR.addRow({ k, v }); if (typeof v === 'number' && k !== 'Contratos') r.getCell('v').numFmt = money })
    wsR.lastRow.font = { bold: true }
    wb.worksheets.unshift(wb.worksheets.pop()) // Resumen primero

    await logActivity({ userId: req.user.id, action: 'partner_export', detail: `exportó el estado de cuenta de Sociedad (${year || 'todos los años'})` })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Sociedad-${year || 'historico'}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Error export sociedad:', err.message)
    res.status(500).json({ error: 'Error al exportar' })
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
    let cid = typeof conceptId === 'string' && conceptId ? conceptId.slice(0, 40) : null
    if (cid && !(await prisma.partnerConcept.findUnique({ where: { id: cid }, select: { id: true } })))
      return res.status(400).json({ error: 'El concepto vinculado no existe' })

    const rec = await prisma.partnerCompetitorPrice.create({
      data: {
        competitor: competitor.trim().slice(0, 80),
        price,
        currency: currency === 'USD' ? 'USD' : 'MXN',
        priceType: priceType === 'COST' ? 'COST' : 'SALE',
        context: context?.trim().slice(0, 200) || null,
        notes: notes?.trim().slice(0, 300) || null,
        conceptId: cid,
        date: parseDate(date) || new Date(),
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
