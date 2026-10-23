import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Rutas a las que puede llegar un usuario CLIENTE (todo lo demás es interno)
const CLIENT_ALLOWED = [
  /^\/api\/auth\/me$/,
  /^\/api\/support(\/|$)/,
  /^\/api\/notifications(\/|$)/
]

export const authenticate = async (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token requerido' })

  try {
    const token = header.split(' ')[1]
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, name: true, role: true, isActive: true, visibleTabs: true, company: true }
    })
    if (!user || !user.isActive)
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' })

    // Usuarios CLIENTE: aislados en el portal de soporte. Cualquier otra ruta del
    // sistema interno se rechaza aquí, antes de llegar a cualquier controlador.
    if (user.role === 'CLIENT') {
      const full = (req.baseUrl || '') + (req.path || '')
      if (!CLIENT_ALLOWED.some(rx => rx.test(full)))
        return res.status(403).json({ error: 'Acceso restringido al portal de clientes' })
    }

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

// Solo personal interno (cualquier rol excepto CLIENTE)
export const requireStaff = (req, res, next) => {
  if (req.user.role === 'CLIENT')
    return res.status(403).json({ error: 'Solo personal interno' })
  next()
}
