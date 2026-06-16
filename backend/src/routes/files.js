import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/auth.js'

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

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|csv|txt|zip/
    const ext = allowed.test(path.extname(file.originalname).toLowerCase())
    const mime = allowed.test(file.mimetype)
    cb(null, ext || mime)
  }
})

router.use(authenticate)

// POST /api/files/upload
router.post('/upload', upload.single('file'), async (req, res) => {
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
