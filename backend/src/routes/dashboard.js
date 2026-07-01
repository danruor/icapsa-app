import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'
import { notify } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// GET /api/dashboard
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id

    const [
      totalProjects,
      activeProjects,
      totalTasks,
      myTasks,
      tasksByStatus,
      recentTasks,
      upcomingDeadlines
    ] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null, members: { some: { userId } } } }),
      prisma.project.count({ where: { deletedAt: null, members: { some: { userId } }, status: 'ACTIVE' } }),
      prisma.task.count({ where: { project: { deletedAt: null, members: { some: { userId } } } } }),
      prisma.task.count({ where: { assigneeId: userId, status: { not: 'DONE' } } }),
      prisma.task.groupBy({
        by: ['status'],
        where: { project: { deletedAt: null, members: { some: { userId } } } },
        _count: true
      }),
      prisma.task.findMany({
        where: { project: { deletedAt: null, members: { some: { userId } } } },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.task.findMany({
        where: {
          project: { members: { some: { userId } } },
          dueDate: { gte: new Date() },
          status: { not: 'DONE' }
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5
      })
    ])

    // Verificar tareas que vencen en 24h y notificar (una vez)
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const dueTasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { not: 'DONE' },
        dueDate: { gte: new Date(), lte: soon }
      },
      include: { project: { select: { name: true, id: true } } }
    })
    for (const t of dueTasks) {
      const existing = await prisma.notification.findFirst({
        where: { userId, type: 'task_due', message: { contains: t.title } }
      })
      if (!existing) {
        await notify({
          userId, type: 'task_due',
          title: 'Tarea por vencer',
          message: `"${t.title}" vence pronto en ${t.project.name}`,
          link: `/projects/${t.project.id}`
        })
      }
    }

    res.json({
      stats: { totalProjects, activeProjects, totalTasks, myTasks },
      tasksByStatus,
      recentTasks,
      upcomingDeadlines
    })
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener dashboard' })
  }
})

export default router
