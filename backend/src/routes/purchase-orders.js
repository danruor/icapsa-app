import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireTab } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'
import { nextFolio } from '../lib/folio.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('inventory'))

// GET /api/purchase-orders - lista de órdenes de compra
router.get('/', async (req, res) => {
  try {
    const orders = await prisma.purchaseOrder.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, color: true } },
        movements: {
          include: { item: { select: { id: true, name: true, unit: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    // Calcular total de cada OC
    const withTotals = orders.map(o => {
      const total = o.movements.reduce((s, m) => s + (m.quantity * (m.unitPrice || 0)), 0)
      const itemCount = o.movements.length
      return { ...o, total, itemCount }
    })
    res.json(withTotals)
  } catch (err) {
    console.error('Error listar OC:', err.message)
    res.status(500).json({ error: 'Error al obtener órdenes de compra' })
  }
})

// GET /api/purchase-orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        movements: { include: { item: { select: { id: true, name: true, unit: true } } } }
      }
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    const total = order.movements.reduce((s, m) => s + (m.quantity * (m.unitPrice || 0)), 0)
    res.json({ ...order, total })
  } catch {
    res.status(500).json({ error: 'Error al obtener orden' })
  }
})

// POST /api/purchase-orders - crear OC (sube inventario)
// items: [{ itemId?, name?, unit?, category?, location?, quantity, unitPrice }]
//   - si trae itemId: surte un artículo existente
//   - si no: crea el artículo nuevo y lo surte
router.post('/', async (req, res) => {
  try {
    const { supplier, notes, date, projectId, items } = req.body
    if (!supplier) return res.status(400).json({ error: 'El proveedor es requerido' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'Agrega al menos un artículo' })

    // Crear la orden con folio secuencial seguro (reintenta si hay colisión)
    let order
    for (let attempt = 0; attempt < 5; attempt++) {
      const folio = await nextFolio('purchaseOrder', 'OC')
      try {
        order = await prisma.purchaseOrder.create({
          data: {
            folio, supplier, notes,
            date: date ? new Date(date) : new Date(),
            projectId: projectId || null,
            createdById: req.user.id
          }
        })
        break
      } catch (e) {
        if (e.code === 'P2002' && attempt < 4) continue
        throw e
      }
    }
    const folio = order.folio

    // Procesar cada artículo: crear si es nuevo, subir stock, registrar movimiento ligado a la OC
    for (const it of items) {
      const qty = parseInt(it.quantity) || 0
      if (qty <= 0) continue
      const price = it.unitPrice !== undefined && it.unitPrice !== '' ? parseFloat(it.unitPrice) : null

      let itemId = it.itemId
      if (!itemId) {
        // Crear artículo nuevo
        const newItem = await prisma.inventoryItem.create({
          data: {
            name: it.name || 'Artículo sin nombre',
            unit: it.unit || 'pza',
            category: it.category || null,
            location: it.location || null,
            quantity: qty,
            unitPrice: price,
            projectId: projectId || null
          }
        })
        itemId = newItem.id
      } else {
        // Subir stock de artículo existente
        const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } })
        if (!item) continue
        await prisma.inventoryItem.update({
          where: { id: itemId },
          data: {
            quantity: item.quantity + qty,
            ...(price !== null && { unitPrice: price }) // actualizar último precio
          }
        })
      }

      // Movimiento de entrada ligado a la OC
      await prisma.inventoryMovement.create({
        data: {
          type: 'IN', quantity: qty, unitPrice: price,
          note: `Recepción ${folio}`,
          itemId, userId: req.user.id,
          purchaseOrderId: order.id
        }
      })
    }

    if (projectId) {
      await logActivity({
        userId: req.user.id, projectId,
        action: 'purchase_order',
        detail: `registró la orden de compra ${folio} (${supplier})`
      })
    }

    const full = await prisma.purchaseOrder.findUnique({
      where: { id: order.id },
      include: { movements: { include: { item: { select: { name: true, unit: true } } } } }
    })
    res.status(201).json(full)
  } catch (err) {
    console.error('Error crear OC:', err.message)
    res.status(500).json({ error: 'Error al crear orden de compra' })
  }
})

// DELETE /api/purchase-orders/:id - elimina OC y revierte el stock
router.delete('/:id', async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { movements: true }
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })

    // Revertir stock: restar lo que esta OC había sumado
    for (const m of order.movements) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: m.itemId } })
      if (item) {
        await prisma.inventoryItem.update({
          where: { id: m.itemId },
          data: { quantity: Math.max(0, item.quantity - m.quantity) }
        })
      }
    }
    // Borra la OC (los movimientos se borran en cascada)
    await prisma.purchaseOrder.delete({ where: { id: req.params.id } })
    res.json({ message: 'Orden eliminada y stock revertido' })
  } catch (err) {
    console.error('Error eliminar OC:', err.message)
    res.status(500).json({ error: 'Error al eliminar orden' })
  }
})

export default router
