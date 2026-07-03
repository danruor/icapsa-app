import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireTab } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('board'))

const CARD_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, position: true } },
  project: { select: { id: true, name: true, color: true } },
  quote: { select: { id: true, folio: true, clientName: true } },
  purchaseOrder: { select: { id: true, folio: true, supplier: true } }
}

// Notificar asignación de pendiente
async function notifyAssignment(card, byUserId) {
  try {
    if (!card.assigneeId || card.assigneeId === byUserId) return
    const by = await prisma.user.findUnique({ where: { id: byUserId }, select: { name: true } })
    await prisma.notification.create({
      data: {
        userId: card.assigneeId,
        type: 'board_assigned',
        title: 'Nuevo pendiente asignado',
        message: `${by?.name || 'Alguien'} te asignó: «${card.title}»`,
        link: '/board'
      }
    })
  } catch (err) {
    console.error('Error notificar asignación:', err.message)
  }
}

// GET /api/board — tablero completo (con columnas por defecto la primera vez)
router.get('/', async (req, res) => {
  try {
    let columns = await prisma.boardColumn.findMany({
      include: { cards: { include: CARD_INCLUDE, orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' }
    })

    // Primera vez: crear columnas por defecto
    if (columns.length === 0) {
      await prisma.boardColumn.createMany({
        data: [
          { name: 'Por hacer', color: '#94A3B8', position: 0 },
          { name: 'En proceso', color: '#3B82F6', position: 1 },
          { name: 'Terminado', color: '#22C55E', position: 2 }
        ]
      })
      columns = await prisma.boardColumn.findMany({
        include: { cards: { include: CARD_INCLUDE, orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' }
      })
    }
    res.json(columns)
  } catch (err) {
    console.error('Error tablero:', err.message)
    res.status(500).json({ error: 'Error al obtener el tablero' })
  }
})

// GET /api/board/users — asignables (todos los activos, incluyéndome)
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, position: true },
      orderBy: { name: 'asc' }
    })
    res.json(users)
  } catch {
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// GET /api/board/links — opciones para vincular tarjetas
router.get('/links', async (req, res) => {
  try {
    const [projects, quotes, purchaseOrders] = await Promise.all([
      prisma.project.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: { createdAt: 'desc' }, take: 100
      }),
      prisma.quote.findMany({
        where: { deletedAt: null },
        select: { id: true, folio: true, clientName: true },
        orderBy: { createdAt: 'desc' }, take: 100
      }),
      prisma.purchaseOrder.findMany({
        select: { id: true, folio: true, supplier: true },
        orderBy: { createdAt: 'desc' }, take: 100
      })
    ])
    res.json({ projects, quotes, purchaseOrders })
  } catch {
    res.status(500).json({ error: 'Error al obtener vínculos' })
  }
})

// ===== COLUMNAS =====

// POST /api/board/columns
router.post('/columns', async (req, res) => {
  try {
    const name = (req.body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'La columna necesita un nombre' })
    const max = await prisma.boardColumn.aggregate({ _max: { position: true } })
    const col = await prisma.boardColumn.create({
      data: { name, color: req.body.color || '#94A3B8', position: (max._max.position ?? -1) + 1 }
    })
    res.status(201).json(col)
  } catch (err) {
    console.error('Error crear columna:', err.message)
    res.status(500).json({ error: 'Error al crear la columna' })
  }
})

// PATCH /api/board/columns/:id — renombrar / color / posición
router.patch('/columns/:id', async (req, res) => {
  try {
    const { name, color, position } = req.body
    const col = await prisma.boardColumn.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
        ...(position !== undefined && { position: parseInt(position) })
      }
    })
    res.json(col)
  } catch {
    res.status(500).json({ error: 'Error al actualizar la columna' })
  }
})

