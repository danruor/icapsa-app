import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
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
      where: projectFilter,
      select: { id: true, name: true, color: true, startDate: true, endDate: true }
    })
    const projectIds = projects.map(p => p.id)

    // Tareas con fecha de vencimiento
    const tasks = await prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        dueDate: { not: null },
        ...(start && end && { dueDate: { gte: new Date(start), lte: new Date(end) } })
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } }
      }
    })

    // Construir eventos unificados
    const events = []

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
