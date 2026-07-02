import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

const MAX_MSG = 4000

// Helper: valida que el usuario sea participante; devuelve la participación o null
async function myPart(conversationId, userId) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } }
  })
}

// Helper: mensaje de sistema (trazabilidad corporativa)
async function systemMessage(conversationId, content) {
  await prisma.chatMessage.create({
    data: { conversationId, content, type: 'SYSTEM', senderId: null }
  })
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
}

// GET /api/chat/users — usuarios activos para iniciar conversaciones
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, id: { not: req.user.id } },
      select: { id: true, name: true, position: true, role: true },
      orderBy: { name: 'asc' }
    })
    res.json(users)
  } catch (err) {
    console.error('Error usuarios chat:', err.message)
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// GET /api/chat/unread — total de mensajes no leídos (badge del menú)
router.get('/unread', async (req, res) => {
  try {
    const parts = await prisma.conversationParticipant.findMany({
      where: { userId: req.user.id },
      select: { conversationId: true, lastReadAt: true }
    })
    let total = 0
    await Promise.all(parts.map(async p => {
      const c = await prisma.chatMessage.count({
        where: {
          conversationId: p.conversationId,
          createdAt: { gt: p.lastReadAt },
          deletedAt: null,
          type: 'TEXT',
          senderId: { not: req.user.id }
        }
      })
      total += c
    }))
    res.json({ unread: total })
  } catch (err) {
    console.error('Error unread chat:', err.message)
    res.status(500).json({ error: 'Error' })
  }
})

// GET /api/chat/conversations — mis conversaciones con último mensaje y no leídos
router.get('/conversations', async (req, res) => {
  try {
    const parts = await prisma.conversationParticipant.findMany({
      where: { userId: req.user.id, hidden: false },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { select: { id: true, name: true, position: true, isActive: true } } }
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { id: true, name: true } } }
            }
          }
        }
      }
    })

    const list = await Promise.all(parts.map(async p => {
      const conv = p.conversation
      const unread = await prisma.chatMessage.count({
        where: {
          conversationId: conv.id,
          createdAt: { gt: p.lastReadAt },
          deletedAt: null,
          type: 'TEXT',
          senderId: { not: req.user.id }
        }
      })
      // Nombre a mostrar: para directos, el nombre del otro participante
      const others = conv.participants.filter(x => x.userId !== req.user.id)
      const displayName = conv.type === 'GROUP'
        ? (conv.name || 'Grupo')
        : (others[0]?.user.name || 'Usuario eliminado')
      const subtitle = conv.type === 'GROUP'
        ? `${conv.participants.length} integrantes`
        : (others[0]?.user.position || '')

      return {
        id: conv.id,
        type: conv.type,
        name: displayName,
        subtitle,
        participants: conv.participants.map(x => ({
          userId: x.userId, name: x.user.name, position: x.user.position,
          isAdmin: x.isAdmin, isActive: x.user.isActive
        })),
        myIsAdmin: p.isAdmin,
        lastMessage: conv.messages[0] ? {
          content: conv.messages[0].type === 'SYSTEM' ? conv.messages[0].content : conv.messages[0].content.slice(0, 80),
          senderName: conv.messages[0].sender?.name || null,
          isMine: conv.messages[0].senderId === req.user.id,
          isSystem: conv.messages[0].type === 'SYSTEM',
          createdAt: conv.messages[0].createdAt
        } : null,
        unread,
        updatedAt: conv.updatedAt
      }
    }))

    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    res.json(list)
  } catch (err) {
    console.error('Error conversaciones:', err.message)
    res.status(500).json({ error: 'Error al obtener conversaciones' })
  }
})

// POST /api/chat/conversations — crear conversación { type, name?, participantIds }
router.post('/conversations', async (req, res) => {
  try {
    const { type, name, participantIds } = req.body
    const ids = [...new Set((participantIds || []).filter(id => id && id !== req.user.id))]

    if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un participante' })

    // Validar que existan y estén activos
    const valid = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true } })
    if (valid.length !== ids.length) return res.status(400).json({ error: 'Algún participante no es válido' })

    if (type === 'DIRECT') {
      const otherId = ids[0]
      // Deduplicar: si ya existe conversación directa con esa persona, devolverla
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          AND: [
            { participants: { some: { userId: req.user.id } } },
            { participants: { some: { userId: otherId } } }
          ]
        }
      })
      if (existing) {
        await prisma.conversationParticipant.updateMany({
          where: { conversationId: existing.id, userId: req.user.id, hidden: true },
          data: { hidden: false }
        })
        return res.json({ id: existing.id, existed: true })
      }

      const conv = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          createdById: req.user.id,
          participants: { create: [{ userId: req.user.id }, { userId: otherId }] }
        }
      })
      return res.status(201).json({ id: conv.id })
    }

    if (type === 'GROUP') {
      const groupName = (name || '').trim()
      if (!groupName) return res.status(400).json({ error: 'El grupo necesita un nombre' })
      if (groupName.length > 60) return res.status(400).json({ error: 'Nombre de grupo muy largo (máx 60)' })

      const conv = await prisma.conversation.create({
        data: {
          type: 'GROUP',
          name: groupName,
          createdById: req.user.id,
          participants: {
            create: [
              { userId: req.user.id, isAdmin: true },
              ...ids.map(id => ({ userId: id }))
            ]
          }
        }
      })
      await systemMessage(conv.id, `${req.user.email.split('@')[0]} creó el grupo`)
      await logActivity({
        userId: req.user.id, action: 'chat_group_created',
        detail: `creó el grupo de chat «${groupName}» con ${ids.length + 1} integrantes`
      })
      return res.status(201).json({ id: conv.id })
    }

    res.status(400).json({ error: 'Tipo de conversación inválido' })
  } catch (err) {
    console.error('Error crear conversación:', err.message)
    res.status(500).json({ error: 'Error al crear la conversación' })
  }
})

