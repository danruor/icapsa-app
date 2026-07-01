import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

// GET /api/search?q=texto — busca en todo el sistema respetando permisos de pestaña
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (q.length < 2) return res.json({ projects: [], tasks: [], inventory: [], quotes: [], deliveries: [] })

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN'
    const tabs = isAdmin ? ['projects', 'inventory', 'calendar'] : (req.user.visibleTabs || '').split(',').map(t => t.trim())

    const contains = { contains: q, mode: 'insensitive' }
    const results = { projects: [], tasks: [], inventory: [], quotes: [], deliveries: [] }

    const jobs = []

    if (tabs.includes('projects')) {
      jobs.push(
        prisma.project.findMany({
          where: {
            deletedAt: null,
            OR: [{ name: contains }, { client: contains }],
            ...(isAdmin ? {} : { members: { some: { userId: req.user.id } } })
          },
          select: { id: true, name: true, client: true, color: true },
          take: 5
        }).then(r => { results.projects = r }),
        prisma.task.findMany({
          where: {
            title: contains,
            project: { deletedAt: null, ...(isAdmin ? {} : { members: { some: { userId: req.user.id } } }) }
          },
          select: { id: true, title: true, status: true, projectId: true, project: { select: { name: true } } },
          take: 5
        }).then(r => { results.tasks = r })
      )
    }

    if (tabs.includes('inventory')) {
      jobs.push(
        prisma.inventoryItem.findMany({
          where: { OR: [{ name: contains }, { sku: contains }, { category: contains }] },
          select: { id: true, name: true, quantity: true, unit: true, location: true },
          take: 5
        }).then(r => { results.inventory = r }),
        prisma.delivery.findMany({
          where: { OR: [{ folio: contains }, { recipient: contains }] },
          select: { id: true, folio: true, recipient: true, date: true },
          take: 5
        }).then(r => { results.deliveries = r })
      )
    }

    if (isSuperAdmin) {
      jobs.push(
        prisma.quote.findMany({
          where: { deletedAt: null, OR: [{ folio: contains }, { clientName: contains }] },
          select: { id: true, folio: true, clientName: true, paymentStatus: true },
          take: 5
        }).then(r => { results.quotes = r })
      )
    }

    await Promise.all(jobs)
    res.json(results)
  } catch (err) {
    console.error('Error búsqueda:', err.message)
    res.status(500).json({ error: 'Error en la búsqueda' })
  }
})

export default router
