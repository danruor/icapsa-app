import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// Acceso ULTRA restringido: SOLO super admin o usuarios con la pestaña 'partners'
// explícitamente otorgada. Un ADMIN normal NO entra.
const requirePartners = (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') return next()
  const allowed = (req.user.visibleTabs || '').split(',').map(t => t.trim())
  if (allowed.includes('partners')) return next()
  res.status(403).json({ error: 'Sin acceso a esta sección' })
}
router.use(requirePartners)

// Validación numérica estricta (manejamos dinero)
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

// Cálculo canónico de una partida (misma fórmula que el Excel de Dan)
function computeDeal(d) {
  const costUnitMXN = d.costCurrency === 'USD' ? d.costUnit * d.fx : d.costUnit
  const saleUnitMXN = d.saleCurrency === 'USD' ? d.saleUnit * d.fx : d.saleUnit
  const costTotal = costUnitMXN * d.quantity
  const saleTotal = saleUnitMXN * d.quantity
  const utility = saleTotal - costTotal
  const isr = utility > 0 ? utility * (d.isrRate / 100) : 0
  const net = utility - isr
  const partnerShare = net > 0 ? net * (d.partnerRate / 100) : 0
  const icapsaShare = net - partnerShare
  return { costUnitMXN, saleUnitMXN, costTotal, saleTotal, utility, isr, net, partnerShare, icapsaShare }
}

// GET /api/partners/summary — ajustes + estado de cuenta global
router.get('/summary', async (req, res) => {
  try {
    const [settings, deals, payments] = await Promise.all([
      getSettings(),
      prisma.partnerDeal.findMany(),
      prisma.partnerPayment.findMany()
    ])

    const totals = { costTotal: 0, saleTotal: 0, utility: 0, isr: 0, net: 0, partnerShare: 0, icapsaShare: 0 }
    for (const d of deals) {
      const c = computeDeal(d)
      for (const k of Object.keys(totals)) totals[k] += c[k]
    }
    const paidToPartner = payments.filter(p => p.direction === 'TO_PARTNER').reduce((s, p) => s + p.amount, 0)
    const paidFromPartner = payments.filter(p => p.direction === 'FROM_PARTNER').reduce((s, p) => s + p.amount, 0)
    const netPaid = paidToPartner - paidFromPartner
    const balance = totals.partnerShare - netPaid // >0: ICAPSA debe al socio

    res.json({ settings, totals, paidToPartner, paidFromPartner, netPaid, balance, dealCount: deals.length })
  } catch (err) {
    console.error('Error resumen sociedad:', err.message)
    res.status(500).json({ error: 'Error al obtener el resumen' })
  }
})

// PATCH /api/partners/settings — solo SUPER_ADMIN ajusta los valores por defecto
router.patch('/settings', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador' })
    const { partnerName, defaultFx, defaultIsr, defaultPartnerRate, defaultIva } = req.body
    const data = {}
    if (partnerName !== undefined) data.partnerName = String(partnerName).slice(0, 40)
    for (const [k, lim] of [['defaultFx', { min: 0.01, max: 1000 }], ['defaultIsr', { min: 0, max: 100 }], ['defaultPartnerRate', { min: 0, max: 100 }], ['defaultIva', { min: 0, max: 100 }]]) {
      if (req.body[k] !== undefined) {
        const n = num(req.body[k], lim)
        if (n === null) return res.status(400).json({ error: `Valor inválido en ${k}` })
        data[k] = n
      }
    }
    await getSettings()
    const s = await prisma.partnerSettings.update({ where: { id: 'main' }, data })
    res.json(s)
  } catch (err) {
    console.error('Error ajustes sociedad:', err.message)
    res.status(500).json({ error: 'Error al guardar ajustes' })
  }
})

