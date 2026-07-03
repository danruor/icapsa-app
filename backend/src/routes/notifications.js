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

// POST /api/notifications/push-token — registra el token push del dispositivo
// Si el token ya existía (mismo teléfono, otra sesión), se reasigna al usuario actual.
router.post('/push-token', async (req, res) => {
  try {
    const token = (req.body.token || '').trim()
    if (!token || !token.startsWith('ExponentPushToken')) {
      return res.status(400).json({ error: 'Token push inválido' })
    }
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, userId: req.user.id, platform: req.body.platform || 'ios' },
      update: { userId: req.user.id }
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('Error registrando push token:', err.message)
    res.status(500).json({ error: 'Error al registrar el dispositivo' })
  }
})

// DELETE /api/notifications/push-token — al cerrar sesión, el teléfono deja de recibir push
router.delete('/push-token', async (req, res) => {
  try {
    const token = (req.body.token || '').trim()
    if (token) {
      await prisma.pushToken.deleteMany({ where: { token, userId: req.user.id } })
    }
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Error' })
  }
})

export default router
