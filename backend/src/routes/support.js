import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/auth.js'
import { notify, logActivity } from '../lib/events.js'
import { nextFolio } from '../lib/folio.js'
import { parseDate, num } from '../lib/validate.js'

const router = Router()
const prisma = new PrismaClient()

// ===================================================================
// SOPORTE A CLIENTES — tickets con trazabilidad de principio a fin
//  · Clientes (rol CLIENT): ven y atienden SOLO sus tickets (y los de su empresa)
//  · Personal interno: necesita la pestaña 'support' (admins siempre)
// ===================================================================

router.use(authenticate)
router.use((req, res, next) => {
  if (req.user.role === 'CLIENT') return next()
  if (['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) return next()
  const allowed = (req.user.visibleTabs || '').split(',').map(t => t.trim())
  if (allowed.includes('support')) return next()
  res.status(403).json({ error: 'No tienes acceso a Soporte' })
})

const isClient = (req) => req.user.role === 'CLIENT'
const requireStaff = (req, res, next) => isClient(req) ? res.status(403).json({ error: 'Solo personal interno' }) : next()

export const CATEGORIES = ['FAILURE', 'INSTALLATION', 'DATA', 'BILLING', 'WARRANTY', 'OTHER']
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
export const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT', 'RESOLVED', 'CLOSED']
const ACTIVE = ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT']
// Tiempo máximo de atención por prioridad (horas)
export const SLA_HOURS = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 168 }
const STATUS_LABEL = { OPEN: 'Abierto', IN_PROGRESS: 'En atención', WAITING_CLIENT: 'Esperando al cliente', RESOLVED: 'Resuelto', CLOSED: 'Cerrado' }
const PRIORITY_LABEL = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' }

const slaFrom = (priority, from = new Date()) => new Date(new Date(from).getTime() + (SLA_HOURS[priority] || 72) * 3600 * 1000)
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const fmtDate = (d) => new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Alcance: un cliente solo ve lo suyo (y lo de su empresa)
function scopeWhere(req) {
  if (!isClient(req)) return {}
  const or = [{ createdById: req.user.id }]
  if (req.user.company) or.push({ company: req.user.company })
  return { OR: or }
}

const USER_SEL = { select: { id: true, name: true, position: true, company: true } }
const TICKET_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, phone: true, company: true, role: true } },
  assignee: USER_SEL,
  project: { select: { id: true, name: true, color: true } },
  quote: { select: { id: true, folio: true } },
  purchaseOrder: { select: { id: true, folio: true } },
  delivery: { select: { id: true, folio: true } },
  _count: { select: { messages: true, attachments: true, visits: true } }
}

function decorate(t) {
  const open = ACTIVE.includes(t.status)
  const slaOverdue = open && t.status !== 'WAITING_CLIENT' && !!t.slaDueAt && new Date(t.slaDueAt).getTime() < Date.now()
  return { ...t, isOpen: open, slaOverdue }
}

const systemEvent = (ticketId, body) => prisma.ticketMessage.create({ data: { ticketId, kind: 'SYSTEM', body } })

// Avisa al equipo responsable: asignado + administradores (sin repetir a quien actúa)
async function notifyStaff(ticket, title, message, actorId) {
  const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true }, select: { id: true } })
  const ids = new Set(admins.map(a => a.id))
  if (ticket.assigneeId) ids.add(ticket.assigneeId)
  ids.delete(actorId)
  for (const id of ids) await notify({ userId: id, type: 'ticket', title, message, link: `/support/${ticket.id}` })
}
async function notifyClient(ticket, title, message, actorId) {
  if (!ticket.createdById || ticket.createdById === actorId) return
  const creator = await prisma.user.findUnique({ where: { id: ticket.createdById }, select: { role: true } })
  const link = creator?.role === 'CLIENT' ? `/portal/tickets/${ticket.id}` : `/support/${ticket.id}`
  await notify({ userId: ticket.createdById, type: 'ticket', title, message, link })
}

// Carga un ticket dentro del alcance del solicitante (404 si no existe o no le toca)
async function loadTicket(req, res, include = TICKET_INCLUDE) {
  const t = await prisma.supportTicket.findFirst({ where: { id: req.params.id, ...scopeWhere(req) }, include })
  if (!t) { res.status(404).json({ error: 'Ticket no encontrado' }); return null }
  return t
}

