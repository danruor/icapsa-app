import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

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
      data: { title, description, projectId, assigneeId, priority, dueDate, creatorId: req.user.id },
      include: {
        assignee: { select: { id: true, name: true } },
        creator:  { select: { id: true, name: true } }
      }
    })
    res.status(201).json(task)
  } catch {
    res.status(500).json({ error: 'Error al crear tarea' })
  }
})

// PATCH /api/tasks/:id
router.patch('/:id', async (req, res) => {
  try {
    const { title, description, status, priority, assigneeId, dueDate } = req.body
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { title, description, status, priority, assigneeId, dueDate },
      include: {
        assignee: { select: { id: true, name: true } },
        creator:  { select: { id: true, name: true } }
      }
    })
    res.json(task)
  } catch {
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

// POST /api/tasks/:id/comments
router.post('/:id/comments', async (req, res) => {
  try {
    const { content } = req.body
    const comment = await prisma.comment.create({
      data: { content, taskId: req.params.id, userId: req.user.id },
      include: { user: { select: { id: true, name: true } } }
    })
    res.status(201).json(comment)
  } catch {
    res.status(500).json({ error: 'Error al agregar comentario' })
  }
})

export default router
