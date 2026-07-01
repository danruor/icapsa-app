import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { logActivity } from '../lib/events.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)
router.use(requireAdmin)

// GET /api/admin/users - lista todos los usuarios
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, isActive: true,
        phone: true, position: true, visibleTabs: true, createdAt: true,
        projects: {
          include: { project: { select: { id: true, name: true, color: true } } }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
    res.json(users)
  } catch (err) {
    console.error('Error listar usuarios:', err.message)
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// POST /api/admin/users - crear usuario
router.post('/users', async (req, res) => {
  try {
    let { email, password, name, role, phone, position, projectIds, visibleTabs } = req.body
    if (email) email = email.trim().toLowerCase()
    if (password && password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    if (!email || !password || !name)
      return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' })

    // Solo SUPER_ADMIN puede crear otros SUPER_ADMIN o ADMIN
    if (['SUPER_ADMIN', 'ADMIN'].includes(role) && req.user.role !== 'SUPER_ADMIN')
      return res.status(403).json({ error: 'Solo un super administrador puede crear administradores' })

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return res.status(409).json({ error: 'El correo ya está registrado' })

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email, password: hashed, name,
        role: role || 'MEMBER', phone, position,
        ...(Array.isArray(visibleTabs) && { visibleTabs: visibleTabs.join(',') }),
        ...(projectIds?.length && {
          projects: {
            create: projectIds.map(pid => ({ projectId: pid, role: role || 'MEMBER' }))
          }
        })
      },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    })
    await logActivity({ userId: req.user.id, action: 'user_created', detail: `creó al usuario ${user.name} (${user.email}) con rol ${user.role}` })
    res.status(201).json(user)
  } catch (err) {
    console.error('Error crear usuario:', err.message)
    res.status(500).json({ error: 'Error al crear usuario' })
  }
})

// PATCH /api/admin/users/:id - editar usuario
router.patch('/users/:id', async (req, res) => {
  try {
    const { name, role, phone, position, isActive, password, visibleTabs } = req.body
    const target = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })

    // Proteger: solo SUPER_ADMIN puede modificar roles admin
    if ((['SUPER_ADMIN', 'ADMIN'].includes(role) || ['SUPER_ADMIN', 'ADMIN'].includes(target.role))
        && req.user.role !== 'SUPER_ADMIN')
      return res.status(403).json({ error: 'Solo un super administrador puede modificar administradores' })

    // No permitir auto-desactivarse
    if (req.params.id === req.user.id && isActive === false)
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' })

    const data = {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(phone !== undefined && { phone }),
      ...(position !== undefined && { position }),
      ...(isActive !== undefined && { isActive }),
      ...(Array.isArray(visibleTabs) && { visibleTabs: visibleTabs.join(',') })
    }
    if (password && password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    if (password) data.password = await bcrypt.hash(password, 12)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, name: true, role: true, isActive: true, phone: true, position: true, visibleTabs: true }
    })
    const changes = []
    if (role !== undefined) changes.push(`rol→${role}`)
    if (isActive !== undefined) changes.push(isActive ? 'activado' : 'desactivado')
    if (password) changes.push('contraseña cambiada')
    if (Array.isArray(visibleTabs)) changes.push('pestañas actualizadas')
    if (changes.length) await logActivity({ userId: req.user.id, action: 'user_updated', detail: `modificó a ${user.name}: ${changes.join(', ')}` })
    res.json(user)
  } catch (err) {
    console.error('Error editar usuario:', err.message)
    res.status(500).json({ error: 'Error al actualizar usuario' })
  }
})

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' })

    const target = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (['SUPER_ADMIN', 'ADMIN'].includes(target.role) && req.user.role !== 'SUPER_ADMIN')
      return res.status(403).json({ error: 'Solo un super administrador puede eliminar administradores' })

    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ message: 'Usuario eliminado' })
  } catch (err) {
    console.error('Error eliminar usuario:', err.message)
    res.status(500).json({ error: 'Error al eliminar usuario' })
  }
})

