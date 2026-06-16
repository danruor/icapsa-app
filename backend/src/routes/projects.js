import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
    const projects = await prisma.project.findMany({
      where: isAdmin ? {} : { members: { some: { userId: req.user.id } } },
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
        name, description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        ...(color && { color }),
        members: { create: { userId: req.user.id, role: 'ADMIN' } }
      },
      include: { members: true }
    })
    res.status(201).json(project)
  } catch (err) {
    console.error('Error crear proyecto:', err.message)
    res.status(500).json({ error: 'Error al crear proyecto: ' + err.message })
  }
})

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
    const project = await prisma.project.findFirst({
      where: isAdmin
        ? { id: req.params.id }
        : { id: req.params.id, members: { some: { userId: req.user.id } } },
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
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(color && { color }),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      }
    })
    res.json(project)
  } catch (err) {
    console.error('Error actualizar proyecto:', err.message)
    res.status(500).json({ error: 'Error al actualizar proyecto: ' + err.message })
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


// GET /api/projects/:id/members - miembros del proyecto
router.get('/:id/members', async (req, res) => {
  try {
    const members = await prisma.projectMember.findMany({
      where: { projectId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, role: true, position: true } } }
    })
    res.json(members)
  } catch {
    res.status(500).json({ error: 'Error al obtener miembros' })
  }
})

// POST /api/projects/:id/members - agregar miembro
router.post('/:id/members', async (req, res) => {
  try {
    const { userId, role } = req.body
    const member = await prisma.projectMember.create({
      data: { projectId: req.params.id, userId, role: role || 'MEMBER' },
      include: { user: { select: { id: true, name: true, email: true } } }
    })
    res.status(201).json(member)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El usuario ya es miembro' })
    res.status(500).json({ error: 'Error al agregar miembro' })
  }
})

// DELETE /api/projects/:id/members/:userId - quitar miembro
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    await prisma.projectMember.deleteMany({
      where: { projectId: req.params.id, userId: req.params.userId }
    })
    res.json({ message: 'Miembro removido' })
  } catch {
    res.status(500).json({ error: 'Error al remover miembro' })
  }
})

export default router
