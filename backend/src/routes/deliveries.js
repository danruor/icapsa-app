import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireTab } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'
import { nextFolio } from '../lib/folio.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('inventory'))

// GET /api/deliveries - lista de entregas
router.get('/', async (req, res) => {
  try {
    const deliveries = await prisma.delivery.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, color: true } },
        quote: { select: { id: true, folio: true } },
        movements: { include: { item: { select: { id: true, name: true, unit: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    })
    const withTotals = deliveries.map(d => {
      const total = d.movements.reduce((s, m) => s + (m.quantity * (m.unitPrice || 0)), 0)
      const itemCount = d.movements.length
      return { ...d, total, itemCount }
    })
    res.json(withTotals)
  } catch (err) {
    console.error('Error listar entregas:', err.message)
    res.status(500).json({ error: 'Error al obtener entregas' })
  }
})

// GET /api/deliveries/:id
router.get('/:id', async (req, res) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        quote: { select: { id: true, folio: true, clientName: true } },
        movements: { include: { item: { select: { id: true, name: true, unit: true } } } }
      }
    })
    if (!delivery) return res.status(404).json({ error: 'Entrega no encontrada' })
    res.json(delivery)
  } catch {
    res.status(500).json({ error: 'Error al obtener entrega' })
  }
})

// Lista mínima de cotizaciones para vincular (id, folio, cliente) — accesible a cualquier usuario que registre entregas
router.get('/list/quotes', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      select: { id: true, folio: true, clientName: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
    res.json(quotes)
  } catch {
    res.status(500).json({ error: 'Error al obtener cotizaciones' })
  }
})

// POST /api/deliveries - crear entrega (baja inventario)
// items: [{ itemId, quantity }]
router.post('/', async (req, res) => {
  try {
    const { recipient, notes, date, projectId, quoteId, items } = req.body
    if (!recipient) return res.status(400).json({ error: 'El destinatario es requerido' })
    if (!items || items.length === 0) return res.status(400).json({ error: 'Agrega al menos un artículo' })

    // Validar stock disponible antes de crear
    for (const it of items) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: it.itemId } })
      if (!item) return res.status(400).json({ error: 'Artículo no encontrado' })
      if (item.quantity < (parseInt(it.quantity) || 0)) {
        return res.status(400).json({ error: `Stock insuficiente de "${item.name}" (disponible: ${item.quantity} ${item.unit})` })
      }
    }

    // Crear la entrega con folio secuencial seguro (reintenta si hay colisión)
    let delivery
    for (let attempt = 0; attempt < 5; attempt++) {
      const folio = await nextFolio('delivery', 'ENT')
      try {
        delivery = await prisma.delivery.create({
          data: {
            folio, recipient, notes,
            date: date ? new Date(date) : new Date(),
            projectId: projectId || null,
            quoteId: quoteId || null,
            createdById: req.user.id
          }
        })
        break
      } catch (e) {
        if (e.code === 'P2002' && attempt < 4) continue
        throw e
      }
    }
    const folio = delivery.folio

    // Procesar salidas: bajar stock, registrar movimiento ligado a la entrega
    for (const it of items) {
      const qty = parseInt(it.quantity) || 0
      if (qty <= 0) continue
      const item = await prisma.inventoryItem.findUnique({ where: { id: it.itemId } })
      if (!item) continue

      await prisma.inventoryItem.update({
        where: { id: it.itemId },
        data: { quantity: Math.max(0, item.quantity - qty) }
      })

      await prisma.inventoryMovement.create({
        data: {
          type: 'OUT', quantity: qty, unitPrice: item.unitPrice,
          note: `Entrega ${folio}`,
          itemId: it.itemId, userId: req.user.id,
          deliveryId: delivery.id
        }
      })
    }

    if (projectId) {
      await logActivity({
        userId: req.user.id, projectId,
        action: 'delivery',
        detail: `registró la entrega ${folio} a ${recipient}`
      })
    }

    const full = await prisma.delivery.findUnique({
      where: { id: delivery.id },
      include: { movements: { include: { item: { select: { name: true, unit: true } } } } }
    })
    res.status(201).json(full)
  } catch (err) {
    console.error('Error crear entrega:', err.message)
    res.status(500).json({ error: 'Error al crear entrega' })
  }
})

// DELETE /api/deliveries/:id - elimina entrega y regresa el stock
router.delete('/:id', async (req, res) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      include: { movements: true }
    })
    if (!delivery) return res.status(404).json({ error: 'Entrega no encontrada' })

    // Regresar stock: sumar lo que esta entrega había restado
    for (const m of delivery.movements) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: m.itemId } })
      if (item) {
        await prisma.inventoryItem.update({
          where: { id: m.itemId },
          data: { quantity: item.quantity + m.quantity }
        })
      }
    }
    await prisma.delivery.delete({ where: { id: req.params.id } })
    res.json({ message: 'Entrega eliminada y stock devuelto' })
  } catch (err) {
    console.error('Error eliminar entrega:', err.message)
    res.status(500).json({ error: 'Error al eliminar entrega' })
  }
})

export default router
