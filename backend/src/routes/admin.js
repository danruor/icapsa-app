import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireAdmin } from '../middleware/auth.js'

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
    const { email, password, name, role, phone, position, projectIds, visibleTabs } = req.body
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
    res.status(201).json(user)
  } catch (err) {
    console.error('Error crear usuario:', err.message)
    res.status(500).json({ error: 'Error al crear usuario: ' + err.message })
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
    if (password) data.password = await bcrypt.hash(password, 12)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, name: true, role: true, isActive: true, phone: true, position: true, visibleTabs: true }
    })
    res.json(user)
  } catch (err) {
    console.error('Error editar usuario:', err.message)
    res.status(500).json({ error: 'Error al actualizar usuario: ' + err.message })
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
    res.status(500).json({ error: 'Error al asignar proyectos: ' + err.message })
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

export default router
