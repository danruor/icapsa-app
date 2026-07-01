import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireTab } from '../middleware/auth.js'
import { notify, logActivity } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('projects'))

// GET /api/tasks?projectId=xxx
router.get('/', async (req, res) => {
  try {
    const { projectId, status, assigneeId } = req.query
    const tasks = await prisma.task.findMany({
      where: {
        ...(projectId && { projectId }),
        ...(status && { status }),
        ...(assigneeId && { assigneeId })
      },
      include: {
        assignee: { select: { id: true, name: true } },
        creator:  { select: { id: true, name: true } },
        _count: { select: { comments: true, files: true } }
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
    })
    res.json(tasks)
  } catch {
    res.status(500).json({ error: 'Error al obtener tareas' })
  }
})

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { title, description, projectId, assigneeId, priority, dueDate } = req.body
    if (!title || !projectId)
      return res.status(400).json({ error: 'Título y proyecto son requeridos' })

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        projectId,
        assigneeId: assigneeId || null,
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        creatorId: req.user.id
      },
      include: {
        assignee: { select: { id: true, name: true } },
        creator:  { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } }
      }
    })

    // Notificar al asignado
    if (assigneeId && assigneeId !== req.user.id) {
      await notify({
        userId: assigneeId,
        type: 'task_assigned',
        title: 'Nueva tarea asignada',
        message: `Se te asignó la tarea "${title}" en ${task.project.name}`,
        link: `/projects/${projectId}`
      })
    }
    await logActivity({
      userId: req.user.id, projectId,
      action: 'created_task',
      detail: `creó la tarea "${title}"`
    })

    res.status(201).json(task)
  } catch (err) {
    console.error('Error al crear tarea:', err.message)
    res.status(500).json({ error: 'Error al crear tarea' })
  }
})

// PATCH /api/tasks/:id
router.patch('/:id', async (req, res) => {
  try {
    const { title, description, status, priority, assigneeId, dueDate } = req.body
    const before = await prisma.task.findUnique({ where: { id: req.params.id }, select: { assigneeId: true, status: true, projectId: true, title: true } })

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null })
      },
      include: {
        assignee: { select: { id: true, name: true } },
        creator:  { select: { id: true, name: true } },
        project:  { select: { id: true, name: true } }
      }
    })

    // Notificar si se reasignó a alguien nuevo
    if (assigneeId && assigneeId !== before?.assigneeId && assigneeId !== req.user.id) {
      await notify({
        userId: assigneeId,
        type: 'task_assigned',
        title: 'Tarea asignada',
        message: `Se te asignó "${task.title}" en ${task.project.name}`,
        link: `/projects/${task.projectId}`
      })
    }
    // Registrar cambio de estado
    if (status && status !== before?.status) {
      const statusNames = { TODO: 'Por hacer', IN_PROGRESS: 'En progreso', REVIEW: 'En revisión', DONE: 'Completado' }
      await logActivity({
        userId: req.user.id, projectId: task.projectId,
        action: 'updated_status',
        detail: `movió "${task.title}" a ${statusNames[status]}`
      })
    }

    res.json(task)
  } catch (err) {
    console.error('Error al actualizar tarea:', err.message)
    res.status(500).json({ error: 'Error al actualizar tarea' })
  }
})

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } })
    res.json({ message: 'Tarea eliminada' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar tarea' })
  }
})

// GET /api/tasks/:id/comments - leer comentarios de una tarea
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { taskId: req.params.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' }
    })
    res.json(comments)
  } catch (err) {
    console.error('Error al leer comentarios:', err.message)
    res.status(500).json({ error: 'Error al obtener comentarios' })
  }
})

// POST /api/tasks/:id/comments - agregar comentario
router.post('/:id/comments', async (req, res) => {
  try {
    const { content } = req.body
    if (!content || !content.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' })

    const comment = await prisma.comment.create({
      data: { content: content.trim(), taskId: req.params.id, userId: req.user.id },
      include: { user: { select: { id: true, name: true } } }
    })

    // Notificar al responsable y creador de la tarea (si no son quien comenta)
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      select: { title: true, projectId: true, assigneeId: true, creatorId: true }
    })
    if (task) {
      const toNotify = new Set([task.assigneeId, task.creatorId].filter(uid => uid && uid !== req.user.id))
      for (const uid of toNotify) {
        await notify({
          userId: uid,
          type: 'comment',
          title: 'Nuevo comentario',
          message: `${comment.user.name} comentó en "${task.title}"`,
          link: `/projects/${task.projectId}`
        })
      }
    }

    res.status(201).json(comment)
  } catch (err) {
    console.error('Error al agregar comentario:', err.message)
    res.status(500).json({ error: 'Error al agregar comentario' })
  }
})

export default router
