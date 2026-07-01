import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'
import { nextFolio } from '../lib/folio.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// Solo SUPER_ADMIN puede acceder a cotizaciones
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN')
    return res.status(403).json({ error: 'Solo el super administrador puede acceder a cotizaciones' })
  next()
}
router.use(requireSuperAdmin)

// ===== PRODUCTOS (catálogo) =====

// GET /api/quotes/products
router.get('/products', async (req, res) => {
  try {
    const { category, search } = req.query
    const products = await prisma.product.findMany({
      where: {
        ...(category && { category }),
        ...(search && { name: { contains: search, mode: 'insensitive' } })
      },
      orderBy: { name: 'asc' }
    })
    res.json(products)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' })
  }
})

// POST /api/quotes/products
router.post('/products', async (req, res) => {
  try {
    const { name, description, sku, category, unit, price, cost } = req.body
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
    const product = await prisma.product.create({
      data: {
        name, description, sku, category,
        unit: unit || 'pza',
        price: price ? parseFloat(price) : 0,
        cost: cost ? parseFloat(cost) : null
      }
    })
    res.status(201).json(product)
  } catch {
    res.status(500).json({ error: 'Error al crear producto' })
  }
})

// PATCH /api/quotes/products/:id
router.patch('/products/:id', async (req, res) => {
  try {
    const { name, description, sku, category, unit, price, cost, active } = req.body
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(sku !== undefined && { sku }),
        ...(category !== undefined && { category }),
        ...(unit !== undefined && { unit }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(cost !== undefined && { cost: cost ? parseFloat(cost) : null }),
        ...(active !== undefined && { active })
      }
    })
    res.json(product)
  } catch {
    res.status(500).json({ error: 'Error al actualizar producto' })
  }
})

// DELETE /api/quotes/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } })
    res.json({ message: 'Producto eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar producto' })
  }
})

// ===== COTIZACIONES =====

// GET /api/quotes
router.get('/', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        items: true,
        project: { select: { id: true, name: true, color: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    // Calcular totales
    const withTotals = quotes.map(q => {
      const subtotal = q.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
      const tax = subtotal * (q.taxRate / 100)
      return { ...q, subtotal, tax, total: subtotal + tax, balance: Math.max(0, (subtotal + tax) - q.paidAmount) }
    })
    res.json(withTotals)
  } catch (err) {
    console.error('Error listar cotizaciones:', err.message)
    res.status(500).json({ error: 'Error al obtener cotizaciones' })
  }
})

// GET /api/quotes/:id
router.get('/:id', async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
        project: { select: { id: true, name: true } }
      }
    })
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' })
    const subtotal = quote.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
    const tax = subtotal * (quote.taxRate / 100)
    res.json({ ...quote, subtotal, tax, total: subtotal + tax })
  } catch {
    res.status(500).json({ error: 'Error al obtener cotización' })
  }
})

// POST /api/quotes
router.post('/', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, notes, taxRate, validUntil, items, projectId } = req.body
    if (!clientName) return res.status(400).json({ error: 'El nombre del cliente es requerido' })

    // Crear con folio secuencial seguro; reintentar si hay colisión concurrente
    let quote
    for (let attempt = 0; attempt < 5; attempt++) {
      const folio = await nextFolio('quote', 'COT')
      try {
        quote = await prisma.quote.create({
          data: {
            folio, clientName, clientEmail, clientPhone, notes,
            taxRate: taxRate !== undefined ? parseFloat(taxRate) : 16,
            validUntil: validUntil ? new Date(validUntil) : null,
            createdById: req.user.id,
            projectId: projectId || null,
            items: {
              create: (items || []).map(it => ({
                name: it.name,
                unit: it.unit || 'pza',
                quantity: parseInt(it.quantity) || 1,
                unitPrice: parseFloat(it.unitPrice) || 0,
                discount: parseFloat(it.discount) || 0,
                productId: it.productId || null
              }))
            }
          },
          include: { items: true, createdBy: { select: { name: true } } }
        })
        break // éxito
      } catch (e) {
        if (e.code === 'P2002' && attempt < 4) continue // folio duplicado, reintentar
        throw e
      }
    }
    res.status(201).json(quote)
  } catch (err) {
    console.error('Error crear cotización:', err.message)
    res.status(500).json({ error: 'Error al crear cotización' })
  }
})