// GET /api/partners/deals — partidas con cálculos
router.get('/deals', async (req, res) => {
  try {
    const deals = await prisma.partnerDeal.findMany({
      include: { project: { select: { id: true, name: true, color: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(deals.map(d => ({ ...d, calc: computeDeal(d) })))
  } catch (err) {
    console.error('Error partidas:', err.message)
    res.status(500).json({ error: 'Error al obtener desarrollos' })
  }
})

// POST /api/partners/deals
router.post('/deals', async (req, res) => {
  try {
    const s = await getSettings()
    const { name, area, notes, projectId, costCurrency, saleCurrency, status } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'El desarrollo necesita un nombre' })

    const quantity = num(req.body.quantity, { min: 0, max: 1e9 })
    const costUnit = num(req.body.costUnit ?? 0, { min: 0, max: 1e12 })
    const saleUnit = num(req.body.saleUnit ?? 0, { min: 0, max: 1e12 })
    const fx = num(req.body.fx ?? s.defaultFx, { min: 0.01, max: 1000 })
    const isrRate = num(req.body.isrRate ?? s.defaultIsr, { min: 0, max: 100 })
    const partnerRate = num(req.body.partnerRate ?? s.defaultPartnerRate, { min: 0, max: 100 })
    const ivaRate = num(req.body.ivaRate ?? s.defaultIva, { min: 0, max: 100 })
    if ([quantity, costUnit, saleUnit, fx, isrRate, partnerRate, ivaRate].some(v => v === null))
      return res.status(400).json({ error: 'Revisa los valores numéricos' })

    const deal = await prisma.partnerDeal.create({
      data: {
        name: name.trim(), area: area?.trim() || null, notes: notes || null,
        quantity: Math.round(quantity), costUnit, saleUnit,
        costCurrency: costCurrency === 'MXN' ? 'MXN' : 'USD',
        saleCurrency: saleCurrency === 'MXN' ? 'MXN' : 'USD',
        fx, isrRate, partnerRate, ivaRate,
        status: status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        projectId: projectId || null,
        createdById: req.user.id
      }
    })
    await logActivity({ userId: req.user.id, action: 'partner_deal', detail: `registró el desarrollo «${deal.name}» en Sociedad` })
    res.status(201).json({ ...deal, calc: computeDeal(deal) })
  } catch (err) {
    console.error('Error crear partida:', err.message)
    res.status(500).json({ error: 'Error al crear el desarrollo' })
  }
})

// PATCH /api/partners/deals/:id
router.patch('/deals/:id', async (req, res) => {
  try {
    const existing = await prisma.partnerDeal.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })

    const data = {}
    if (req.body.name !== undefined) {
      if (!req.body.name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      data.name = req.body.name.trim()
    }
    if (req.body.area !== undefined) data.area = req.body.area?.trim() || null
    if (req.body.notes !== undefined) data.notes = req.body.notes || null
    if (req.body.projectId !== undefined) data.projectId = req.body.projectId || null
    if (req.body.costCurrency !== undefined) data.costCurrency = req.body.costCurrency === 'MXN' ? 'MXN' : 'USD'
    if (req.body.saleCurrency !== undefined) data.saleCurrency = req.body.saleCurrency === 'MXN' ? 'MXN' : 'USD'
    if (req.body.status !== undefined) data.status = req.body.status === 'CLOSED' ? 'CLOSED' : 'OPEN'

    for (const [k, lim, round] of [
      ['quantity', { min: 0, max: 1e9 }, true],
      ['costUnit', { min: 0, max: 1e12 }], ['saleUnit', { min: 0, max: 1e12 }],
      ['fx', { min: 0.01, max: 1000 }],
      ['isrRate', { min: 0, max: 100 }], ['partnerRate', { min: 0, max: 100 }], ['ivaRate', { min: 0, max: 100 }]
    ]) {
      if (req.body[k] !== undefined) {
        const n = num(req.body[k], lim)
        if (n === null) return res.status(400).json({ error: `Valor inválido en ${k}` })
        data[k] = round ? Math.round(n) : n
      }
    }

    const deal = await prisma.partnerDeal.update({ where: { id: req.params.id }, data })
    res.json({ ...deal, calc: computeDeal(deal) })
  } catch (err) {
    console.error('Error editar partida:', err.message)
    res.status(500).json({ error: 'Error al actualizar' })
  }
})

// DELETE /api/partners/deals/:id
router.delete('/deals/:id', async (req, res) => {
  try {
    const deal = await prisma.partnerDeal.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'partner_deal_deleted', detail: `eliminó el desarrollo «${deal.name}» de Sociedad` })
    res.json({ message: 'Desarrollo eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

// GET /api/partners/payments — cuenta corriente
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

// POST /api/partners/payments
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

// DELETE /api/partners/payments/:id — solo SUPER_ADMIN corrige la cuenta
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

export default router
