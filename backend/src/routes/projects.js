import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireTab } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('projects'))

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
    const projects = await prisma.project.findMany({
      where: isAdmin ? { deletedAt: null } : { deletedAt: null, members: { some: { userId: req.user.id } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        tasks: { select: { status: true } },
        quotes: { select: { id: true, paidAmount: true, taxRate: true, items: { select: { unitPrice: true, quantity: true, discount: true } } } },
        _count: { select: { tasks: true, inventory: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Enriquecer con métricas ejecutivas
    const enriched = projects.map(p => {
      const totalTasks = p.tasks.length
      const doneTasks = p.tasks.filter(t => t.status === 'DONE').length
      const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
      // Total presupuestado de cotizaciones vinculadas
      let quotedTotal = 0
      p.quotes.forEach(q => {
        const sub = q.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
        quotedTotal += sub * (1 + q.taxRate / 100)
      })
      const { tasks, quotes, ...rest } = p
      return { ...rest, progress, totalTasks, doneTasks, quotedTotal, quotesCount: p.quotes.length }
    })

    res.json(enriched)
  } catch {
    res.status(500).json({ error: 'Error al obtener proyectos' })
  }
})

// POST /api/projects
router.post('/', async (req, res) => {
  try {
    const { name, description, startDate, endDate, color, address, latitude, longitude, budget, client } = req.body
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' })

    const project = await prisma.project.create({
      data: {
        name, description, address, client,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        latitude: latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
        longitude: longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
        budget: budget !== undefined && budget !== null && budget !== '' ? parseFloat(budget) : null,
        ...(color && { color }),
        members: { create: { userId: req.user.id, role: 'ADMIN' } }
      },
      include: { members: true }
    })
    res.status(201).json(project)
  } catch (err) {
    console.error('Error crear proyecto:', err.message)
    res.status(500).json({ error: 'Error al crear proyecto' })
  }
})

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
    const project = await prisma.project.findFirst({
      where: isAdmin
        ? { id: req.params.id, deletedAt: null }
        : { id: req.params.id, deletedAt: null, members: { some: { userId: req.user.id } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        tasks: { include: { assignee: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } }, _count: { select: { files: true } } }, orderBy: { createdAt: 'desc' } },
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
    const { name, description, status, startDate, endDate, color, address, latitude, longitude, budget, client } = req.body
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(address !== undefined && { address }),
        ...(client !== undefined && { client }),
        ...(latitude !== undefined && { latitude: latitude !== null ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude !== null ? parseFloat(longitude) : null }),
        ...(budget !== undefined && { budget: budget !== null && budget !== '' ? parseFloat(budget) : null }),
        ...(color && { color }),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      }
    })
    res.json(project)
  } catch (err) {
    console.error('Error actualizar proyecto:', err.message)
    res.status(500).json({ error: 'Error al actualizar proyecto' })
  }
})

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() }
    })
    await logActivity({
      userId: req.user.id, action: 'project_trashed',
      detail: `envió el proyecto "${project.name}" a la papelera`
    })
    res.json({ message: 'Proyecto enviado a la papelera (recuperable por 30 días)' })
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

// GET /api/projects/:id/activity - historial de actividad del proyecto
router.get('/:id/activity', async (req, res) => {
  try {
    const activities = await prisma.activity.findMany({
      where: { projectId: req.params.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    res.json(activities)
  } catch {
    res.status(500).json({ error: 'Error al obtener actividad' })
  }
})

// GET /api/projects/:id/quotes - presupuestos vinculados al proyecto
router.get('/:id/quotes', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { projectId: req.params.id, deletedAt: null },
      include: { items: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    const withTotals = quotes.map(q => {
      const subtotal = q.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
      const tax = subtotal * (q.taxRate / 100)
      const total = subtotal + tax
      return { ...q, subtotal, tax, total, balance: Math.max(0, total - q.paidAmount) }
    })
    res.json(withTotals)
  } catch (err) {
    console.error('Error quotes de proyecto:', err.message)
    res.status(500).json({ error: 'Error al obtener presupuestos' })
  }
})

export default router