// GET /api/chat/conversations/:id/messages — últimos mensajes (marca como leído)
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const part = await myPart(req.params.id, req.user.id)
    if (!part) return res.status(403).json({ error: 'No participas en esta conversación' })

    const messages = await prisma.chatMessage.findMany({
      where: {
        conversationId: req.params.id,
        ...(part.clearedAt && { createdAt: { gt: part.clearedAt } })
      },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 80
    })

    // Marcar como leído
    await prisma.conversationParticipant.update({
      where: { id: part.id },
      data: { lastReadAt: new Date() }
    })

    // Ocultar contenido de mensajes eliminados
    const safe = messages.reverse().map(m => ({
      id: m.id,
      content: m.deletedAt ? null : m.content,
      deleted: !!m.deletedAt,
      type: m.type,
      createdAt: m.createdAt,
      sender: m.sender ? { id: m.sender.id, name: m.sender.name } : null,
      mine: m.senderId === req.user.id
    }))
    res.json(safe)
  } catch (err) {
    console.error('Error mensajes:', err.message)
    res.status(500).json({ error: 'Error al obtener mensajes' })
  }
})

// POST /api/chat/conversations/:id/messages — enviar mensaje
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const part = await myPart(req.params.id, req.user.id)
    if (!part) return res.status(403).json({ error: 'No participas en esta conversación' })

    const content = (req.body.content || '').trim()
    if (!content) return res.status(400).json({ error: 'Mensaje vacío' })
    if (content.length > MAX_MSG) return res.status(400).json({ error: `Mensaje muy largo (máx ${MAX_MSG} caracteres)` })

    const msg = await prisma.chatMessage.create({
      data: { conversationId: req.params.id, senderId: req.user.id, content },
      include: { sender: { select: { id: true, name: true } } }
    })
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() }
    })
    // Si alguien tenía el chat "eliminado" de su lista, reaparece con el mensaje nuevo
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: req.params.id, hidden: true },
      data: { hidden: false }
    })
    // El remitente ya leyó hasta su propio mensaje
    await prisma.conversationParticipant.update({
      where: { id: part.id },
      data: { lastReadAt: new Date() }
    })

    res.status(201).json({
      id: msg.id, content: msg.content, deleted: false, type: msg.type,
      createdAt: msg.createdAt, sender: { id: msg.sender.id, name: msg.sender.name }, mine: true
    })
  } catch (err) {
    console.error('Error enviar mensaje:', err.message)
    res.status(500).json({ error: 'Error al enviar el mensaje' })
  }
})

// DELETE /api/chat/messages/:id — eliminar mi propio mensaje (soft, queda rastro)
router.delete('/messages/:id', async (req, res) => {
  try {
    const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } })
    if (!msg || msg.senderId !== req.user.id)
      return res.status(403).json({ error: 'Solo puedes eliminar tus propios mensajes' })
    await prisma.chatMessage.update({ where: { id: msg.id }, data: { deletedAt: new Date() } })
    res.json({ message: 'Mensaje eliminado' })
  } catch (err) {
    console.error('Error eliminar mensaje:', err.message)
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

// PATCH /api/chat/conversations/:id — renombrar grupo (solo admin del grupo)
router.patch('/conversations/:id', async (req, res) => {
  try {
    const part = await myPart(req.params.id, req.user.id)
    if (!part) return res.status(403).json({ error: 'No participas en esta conversación' })
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } })
    if (conv.type !== 'GROUP') return res.status(400).json({ error: 'Solo los grupos se pueden renombrar' })
    if (!part.isAdmin) return res.status(403).json({ error: 'Solo el administrador del grupo puede renombrarlo' })

    const name = (req.body.name || '').trim()
    if (!name || name.length > 60) return res.status(400).json({ error: 'Nombre inválido' })

    const old = conv.name
    await prisma.conversation.update({ where: { id: conv.id }, data: { name } })
    const meName = (await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } })).name
    await systemMessage(conv.id, `${meName} renombró el grupo de «${old}» a «${name}»`)
    res.json({ message: 'Grupo renombrado' })
  } catch (err) {
    console.error('Error renombrar:', err.message)
    res.status(500).json({ error: 'Error al renombrar' })
  }
})

