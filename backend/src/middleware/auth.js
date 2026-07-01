import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const authenticate = async (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token requerido' })

  try {
    const token = header.split(' ')[1]
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, isActive: true, visibleTabs: true }
    })
    if (!user || !user.isActive)
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' })

    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos suficientes' })
  next()
}

export const requireAdmin = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role))
    return res.status(403).json({ error: 'Requiere permisos de administrador' })
  next()
}

// Verifica que el usuario tenga acceso a una pestaña (admins ven todo).
// Refuerza en el servidor lo que el frontend solo oculta visualmente.
export const requireTab = (tab) => (req, res, next) => {
  if (['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) return next()
  const allowed = (req.user.visibleTabs || '').split(',').map(t => t.trim())
  if (allowed.includes(tab)) return next()
  res.status(403).json({ error: 'No tienes acceso a esta sección' })
}
