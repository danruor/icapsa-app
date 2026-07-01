import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireTab } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('inventory'))

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

    // Saldo inicial: si nace con stock, registrar movimiento de apertura para el kardex
    if (item.quantity > 0) {
      await prisma.inventoryMovement.create({
        data: {
          type: 'IN', quantity: item.quantity, unitPrice: item.unitPrice,
          note: 'Saldo inicial', itemId: item.id, userId: req.user.id
        }
      })
    }

    if (item.projectId) {
      await logActivity({
        userId: req.user.id, projectId: item.projectId,
        action: 'added_inventory',
        detail: `agregó "${item.name}" al inventario`
      })
    }
    res.status(201).json(item)
  } catch (err) {
    console.error('Error crear artículo:', err.message)
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


// POST /api/inventory/:id/movement - registrar entrada/salida/ajuste
router.post('/:id/movement', async (req, res) => {
  try {
    const { type, quantity, note } = req.body  // type: IN | OUT | ADJUST
    const qty = parseInt(quantity)
    if (!type || !qty) return res.status(400).json({ error: 'Tipo y cantidad requeridos' })

    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ error: 'Artículo no encontrado' })

    let newQty = item.quantity
    if (type === 'IN') newQty += qty
    else if (type === 'OUT') newQty = Math.max(0, newQty - qty)
    else if (type === 'ADJUST') newQty = qty

    await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id: req.params.id }, data: { quantity: newQty } }),
      prisma.inventoryMovement.create({
        data: { type, quantity: qty, note, itemId: req.params.id, userId: req.user.id }
      })
    ])

    const updated = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true, color: true } } }
    })

    if (updated.projectId) {
      const typeNames = { IN: 'entrada', OUT: 'salida', ADJUST: 'ajuste' }
      await logActivity({
        userId: req.user.id, projectId: updated.projectId,
        action: 'inventory_movement',
        detail: `registró ${typeNames[type]} de ${qty} ${updated.unit} en "${updated.name}"`
      })
    }

    res.json(updated)
  } catch (err) {
    console.error('Error movimiento:', err.message)
    res.status(500).json({ error: 'Error al registrar movimiento' })
  }
})

// GET /api/inventory/:id/movements - historial de movimientos
router.get('/:id/movements', async (req, res) => {
  try {
    // Cronológico ascendente para calcular el saldo acumulado (kardex)
    const movements = await prisma.inventoryMovement.findMany({
      where: { itemId: req.params.id },
      include: {
        user: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, folio: true, supplier: true } },
        delivery: {
          select: {
            id: true, folio: true, recipient: true,
            quote: { select: { id: true, folio: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    // Calcular saldo acumulado (IN suma, OUT resta, ADJUST fija)
    let balance = 0
    const withBalance = movements.map(m => {
      if (m.type === 'IN') balance += m.quantity
      else if (m.type === 'OUT') balance -= m.quantity
      else if (m.type === 'ADJUST') balance = m.quantity
      return { ...m, balanceAfter: balance }
    })

    // Devolver en orden descendente (más reciente primero) para mostrar
    res.json(withBalance.reverse())
  } catch (err) {
    console.error('Error kardex:', err.message)
    res.status(500).json({ error: 'Error al obtener movimientos' })
  }
})

export default router