// PUT /api/admin/users/:id/projects - asignar proyectos a un usuario
router.put('/users/:id/projects', async (req, res) => {
  try {
    const { projectIds } = req.body  // array de IDs
    const userId = req.params.id

    // Borrar asignaciones actuales y recrear
    await prisma.projectMember.deleteMany({ where: { userId } })

    if (projectIds?.length) {
      await prisma.projectMember.createMany({
        data: projectIds.map(pid => ({ userId, projectId: pid, role: 'MEMBER' })),
        skipDuplicates: true
      })
    }

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true,
        projects: { include: { project: { select: { id: true, name: true, color: true } } } }
      }
    })
    res.json(updated)
  } catch (err) {
    console.error('Error asignar proyectos:', err.message)
    res.status(500).json({ error: 'Error al asignar proyectos' })
  }
})

// GET /api/admin/stats - estadísticas para el panel
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, activeUsers, totalProjects, totalTasks, totalInventory] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.project.count(),
      prisma.task.count(),
      prisma.inventoryItem.count()
    ])
    const byRole = await prisma.user.groupBy({ by: ['role'], _count: true })
    res.json({ totalUsers, activeUsers, totalProjects, totalTasks, totalInventory, byRole })
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})


// ===== BITÁCORA DE AUDITORÍA (solo super admin) =====
// GET /api/admin/audit
router.get('/audit', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo super administrador' })
    const activities = await prisma.activity.findMany({
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    })
    res.json(activities)
  } catch (err) {
    console.error('Error auditoría:', err.message)
    res.status(500).json({ error: 'Error al obtener la bitácora' })
  }
})

// ===== PAPELERA (solo super admin) =====
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

// GET /api/admin/trash - lista papelera y purga lo que pasó de 30 días
router.get('/trash', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo super administrador' })

    // Purga automática: eliminar definitivamente lo más viejo de 30 días
    const cutoff = new Date(Date.now() - THIRTY_DAYS)
    await prisma.project.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } })
    await prisma.quote.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } })

    const [projects, quotes] = await Promise.all([
      prisma.project.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, client: true, deletedAt: true, _count: { select: { tasks: true } } },
        orderBy: { deletedAt: 'desc' }
      }),
      prisma.quote.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, folio: true, clientName: true, deletedAt: true },
        orderBy: { deletedAt: 'desc' }
      })
    ])
    res.json({ projects, quotes })
  } catch (err) {
    console.error('Error papelera:', err.message)
    res.status(500).json({ error: 'Error al obtener la papelera' })
  }
})

// POST /api/admin/trash/restore - restaurar { type: 'project'|'quote', id }
router.post('/trash/restore', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo super administrador' })
    const { type, id } = req.body
    if (type === 'project') {
      const p = await prisma.project.update({ where: { id }, data: { deletedAt: null } })
      await logActivity({ userId: req.user.id, action: 'project_restored', detail: `restauró el proyecto "${p.name}" de la papelera` })
    } else if (type === 'quote') {
      const q = await prisma.quote.update({ where: { id }, data: { deletedAt: null } })
      await logActivity({ userId: req.user.id, action: 'quote_restored', detail: `restauró la cotización ${q.folio} de la papelera` })
    } else {
      return res.status(400).json({ error: 'Tipo inválido' })
    }
    res.json({ message: 'Restaurado correctamente' })
  } catch (err) {
    console.error('Error restaurar:', err.message)
    res.status(500).json({ error: 'Error al restaurar' })
  }
})

// DELETE /api/admin/trash/:type/:id - eliminar definitivamente
router.delete('/trash/:type/:id', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo super administrador' })
    const { type, id } = req.params
    if (type === 'project') {
      const p = await prisma.project.delete({ where: { id } })
      await logActivity({ userId: req.user.id, action: 'project_purged', detail: `eliminó definitivamente el proyecto "${p.name}"` })
    } else if (type === 'quote') {
      const q = await prisma.quote.delete({ where: { id } })
      await logActivity({ userId: req.user.id, action: 'quote_purged', detail: `eliminó definitivamente la cotización ${q.folio}` })
    } else {
      return res.status(400).json({ error: 'Tipo inválido' })
    }
    res.json({ message: 'Eliminado definitivamente' })
  } catch (err) {
    console.error('Error purgar:', err.message)
    res.status(500).json({ error: 'Error al eliminar' })
  }
})

export default router
