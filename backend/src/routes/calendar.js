import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { parseDate } from '../lib/validate.js'
import { authenticate, requireTab } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireTab('calendar'))

// GET /api/calendar?projectId=xxx&start=ISO&end=ISO
// Devuelve eventos del calendario: tareas con fecha + inicio/fin de proyectos
router.get('/', async (req, res) => {
  try {
    const { projectId, start, end } = req.query
    const userId = req.user.id

    const projectFilter = { members: { some: { userId } } }
    if (projectId) projectFilter.id = projectId

    // Proyectos del usuario (con fechas y color)
    const projects = await prisma.project.findMany({
      where: { ...projectFilter, deletedAt: null },
      select: { id: true, name: true, color: true, startDate: true, endDate: true }
    })
    const projectIds = projects.map(p => p.id)

    // Tareas con fecha de vencimiento
    const tasks = await prisma.task.findMany({
      where: {
        project: { deletedAt: null },
        projectId: { in: projectIds },
        dueDate: { not: null },
        ...(parseDate(start) && parseDate(end) && { dueDate: { gte: parseDate(start), lte: parseDate(end) } })
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } }
      }
    })

    // Visitas de soporte programadas: administradores ven todas; el resto, las suyas
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
    const visits = await prisma.ticketVisit.findMany({
      where: {
        status: { not: 'CANCELLED' },
        ...(isAdmin ? {} : { OR: [{ technicianId: userId }, { ticket: { assigneeId: userId } }] }),
        ...(parseDate(start) && parseDate(end) && { scheduledAt: { gte: parseDate(start), lte: parseDate(end) } })
      },
      include: { technician: { select: { name: true } }, ticket: { select: { id: true, folio: true, title: true, company: true, location: true } } }
    })

    // Construir eventos unificados
    const events = []

    visits.forEach(v => {
      events.push({
        id: `visit-${v.id}`,
        type: 'visit',
        title: `Visita ${v.ticket.folio}${v.ticket.company ? ` · ${v.ticket.company}` : ''}`,
        date: v.scheduledAt,
        color: '#8B5CF6',
        projectId: null,
        projectName: v.ticket.title,
        status: v.status,
        assignee: v.technician?.name,
        ticketId: v.ticket.id,
        location: v.ticket.location
      })
    })

    // Eventos de tareas
    tasks.forEach(t => {
      events.push({
        id: `task-${t.id}`,
        type: 'task',
        title: t.title,
        date: t.dueDate,
        color: t.project.color,
        projectId: t.project.id,
        projectName: t.project.name,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee?.name
      })
    })

    // Eventos de inicio/fin de proyecto
    projects.forEach(p => {
      if (p.startDate) {
        events.push({
          id: `project-start-${p.id}`,
          type: 'project-start',
          title: `Inicio: ${p.name}`,
          date: p.startDate,
          color: p.color,
          projectId: p.id,
          projectName: p.name
        })
      }
      if (p.endDate) {
        events.push({
          id: `project-end-${p.id}`,
          type: 'project-end',
          title: `Entrega: ${p.name}`,
          date: p.endDate,
          color: p.color,
          projectId: p.id,
          projectName: p.name
        })
      }
    })

    res.json({ events, projects })
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener calendario' })
  }
})

export default router