// DELETE /api/board/columns/:id — elimina la columna Y sus tarjetas
router.delete('/columns/:id', async (req, res) => {
  try {
    await prisma.boardColumn.delete({ where: { id: req.params.id } })
    res.json({ message: 'Columna eliminada' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar la columna' })
  }
})

// ===== TARJETAS =====

// POST /api/board/cards
router.post('/cards', async (req, res) => {
  try {
    const { title, columnId, description, assigneeId, priority, dueDate, projectId, quoteId, purchaseOrderId } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'La tarjeta necesita un título' })
    if (!columnId) return res.status(400).json({ error: 'Falta la columna' })

    const max = await prisma.boardCard.aggregate({ where: { columnId }, _max: { position: true } })
    const card = await prisma.boardCard.create({
      data: {
        title: title.trim(),
        description: description || null,
        columnId,
        position: (max._max.position ?? -1) + 1,
        priority: priority || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId: assigneeId || null,
        projectId: projectId || null,
        quoteId: quoteId || null,
        purchaseOrderId: purchaseOrderId || null,
        createdById: req.user.id
      },
      include: CARD_INCLUDE
    })
    await notifyAssignment(card, req.user.id)
    res.status(201).json(card)
  } catch (err) {
    console.error('Error crear tarjeta:', err.message)
    res.status(500).json({ error: 'Error al crear la tarjeta' })
  }
})

// PATCH /api/board/cards/:id — editar campos
router.patch('/cards/:id', async (req, res) => {
  try {
    const before = await prisma.boardCard.findUnique({ where: { id: req.params.id } })
    if (!before) return res.status(404).json({ error: 'Tarjeta no encontrada' })

    const { title, description, assigneeId, priority, dueDate, projectId, quoteId, purchaseOrderId, columnId } = req.body
    const card = await prisma.boardCard.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
        ...(priority !== undefined && { priority: priority || null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(projectId !== undefined && { projectId: projectId || null }),
        ...(quoteId !== undefined && { quoteId: quoteId || null }),
        ...(purchaseOrderId !== undefined && { purchaseOrderId: purchaseOrderId || null }),
        ...(columnId !== undefined && { columnId })
      },
      include: CARD_INCLUDE
    })
    // Notificar si cambió el asignado
    if (assigneeId !== undefined && assigneeId && assigneeId !== before.assigneeId) {
      await notifyAssignment(card, req.user.id)
    }
    res.json(card)
  } catch (err) {
    console.error('Error editar tarjeta:', err.message)
    res.status(500).json({ error: 'Error al actualizar la tarjeta' })
  }
})

// POST /api/board/cards/:id/move — mover con drag & drop { columnId, index }
router.post('/cards/:id/move', async (req, res) => {
  try {
    const { columnId, index } = req.body
    const card = await prisma.boardCard.findUnique({ where: { id: req.params.id } })
    if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada' })
    const fromColumnId = card.columnId

    // Tarjetas de la columna destino (sin la que se mueve), en orden
    const destCards = await prisma.boardCard.findMany({
      where: { columnId, id: { not: card.id } },
      orderBy: { position: 'asc' },
      select: { id: true }
    })
    const at = Math.max(0, Math.min(parseInt(index) || 0, destCards.length))
    destCards.splice(at, 0, { id: card.id })

    // Reescribir posiciones del destino (y cambiar la columna de la tarjeta)
    await prisma.$transaction([
      ...destCards.map((c, i) =>
        prisma.boardCard.update({
          where: { id: c.id },
          data: { position: i, ...(c.id === card.id && { columnId }) }
        })
      )
    ])

    // Reindexar la columna origen si fue distinta
    if (fromColumnId !== columnId) {
      const srcCards = await prisma.boardCard.findMany({
        where: { columnId: fromColumnId },
        orderBy: { position: 'asc' },
        select: { id: true }
      })
      await prisma.$transaction(
        srcCards.map((c, i) => prisma.boardCard.update({ where: { id: c.id }, data: { position: i } }))
      )
    }

    res.json({ message: 'Movida' })
  } catch (err) {
    console.error('Error mover tarjeta:', err.message)
    res.status(500).json({ error: 'Error al mover la tarjeta' })
  }
})

// DELETE /api/board/cards/:id
router.delete('/cards/:id', async (req, res) => {
  try {
    await prisma.boardCard.delete({ where: { id: req.params.id } })
    res.json({ message: 'Tarjeta eliminada' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar la tarjeta' })
  }
})

export default router