// PATCH /api/quotes/:id - actualizar cotización (datos + items)
router.patch('/:id', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, notes, taxRate, validUntil, status, items, projectId } = req.body

    // Si vienen items, reemplazar todos
    if (items) {
      await prisma.quoteItem.deleteMany({ where: { quoteId: req.params.id } })
    }

    const quote = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        ...(clientName !== undefined && { clientName }),
        ...(clientEmail !== undefined && { clientEmail }),
        ...(clientPhone !== undefined && { clientPhone }),
        ...(notes !== undefined && { notes }),
        ...(taxRate !== undefined && { taxRate: parseFloat(taxRate) }),
        ...(status !== undefined && { status }),
        ...(projectId !== undefined && { projectId: projectId || null }),
        ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(items && {
          items: {
            create: items.map(it => ({
              name: it.name, unit: it.unit || 'pza',
              quantity: parseInt(it.quantity) || 1,
              unitPrice: parseFloat(it.unitPrice) || 0,
              discount: parseFloat(it.discount) || 0,
              productId: it.productId || null
            }))
          }
        })
      },
      include: { items: true }
    })
    res.json(quote)
  } catch (err) {
    console.error('Error actualizar cotización:', err.message)
    res.status(500).json({ error: 'Error al actualizar cotización' })
  }
})

// DELETE /api/quotes/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.quote.delete({ where: { id: req.params.id } })
    res.json({ message: 'Cotización eliminada' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar cotización' })
  }
})


// PATCH /api/quotes/:id/payment - registrar estado de pago
router.patch('/:id/payment', async (req, res) => {
  try {
    const { paymentStatus, paidAmount } = req.body

    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    })
    if (!quote) return res.status(404).json({ error: 'No encontrada' })

    const data = {}
    if (paymentStatus !== undefined) {
      data.paymentStatus = paymentStatus
      // Si se marca como pagada, registrar fecha
      if (paymentStatus === 'PAID') {
        data.paidAt = new Date()
        // Calcular total para marcar como pagado completo
        const subtotal = quote.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
        data.paidAmount = subtotal * (1 + quote.taxRate / 100)
      } else if (paymentStatus === 'PENDING') {
        data.paidAt = null
        data.paidAmount = 0
      }
    }
    if (paidAmount !== undefined) {
      data.paidAmount = parseFloat(paidAmount)
      // Determinar estado según monto pagado
      const subtotal = quote.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
      const total = subtotal * (1 + quote.taxRate / 100)
      if (data.paidAmount >= total) {
        data.paymentStatus = 'PAID'
        data.paidAt = new Date()
      } else if (data.paidAmount > 0) {
        data.paymentStatus = 'PARTIAL'
      } else {
        data.paymentStatus = 'PENDING'
      }
    }

    const updated = await prisma.quote.update({ where: { id: req.params.id }, data })
    res.json(updated)
  } catch (err) {
    console.error('Error registrar pago:', err.message)
    res.status(500).json({ error: 'Error al registrar pago' })
  }
})

// GET /api/quotes/summary/payments - resumen financiero
router.get('/summary/payments', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({ include: { items: true } })

    let totalQuoted = 0, totalPaid = 0, totalPending = 0
    let countPaid = 0, countPending = 0, countPartial = 0

    quotes.forEach(q => {
      const subtotal = q.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
      const total = subtotal * (1 + q.taxRate / 100)
      totalQuoted += total
      totalPaid += q.paidAmount
      totalPending += Math.max(0, total - q.paidAmount)
      if (q.paymentStatus === 'PAID') countPaid++
      else if (q.paymentStatus === 'PARTIAL') countPartial++
      else countPending++
    })

    res.json({ totalQuoted, totalPaid, totalPending, countPaid, countPending, countPartial, totalQuotes: quotes.length })
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener resumen' })
  }
})

// GET /api/quotes/list/projects - proyectos disponibles para vincular
router.get('/list/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' }
    })
    res.json(projects)
  } catch {
    res.status(500).json({ error: 'Error al obtener proyectos' })
  }
})

export default router
