import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authenticate, requireTab } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    const dir = 'uploads'
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    cb(null, dir)
  },
  filename: (_, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  }
})

// Solo imágenes y PDF: se valida la extensión Y el tipo MIME real (ambos deben coincidir)
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.pdf'])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB, un archivo por petición
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED_EXT.has(ext) && ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
    cb(new Error('Tipo de archivo no permitido. Solo imágenes (JPG, PNG, GIF, WebP, HEIC) y PDF.'))
  }
})

// Convierte el error del filtro en respuesta legible en vez de crash
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message.includes('File too large') ? 'El archivo excede 10MB' : err.message })
    next()
  })
}

router.use(authenticate)
router.use(requireTab('projects'))

// POST /api/files/upload
router.post('/upload', handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

    const { projectId, taskId } = req.body
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`

    const file = await prisma.file.create({
      data: {
        name: req.file.originalname,
        url: `${baseUrl}/uploads/${req.file.filename}`,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user.id,
        ...(projectId && { projectId }),
        ...(taskId && { taskId })
      },
      include: { uploadedBy: { select: { id: true, name: true } } }
    })
    res.status(201).json(file)
  } catch {
    res.status(500).json({ error: 'Error al subir archivo' })
  }
})

// GET /api/files?projectId=xxx
router.get('/', async (req, res) => {
  try {
    const { projectId, taskId } = req.query
    const files = await prisma.file.findMany({
      where: {
        ...(projectId && { projectId }),
        ...(taskId && { taskId })
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(files)
  } catch {
    res.status(500).json({ error: 'Error al obtener archivos' })
  }
})

// DELETE /api/files/:id
router.delete('/:id', async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id } })
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })

    const filename = file.url.split('/uploads/')[1]
    const filePath = `uploads/${filename}`
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    await prisma.file.delete({ where: { id: req.params.id } })
    res.json({ message: 'Archivo eliminado' })
  } catch {
    res.status(500).json({ error: 'Error al eliminar archivo' })
  }
})

export default router
