import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

// POST /api/auth/register — SOLO administradores (registro público deshabilitado)
router.post('/register', authenticate, requireAdmin, async (req, res) => {
  try {
    let { email, password, name } = req.body
    if (!email || !password || !name)
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    email = email.trim().toLowerCase()
    if (password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists)
      return res.status(409).json({ error: 'El correo ya está registrado' })

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, password: hashed, name },
      select: { id: true, email: true, name: true, role: true, visibleTabs: true }
    })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.status(201).json({ user, token })
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar usuario' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'Correo y contraseña requeridos' })
    email = email.trim().toLowerCase()

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user)
      return res.status(401).json({ error: 'Credenciales incorrectas' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid)
      return res.status(401).json({ error: 'Credenciales incorrectas' })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, visibleTabs: user.visibleTabs },
      token
    })
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, visibleTabs: true, createdAt: true }
  })
  res.json(user)
})

// GET /api/auth/users - lista básica de usuarios (para asignaciones)
router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, position: true },
      orderBy: { name: 'asc' }
    })
    res.json(users)
  } catch {
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

export default router
