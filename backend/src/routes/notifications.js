import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// GET /api/notifications - notificaciones del usuario actual
router.get('/', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30
    })
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, read: false }
    })
    res.json({ notifications, unreadCount })
  } catch {
    res.status(500).json({ error: 'Error al obtener notificaciones' })
  }
})

// PATCH /api/notifications/:id/read - marcar una como leída
router.patch('/:id/read', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true }
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Error' })
  }
})

// POST /api/notifications/read-all - marcar todas como leídas
router.post('/read-all', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true }
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Error' })
  }
})

export default router
