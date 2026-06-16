import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// GET /api/inventory?projectId=xxx  (sin projectId = inventario general)
router.get('/', async (req, res) => {
  try {
    const { projectId, category, lowStock } = req.query
    const items = await prisma.inventoryItem.findMany({
      where: {
        ...(projectId && { projectId }),
        ...(category && { category })
      },
      include: {
        project: { select: { id: true, name: true, color: true } }
      },
      orderBy: { name: 'asc' }
    })

    // Filtro de stock bajo en memoria (quantity <= minStock)
    const result = lowStock === 'true'
      ? items.filter(i => i.quantity <= i.minStock)
      : items

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener inventario' })
  }
})

// GET /api/inventory/summary  (totales para tarjetas)
router.get('/summary', async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      select: { quantity: true, minStock: true, unitPrice: true }
    })
    const totalItems = items.length
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0)
    const lowStockCount = items.filter(i => i.quantity <= i.minStock).length
    const totalValue = items.reduce((s, i) => s + (i.unitPrice || 0) * i.quantity, 0)

    res.json({ totalItems, totalUnits, lowStockCount, totalValue })
  } catch {
    res.status(500).json({ error: 'Error al obtener resumen' })
  }
})

// POST /api/inventory
router.post('/', async (req, res) => {
  try {
    const { name, description, sku, quantity, unit, minStock, location, category, unitPrice, projectId } = req.body
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' })

    const item = await prisma.inventoryItem.create({
      data: {
        name, description, sku,
        quantity: quantity ? parseInt(quantity) : 0,
        unit: unit || 'pza',
        minStock: minStock ? parseInt(minStock) : 0,
        location, category,
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
        projectId: projectId || null
      },
      include: { project: { select: { id: true, name: true, color: true } } }
    })
    res.status(201).json(item)
  } catch {
    res.status(500).json({ error: 'Error al crear artículo' })
  }
})

// PATCH /api/inventory/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, sku, quantity, unit, minStock, location, category, unitPrice, projectId } = req.body
    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(sku !== undefined && { sku }),
        ...(quantity !== undefined && { quantity: parseInt(quantity) }),
        ...(unit !== undefined && { unit }),
        ...(minStock !== undefined && { minStock: parseInt(minStock) }),
        ...(location !== undefined && { location }),
        ...(category !== undefined && { category }),
        ...(unitPrice !== undefined && { unitPrice: unitPrice ? parseFloat(unitPrice) : null }),
        ...(projectId !== undefined && { projectId: projectId || null })
      },
      include: { project: { select: { id: true, name: true, color: true } } }
    })
    res.json(item)
  } catch {
    res.status(500).json({ error: 'Error al actualizar artículo' })
  }
})

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } })
    res.json({ message: 'Artículo eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar artículo' })
  }
})

export default router
