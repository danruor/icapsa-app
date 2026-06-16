import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { tasks: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(projects)
  } catch {
    res.status(500).json({ error: 'Error al obtener proyectos' })
  }
})

// POST /api/projects
router.post('/', async (req, res) => {
  try {
    const { name, description, startDate, endDate, color } = req.body
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' })

    const project = await prisma.project.create({
      data: {
        name, description, startDate, endDate,
        ...(color && { color }),
        members: { create: { userId: req.user.id, role: 'ADMIN' } }
      },
      include: { members: true }
    })
    res.status(201).json(project)
  } catch {
    res.status(500).json({ error: 'Error al crear proyecto' })
  }
})

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        members: { some: { userId: req.user.id } }
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        tasks: { include: { assignee: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        files: { include: { uploadedBy: { select: { id: true, name: true } } } },
        inventory: { orderBy: { name: 'asc' } }
      }
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    res.json(project)
  } catch {
    res.status(500).json({ error: 'Error al obtener proyecto' })
  }
})

// PATCH /api/projects/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, status, startDate, endDate, color } = req.body
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name, description, status, startDate, endDate, ...(color && { color }) }
    })
    res.json(project)
  } catch {
    res.status(500).json({ error: 'Error al actualizar proyecto' })
  }
})

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } })
    res.json({ message: 'Proyecto eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar proyecto' })
  }
})

export default router
