import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

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
        items: true
      },
      orderBy: { createdAt: 'desc' }
    })
    // Calcular totales
    const withTotals = quotes.map(q => {
      const subtotal = q.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
      const tax = subtotal * (q.taxRate / 100)
      return { ...q, subtotal, tax, total: subtotal + tax }
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
        items: { include: { product: { select: { id: true, name: true } } } }
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
    const { clientName, clientEmail, clientPhone, notes, taxRate, validUntil, items } = req.body
    if (!clientName) return res.status(400).json({ error: 'El nombre del cliente es requerido' })

    // Generar folio: COT-YYYY-NNNN
    const year = new Date().getFullYear()
    const count = await prisma.quote.count()
    const folio = `COT-${year}-${String(count + 1).padStart(4, '0')}`

    const quote = await prisma.quote.create({
      data: {
        folio, clientName, clientEmail, clientPhone, notes,
        taxRate: taxRate !== undefined ? parseFloat(taxRate) : 16,
        validUntil: validUntil ? new Date(validUntil) : null,
        createdById: req.user.id,
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
    res.status(201).json(quote)
  } catch (err) {
    console.error('Error crear cotización:', err.message)
    res.status(500).json({ error: 'Error al crear cotización: ' + err.message })
  }
})

// PATCH /api/quotes/:id - actualizar cotización (datos + items)
router.patch('/:id', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, notes, taxRate, validUntil, status, items } = req.body

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

export default router