// ----- Adjuntos: misma política del sistema (imágenes + PDF, 10 MB, nombre aleatorio) -----
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.pdf'])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR) },
    filename: (_, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED_EXT.has(ext) && ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
    cb(new Error('Solo imágenes (JPG, PNG, GIF, WebP, HEIC) y PDF'))
  }
})
const handleUpload = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo excede 10MB' : 'Tipo de archivo no permitido' })
  next()
})

// ===================================================================
// CATÁLOGOS
// ===================================================================
router.get('/meta', (req, res) => {
  res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES, slaHours: SLA_HOURS })
})

// Técnicos asignables + clientes registrados (solo personal)
router.get('/users', requireStaff, async (req, res) => {
  try {
    const [technicians, clients] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true, role: { notIn: ['CLIENT', 'INSTALLER'] } }, select: { id: true, name: true, position: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { isActive: true, role: 'CLIENT' }, select: { id: true, name: true, email: true, company: true, phone: true }, orderBy: [{ company: 'asc' }, { name: 'asc' }] })
    ])
    res.json({ technicians, clients })
  } catch { res.status(500).json({ error: 'Error al obtener usuarios' }) }
})

// Documentos vinculables (solo personal)
router.get('/links', requireStaff, async (req, res) => {
  try {
    const [projects, quotes, purchaseOrders, deliveries] = await Promise.all([
      prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true, color: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.quote.findMany({ where: { deletedAt: null }, select: { id: true, folio: true, clientName: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.purchaseOrder.findMany({ select: { id: true, folio: true, supplier: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.delivery.findMany({ select: { id: true, folio: true }, orderBy: { createdAt: 'desc' }, take: 100 })
    ])
    res.json({ projects, quotes, purchaseOrders, deliveries })
  } catch { res.status(500).json({ error: 'Error al obtener vínculos' }) }
})

// ===================================================================
// TICKETS
// ===================================================================

// GET /api/support/tickets?status=ACTIVE|OPEN|...&priority=&assigneeId=&company=&q=&mine=1
router.get('/tickets', async (req, res) => {
  try {
    const { status, priority, assigneeId, company, q, mine } = req.query
    const where = { ...scopeWhere(req) }
    if (status === 'ACTIVE') where.status = { in: ACTIVE }
    else if (STATUSES.includes(status)) where.status = status
    if (PRIORITIES.includes(priority)) where.priority = priority
    if (!isClient(req)) {
      if (assigneeId === 'none') where.assigneeId = null
      else if (assigneeId) where.assigneeId = clean(assigneeId, 40)
      if (mine === '1') where.assigneeId = req.user.id
      if (company) where.company = { contains: clean(company, 80), mode: 'insensitive' }
    }
    const s = clean(q, 80)
    if (s) where.AND = [{ OR: [
      { folio: { contains: s, mode: 'insensitive' } }, { title: { contains: s, mode: 'insensitive' } },
      { equipment: { contains: s, mode: 'insensitive' } }, { location: { contains: s, mode: 'insensitive' } },
      { company: { contains: s, mode: 'insensitive' } }
    ] }]
    const tickets = await prisma.supportTicket.findMany({ where, include: TICKET_INCLUDE, orderBy: { createdAt: 'desc' }, take: 500 })
    res.json(tickets.map(decorate))
  } catch (err) {
    console.error('Error listar tickets:', err.message)
    res.status(500).json({ error: 'Error al obtener tickets' })
  }
})

// GET /api/support/tickets/:id — detalle con línea de tiempo (sin notas internas para clientes)
router.get('/tickets/:id', async (req, res) => {
  try {
    const t = await loadTicket(req, res, {
      ...TICKET_INCLUDE,
      messages: {
        where: isClient(req) ? { kind: { not: 'INTERNAL' } } : {},
        include: { author: { select: { id: true, name: true, role: true, company: true } }, attachments: true },
        orderBy: { createdAt: 'asc' }
      },
      attachments: {
        // El cliente no debe ver adjuntos ligados a notas internas del equipo
        where: isClient(req) ? { OR: [{ messageId: null }, { message: { kind: { not: 'INTERNAL' } } }] } : {},
        include: { uploadedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' }
      },
      visits: { include: { technician: USER_SEL }, orderBy: { scheduledAt: 'asc' } }
    })
    if (!t) return
    res.json(decorate(t))
  } catch (err) {
    console.error('Error detalle ticket:', err.message)
    res.status(500).json({ error: 'Error al obtener el ticket' })
  }
})

// POST /api/support/tickets — el cliente levanta un ticket; el personal puede hacerlo a nombre de un cliente
router.post('/tickets', async (req, res) => {
  try {
    const title = clean(req.body.title, 160)
    const description = clean(req.body.description, 5000)
    if (!title) return res.status(400).json({ error: 'Describe brevemente el problema (título)' })
    if (!description) return res.status(400).json({ error: 'Describe el problema con detalle' })
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER'
    const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'MEDIUM'

    // Anti-abuso: un cliente no puede acumular más de 30 tickets activos
    if (isClient(req)) {
      const openCount = await prisma.supportTicket.count({ where: { createdById: req.user.id, status: { in: ACTIVE } } })
      if (openCount >= 30) return res.status(429).json({ error: 'Tienes demasiados tickets abiertos. Espera a que se atiendan antes de levantar más.' })
    }

    let createdById = req.user.id
    let company = req.user.company || null
    let assigneeId = null
    const links = {}
    if (!isClient(req)) {
      // A nombre de un cliente registrado, o con empresa libre (reporte telefónico)
      if (req.body.clientId) {
        const c = await prisma.user.findFirst({ where: { id: clean(req.body.clientId, 40), role: 'CLIENT', isActive: true }, select: { id: true, company: true } })
        if (!c) return res.status(400).json({ error: 'Cliente no válido' })
        createdById = c.id; company = c.company || null
      } else {
        company = clean(req.body.company, 80) || null
      }
      if (req.body.assigneeId) {
        const tech = await prisma.user.findFirst({ where: { id: clean(req.body.assigneeId, 40), role: { notIn: ['CLIENT', 'INSTALLER'] }, isActive: true }, select: { id: true } })
        if (!tech) return res.status(400).json({ error: 'Técnico no válido' })
        assigneeId = tech.id
      }
      for (const k of ['projectId', 'quoteId', 'purchaseOrderId', 'deliveryId']) if (req.body[k]) links[k] = clean(req.body[k], 40)
    }

    const base = {
      title, description, category, priority, company,
      location: clean(req.body.location, 200) || null,
      equipment: clean(req.body.equipment, 200) || null,
      slaDueAt: slaFrom(priority),
      createdById, assigneeId,
      status: assigneeId ? 'IN_PROGRESS' : 'OPEN',
      ...links
    }
    let ticket
    for (let attempt = 0; attempt < 5; attempt++) {
      const folio = await nextFolio('supportTicket', 'TKT')
      try {
        ticket = await prisma.supportTicket.create({ data: { ...base, folio }, include: TICKET_INCLUDE })
        break
      } catch (e) {
        if (e.code === 'P2002' && attempt < 4) continue
        throw e
      }
    }

    await systemEvent(ticket.id, `Ticket creado por ${req.user.name}${createdById !== req.user.id ? ` a nombre de ${ticket.createdBy.name}` : ''} · prioridad ${PRIORITY_LABEL[priority]} · límite de atención ${fmtDate(ticket.slaDueAt)}`)
    if (assigneeId) await systemEvent(ticket.id, `Asignado a ${ticket.assignee.name}`)

    await notifyStaff(ticket, `Nuevo ticket ${ticket.folio}`, `${company ? company + ' · ' : ''}${title} (${PRIORITY_LABEL[priority]})`, req.user.id)
    if (assigneeId && assigneeId !== req.user.id)
      await notify({ userId: assigneeId, type: 'ticket', title: `Te asignaron ${ticket.folio}`, message: title, link: `/support/${ticket.id}` })
    if (createdById !== req.user.id)
      await notifyClient(ticket, `Registramos tu ticket ${ticket.folio}`, `${title} — puedes seguirlo en tu portal`, req.user.id)
    await logActivity({ userId: req.user.id, action: 'ticket_created', detail: `levantó el ticket ${ticket.folio} «${title}»${company ? ` (${company})` : ''}` })
    res.status(201).json(decorate(ticket))
  } catch (err) {
    console.error('Error crear ticket:', err.message)
    res.status(500).json({ error: 'Error al crear el ticket' })
  }
})

// PATCH /api/support/tickets/:id — gestión (solo personal): estado, prioridad, asignación, vínculos
router.patch('/tickets/:id', requireStaff, async (req, res) => {
  try {
    const t = await loadTicket(req, res)
    if (!t) return
    const data = {}
    const events = []

    if (req.body.title !== undefined) { const v = clean(req.body.title, 160); if (!v) return res.status(400).json({ error: 'Título requerido' }); data.title = v }
    if (req.body.description !== undefined) { const v = clean(req.body.description, 5000); if (v) data.description = v }
    for (const k of ['location', 'equipment', 'company']) if (req.body[k] !== undefined) data[k] = clean(req.body[k], 200) || null
    if (req.body.category !== undefined && CATEGORIES.includes(req.body.category)) data.category = req.body.category
    for (const k of ['projectId', 'quoteId', 'purchaseOrderId', 'deliveryId']) if (req.body[k] !== undefined) data[k] = req.body[k] ? clean(req.body[k], 40) : null

    if (req.body.priority !== undefined && PRIORITIES.includes(req.body.priority) && req.body.priority !== t.priority) {
      data.priority = req.body.priority
      data.slaDueAt = slaFrom(req.body.priority, t.createdAt)
      events.push(`Prioridad cambiada a ${PRIORITY_LABEL[req.body.priority]} por ${req.user.name} · nuevo límite ${fmtDate(data.slaDueAt)}`)
    }

    let newAssignee = null
    if (req.body.assigneeId !== undefined && (req.body.assigneeId || null) !== t.assigneeId) {
      if (req.body.assigneeId) {
        newAssignee = await prisma.user.findFirst({ where: { id: clean(req.body.assigneeId, 40), role: { notIn: ['CLIENT', 'INSTALLER'] }, isActive: true }, select: { id: true, name: true } })
        if (!newAssignee) return res.status(400).json({ error: 'Técnico no válido' })
        data.assigneeId = newAssignee.id
        events.push(`Asignado a ${newAssignee.name} por ${req.user.name}`)
        if (t.status === 'OPEN' && req.body.status === undefined) data.status = 'IN_PROGRESS'
      } else {
        data.assigneeId = null
        events.push(`Asignación retirada por ${req.user.name}`)
      }
    }

    if (req.body.status !== undefined && STATUSES.includes(req.body.status) && req.body.status !== t.status) {
      const s = req.body.status
      data.status = s
      if (s === 'RESOLVED') { data.resolvedAt = new Date(); data.closedAt = null }
      else if (s === 'CLOSED') { data.closedAt = new Date(); if (!t.resolvedAt) data.resolvedAt = new Date() }
      else { data.resolvedAt = null; data.closedAt = null }
      events.push(`Estado: ${STATUS_LABEL[t.status]} → ${STATUS_LABEL[s]} (${req.user.name})`)
    }

    const updated = await prisma.supportTicket.update({ where: { id: t.id }, data, include: TICKET_INCLUDE })
    for (const e of events) await systemEvent(t.id, e)

    if (newAssignee && newAssignee.id !== req.user.id)
      await notify({ userId: newAssignee.id, type: 'ticket', title: `Te asignaron ${t.folio}`, message: updated.title, link: `/support/${t.id}` })
    if (data.status === 'RESOLVED')
      await notifyClient(updated, `${t.folio} marcado como resuelto`, 'Confirma que quedó solucionado y califica la atención', req.user.id)
    else if (data.status === 'WAITING_CLIENT')
      await notifyClient(updated, `${t.folio} necesita tu respuesta`, 'El equipo requiere información tuya para continuar', req.user.id)
    else if (data.status === 'CLOSED')
      await notifyClient(updated, `${t.folio} cerrado`, 'Gracias por tu confianza', req.user.id)
    if (events.length) await logActivity({ userId: req.user.id, action: 'ticket_updated', detail: `${t.folio}: ${events.join(' · ')}` })
    res.json(decorate(updated))
  } catch (err) {
    console.error('Error actualizar ticket:', err.message)
    res.status(500).json({ error: 'Error al actualizar el ticket' })
  }
})

// DELETE /api/support/tickets/:id — solo SUPER_ADMIN (queda en bitácora)
router.delete('/tickets/:id', requireStaff, async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador puede eliminar tickets' })
    const t = await prisma.supportTicket.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, action: 'ticket_deleted', detail: `eliminó el ticket ${t.folio} «${t.title}»` })
    res.json({ message: 'Ticket eliminado' })
  } catch { res.status(500).json({ error: 'Error al eliminar' }) }
})

// ===================================================================
// CONVERSACIÓN
// ===================================================================

// POST /api/support/tickets/:id/messages — { body, kind?: 'INTERNAL', status?, attachmentIds? }
router.post('/tickets/:id/messages', async (req, res) => {
  try {
    const t = await loadTicket(req, res)
    if (!t) return
    const body = clean(req.body.body, 5000)
    const attachmentIds = Array.isArray(req.body.attachmentIds) ? req.body.attachmentIds.map(x => clean(x, 40)).filter(Boolean).slice(0, 10) : []
    if (!body && attachmentIds.length === 0) return res.status(400).json({ error: 'Escribe un mensaje' })
    const internal = !isClient(req) && req.body.kind === 'INTERNAL'
    if (isClient(req) && t.status === 'CLOSED') return res.status(400).json({ error: 'El ticket está cerrado. Reábrelo para continuar la conversación.' })

    const msg = await prisma.ticketMessage.create({
      data: { ticketId: t.id, authorId: req.user.id, kind: internal ? 'INTERNAL' : 'MESSAGE', body: body || '📎 Archivo adjunto' },
      include: { author: { select: { id: true, name: true, role: true, company: true } } }
    })
    if (attachmentIds.length)
      await prisma.ticketAttachment.updateMany({ where: { id: { in: attachmentIds }, ticketId: t.id, messageId: null }, data: { messageId: msg.id } })

    // Efectos sobre el ticket
    const data = {}
    const events = []
    if (!internal) {
      if (isClient(req)) {
        if (t.status === 'WAITING_CLIENT') { data.status = t.assigneeId ? 'IN_PROGRESS' : 'OPEN'; events.push('El cliente respondió') }
        if (t.status === 'RESOLVED') { data.status = t.assigneeId ? 'IN_PROGRESS' : 'OPEN'; data.resolvedAt = null; events.push('Reabierto: el cliente respondió sobre un ticket resuelto') }
      } else {
        if (!t.firstResponseAt) data.firstResponseAt = new Date()
        if (!t.assigneeId) { data.assigneeId = req.user.id; events.push(`${req.user.name} tomó el ticket`) }
        if (t.status === 'OPEN') data.status = 'IN_PROGRESS'
        const s = req.body.status
        if (STATUSES.includes(s) && s !== (data.status || t.status)) {
          data.status = s
          if (s === 'RESOLVED') data.resolvedAt = new Date()
          if (s === 'CLOSED') data.closedAt = new Date()
          events.push(`Estado → ${STATUS_LABEL[s]} (${req.user.name})`)
        }
      }
    }
    const updated = Object.keys(data).length
      ? await prisma.supportTicket.update({ where: { id: t.id }, data, include: TICKET_INCLUDE })
      : t
    for (const e of events) await systemEvent(t.id, e)

    if (!internal) {
      if (isClient(req)) await notifyStaff(updated, `${t.folio} · ${req.user.name} respondió`, body.slice(0, 120) || 'Adjuntó un archivo', req.user.id)
      else await notifyClient(updated, `Respuesta en ${t.folio}`, body.slice(0, 120) || 'Te enviaron un archivo', req.user.id)
    }
    const attachments = attachmentIds.length ? await prisma.ticketAttachment.findMany({ where: { messageId: msg.id } }) : []
    res.status(201).json({ message: { ...msg, attachments }, ticket: decorate(updated) })
  } catch (err) {
    console.error('Error mensaje ticket:', err.message)
    res.status(500).json({ error: 'Error al enviar el mensaje' })
  }
})

// POST /api/support/tickets/:id/attachments — multipart 'file' (luego se liga a un mensaje con attachmentIds)
router.post('/tickets/:id/attachments', async (req, res, next) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: req.params.id, ...scopeWhere(req) }, select: { id: true, status: true } })
  if (!t) return res.status(404).json({ error: 'Ticket no encontrado' })
  if (isClient(req) && t.status === 'CLOSED') return res.status(400).json({ error: 'El ticket está cerrado' })
  next()
}, handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`
    const att = await prisma.ticketAttachment.create({
      data: {
        ticketId: req.params.id, uploadedById: req.user.id,
        name: clean(req.file.originalname, 200) || req.file.filename,
        url: `${baseUrl}/uploads/${req.file.filename}`,
        size: req.file.size, mimeType: req.file.mimetype
      }
    })
    res.status(201).json(att)
  } catch (err) {
    console.error('Error adjunto ticket:', err.message)
    res.status(500).json({ error: 'Error al subir el archivo' })
  }
})

// POST /api/support/tickets/:id/rate — el cliente confirma la solución y califica (cierra el ticket)
router.post('/tickets/:id/rate', async (req, res) => {
  try {
    // Solo el cliente califica la atención (el personal cierra con PATCH status=CLOSED)
    if (!isClient(req)) return res.status(403).json({ error: 'Solo el cliente puede calificar la atención' })
    const t = await loadTicket(req, res)
    if (!t) return
    if (!['RESOLVED', 'CLOSED'].includes(t.status)) return res.status(400).json({ error: 'El ticket aún no está resuelto' })
    if (t.status === 'CLOSED' && t.rating != null) return res.status(400).json({ error: 'Este ticket ya fue calificado' })
    const rating = num(req.body.rating, { min: 1, max: 5 })
    if (rating === null) return res.status(400).json({ error: 'Calificación de 1 a 5' })
    const comment = clean(req.body.comment, 500) || null
    const updated = await prisma.supportTicket.update({
      where: { id: t.id },
      data: { rating: Math.round(rating), ratingComment: comment, status: 'CLOSED', closedAt: t.closedAt || new Date() },
      include: TICKET_INCLUDE
    })
    await systemEvent(t.id, `${req.user.name} confirmó la solución y calificó ${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}${comment ? ` — «${comment}»` : ''}`)
    await notifyStaff(updated, `${t.folio} cerrado con ${Math.round(rating)}★`, comment || 'El cliente confirmó la solución', req.user.id)
    res.json(decorate(updated))
  } catch (err) {
    console.error('Error calificar ticket:', err.message)
    res.status(500).json({ error: 'Error al calificar' })
  }
})

// POST /api/support/tickets/:id/reopen — { reason? }
router.post('/tickets/:id/reopen', async (req, res) => {
  try {
    const t = await loadTicket(req, res)
    if (!t) return
    if (!['RESOLVED', 'CLOSED'].includes(t.status)) return res.status(400).json({ error: 'El ticket sigue abierto' })
    const reason = clean(req.body.reason, 2000)
    const updated = await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: t.assigneeId ? 'IN_PROGRESS' : 'OPEN', resolvedAt: null, closedAt: null, slaDueAt: slaFrom(t.priority) },
      include: TICKET_INCLUDE
    })
    await systemEvent(t.id, `Reabierto por ${req.user.name}`)
    if (reason) await prisma.ticketMessage.create({ data: { ticketId: t.id, authorId: req.user.id, kind: 'MESSAGE', body: reason } })
    if (isClient(req)) await notifyStaff(updated, `${t.folio} reabierto por el cliente`, reason.slice(0, 120) || 'El problema persiste', req.user.id)
    else await notifyClient(updated, `${t.folio} fue reabierto`, reason.slice(0, 120) || 'Seguimos atendiendo tu caso', req.user.id)
    res.json(decorate(updated))
  } catch (err) {
    console.error('Error reabrir ticket:', err.message)
    res.status(500).json({ error: 'Error al reabrir' })
  }
})

// ===================================================================
// VISITAS (se reflejan en el Calendario del equipo)
// ===================================================================
const VISIT_INCLUDE = { technician: USER_SEL, ticket: { select: { id: true, folio: true, title: true, company: true, location: true, createdById: true, status: true } } }

// POST /api/support/tickets/:id/visits — { scheduledAt, durationMin, technicianId, notes }
router.post('/tickets/:id/visits', requireStaff, async (req, res) => {
  try {
    const t = await loadTicket(req, res)
    if (!t) return
    const scheduledAt = parseDate(req.body.scheduledAt)
    if (!scheduledAt) return res.status(400).json({ error: 'Fecha y hora de la visita requeridas' })
    const durationMin = num(req.body.durationMin ?? 120, { min: 15, max: 1440 }) ?? 120
    let technician = null
    if (req.body.technicianId) {
      technician = await prisma.user.findFirst({ where: { id: clean(req.body.technicianId, 40), role: { notIn: ['CLIENT', 'INSTALLER'] }, isActive: true }, select: { id: true, name: true } })
      if (!technician) return res.status(400).json({ error: 'Técnico no válido' })
    }
    const visit = await prisma.ticketVisit.create({
      data: { ticketId: t.id, scheduledAt, durationMin: Math.round(durationMin), technicianId: technician?.id || null, notes: clean(req.body.notes, 1000) || null },
      include: VISIT_INCLUDE
    })
    await systemEvent(t.id, `📅 Visita programada para ${fmtDate(scheduledAt)}${technician ? ` con ${technician.name}` : ''} (${req.user.name})`)
    if (t.status === 'OPEN') await prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS' } })
    await notifyClient(t, `Visita programada · ${t.folio}`, `${fmtDate(scheduledAt)}${technician ? ` — ${technician.name}` : ''}`, req.user.id)
    if (technician && technician.id !== req.user.id)
      await notify({ userId: technician.id, type: 'ticket_visit', title: `Visita asignada · ${t.folio}`, message: `${fmtDate(scheduledAt)} · ${t.company || t.title}`, link: `/support/${t.id}` })
    await logActivity({ userId: req.user.id, action: 'ticket_visit', detail: `programó visita del ${t.folio} para ${fmtDate(scheduledAt)}` })
    res.status(201).json(visit)
  } catch (err) {
    console.error('Error programar visita:', err.message)
    res.status(500).json({ error: 'Error al programar la visita' })
  }
})

// PATCH /api/support/visits/:id — reprogramar / concluir / cancelar
router.patch('/visits/:id', requireStaff, async (req, res) => {
  try {
    const v = await prisma.ticketVisit.findUnique({ where: { id: req.params.id }, include: VISIT_INCLUDE })
    if (!v) return res.status(404).json({ error: 'Visita no encontrada' })
    const data = {}
    const events = []
    if (req.body.scheduledAt !== undefined) {
      const d = parseDate(req.body.scheduledAt)
      if (!d) return res.status(400).json({ error: 'Fecha inválida' })
      if (d.getTime() !== new Date(v.scheduledAt).getTime()) { data.scheduledAt = d; events.push(`Visita reprogramada a ${fmtDate(d)} (${req.user.name})`) }
    }
    if (req.body.durationMin !== undefined) { const n = num(req.body.durationMin, { min: 15, max: 1440 }); if (n !== null) data.durationMin = Math.round(n) }
    if (req.body.technicianId !== undefined) {
      if (req.body.technicianId) {
        const tech = await prisma.user.findFirst({ where: { id: clean(req.body.technicianId, 40), role: { notIn: ['CLIENT', 'INSTALLER'] }, isActive: true }, select: { id: true, name: true } })
        if (!tech) return res.status(400).json({ error: 'Técnico no válido' })
        data.technicianId = tech.id
        if (tech.id !== v.technicianId) events.push(`Visita reasignada a ${tech.name}`)
      } else data.technicianId = null
    }
    if (req.body.notes !== undefined) data.notes = clean(req.body.notes, 1000) || null
    if (req.body.outcome !== undefined) data.outcome = clean(req.body.outcome, 2000) || null
    if (['SCHEDULED', 'DONE', 'CANCELLED'].includes(req.body.status) && req.body.status !== v.status) {
      data.status = req.body.status
      if (req.body.status === 'DONE') events.push(`✅ Visita realizada${data.outcome || v.outcome ? `: ${data.outcome || v.outcome}` : ''} (${req.user.name})`)
      if (req.body.status === 'CANCELLED') events.push(`Visita del ${fmtDate(v.scheduledAt)} cancelada (${req.user.name})`)
    }
    const updated = await prisma.ticketVisit.update({ where: { id: v.id }, data, include: VISIT_INCLUDE })
    for (const e of events) await systemEvent(v.ticketId, e)
    if (data.scheduledAt || data.status === 'CANCELLED')
      await notifyClient(v.ticket, `Visita ${data.status === 'CANCELLED' ? 'cancelada' : 'reprogramada'} · ${v.ticket.folio}`, data.scheduledAt ? fmtDate(data.scheduledAt) : fmtDate(v.scheduledAt), req.user.id)
    if (data.technicianId && data.technicianId !== req.user.id && data.technicianId !== v.technicianId)
      await notify({ userId: data.technicianId, type: 'ticket_visit', title: `Visita asignada · ${v.ticket.folio}`, message: fmtDate(data.scheduledAt || v.scheduledAt), link: `/support/${v.ticketId}` })
    res.json(updated)
  } catch (err) {
    console.error('Error actualizar visita:', err.message)
    res.status(500).json({ error: 'Error al actualizar la visita' })
  }
})

// GET /api/support/visits/upcoming — próximas visitas en el alcance del solicitante
router.get('/visits/upcoming', async (req, res) => {
  try {
    const visits = await prisma.ticketVisit.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 2 * 3600 * 1000) }, ticket: scopeWhere(req) },
      include: VISIT_INCLUDE, orderBy: { scheduledAt: 'asc' }, take: 50
    })
    res.json(visits)
  } catch { res.status(500).json({ error: 'Error al obtener visitas' }) }
})

// ===================================================================
// MÉTRICAS (solo personal)
// ===================================================================
router.get('/metrics', requireStaff, async (req, res) => {
  try {
    const now = new Date()
    const since90 = new Date(now.getTime() - 90 * 86400000)
    const [all, recent, upcomingVisits] = await Promise.all([
      prisma.supportTicket.findMany({ select: { id: true, status: true, priority: true, category: true, company: true, assigneeId: true, slaDueAt: true, createdAt: true, resolvedAt: true, firstResponseAt: true, rating: true, assignee: { select: { name: true } } } }),
      prisma.supportTicket.findMany({ where: { createdAt: { gte: since90 } }, select: { createdAt: true, resolvedAt: true, firstResponseAt: true, rating: true } }),
      prisma.ticketVisit.findMany({ where: { status: 'SCHEDULED', scheduledAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } }, include: VISIT_INCLUDE, orderBy: { scheduledAt: 'asc' }, take: 20 })
    ])
    const active = all.filter(t => ACTIVE.includes(t.status))
    const counts = { total: all.length, active: active.length }
    for (const s of STATUSES) counts[s] = all.filter(t => t.status === s).length
    counts.overdue = active.filter(t => t.status !== 'WAITING_CLIENT' && t.slaDueAt && t.slaDueAt < now).length
    counts.unassigned = active.filter(t => !t.assigneeId).length
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    counts.resolvedThisMonth = all.filter(t => t.resolvedAt && t.resolvedAt >= monthStart).length
    counts.createdThisMonth = all.filter(t => t.createdAt >= monthStart).length

    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const hours = (a, b) => (new Date(b) - new Date(a)) / 3600000
    const avgFirstResponseHours = avg(recent.filter(t => t.firstResponseAt).map(t => hours(t.createdAt, t.firstResponseAt)))
    const avgResolutionHours = avg(recent.filter(t => t.resolvedAt).map(t => hours(t.createdAt, t.resolvedAt)))
    const rated = all.filter(t => t.rating)
    const avgRating = avg(rated.map(t => t.rating))

    const group = (list, key) => Object.entries(list.reduce((acc, t) => { const k = t[key] || '—'; acc[k] = (acc[k] || 0) + 1; return acc }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    const byAssignee = Object.entries(active.reduce((acc, t) => { const k = t.assignee?.name || 'Sin asignar'; acc[k] = (acc[k] || 0) + 1; return acc }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toISOString().slice(0, 7)
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      months.push({
        month: key,
        creados: all.filter(t => t.createdAt >= d && t.createdAt < next).length,
        resueltos: all.filter(t => t.resolvedAt && t.resolvedAt >= d && t.resolvedAt < next).length
      })
    }

    res.json({
      counts, avgFirstResponseHours, avgResolutionHours, avgRating, ratingCount: rated.length,
      byCategory: group(all, 'category'), byPriority: group(active, 'priority'), byCompany: group(active, 'company').slice(0, 10), byAssignee,
      perMonth: months, upcomingVisits
    })
  } catch (err) {
    console.error('Error métricas soporte:', err.message)
    res.status(500).json({ error: 'Error al calcular métricas' })
  }
})

// ===================================================================
// SLA: aviso automático cuando un ticket se vence sin atención (cada 30 min desde index.js)
// ===================================================================
export async function runSlaCheck() {
  try {
    const overdue = await prisma.supportTicket.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: new Date() }, slaNotifiedAt: null },
      include: TICKET_INCLUDE, take: 100
    })
    for (const t of overdue) {
      await prisma.supportTicket.update({ where: { id: t.id }, data: { slaNotifiedAt: new Date() } })
      await systemEvent(t.id, `⚠️ Límite de atención vencido (${PRIORITY_LABEL[t.priority]}: ${SLA_HOURS[t.priority]} h)`)
      await notifyStaff(t, `⚠️ SLA vencido · ${t.folio}`, `${t.company ? t.company + ' · ' : ''}${t.title}`, null)
    }
    if (overdue.length) console.log(`SLA: ${overdue.length} ticket(s) vencidos notificados`)
  } catch (err) {
    console.error('Error verificación SLA:', err.message)
  }
}

export default router