// POST /api/chat/conversations/:id/participants — agregar integrantes (solo admin)
router.post('/conversations/:id/participants', async (req, res) => {
  try {
    const part = await myPart(req.params.id, req.user.id)
    if (!part) return res.status(403).json({ error: 'No participas en esta conversación' })
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } })
    if (conv.type !== 'GROUP') return res.status(400).json({ error: 'Solo aplicable a grupos' })
    if (!part.isAdmin) return res.status(403).json({ error: 'Solo el administrador puede agregar integrantes' })

    const ids = [...new Set((req.body.participantIds || []).filter(Boolean))]
    if (!ids.length) return res.status(400).json({ error: 'Selecciona a quién agregar' })

    const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true } })
    let added = []
    for (const u of users) {
      const exists = await myPart(conv.id, u.id)
      if (!exists) {
        await prisma.conversationParticipant.create({ data: { conversationId: conv.id, userId: u.id } })
        added.push(u.name)
      }
    }
    if (added.length) {
      const meName = (await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } })).name
      await systemMessage(conv.id, `${meName} agregó a ${added.join(', ')}`)
    }
    res.json({ message: `${added.length} integrante(s) agregado(s)` })
  } catch (err) {
    console.error('Error agregar integrantes:', err.message)
    res.status(500).json({ error: 'Error al agregar integrantes' })
  }
})

// DELETE /api/chat/conversations/:id/participants/:userId — quitar integrante o salir
router.delete('/conversations/:id/participants/:userId', async (req, res) => {
  try {
    const part = await myPart(req.params.id, req.user.id)
    if (!part) return res.status(403).json({ error: 'No participas en esta conversación' })
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } })
    if (conv.type !== 'GROUP') return res.status(400).json({ error: 'Solo aplicable a grupos' })

    const leaving = req.params.userId === req.user.id
    if (!leaving && !part.isAdmin)
      return res.status(403).json({ error: 'Solo el administrador puede quitar integrantes' })

    const target = await myPart(conv.id, req.params.userId)
    if (!target) return res.status(404).json({ error: 'Ese usuario no está en el grupo' })

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { name: true } })
    await prisma.conversationParticipant.delete({ where: { id: target.id } })

    const remaining = await prisma.conversationParticipant.findMany({ where: { conversationId: conv.id } })

    // Si el grupo queda vacío, se elimina (con sus mensajes)
    if (remaining.length === 0) {
      await prisma.conversation.delete({ where: { id: conv.id } })
      return res.json({ message: 'Saliste del grupo y quedó vacío: se eliminó' })
    }

    // Si salió el único admin, promover al integrante más antiguo
    if (target.isAdmin && !remaining.some(r => r.isAdmin)) {
      const oldest = remaining.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0]
      await prisma.conversationParticipant.update({ where: { id: oldest.id }, data: { isAdmin: true } })
    }

    const meName = (await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } })).name
    await systemMessage(conv.id, leaving
      ? `${targetUser.name} salió del grupo`
      : `${meName} quitó a ${targetUser.name} del grupo`)

    res.json({ message: leaving ? 'Saliste del grupo' : 'Integrante removido' })
  } catch (err) {
    console.error('Error quitar integrante:', err.message)
    res.status(500).json({ error: 'Error al procesar' })
  }
})

// DELETE /api/chat/conversations/:id — eliminar chat
// DIRECT: lo quita de TU lista y corta TU historial (la otra persona conserva el suyo)
// GROUP: lo elimina PARA TODOS (solo admin del grupo o super admin), queda en auditoría
router.delete('/conversations/:id', async (req, res) => {
  try {
    const part = await myPart(req.params.id, req.user.id)
    if (!part) return res.status(403).json({ error: 'No participas en esta conversación' })
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } })
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })

    if (conv.type === 'DIRECT') {
      await prisma.conversationParticipant.update({
        where: { id: part.id },
        data: { hidden: true, clearedAt: new Date(), lastReadAt: new Date() }
      })
      return res.json({ message: 'Chat eliminado de tu lista' })
    }

    // GROUP: destructivo para todos
    if (!part.isAdmin && req.user.role !== 'SUPER_ADMIN')
      return res.status(403).json({ error: 'Solo el administrador puede eliminar el grupo. Puedes salirte desde el menú.' })

    const count = await prisma.conversationParticipant.count({ where: { conversationId: conv.id } })
    await prisma.conversation.delete({ where: { id: conv.id } })
    await logActivity({
      userId: req.user.id, action: 'chat_group_deleted',
      detail: `eliminó el grupo de chat «${conv.name}» (${count} integrantes)`
    })
    res.json({ message: 'Grupo eliminado para todos los integrantes' })
  } catch (err) {
    console.error('Error eliminar conversación:', err.message)
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

export default router
