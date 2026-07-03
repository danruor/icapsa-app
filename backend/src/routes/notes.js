import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

const noteInclude = {
  projects: { select: { id: true, name: true, color: true } },
  quotes: { select: { id: true, folio: true, clientName: true } }
}

const isAdminRole = (role) => ['SUPER_ADMIN', 'ADMIN'].includes(role)

// Devuelve solo los IDs de proyectos que el usuario puede referenciar
async function allowedProjectIds(user, ids) {
  if (!ids?.length) return []
  const where = { id: { in: ids }, deletedAt: null }
  if (!isAdminRole(user.role)) where.members = { some: { userId: user.id } }
  const found = await prisma.project.findMany({ where, select: { id: true } })
  return found.map(p => p.id)
}

// Las cotizaciones son de super admin: los demás no pueden vincularlas
async function allowedQuoteIds(user, ids) {
  if (!ids?.length || user.role !== 'SUPER_ADMIN') return []
  const found = await prisma.quote.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true }
  })
  return found.map(q => q.id)
}

// GET /api/notes - mis notas (privadas)
router.get('/', async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.user.id },
      include: noteInclude,
      orderBy: { updatedAt: 'desc' }
    })
    res.json(notes)
  } catch (err) {
    console.error('Error listar notas:', err.message)
    res.status(500).json({ error: 'Error al obtener las notas' })
  }
})

// GET /api/notes/links - proyectos y cotizaciones que puedo vincular
router.get('/links', async (req, res) => {
  try {
    const projWhere = { deletedAt: null }
    if (!isAdminRole(req.user.role)) projWhere.members = { some: { userId: req.user.id } }
    const projects = await prisma.project.findMany({
      where: projWhere,
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' }
    })
    let quotes = []
    if (req.user.role === 'SUPER_ADMIN') {
      quotes = await prisma.quote.findMany({
        where: { deletedAt: null },
        select: { id: true, folio: true, clientName: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    }
    res.json({ projects, quotes })
  } catch (err) {
    console.error('Error links de notas:', err.message)
    res.status(500).json({ error: 'Error al obtener vínculos' })
  }
})

// POST /api/notes - crear nota
router.post('/', async (req, res) => {
  try {
    const { title, content, drawing, color, projectIds, quoteIds } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' })
    if (drawing && drawing.length > 1_500_000)
      return res.status(400).json({ error: 'El dibujo es demasiado grande' })

    const pids = await allowedProjectIds(req.user, projectIds)
    const qids = await allowedQuoteIds(req.user, quoteIds)

    const note = await prisma.note.create({
      data: {
        title: title.trim().slice(0, 200),
        content: content?.slice(0, 20000) || null,
        drawing: drawing || null,
        color: color || '#FDE68A',
        userId: req.user.id,
        projects: { connect: pids.map(id => ({ id })) },
        quotes: { connect: qids.map(id => ({ id })) }
      },
      include: noteInclude
    })
    res.status(201).json(note)
  } catch (err) {
    console.error('Error crear nota:', err.message)
    res.status(500).json({ error: 'Error al crear la nota' })
  }
})

// PATCH /api/notes/:id - editar (solo el dueño)
router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    })
    if (!existing) return res.status(404).json({ error: 'Nota no encontrada' })

    const { title, content, drawing, color, projectIds, quoteIds } = req.body
    if (drawing && drawing.length > 1_500_000)
      return res.status(400).json({ error: 'El dibujo es demasiado grande' })

    const data = {}
    if (title !== undefined) {
      if (!title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' })
      data.title = title.trim().slice(0, 200)
    }
    if (content !== undefined) data.content = content?.slice(0, 20000) || null
    if (drawing !== undefined) data.drawing = drawing || null
    if (color !== undefined) data.color = color || '#FDE68A'
    if (projectIds !== undefined) {
      const pids = await allowedProjectIds(req.user, projectIds)
      data.projects = { set: pids.map(id => ({ id })) }
    }
    if (quoteIds !== undefined) {
      const qids = await allowedQuoteIds(req.user, quoteIds)
      data.quotes = { set: qids.map(id => ({ id })) }
    }

    const note = await prisma.note.update({
      where: { id: existing.id },
      data,
      include: noteInclude
    })
    res.json(note)
  } catch (err) {
    console.error('Error editar nota:', err.message)
    res.status(500).json({ error: 'Error al actualizar la nota' })
  }
})

// DELETE /api/notes/:id - eliminar (solo el dueño)
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    })
    if (!existing) return res.status(404).json({ error: 'Nota no encontrada' })
    await prisma.note.delete({ where: { id: existing.id } })
    res.json({ message: 'Nota eliminada' })
  } catch (err) {
    console.error('Error eliminar nota:', err.message)
    res.status(500).json({ error: 'Error al eliminar la nota' })
  }
})

export default router
