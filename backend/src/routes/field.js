import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import ExcelJS from 'exceljs'
import { authenticate } from '../middleware/auth.js'
import { notify, logActivity } from '../lib/events.js'
import { nextFolio } from '../lib/folio.js'
import { parseDate, num } from '../lib/validate.js'

const router = Router()
const prisma = new PrismaClient()

// ===================================================================
// INSTALACIÓN EN CAMPO — sellado de bóvedas (ROXTEC)
//  · Instaladores (rol INSTALLER): SOLO las obras a las que están asignados;
//    registran reportes diarios con material consumido y fotos
//  · Oficina: pestaña 'field' (admins siempre) — estructura, catálogo,
//    asignaciones, revisión de reportes y recuento de costos
// ===================================================================

router.use(authenticate)
router.use((req, res, next) => {
  if (req.user.role === 'INSTALLER') return next()
  if (['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) return next()
  if (req.user.role === 'CLIENT') return res.status(403).json({ error: 'Sin acceso' })
  const allowed = (req.user.visibleTabs || '').split(',').map(t => t.trim())
  if (allowed.includes('field')) return next()
  res.status(403).json({ error: 'No tienes acceso a Instalaciones' })
})

const isInstaller = (req) => req.user.role === 'INSTALLER'
const isAdmin = (req) => ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)
const requireOffice = (req, res, next) => isInstaller(req) ? res.status(403).json({ error: 'Solo personal de oficina' }) : next()
const requireAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(403).json({ error: 'Requiere permisos de administrador' })

export const MATERIAL_CATEGORIES = ['FRAME', 'MODULE', 'STAYPLATE', 'WEDGE', 'SEAL', 'LUBRICANT', 'COATING', 'ACCESSORY', 'CONSUMABLE', 'OTHER']
export const SITE_TYPES = ['VAULT', 'SUBSTATION', 'MANHOLE', 'OTHER']
export const STAGES = ['PENDING', 'DEWATERING', 'WALL_PREP', 'FORMWORK', 'SEALING', 'COATING', 'DONE']
export const INFILTRATIONS = ['RAIN', 'POTABLE', 'SEWAGE', 'GROUNDWATER']
const PHOTO_KINDS = ['BEFORE', 'DURING', 'AFTER']
export const LOG_KINDS = ['NOTE', 'PROGRESS', 'ISSUE', 'DELAY', 'SAFETY', 'CLIENT']
const LOG_LABEL = { NOTE: 'Nota', PROGRESS: 'Avance', ISSUE: 'Problema', DELAY: 'Retraso', SAFETY: 'Seguridad', CLIENT: 'Cliente/CFE' }

// Catálogo ROXTEC de arranque (nomenclatura real: marcos B/GKO, módulos RM Multidiameter, stayplates, wedges, RS, lubricante)
export const ROXTEC_SEED = [
  ...['B 2x1', 'B 2x2', 'B 4x1', 'B 4x2', 'B 6x1', 'B 6x2', 'B 8x1', 'B 8x2'].map(n => ({ sku: n.replace(' ', '-'), name: `Marco Roxtec ${n}`, category: 'FRAME', unit: 'pza' })),
  ...['GKO 2', 'GKO 4', 'GKO 6', 'GKO 8'].map(n => ({ sku: n.replace(' ', '-'), name: `Marco Roxtec ${n}`, category: 'FRAME', unit: 'pza' })),
  ...['RM 15', 'RM 20', 'RM 30', 'RM 40', 'RM 60', 'RM 80', 'RM 90', 'RM 120'].map(n => ({ sku: n.replace(' ', '-'), name: `Módulo ${n} Multidiameter`, category: 'MODULE', unit: 'pza' })),
  ...['RM 15w40', 'RM 20w40'].map(n => ({ sku: n.replace(' ', '-'), name: `Módulo ${n} (twin)`, category: 'MODULE', unit: 'pza' })),
  ...['RM 20/0', 'RM 30/0', 'RM 40/0', 'RM 60/0'].map(n => ({ sku: n.replace(' ', '-').replace('/', '_'), name: `Módulo ciego ${n}`, category: 'MODULE', unit: 'pza' })),
  { sku: 'STAYPLATE-60', name: 'Stayplate 60', category: 'STAYPLATE', unit: 'pza' },
  { sku: 'STAYPLATE-120', name: 'Stayplate 120', category: 'STAYPLATE', unit: 'pza' },
  { sku: 'WEDGE-60', name: 'Wedge 60 (unidad de compresión)', category: 'WEDGE', unit: 'pza' },
  { sku: 'WEDGE-120', name: 'Wedge 120 (unidad de compresión)', category: 'WEDGE', unit: 'pza' },
  { sku: 'WEDGE-CLIP', name: 'Wedge clip', category: 'WEDGE', unit: 'pza' },
  ...['RS 31', 'RS 43', 'RS 50', 'RS 68', 'RS 75', 'RS 100', 'RS 125', 'RS 150'].map(n => ({ sku: n.replace(' ', '-'), name: `Sello redondo ${n}`, category: 'SEAL', unit: 'pza' })),
  { sku: 'LUB', name: 'Lubricante Roxtec (tallow)', category: 'LUBRICANT', unit: 'tubo' },
  { sku: 'IMP-19', name: 'Impermeabilizante triple acción (cubeta 19 L)', category: 'COATING', unit: 'cubeta', notes: 'Rinde ~38 m²' }
]

const STAGE_LABEL = { PENDING: 'Pendiente', DEWATERING: 'Achique y limpieza', WALL_PREP: 'Preparación de muro', FORMWORK: 'Armado y cimbrado', SEALING: 'Sellado', COATING: 'Impermeabilizante', DONE: 'Terminada' }

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const fmtDate = (d) => new Date(d).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric' })

// Historial inmutable por bóveda/obra (trazabilidad)
const trace = (req, projectId, siteId, action, detail) =>
  prisma.fieldEvent.create({ data: { projectId, siteId: siteId || null, userId: req.user.id, action, detail: String(detail).slice(0, 500) } }).catch(() => {})

// Obras visibles: el instalador solo las suyas; oficina todas las no borradas
async function projectScope(req) {
  if (!isInstaller(req)) return { deletedAt: null }
  const a = await prisma.fieldAssignment.findMany({ where: { userId: req.user.id }, select: { projectId: true } })
  return { deletedAt: null, id: { in: a.map(x => x.projectId) } }
}
async function canAccessProject(req, projectId) {
  if (!isInstaller(req)) return true
  return !!(await prisma.fieldAssignment.findFirst({ where: { userId: req.user.id, projectId } }))
}
// Carga una bóveda verificando alcance (404 si no corresponde)
async function loadSite(req, res, siteId, include = {}) {
  const site = await prisma.fieldSite.findUnique({ where: { id: siteId }, include: { project: { select: { id: true, name: true, deletedAt: true } }, ...include } })
  if (!site || site.project.deletedAt || !(await canAccessProject(req, site.projectId))) { res.status(404).json({ error: 'Bóveda no encontrada' }); return null }
  return site
}

// ----- Fotos: solo imágenes, 10 MB, nombre aleatorio -----
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic'])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR) },
    filename: (_, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED_EXT.has(ext) && ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
    cb(new Error('Solo fotos (JPG, PNG, WebP, HEIC)'))
  }
})
const handleUpload = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La foto excede 10MB' : 'Tipo de archivo no permitido' })
  next()
})

const MATERIAL_SEL = { select: { id: true, sku: true, name: true, category: true, unit: true, unitCost: true } }
const USER_SEL = { select: { id: true, name: true, phone: true } }

// ===================================================================
// CATÁLOGOS
// ===================================================================
router.get('/meta', (req, res) => {
  res.json({ materialCategories: MATERIAL_CATEGORIES, siteTypes: SITE_TYPES, stages: STAGES, infiltrations: INFILTRATIONS, photoKinds: PHOTO_KINDS, logKinds: LOG_KINDS })
})

// ----- Material (catálogo ROXTEC) -----
router.get('/materials', async (req, res) => {
  try {
    const where = req.query.all === '1' && !isInstaller(req) ? {} : { isActive: true }
    const materials = await prisma.fieldMaterial.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] })
    res.json(isInstaller(req) ? materials.map(({ unitCost, currency, notes, ...m }) => m) : materials) // el instalador no ve costos
  } catch { res.status(500).json({ error: 'Error al obtener materiales' }) }
})

router.post('/materials', requireOffice, async (req, res) => {
  try {
    const name = clean(req.body.name, 120)
    if (!name) return res.status(400).json({ error: 'El material necesita nombre' })
    const unitCost = num(req.body.unitCost ?? 0, { min: 0, max: 1e9 })
    if (unitCost === null) return res.status(400).json({ error: 'Costo inválido' })
    const m = await prisma.fieldMaterial.create({
      data: {
        name, sku: clean(req.body.sku, 40) || null,
        category: MATERIAL_CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER',
        unit: clean(req.body.unit, 20) || 'pza', unitCost,
        currency: req.body.currency === 'USD' ? 'USD' : 'MXN',
        notes: clean(req.body.notes, 300) || null
      }
    })
    await logActivity({ userId: req.user.id, action: 'field_material', detail: `agregó «${m.name}» al catálogo de material de campo` })
    res.status(201).json(m)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ese SKU ya existe' })
    console.error('Error crear material:', err.message)
    res.status(500).json({ error: 'Error al crear el material' })
  }
})

// POST /api/field/materials/seed — precarga el catálogo ROXTEC (solo agrega los SKU que falten)
router.post('/materials/seed', requireOffice, async (req, res) => {
  try {
    const existing = new Set((await prisma.fieldMaterial.findMany({ select: { sku: true } })).map(m => m.sku))
    const toCreate = ROXTEC_SEED.filter(m => !existing.has(m.sku))
    if (toCreate.length) await prisma.fieldMaterial.createMany({ data: toCreate.map(m => ({ ...m, unitCost: 0 })) })
    await logActivity({ userId: req.user.id, action: 'field_material', detail: `precargó ${toCreate.length} productos ROXTEC en el catálogo` })
    res.json({ created: toCreate.length, skipped: ROXTEC_SEED.length - toCreate.length })
  } catch (err) {
    console.error('Error seed catálogo:', err.message)
    res.status(500).json({ error: 'Error al precargar el catálogo' })
  }
})

router.patch('/materials/:id', requireOffice, async (req, res) => {
  try {
    const data = {}
    if (req.body.name !== undefined) { const v = clean(req.body.name, 120); if (!v) return res.status(400).json({ error: 'Nombre requerido' }); data.name = v }
    if (req.body.sku !== undefined) data.sku = clean(req.body.sku, 40) || null
    if (req.body.category !== undefined && MATERIAL_CATEGORIES.includes(req.body.category)) data.category = req.body.category
    if (req.body.unit !== undefined) data.unit = clean(req.body.unit, 20) || 'pza'
    if (req.body.unitCost !== undefined) { const n = num(req.body.unitCost, { min: 0, max: 1e9 }); if (n === null) return res.status(400).json({ error: 'Costo inválido' }); data.unitCost = n }
    if (req.body.currency !== undefined) data.currency = req.body.currency === 'USD' ? 'USD' : 'MXN'
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive
    if (req.body.notes !== undefined) data.notes = clean(req.body.notes, 300) || null
    res.json(await prisma.fieldMaterial.update({ where: { id: req.params.id }, data }))
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ese SKU ya existe' })
    res.status(500).json({ error: 'Error al actualizar' })
  }
})

// ===================================================================
// OBRAS (proyectos con estructura de campo)
// ===================================================================

// GET /api/field/projects — obras con resumen de avance y costo (el instalador solo las suyas, sin costos)
router.get('/projects', async (req, res) => {
  try {
    const where = await projectScope(req)
    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true, name: true, client: true, address: true, status: true, color: true, startDate: true, endDate: true,
        fieldSites: { select: { id: true, status: true, stage: true } },
        fieldAssignments: { include: { user: USER_SEL } },
        _count: { select: { fieldReports: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    // Costo consumido por obra (solo oficina)
    let costByProject = {}
    if (!isInstaller(req)) {
      const usages = await prisma.fieldMaterialUsage.findMany({
        where: { report: { status: { in: ['SUBMITTED', 'APPROVED'] }, projectId: { in: projects.map(p => p.id) } } },
        select: { quantity: true, unitCost: true, report: { select: { projectId: true } } }
      })
      for (const u of usages) costByProject[u.report.projectId] = (costByProject[u.report.projectId] || 0) + u.quantity * u.unitCost
    }
    const onlyWithField = req.query.all !== '1'
    const out = projects
      .filter(p => !onlyWithField || p.fieldSites.length > 0 || p.fieldAssignments.length > 0 || isInstaller(req))
      .map(p => ({
        id: p.id, name: p.name, client: p.client, address: p.address, status: p.status, color: p.color, startDate: p.startDate, endDate: p.endDate,
        sitesTotal: p.fieldSites.length,
        sitesDone: p.fieldSites.filter(s => s.status === 'DONE').length,
        sitesInProgress: p.fieldSites.filter(s => s.status === 'IN_PROGRESS').length,
        reportsCount: p._count.fieldReports,
        installers: p.fieldAssignments.map(a => ({ ...a.user, isLead: a.isLead })),
        ...(isInstaller(req) ? {} : { costConsumed: costByProject[p.id] || 0 })
      }))
    res.json(out)
  } catch (err) {
    console.error('Error obras de campo:', err.message)
    res.status(500).json({ error: 'Error al obtener obras' })
  }
})

// GET /api/field/projects/:id — detalle: bóvedas con ventanas, instaladores, material asignado vs consumido
router.get('/projects/:id', async (req, res) => {
  try {
    if (!(await canAccessProject(req, req.params.id))) return res.status(404).json({ error: 'Obra no encontrada' })
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: {
        id: true, name: true, client: true, address: true, status: true, color: true, description: true, startDate: true, endDate: true,
        fieldSites: {
          include: {
            openings: { orderBy: { position: 'asc' } },
            _count: { select: { reports: true, photos: true, logs: true } }
          },
          orderBy: { position: 'asc' }
        },
        fieldAssignments: { include: { user: USER_SEL } }
      }
    })
    if (!project) return res.status(404).json({ error: 'Obra no encontrada' })
    // Bitácora bloqueante abierta por bóveda (para marcar en rojo)
    const blocking = await prisma.fieldLog.findMany({ where: { projectId: project.id, blocking: true, resolvedAt: null }, select: { siteId: true } })
    const blockedSites = new Set(blocking.map(b => b.siteId))
    for (const s of project.fieldSites) s.hasBlockingIssue = blockedSites.has(s.id)

    const out = { ...project, installers: project.fieldAssignments.map(a => ({ ...a.user, isLead: a.isLead, assignmentId: a.id })) }
    delete out.fieldAssignments

    if (!isInstaller(req)) {
      // Material asignado vs consumido, con costo
      const [allocations, usages] = await Promise.all([
        prisma.fieldAllocation.findMany({ where: { projectId: project.id }, include: { material: MATERIAL_SEL } }),
        prisma.fieldMaterialUsage.findMany({ where: { report: { projectId: project.id, status: { in: ['SUBMITTED', 'APPROVED'] } } }, include: { material: MATERIAL_SEL } })
      ])
      const byMat = {}
      for (const a of allocations) { const k = a.materialId; byMat[k] = byMat[k] || { material: a.material, allocated: 0, used: 0, cost: 0 }; byMat[k].allocated += a.quantity }
      for (const u of usages) { const k = u.materialId; byMat[k] = byMat[k] || { material: u.material, allocated: 0, used: 0, cost: 0 }; byMat[k].used += u.quantity; byMat[k].cost += u.quantity * u.unitCost }
      out.materials = Object.values(byMat).map(m => ({ ...m, remaining: m.allocated - m.used })).sort((a, b) => b.cost - a.cost)
      out.costConsumed = out.materials.reduce((s, m) => s + m.cost, 0)
      out.costAllocated = out.materials.reduce((s, m) => s + m.allocated * (m.material.unitCost || 0), 0)
    }
    res.json(out)
  } catch (err) {
    console.error('Error detalle obra:', err.message)
    res.status(500).json({ error: 'Error al obtener la obra' })
  }
})

// ----- Instaladores asignados (oficina) -----
router.get('/installers', requireOffice, async (req, res) => {
  try {
    const users = await prisma.user.findMany({ where: { role: 'INSTALLER', isActive: true }, select: { id: true, name: true, phone: true, email: true, fieldAssignments: { select: { projectId: true } } }, orderBy: { name: 'asc' } })
    res.json(users)
  } catch { res.status(500).json({ error: 'Error al obtener instaladores' }) }
})

router.post('/projects/:id/installers', requireOffice, async (req, res) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: clean(req.body.userId, 40), role: 'INSTALLER', isActive: true }, select: { id: true, name: true } })
    if (!user) return res.status(400).json({ error: 'Instalador no válido' })
    const project = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true, name: true } })
    if (!project) return res.status(404).json({ error: 'Obra no encontrada' })
    const a = await prisma.fieldAssignment.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      update: { isLead: !!req.body.isLead },
      create: { projectId: project.id, userId: user.id, isLead: !!req.body.isLead },
      include: { user: USER_SEL }
    })
    await notify({ userId: user.id, type: 'field_assigned', title: 'Nueva obra asignada', message: project.name, link: `/campo/${project.id}` })
    await logActivity({ userId: req.user.id, projectId: project.id, action: 'field_assign', detail: `asignó a ${user.name} como instalador${req.body.isLead ? ' responsable' : ''} de «${project.name}»` })
    res.status(201).json(a)
  } catch (err) {
    console.error('Error asignar instalador:', err.message)
    res.status(500).json({ error: 'Error al asignar' })
  }
})

router.delete('/projects/:id/installers/:userId', requireOffice, async (req, res) => {
  try {
    await prisma.fieldAssignment.deleteMany({ where: { projectId: req.params.id, userId: req.params.userId } })
    res.json({ message: 'Instalador retirado de la obra' })
  } catch { res.status(500).json({ error: 'Error al retirar' }) }
})

// ----- Material asignado a la obra (oficina) -----
router.post('/projects/:id/allocations', requireOffice, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Obra no encontrada' })
    const material = await prisma.fieldMaterial.findUnique({ where: { id: clean(req.body.materialId, 40) } })
    if (!material) return res.status(400).json({ error: 'Material no válido' })
    const quantity = num(req.body.quantity, { min: -1e6, max: 1e6 })
    if (quantity === null || quantity === 0) return res.status(400).json({ error: 'Cantidad inválida' })
    const a = await prisma.fieldAllocation.create({ data: { projectId: project.id, materialId: material.id, quantity, note: clean(req.body.note, 200) || null }, include: { material: MATERIAL_SEL } })
    await logActivity({ userId: req.user.id, projectId: project.id, action: 'field_allocation', detail: `asignó ${quantity} ${material.unit} de «${material.name}» a la obra` })
    res.status(201).json(a)
  } catch (err) {
    console.error('Error asignar material:', err.message)
    res.status(500).json({ error: 'Error al asignar material' })
  }
})

// ===================================================================
// BÓVEDAS / SUBESTACIONES y VENTANAS
// ===================================================================
function parseSiteFields(body, partial = false) {
  const out = {}
  if (!partial || body.code !== undefined) { const v = clean(body.code, 60); if (!v) return { error: 'La bóveda necesita un código (ej. "Bóveda 7")' }; out.code = v }
  if (body.name !== undefined) out.name = clean(body.name, 160) || null
  if (body.address !== undefined) out.address = clean(body.address, 200) || null
  if (body.siteType !== undefined) out.siteType = SITE_TYPES.includes(body.siteType) ? body.siteType : 'VAULT'
  if (body.equipment !== undefined) out.equipment = clean(body.equipment, 160) || null
  if (body.infiltration !== undefined) {
    const arr = Array.isArray(body.infiltration) ? body.infiltration : String(body.infiltration || '').split(',')
    out.infiltration = arr.map(x => x.trim()).filter(x => INFILTRATIONS.includes(x)).join(',') || null
  }
  if (body.notes !== undefined) out.notes = clean(body.notes, 1000) || null
  for (const k of ['latitude', 'longitude']) if (body[k] !== undefined) { const n = num(body[k], { min: -180, max: 180 }); out[k] = n }
  if (body.stage !== undefined && STAGES.includes(body.stage)) out.stage = body.stage
  if (body.status !== undefined && ['PENDING', 'IN_PROGRESS', 'DONE'].includes(body.status)) out.status = body.status
  // Programa de obra
  for (const k of ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd']) {
    if (body[k] !== undefined) { if (body[k] === null || body[k] === '') out[k] = null; else { const d = parseDate(body[k]); if (!d) return { error: `Fecha inválida en ${k}` }; out[k] = d } }
  }
  if (body.plannedDays !== undefined) { const n = body.plannedDays === '' || body.plannedDays === null ? null : num(body.plannedDays, { min: 0, max: 3650 }); if (n === null && body.plannedDays) return { error: 'Días planeados inválidos' }; out.plannedDays = n !== null ? Math.round(n) : null }
  if (out.plannedStart && out.plannedEnd && out.plannedEnd < out.plannedStart) return { error: 'La fecha fin planeada no puede ser antes del inicio' }
  return { out }
}

router.post('/projects/:id/sites', async (req, res) => {
  try {
    if (!(await canAccessProject(req, req.params.id))) return res.status(404).json({ error: 'Obra no encontrada' })
    const project = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Obra no encontrada' })
    const f = parseSiteFields(req.body)
    if (f.error) return res.status(400).json({ error: f.error })
    const max = await prisma.fieldSite.aggregate({ where: { projectId: project.id }, _max: { position: true } })
    const openings = Array.isArray(req.body.openings) ? req.body.openings.map((o, i) => ({ label: clean(o.label || o, 120), description: clean(o.description, 300) || null, position: i })).filter(o => o.label) : []
    const site = await prisma.fieldSite.create({
      data: { ...f.out, projectId: project.id, createdById: req.user.id, position: (max._max.position ?? -1) + 1, ...(openings.length && { openings: { create: openings } }) },
      include: { openings: { orderBy: { position: 'asc' } } }
    })
    await trace(req, project.id, site.id, 'SITE_CREATED', `${req.user.name} dio de alta ${site.code}${site.name ? ` (${site.name})` : ''}${site.latitude ? ' con ubicación GPS' : ''}`)
    await logActivity({ userId: req.user.id, projectId: project.id, action: 'field_site', detail: `dio de alta la bóveda ${site.code}` })
    res.status(201).json(site)
  } catch (err) {
    console.error('Error crear bóveda:', err.message)
    res.status(500).json({ error: 'Error al crear la bóveda' })
  }
})

// Oficina edita todo; el instalador solo puede avanzar etapa/estado y notas de campo
router.patch('/sites/:id', async (req, res) => {
  try {
    const site = await loadSite(req, res, req.params.id)
    if (!site) return
    // El instalador puede editar lo de campo (ubicación, equipo, filtración, etapa, programa); el código solo si él la creó
    const b = req.body
    const body = isInstaller(req)
      ? { stage: b.stage, status: b.status, notes: b.notes, equipment: b.equipment, infiltration: b.infiltration, name: b.name, address: b.address, latitude: b.latitude, longitude: b.longitude, siteType: b.siteType,
          plannedStart: b.plannedStart, plannedEnd: b.plannedEnd, plannedDays: b.plannedDays, ...(site.createdById === req.user.id && { code: b.code }) }
      : b
    const f = parseSiteFields(body, true)
    if (f.error) return res.status(400).json({ error: f.error })
    if (f.out.stage === 'DONE') { f.out.status = 'DONE'; if (!site.actualEnd) f.out.actualEnd = new Date() }
    else if (f.out.stage && f.out.stage !== 'PENDING') { if (!f.out.status) f.out.status = 'IN_PROGRESS'; if (!site.actualStart) f.out.actualStart = new Date(); if (site.status === 'DONE') f.out.actualEnd = null }
    const updated = await prisma.fieldSite.update({ where: { id: site.id }, data: f.out, include: { openings: { orderBy: { position: 'asc' } } } })
    if (f.out.stage && f.out.stage !== site.stage) {
      await trace(req, site.projectId, site.id, 'STAGE', `${req.user.name}: etapa ${STAGE_LABEL[site.stage]} → ${STAGE_LABEL[f.out.stage]}`)
      await logActivity({ userId: req.user.id, projectId: site.projectId, action: 'field_stage', detail: `${site.code}: etapa → ${STAGE_LABEL[f.out.stage]}` })
    }
    const sched = ['plannedStart', 'plannedEnd', 'plannedDays', 'actualStart', 'actualEnd'].filter(k => f.out[k] !== undefined && String(f.out[k]) !== String(site[k]))
    if (sched.length) await trace(req, site.projectId, site.id, 'SCHEDULE', `${req.user.name} ajustó el programa: ${sched.map(k => `${k}=${f.out[k] instanceof Date ? f.out[k].toISOString().slice(0, 10) : f.out[k]}`).join(', ')}`)
    if (['name', 'address', 'latitude'].some(k => f.out[k] !== undefined && f.out[k] !== site[k]))
      await trace(req, site.projectId, site.id, 'SITE_UPDATED', `${req.user.name} actualizó datos de la bóveda${f.out.latitude !== undefined ? ' (ubicación GPS)' : ''}`)
    res.json(updated)
  } catch (err) {
    console.error('Error editar bóveda:', err.message)
    res.status(500).json({ error: 'Error al actualizar' })
  }
})

router.delete('/sites/:id', requireAdmin, async (req, res) => {
  try {
    const s = await prisma.fieldSite.delete({ where: { id: req.params.id } })
    await logActivity({ userId: req.user.id, projectId: s.projectId, action: 'field_site_deleted', detail: `eliminó la bóveda ${s.code} con sus reportes y fotos` })
    res.json({ message: 'Bóveda eliminada' })
  } catch { res.status(500).json({ error: 'Error al eliminar' }) }
})

// Ventanas: oficina o instalador (en campo descubren ventanas no previstas)
router.post('/sites/:id/openings', async (req, res) => {
  try {
    const site = await loadSite(req, res, req.params.id)
    if (!site) return
    const label = clean(req.body.label, 120)
    if (!label) return res.status(400).json({ error: 'La ventana necesita un nombre' })
    const max = await prisma.fieldOpening.aggregate({ where: { siteId: site.id }, _max: { position: true } })
    const o = await prisma.fieldOpening.create({ data: { siteId: site.id, label, description: clean(req.body.description, 300) || null, position: (max._max.position ?? -1) + 1 } })
    await trace(req, site.projectId, site.id, 'OPENING', `${req.user.name} agregó la ventana «${label}»`)
    res.status(201).json(o)
  } catch { res.status(500).json({ error: 'Error al crear la ventana' }) }
})

router.patch('/openings/:id', async (req, res) => {
  try {
    const o = await prisma.fieldOpening.findUnique({ where: { id: req.params.id }, select: { id: true, siteId: true } })
    if (!o || !(await loadSite(req, res, o.siteId))) return
    const data = {}
    if (req.body.label !== undefined) { const v = clean(req.body.label, 120); if (!v) return res.status(400).json({ error: 'Nombre requerido' }); data.label = v }
    if (req.body.description !== undefined) data.description = clean(req.body.description, 300) || null
    if (req.body.status !== undefined && ['PENDING', 'SEALED'].includes(req.body.status)) data.status = req.body.status
    res.json(await prisma.fieldOpening.update({ where: { id: o.id }, data }))
  } catch { res.status(500).json({ error: 'Error al actualizar' }) }
})

router.delete('/openings/:id', requireOffice, async (req, res) => {
  try { await prisma.fieldOpening.delete({ where: { id: req.params.id } }); res.json({ message: 'Ventana eliminada' }) }
  catch { res.status(500).json({ error: 'Error al eliminar' }) }
})

// GET /api/field/sites/:id — ficha completa de la bóveda (reportes, fotos, material usado)
router.get('/sites/:id', async (req, res) => {
  try {
    const site = await loadSite(req, res, req.params.id, {
      openings: { orderBy: { position: 'asc' } },
      reports: { include: { author: USER_SEL, usages: { include: { material: MATERIAL_SEL, opening: { select: { id: true, label: true } } } }, _count: { select: { photos: true } } }, orderBy: { reportDate: 'desc' } },
      photos: { include: { uploadedBy: USER_SEL, opening: { select: { id: true, label: true } } }, orderBy: { takenAt: 'desc' } },
      logs: { include: { author: USER_SEL }, orderBy: { logDate: 'desc' }, take: 100 },
      attendance: { include: { author: USER_SEL }, orderBy: { workDate: 'desc' }, take: 200 },
      events: { include: { user: USER_SEL }, orderBy: { createdAt: 'desc' }, take: 100 }
    })
    if (!site) return
    // Días reales trabajados (días distintos con reporte, bitácora o asistencia)
    const days = new Set()
    for (const r of site.reports) if (r.status !== 'DRAFT') days.add(new Date(r.reportDate).toISOString().slice(0, 10))
    for (const l of site.logs) days.add(new Date(l.logDate).toISOString().slice(0, 10))
    for (const a of site.attendance) days.add(new Date(a.workDate).toISOString().slice(0, 10))
    site.actualDays = days.size
    site.hoursWorked = site.attendance.reduce((s, a) => s + (a.hours || 0), 0)
    // Instalador: no ve costos ni reportes borrador de otros
    if (isInstaller(req)) {
      site.reports = site.reports.filter(r => r.status !== 'DRAFT' || r.authorId === req.user.id)
      for (const r of site.reports) for (const u of r.usages) { delete u.unitCost; delete u.material.unitCost }
    } else {
      // Totales de material por bóveda
      const byMat = {}
      for (const r of site.reports) if (r.status !== 'DRAFT' && r.status !== 'REJECTED') for (const u of r.usages) {
        byMat[u.materialId] = byMat[u.materialId] || { material: u.material, used: 0, cost: 0 }
        byMat[u.materialId].used += u.quantity; byMat[u.materialId].cost += u.quantity * u.unitCost
      }
      site.materials = Object.values(byMat).sort((a, b) => b.cost - a.cost)
      site.costConsumed = site.materials.reduce((s, m) => s + m.cost, 0)
    }
    res.json(site)
  } catch (err) {
    console.error('Error ficha bóveda:', err.message)
    res.status(500).json({ error: 'Error al obtener la bóveda' })
  }
})

// ===================================================================
// REPORTES DIARIOS
// ===================================================================
const REPORT_INCLUDE = {
  author: USER_SEL, reviewer: USER_SEL,
  site: { select: { id: true, code: true, name: true, projectId: true } },
  project: { select: { id: true, name: true } },
  usages: { include: { material: MATERIAL_SEL, opening: { select: { id: true, label: true } } } },
  photos: { orderBy: { takenAt: 'asc' } }
}
const stripCosts = (r) => ({ ...r, usages: r.usages.map(({ unitCost, ...u }) => ({ ...u, material: { ...u.material, unitCost: undefined } })) })

async function parseUsages(raw, siteId) {
  if (!Array.isArray(raw)) return { usages: [] }
  const usages = []
  for (const [i, u] of raw.entries()) {
    const material = await prisma.fieldMaterial.findUnique({ where: { id: clean(u.materialId, 40) } })
    if (!material) return { error: `Material no válido en la línea ${i + 1}` }
    const quantity = num(u.quantity, { min: 0.001, max: 1e6 })
    if (quantity === null) return { error: `Cantidad inválida para «${material.name}»` }
    let openingId = null
    if (u.openingId) {
      const o = await prisma.fieldOpening.findFirst({ where: { id: clean(u.openingId, 40), siteId }, select: { id: true } })
      if (!o) return { error: 'Ventana no válida' }
      openingId = o.id
    }
    usages.push({ materialId: material.id, quantity, unitCost: material.unitCost, openingId, note: clean(u.note, 200) || null })
  }
  return { usages }
}

// GET /api/field/reports?projectId=&siteId=&status=&from=&to=&authorId=
router.get('/reports', async (req, res) => {
  try {
    const scope = await projectScope(req)
    const where = { project: scope }
    if (req.query.projectId) where.projectId = clean(req.query.projectId, 40)
    if (req.query.siteId) where.siteId = clean(req.query.siteId, 40)
    if (['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(req.query.status)) where.status = req.query.status
    else if (req.query.status === 'PENDING_REVIEW') where.status = 'SUBMITTED'
    if (isInstaller(req)) where.OR = [{ status: { not: 'DRAFT' } }, { authorId: req.user.id }]
    else if (req.query.authorId) where.authorId = clean(req.query.authorId, 40)
    const from = parseDate(req.query.from), to = parseDate(req.query.to)
    if (from || to) where.reportDate = { ...(from && { gte: from }), ...(to && { lte: to }) }
    const reports = await prisma.fieldReport.findMany({ where, include: REPORT_INCLUDE, orderBy: { reportDate: 'desc' }, take: 300 })
    res.json(isInstaller(req) ? reports.map(stripCosts) : reports)
  } catch (err) {
    console.error('Error listar reportes:', err.message)
    res.status(500).json({ error: 'Error al obtener reportes' })
  }
})

router.get('/reports/:id', async (req, res) => {
  try {
    const r = await prisma.fieldReport.findUnique({ where: { id: req.params.id }, include: REPORT_INCLUDE })
    if (!r || !(await canAccessProject(req, r.projectId))) return res.status(404).json({ error: 'Reporte no encontrado' })
    if (isInstaller(req) && r.status === 'DRAFT' && r.authorId !== req.user.id) return res.status(404).json({ error: 'Reporte no encontrado' })
    res.json(isInstaller(req) ? stripCosts(r) : r)
  } catch { res.status(500).json({ error: 'Error al obtener el reporte' }) }
})

// POST /api/field/reports — crea el reporte del día (borrador editable hasta enviarlo)
router.post('/reports', async (req, res) => {
  try {
    const site = await loadSite(req, res, clean(req.body.siteId, 40))
    if (!site) return
    const summary = clean(req.body.summary, 3000)
    if (!summary) return res.status(400).json({ error: 'Describe el trabajo realizado' })
    const stage = STAGES.includes(req.body.stage) ? req.body.stage : site.stage
    const parsed = await parseUsages(req.body.usages, site.id)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const reportDate = parseDate(req.body.reportDate) || new Date()
    if (reportDate.getTime() > Date.now() + 86400000) return res.status(400).json({ error: 'La fecha no puede ser futura' })
    const hoursWorked = req.body.hoursWorked !== undefined && req.body.hoursWorked !== '' ? num(req.body.hoursWorked, { min: 0, max: 24 }) : null
    const crewSize = req.body.crewSize !== undefined && req.body.crewSize !== '' ? num(req.body.crewSize, { min: 1, max: 100 }) : null

    let report
    for (let attempt = 0; attempt < 5; attempt++) {
      const folio = await nextFolio('fieldReport', 'RPT')
      try {
        report = await prisma.fieldReport.create({
          data: {
            folio, reportDate, stage, summary, issues: clean(req.body.issues, 2000) || null,
            hoursWorked, crewSize: crewSize !== null ? Math.round(crewSize) : null,
            projectId: site.projectId, siteId: site.id, authorId: req.user.id,
            status: req.body.submit ? 'SUBMITTED' : 'DRAFT', submittedAt: req.body.submit ? new Date() : null,
            usages: { create: parsed.usages }
          },
          include: REPORT_INCLUDE
        })
        break
      } catch (e) { if (e.code === 'P2002' && attempt < 4) continue; throw e }
    }
    // La bóveda avanza a la etapa reportada
    if (stage !== site.stage || site.status === 'PENDING') {
      await prisma.fieldSite.update({ where: { id: site.id }, data: { stage, status: stage === 'DONE' ? 'DONE' : 'IN_PROGRESS', ...(stage === 'DONE' && !site.actualEnd && { actualEnd: reportDate }), ...(!site.actualStart && { actualStart: reportDate }) } })
      if (stage !== site.stage) await trace(req, site.projectId, site.id, 'STAGE', `${req.user.name}: etapa ${STAGE_LABEL[site.stage]} → ${STAGE_LABEL[stage]} (reporte ${report.folio})`)
    }
    if (req.body.submit) await afterSubmit(report, req)
    res.status(201).json(isInstaller(req) ? stripCosts(report) : report)
  } catch (err) {
    console.error('Error crear reporte:', err.message)
    res.status(500).json({ error: 'Error al crear el reporte' })
  }
})

async function afterSubmit(report, req) {
  await trace(req, report.projectId, report.siteId, 'REPORT_SUBMITTED', `${req.user.name} envió el reporte ${report.folio} (${STAGE_LABEL[report.stage]}, ${report.usages.length} materiales, ${report.usages.reduce((s, u) => s + u.quantity, 0)} pzas)`)
  await prisma.fieldSite.updateMany({ where: { id: report.siteId, actualStart: null }, data: { actualStart: report.reportDate } })
  await logActivity({ userId: req.user.id, projectId: report.projectId, action: 'field_report', detail: `envió el reporte ${report.folio} de ${report.site.code} (${STAGE_LABEL[report.stage]}, ${report.usages.length} materiales)` })
  const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true }, select: { id: true } })
  for (const a of admins) if (a.id !== req.user.id)
    await notify({ userId: a.id, type: 'field_report', title: `Reporte ${report.folio} · ${report.site.code}`, message: `${report.author.name}: ${report.summary.slice(0, 100)}`, link: `/field/reports/${report.id}` })
}

// PATCH /api/field/reports/:id — editar borrador (autor) · enviar (submit) · revisar (oficina)
router.patch('/reports/:id', async (req, res) => {
  try {
    const r = await prisma.fieldReport.findUnique({ where: { id: req.params.id }, include: REPORT_INCLUDE })
    if (!r || !(await canAccessProject(req, r.projectId))) return res.status(404).json({ error: 'Reporte no encontrado' })
    const data = {}

    // ---- Revisión (solo oficina) ----
    if (req.body.review !== undefined) {
      if (isInstaller(req)) return res.status(403).json({ error: 'Solo oficina revisa reportes' })
      if (!['APPROVED', 'REJECTED'].includes(req.body.review)) return res.status(400).json({ error: 'Revisión inválida' })
      if (r.status !== 'SUBMITTED' && !(r.status === 'APPROVED' && req.body.review === 'REJECTED')) return res.status(400).json({ error: 'El reporte no está enviado' })
      data.status = req.body.review; data.reviewedAt = new Date(); data.reviewerId = req.user.id; data.reviewNote = clean(req.body.reviewNote, 1000) || null
      const updated = await prisma.fieldReport.update({ where: { id: r.id }, data, include: REPORT_INCLUDE })
      await trace(req, r.projectId, r.siteId, 'REPORT_REVIEWED', `${req.user.name} ${req.body.review === 'APPROVED' ? 'aprobó' : 'devolvió'} el reporte ${r.folio}${data.reviewNote ? `: ${data.reviewNote}` : ''}`)
      await notify({ userId: r.authorId, type: 'field_review', title: `Reporte ${r.folio} ${req.body.review === 'APPROVED' ? 'aprobado ✅' : 'devuelto ↩️'}`, message: data.reviewNote || (req.body.review === 'APPROVED' ? 'Buen trabajo' : 'Corrige y vuelve a enviar'), link: `/campo/reportes/${r.id}` })
      await logActivity({ userId: req.user.id, projectId: r.projectId, action: 'field_review', detail: `${req.body.review === 'APPROVED' ? 'aprobó' : 'devolvió'} el reporte ${r.folio}${data.reviewNote ? `: ${data.reviewNote}` : ''}` })
      return res.json(updated)
    }

    // ---- Edición: solo el autor y solo en borrador o devuelto ----
    if (r.authorId !== req.user.id && !isAdmin(req)) return res.status(403).json({ error: 'Solo el autor puede editar su reporte' })
    if (!['DRAFT', 'REJECTED'].includes(r.status)) return res.status(400).json({ error: 'Un reporte enviado ya no se puede editar (trazabilidad)' })

    if (req.body.summary !== undefined) { const v = clean(req.body.summary, 3000); if (!v) return res.status(400).json({ error: 'Describe el trabajo realizado' }); data.summary = v }
    if (req.body.issues !== undefined) data.issues = clean(req.body.issues, 2000) || null
    if (req.body.stage !== undefined && STAGES.includes(req.body.stage)) data.stage = req.body.stage
    if (req.body.reportDate !== undefined) { const d = parseDate(req.body.reportDate); if (!d) return res.status(400).json({ error: 'Fecha inválida' }); data.reportDate = d }
    if (req.body.hoursWorked !== undefined) data.hoursWorked = req.body.hoursWorked === '' ? null : num(req.body.hoursWorked, { min: 0, max: 24 })
    if (req.body.crewSize !== undefined) { const n = req.body.crewSize === '' ? null : num(req.body.crewSize, { min: 1, max: 100 }); data.crewSize = n !== null ? Math.round(n) : null }
    let usageOps = {}
    if (req.body.usages !== undefined) {
      const parsed = await parseUsages(req.body.usages, r.siteId)
      if (parsed.error) return res.status(400).json({ error: parsed.error })
      usageOps = { usages: { deleteMany: {}, create: parsed.usages } }
    }
    if (req.body.submit) { data.status = 'SUBMITTED'; data.submittedAt = new Date(); data.reviewNote = null }

    const updated = await prisma.fieldReport.update({ where: { id: r.id }, data: { ...data, ...usageOps }, include: REPORT_INCLUDE })
    if (data.stage && data.stage !== updated.site.stage) {
      await prisma.fieldSite.update({ where: { id: r.siteId }, data: { stage: data.stage, status: data.stage === 'DONE' ? 'DONE' : 'IN_PROGRESS', ...(data.stage === 'DONE' && { actualEnd: updated.reportDate }) } })
      await trace(req, r.projectId, r.siteId, 'STAGE', `${req.user.name}: etapa → ${STAGE_LABEL[data.stage]} (reporte ${r.folio})`)
    }
    if (req.body.submit) await afterSubmit(updated, req)
    res.json(isInstaller(req) ? stripCosts(updated) : updated)
  } catch (err) {
    console.error('Error editar reporte:', err.message)
    res.status(500).json({ error: 'Error al actualizar el reporte' })
  }
})

router.delete('/reports/:id', async (req, res) => {
  try {
    const r = await prisma.fieldReport.findUnique({ where: { id: req.params.id } })
    if (!r || !(await canAccessProject(req, r.projectId))) return res.status(404).json({ error: 'Reporte no encontrado' })
    // El autor borra sus borradores; eliminar un reporte enviado solo SUPER_ADMIN (y queda en bitácora)
    if (r.status === 'DRAFT' && r.authorId === req.user.id) { await prisma.fieldReport.delete({ where: { id: r.id } }); return res.json({ message: 'Borrador eliminado' }) }
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo el super administrador puede eliminar reportes enviados' })
    await prisma.fieldReport.delete({ where: { id: r.id } })
    await logActivity({ userId: req.user.id, projectId: r.projectId, action: 'field_report_deleted', detail: `eliminó el reporte ${r.folio}` })
    res.json({ message: 'Reporte eliminado' })
  } catch { res.status(500).json({ error: 'Error al eliminar' }) }
})

// ===================================================================
// FOTOS
// ===================================================================
// POST /api/field/sites/:id/photos — multipart 'file' + kind, caption, reportId, openingId, lat, lng
router.post('/sites/:id/photos', async (req, res, next) => {
  if (!(await loadSite(req, res, req.params.id))) return
  next()
}, handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Foto requerida' })
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`
    let reportId = null
    if (req.body.reportId) {
      const r = await prisma.fieldReport.findFirst({ where: { id: clean(req.body.reportId, 40), siteId: req.params.id }, select: { id: true, status: true, authorId: true } })
      if (!r) return res.status(400).json({ error: 'Reporte no válido' })
      if (!['DRAFT', 'REJECTED'].includes(r.status) && !isAdmin(req)) return res.status(400).json({ error: 'El reporte ya fue enviado' })
      reportId = r.id
    }
    let openingId = null
    if (req.body.openingId) {
      const o = await prisma.fieldOpening.findFirst({ where: { id: clean(req.body.openingId, 40), siteId: req.params.id }, select: { id: true } })
      if (o) openingId = o.id
    }
    const photo = await prisma.fieldPhoto.create({
      data: {
        siteId: req.params.id, reportId, openingId, uploadedById: req.user.id,
        url: `${baseUrl}/uploads/${req.file.filename}`, size: req.file.size, mimeType: req.file.mimetype,
        kind: PHOTO_KINDS.includes(req.body.kind) ? req.body.kind : 'DURING',
        caption: clean(req.body.caption, 200) || null,
        latitude: num(req.body.latitude, { min: -90, max: 90 }), longitude: num(req.body.longitude, { min: -180, max: 180 }),
        takenAt: parseDate(req.body.takenAt) || new Date()
      }
    })
    res.status(201).json(photo)
  } catch (err) {
    console.error('Error foto de campo:', err.message)
    res.status(500).json({ error: 'Error al subir la foto' })
  }
})

router.delete('/photos/:id', async (req, res) => {
  try {
    const p = await prisma.fieldPhoto.findUnique({ where: { id: req.params.id }, include: { report: { select: { status: true } } } })
    if (!p || !(await loadSite(req, res, p.siteId))) return
    const own = p.uploadedById === req.user.id && (!p.report || ['DRAFT', 'REJECTED'].includes(p.report.status))
    if (!own && !isAdmin(req)) return res.status(403).json({ error: 'No puedes eliminar esta foto' })
    await prisma.fieldPhoto.delete({ where: { id: p.id } })
    res.json({ message: 'Foto eliminada' })
  } catch { res.status(500).json({ error: 'Error al eliminar' }) }
})

// ===================================================================
// BITÁCORA DIARIA (notas, problemas, retrasos — por obra o por bóveda)
// ===================================================================
const LOG_INCLUDE = { author: USER_SEL, site: { select: { id: true, code: true, name: true } }, project: { select: { id: true, name: true } } }

// GET /api/field/logs?projectId=&siteId=&kind=&open=1&from=&to=
router.get('/logs', async (req, res) => {
  try {
    const where = { project: await projectScope(req) }
    if (req.query.projectId) where.projectId = clean(req.query.projectId, 40)
    if (req.query.siteId) where.siteId = clean(req.query.siteId, 40)
    if (LOG_KINDS.includes(req.query.kind)) where.kind = req.query.kind
    if (req.query.open === '1') { where.blocking = true; where.resolvedAt = null }
    const from = parseDate(req.query.from), to = parseDate(req.query.to)
    if (from || to) where.logDate = { ...(from && { gte: from }), ...(to && { lte: to }) }
    res.json(await prisma.fieldLog.findMany({ where, include: LOG_INCLUDE, orderBy: { logDate: 'desc' }, take: 300 }))
  } catch { res.status(500).json({ error: 'Error al obtener la bitácora' }) }
})

// POST /api/field/logs — { projectId | siteId, kind, body, blocking, logDate }
router.post('/logs', async (req, res) => {
  try {
    let projectId = clean(req.body.projectId, 40) || null, siteId = clean(req.body.siteId, 40) || null
    if (siteId) { const site = await loadSite(req, res, siteId); if (!site) return; projectId = site.projectId }
    else if (!projectId || !(await canAccessProject(req, projectId))) return res.status(404).json({ error: 'Obra no encontrada' })
    const body = clean(req.body.body, 3000)
    if (!body) return res.status(400).json({ error: 'Escribe la nota' })
    const kind = LOG_KINDS.includes(req.body.kind) ? req.body.kind : 'NOTE'
    const logDate = parseDate(req.body.logDate) || new Date()
    if (logDate.getTime() > Date.now() + 86400000) return res.status(400).json({ error: 'La fecha no puede ser futura' })
    const blocking = !!req.body.blocking && ['ISSUE', 'DELAY', 'SAFETY', 'CLIENT'].includes(kind)
    const log = await prisma.fieldLog.create({ data: { projectId, siteId, authorId: req.user.id, kind, body, blocking, logDate }, include: LOG_INCLUDE })
    if (siteId) await prisma.fieldSite.updateMany({ where: { id: siteId, actualStart: null, status: { not: 'DONE' } }, data: { actualStart: logDate, status: 'IN_PROGRESS' } })
    await trace(req, projectId, siteId, 'LOG', `${req.user.name} registró ${LOG_LABEL[kind].toLowerCase()}${blocking ? ' BLOQUEANTE' : ''}: ${body.slice(0, 120)}`)
    if (blocking || kind === 'ISSUE' || kind === 'DELAY') {
      const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true }, select: { id: true } })
      for (const a of admins) if (a.id !== req.user.id)
        await notify({ userId: a.id, type: 'field_issue', title: `${blocking ? '🛑 ' : '⚠️ '}${LOG_LABEL[kind]} en ${log.site?.code || log.project.name}`, message: `${req.user.name}: ${body.slice(0, 120)}`, link: siteId ? `/field/bovedas/${siteId}` : `/field/obras/${projectId}` })
    }
    res.status(201).json(log)
  } catch (err) {
    console.error('Error bitácora:', err.message)
    res.status(500).json({ error: 'Error al guardar la nota' })
  }
})

// PATCH /api/field/logs/:id — resolver un bloqueo (oficina o el autor)
router.patch('/logs/:id', async (req, res) => {
  try {
    const log = await prisma.fieldLog.findUnique({ where: { id: req.params.id } })
    if (!log || !(await canAccessProject(req, log.projectId))) return res.status(404).json({ error: 'Nota no encontrada' })
    const data = {}
    if (req.body.resolved !== undefined) data.resolvedAt = req.body.resolved ? new Date() : null
    if (req.body.body !== undefined && (log.authorId === req.user.id || isAdmin(req))) { const v = clean(req.body.body, 3000); if (v) data.body = v }
    const updated = await prisma.fieldLog.update({ where: { id: log.id }, data, include: LOG_INCLUDE })
    if (data.resolvedAt) await trace(req, log.projectId, log.siteId, 'LOG', `${req.user.name} resolvió el bloqueo: ${log.body.slice(0, 80)}`)
    res.json(updated)
  } catch { res.status(500).json({ error: 'Error al actualizar' }) }
})

router.delete('/logs/:id', async (req, res) => {
  try {
    const log = await prisma.fieldLog.findUnique({ where: { id: req.params.id } })
    if (!log || !(await canAccessProject(req, log.projectId))) return res.status(404).json({ error: 'Nota no encontrada' })
    const recent = Date.now() - new Date(log.createdAt).getTime() < 15 * 60 * 1000
    if (!(log.authorId === req.user.id && recent) && req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Una nota de bitácora solo se puede borrar en los primeros 15 minutos (trazabilidad)' })
    await prisma.fieldLog.delete({ where: { id: log.id } })
    res.json({ message: 'Nota eliminada' })
  } catch { res.status(500).json({ error: 'Error al eliminar' }) }
})

// ===================================================================
// ASISTENCIA DIARIA (quién trabajó, dónde, cuántas horas)
// ===================================================================
const ATT_INCLUDE = { author: USER_SEL, worker: USER_SEL, site: { select: { id: true, code: true, name: true } }, project: { select: { id: true, name: true } } }

// GET /api/field/attendance?projectId=&siteId=&date=YYYY-MM-DD&from=&to=
router.get('/attendance', async (req, res) => {
  try {
    const where = { project: await projectScope(req) }
    if (req.query.projectId) where.projectId = clean(req.query.projectId, 40)
    if (req.query.siteId) where.siteId = clean(req.query.siteId, 40)
    const day = parseDate(req.query.date)
    if (day) { const s = new Date(day); s.setUTCHours(0, 0, 0, 0); const e = new Date(s.getTime() + 86400000); where.workDate = { gte: s, lt: e } }
    else { const from = parseDate(req.query.from), to = parseDate(req.query.to); if (from || to) where.workDate = { ...(from && { gte: from }), ...(to && { lte: to }) } }
    res.json(await prisma.fieldAttendance.findMany({ where, include: ATT_INCLUDE, orderBy: [{ workDate: 'desc' }, { workerName: 'asc' }], take: 1000 }))
  } catch { res.status(500).json({ error: 'Error al obtener asistencia' }) }
})

// POST /api/field/attendance — { projectId, workDate, entries: [{ workerName, workerId?, siteId?, hours?, role?, note? }] }
// Reemplaza la lista del día que registró este autor (idempotente por día)
router.post('/attendance', async (req, res) => {
  try {
    const projectId = clean(req.body.projectId, 40)
    if (!projectId || !(await canAccessProject(req, projectId))) return res.status(404).json({ error: 'Obra no encontrada' })
    const workDate = parseDate(req.body.workDate) || new Date()
    if (workDate.getTime() > Date.now() + 86400000) return res.status(400).json({ error: 'La fecha no puede ser futura' })
    const dayStart = new Date(workDate); dayStart.setUTCHours(0, 0, 0, 0); const dayEnd = new Date(dayStart.getTime() + 86400000)
    if (!Array.isArray(req.body.entries)) return res.status(400).json({ error: 'Lista de personas requerida' })
    const siteIds = new Set((await prisma.fieldSite.findMany({ where: { projectId }, select: { id: true } })).map(s => s.id))
    const entries = []
    for (const [i, e] of req.body.entries.slice(0, 60).entries()) {
      const workerName = clean(e.workerName, 80)
      if (!workerName) return res.status(400).json({ error: `Falta el nombre en la línea ${i + 1}` })
      const hours = e.hours === '' || e.hours === undefined || e.hours === null ? null : num(e.hours, { min: 0, max: 24 })
      if (e.hours && hours === null) return res.status(400).json({ error: `Horas inválidas para ${workerName}` })
      const siteId = e.siteId && siteIds.has(e.siteId) ? e.siteId : null
      let workerId = null
      if (e.workerId) { const u = await prisma.user.findFirst({ where: { id: clean(e.workerId, 40), isActive: true }, select: { id: true } }); workerId = u?.id || null }
      entries.push({ projectId, siteId, workerId, workerName, hours, role: clean(e.role, 40) || null, note: clean(e.note, 200) || null, workDate: dayStart, authorId: req.user.id })
    }
    await prisma.$transaction([
      prisma.fieldAttendance.deleteMany({ where: { projectId, authorId: req.user.id, workDate: { gte: dayStart, lt: dayEnd } } }),
      prisma.fieldAttendance.createMany({ data: entries })
    ])
    // Las bóvedas con gente ese día arrancan si no habían arrancado
    const touched = [...new Set(entries.map(e => e.siteId).filter(Boolean))]
    if (touched.length) await prisma.fieldSite.updateMany({ where: { id: { in: touched }, actualStart: null, status: { not: 'DONE' } }, data: { actualStart: dayStart, status: 'IN_PROGRESS' } })
    await trace(req, projectId, null, 'ATTENDANCE', `${req.user.name} registró asistencia del ${dayStart.toISOString().slice(0, 10)}: ${entries.length} personas (${entries.map(e => e.workerName.split(' ')[0]).join(', ')})`)
    const saved = await prisma.fieldAttendance.findMany({ where: { projectId, workDate: { gte: dayStart, lt: dayEnd } }, include: ATT_INCLUDE, orderBy: { workerName: 'asc' } })
    res.status(201).json(saved)
  } catch (err) {
    console.error('Error asistencia:', err.message)
    res.status(500).json({ error: 'Error al guardar la asistencia' })
  }
})

// GET /api/field/crew?projectId= — nombres usados antes en esta obra (autocompletar cuadrilla)
router.get('/crew', async (req, res) => {
  try {
    const projectId = clean(req.query.projectId, 40)
    if (!projectId || !(await canAccessProject(req, projectId))) return res.status(404).json({ error: 'Obra no encontrada' })
    const rows = await prisma.fieldAttendance.groupBy({ by: ['workerName', 'role'], where: { projectId }, _count: { _all: true }, _max: { workDate: true } })
    const assigned = await prisma.fieldAssignment.findMany({ where: { projectId }, include: { user: USER_SEL } })
    const crew = {}
    for (const a of assigned) crew[a.user.name] = { workerName: a.user.name, workerId: a.user.id, role: a.isLead ? 'responsable' : 'instalador', days: 0 }
    for (const r of rows) { crew[r.workerName] = { ...(crew[r.workerName] || {}), workerName: r.workerName, role: r.role || crew[r.workerName]?.role || null, days: r._count._all, lastDate: r._max.workDate } }
    res.json(Object.values(crew).sort((a, b) => (b.days || 0) - (a.days || 0)))
  } catch { res.status(500).json({ error: 'Error al obtener cuadrilla' }) }
})

// ===================================================================
// PROGRAMA DE OBRA: planeado vs real, calendario de campo
// ===================================================================
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

// GET /api/field/projects/:id/schedule — por bóveda: planeado, real, desviación, avance
router.get('/projects/:id/schedule', async (req, res) => {
  try {
    if (!(await canAccessProject(req, req.params.id))) return res.status(404).json({ error: 'Obra no encontrada' })
    const sites = await prisma.fieldSite.findMany({
      where: { projectId: req.params.id },
      include: {
        reports: { where: { status: { not: 'DRAFT' } }, select: { reportDate: true, hoursWorked: true } },
        logs: { select: { logDate: true, blocking: true, resolvedAt: true, kind: true } },
        attendance: { select: { workDate: true, hours: true, workerName: true } }
      },
      orderBy: { position: 'asc' }
    })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const rows = sites.map(s => {
      const days = new Set()
      for (const r of s.reports) days.add(new Date(r.reportDate).toISOString().slice(0, 10))
      for (const l of s.logs) days.add(new Date(l.logDate).toISOString().slice(0, 10))
      for (const a of s.attendance) days.add(new Date(a.workDate).toISOString().slice(0, 10))
      const sorted = [...days].sort()
      const actualStart = s.actualStart || (sorted[0] ? new Date(sorted[0]) : null)
      const actualEnd = s.status === 'DONE' ? (s.actualEnd || (sorted.at(-1) ? new Date(sorted.at(-1)) : null)) : null
      const plannedDays = s.plannedDays ?? (s.plannedStart && s.plannedEnd ? dayDiff(s.plannedStart, s.plannedEnd) + 1 : null)
      const actualDays = days.size
      const elapsedDays = actualStart ? dayDiff(actualStart, actualEnd || today) + 1 : 0
      const stepPct = Math.round(((STAGES.indexOf(s.stage)) / (STAGES.length - 1)) * 100)
      const openBlocking = s.logs.filter(l => l.blocking && !l.resolvedAt).length
      let health = 'ON_TRACK'
      if (s.status === 'DONE') health = s.plannedEnd && actualEnd && actualEnd > s.plannedEnd ? 'LATE_DONE' : 'DONE'
      else if (openBlocking) health = 'BLOCKED'
      else if (s.plannedEnd && today > new Date(s.plannedEnd)) health = 'OVERDUE'
      else if (plannedDays && actualDays > plannedDays) health = 'OVER_BUDGET'
      else if (!s.plannedStart && !s.plannedEnd) health = 'UNPLANNED'
      return {
        id: s.id, code: s.code, name: s.name, stage: s.stage, status: s.status, position: s.position,
        plannedStart: s.plannedStart, plannedEnd: s.plannedEnd, plannedDays,
        actualStart, actualEnd, actualDays, elapsedDays,
        hours: s.attendance.reduce((a, x) => a + (x.hours || 0), 0) || s.reports.reduce((a, r) => a + (r.hoursWorked || 0), 0),
        workers: new Set(s.attendance.map(a => a.workerName)).size,
        delayDays: s.plannedEnd ? dayDiff(s.plannedEnd, actualEnd || today) : null,
        progressPct: s.status === 'DONE' ? 100 : stepPct, openBlocking, health
      }
    })
    const planned = rows.filter(r => r.plannedDays)
    res.json({
      sites: rows,
      totals: {
        sites: rows.length, done: rows.filter(r => r.status === 'DONE').length, inProgress: rows.filter(r => r.status === 'IN_PROGRESS').length,
        blocked: rows.filter(r => r.health === 'BLOCKED').length, overdue: rows.filter(r => r.health === 'OVERDUE' || r.health === 'LATE_DONE').length,
        plannedDays: planned.reduce((a, r) => a + r.plannedDays, 0), actualDays: rows.reduce((a, r) => a + r.actualDays, 0),
        avgPlannedDays: planned.length ? planned.reduce((a, r) => a + r.plannedDays, 0) / planned.length : null,
        avgActualDays: rows.filter(r => r.status === 'DONE').length ? rows.filter(r => r.status === 'DONE').reduce((a, r) => a + r.actualDays, 0) / rows.filter(r => r.status === 'DONE').length : null,
        plannedStart: planned.length ? new Date(Math.min(...planned.filter(r => r.plannedStart).map(r => new Date(r.plannedStart)))) : null,
        plannedEnd: planned.length ? new Date(Math.max(...planned.filter(r => r.plannedEnd).map(r => new Date(r.plannedEnd)))) : null
      }
    })
  } catch (err) {
    console.error('Error programa:', err.message)
    res.status(500).json({ error: 'Error al calcular el programa' })
  }
})

// GET /api/field/calendar?projectId=&month=YYYY-MM — eventos del mes (programa, reportes, bitácora, asistencia)
router.get('/calendar', async (req, res) => {
  try {
    const scope = await projectScope(req)
    const pid = clean(req.query.projectId, 40) || null
    const mm = req.query.month || ''
    const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(mm) ? mm : new Date().toISOString().slice(0, 7)
    const start = new Date(`${m}-01T00:00:00Z`); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1)
    const pw = pid ? { projectId: pid, project: scope } : { project: scope }
    const [sites, reports, logs, attendance] = await Promise.all([
      prisma.fieldSite.findMany({ where: { ...pw, OR: [{ plannedStart: { lt: end }, plannedEnd: { gte: start } }, { actualStart: { lt: end } }] }, select: { id: true, code: true, name: true, stage: true, status: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, project: { select: { id: true, name: true, color: true } } } }),
      prisma.fieldReport.findMany({ where: { ...pw, status: { not: 'DRAFT' }, reportDate: { gte: start, lt: end } }, select: { id: true, folio: true, reportDate: true, stage: true, status: true, site: { select: { id: true, code: true } }, author: USER_SEL } }),
      prisma.fieldLog.findMany({ where: { ...pw, logDate: { gte: start, lt: end } }, select: { id: true, logDate: true, kind: true, blocking: true, resolvedAt: true, body: true, siteId: true, site: { select: { code: true } }, author: USER_SEL } }),
      prisma.fieldAttendance.findMany({ where: { ...pw, workDate: { gte: start, lt: end } }, select: { workDate: true, workerName: true, hours: true, siteId: true, site: { select: { code: true } } } })
    ])
    // Asistencia agrupada por día
    const attByDay = {}
    for (const a of attendance) { const d = new Date(a.workDate).toISOString().slice(0, 10); attByDay[d] = attByDay[d] || { workers: new Set(), hours: 0, sites: new Set() }; attByDay[d].workers.add(a.workerName); attByDay[d].hours += a.hours || 0; if (a.site) attByDay[d].sites.add(a.site.code) }
    res.json({
      month: m, sites, reports, logs,
      attendance: Object.entries(attByDay).map(([day, v]) => ({ day, workers: [...v.workers], hours: v.hours, sites: [...v.sites] }))
    })
  } catch (err) {
    console.error('Error calendario campo:', err.message)
    res.status(500).json({ error: 'Error al obtener el calendario' })
  }
})

// GET /api/field/projects/:id/materials-by-site — matriz bóveda × material (oficina)
router.get('/projects/:id/materials-by-site', requireOffice, async (req, res) => {
  try {
    const usages = await prisma.fieldMaterialUsage.findMany({
      where: { report: { projectId: req.params.id, status: { in: ['SUBMITTED', 'APPROVED'] } } },
      include: { material: MATERIAL_SEL, report: { select: { siteId: true, site: { select: { code: true, name: true } } } } }
    })
    const mats = {}, sites = {}
    for (const u of usages) {
      mats[u.materialId] = u.material
      const sk = u.report.siteId
      sites[sk] = sites[sk] || { site: { id: sk, ...u.report.site }, cells: {}, cost: 0 }
      sites[sk].cells[u.materialId] = (sites[sk].cells[u.materialId] || 0) + u.quantity
      sites[sk].cost += u.quantity * u.unitCost
    }
    const materials = Object.values(mats).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name))
    const totals = {}
    for (const s of Object.values(sites)) for (const [k, q] of Object.entries(s.cells)) totals[k] = (totals[k] || 0) + q
    res.json({ materials, rows: Object.values(sites).sort((a, b) => a.site.code.localeCompare(b.site.code, 'es', { numeric: true })), totals })
  } catch { res.status(500).json({ error: 'Error al calcular la matriz' }) }
})

// GET /api/field/sites/:id/events — historial completo de la bóveda
router.get('/sites/:id/events', async (req, res) => {
  try {
    const site = await loadSite(req, res, req.params.id)
    if (!site) return
    res.json(await prisma.fieldEvent.findMany({ where: { siteId: site.id }, include: { user: USER_SEL }, orderBy: { createdAt: 'desc' }, take: 500 }))
  } catch { res.status(500).json({ error: 'Error al obtener el historial' }) }
})

// ===================================================================
// RECUENTO Y COSTOS (oficina)
// ===================================================================
// GET /api/field/summary?projectId=&from=&to=
router.get('/summary', requireOffice, async (req, res) => {
  try {
    const where = { status: { in: ['SUBMITTED', 'APPROVED'] }, project: { deletedAt: null } }
    if (req.query.projectId) where.projectId = clean(req.query.projectId, 40)
    const from = parseDate(req.query.from), to = parseDate(req.query.to)
    if (from || to) where.reportDate = { ...(from && { gte: from }), ...(to && { lte: to }) }

    const [reports, pending, sites] = await Promise.all([
      prisma.fieldReport.findMany({ where, include: { usages: { include: { material: MATERIAL_SEL } }, site: { select: { id: true, code: true, name: true } }, project: { select: { id: true, name: true } }, author: USER_SEL, _count: { select: { photos: true } } } }),
      prisma.fieldReport.count({ where: { status: 'SUBMITTED', project: { deletedAt: null } } }),
      prisma.fieldSite.findMany({ where: { project: { deletedAt: null, ...(req.query.projectId && { id: clean(req.query.projectId, 40) }) } }, select: { status: true, stage: true } })
    ])
    const byMaterial = {}, byProject = {}, bySite = {}, byInstaller = {}, byDay = {}
    let totalCost = 0, totalHours = 0
    for (const r of reports) {
      let cost = 0
      for (const u of r.usages) {
        const c = u.quantity * u.unitCost; cost += c
        const k = u.materialId
        byMaterial[k] = byMaterial[k] || { material: u.material, quantity: 0, cost: 0 }
        byMaterial[k].quantity += u.quantity; byMaterial[k].cost += c
      }
      totalCost += cost; totalHours += r.hoursWorked || 0
      const pk = r.projectId; byProject[pk] = byProject[pk] || { project: r.project, reports: 0, cost: 0, hours: 0 }; byProject[pk].reports++; byProject[pk].cost += cost; byProject[pk].hours += r.hoursWorked || 0
      const sk = r.siteId; bySite[sk] = bySite[sk] || { site: r.site, project: r.project, reports: 0, cost: 0, photos: 0 }; bySite[sk].reports++; bySite[sk].cost += cost; bySite[sk].photos += r._count.photos
      const ik = r.authorId; byInstaller[ik] = byInstaller[ik] || { user: r.author, reports: 0, cost: 0, hours: 0, photos: 0 }; byInstaller[ik].reports++; byInstaller[ik].cost += cost; byInstaller[ik].hours += r.hoursWorked || 0; byInstaller[ik].photos += r._count.photos
      const dk = new Date(r.reportDate).toISOString().slice(0, 10); byDay[dk] = byDay[dk] || { day: dk, reports: 0, cost: 0 }; byDay[dk].reports++; byDay[dk].cost += cost
    }
    const stageCounts = {}
    for (const s of STAGES) stageCounts[s] = sites.filter(x => x.stage === s).length
    res.json({
      totals: { reports: reports.length, cost: totalCost, hours: totalHours, pendingReview: pending, sites: sites.length, sitesDone: sites.filter(s => s.status === 'DONE').length },
      byMaterial: Object.values(byMaterial).sort((a, b) => b.cost - a.cost),
      byProject: Object.values(byProject).sort((a, b) => b.cost - a.cost),
      bySite: Object.values(bySite).sort((a, b) => b.cost - a.cost),
      byInstaller: Object.values(byInstaller).sort((a, b) => b.reports - a.reports),
      byDay: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
      stageCounts
    })
  } catch (err) {
    console.error('Error resumen de campo:', err.message)
    res.status(500).json({ error: 'Error al calcular el resumen' })
  }
})

// GET /api/field/export.xlsx?projectId=
router.get('/export.xlsx', requireOffice, async (req, res) => {
  try {
    const where = { status: { in: ['SUBMITTED', 'APPROVED'] }, project: { deletedAt: null } }
    if (req.query.projectId) where.projectId = clean(req.query.projectId, 40)
    const reports = await prisma.fieldReport.findMany({ where, include: { usages: { include: { material: MATERIAL_SEL, opening: { select: { label: true } } } }, site: { select: { code: true, name: true, address: true } }, project: { select: { name: true } }, author: USER_SEL, _count: { select: { photos: true } } }, orderBy: { reportDate: 'asc' } })
    const wb = new ExcelJS.Workbook(); wb.creator = 'ICAPSA'
    const money = '"$"#,##0.00'
    const head = (ws) => { ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22A2DE' } } }

    const wsU = wb.addWorksheet('Material consumido')
    wsU.columns = [{ header: 'Fecha', key: 'date', width: 12 }, { header: 'Reporte', key: 'folio', width: 14 }, { header: 'Obra', key: 'project', width: 30 }, { header: 'Bóveda', key: 'site', width: 16 }, { header: 'Ubicación', key: 'name', width: 30 }, { header: 'Ventana', key: 'opening', width: 22 }, { header: 'SKU', key: 'sku', width: 14 }, { header: 'Material', key: 'material', width: 30 }, { header: 'Cant.', key: 'qty', width: 8 }, { header: 'Unidad', key: 'unit', width: 8 }, { header: 'Costo unit.', key: 'uc', width: 12 }, { header: 'Costo', key: 'cost', width: 14 }, { header: 'Instalador', key: 'author', width: 22 }, { header: 'Estatus', key: 'status', width: 10 }]
    head(wsU)
    for (const r of reports) for (const u of r.usages)
      wsU.addRow({ date: new Date(r.reportDate).toISOString().slice(0, 10), folio: r.folio, project: r.project.name, site: r.site.code, name: r.site.name || r.site.address || '', opening: u.opening?.label || '', sku: u.material.sku || '', material: u.material.name, qty: u.quantity, unit: u.material.unit, uc: u.unitCost, cost: u.quantity * u.unitCost, author: r.author.name, status: r.status === 'APPROVED' ? 'Aprobado' : 'Enviado' })
    ;['uc', 'cost'].forEach(k => { wsU.getColumn(k).numFmt = money })
    if (wsU.rowCount > 1) { const t = wsU.addRow({ material: 'TOTAL' }); t.font = { bold: true }; t.getCell('cost').value = { formula: `SUM(L2:L${t.number - 1})` }; t.getCell('cost').numFmt = money }

    const wsR = wb.addWorksheet('Reportes')
    wsR.columns = [{ header: 'Fecha', key: 'date', width: 12 }, { header: 'Reporte', key: 'folio', width: 14 }, { header: 'Obra', key: 'project', width: 30 }, { header: 'Bóveda', key: 'site', width: 16 }, { header: 'Etapa', key: 'stage', width: 22 }, { header: 'Instalador', key: 'author', width: 22 }, { header: 'Cuadrilla', key: 'crew', width: 9 }, { header: 'Horas', key: 'hours', width: 8 }, { header: 'Fotos', key: 'photos', width: 7 }, { header: 'Costo material', key: 'cost', width: 15 }, { header: 'Trabajo realizado', key: 'summary', width: 60 }, { header: 'Problemas', key: 'issues', width: 40 }, { header: 'Estatus', key: 'status', width: 10 }]
    head(wsR)
    for (const r of reports) wsR.addRow({ date: new Date(r.reportDate).toISOString().slice(0, 10), folio: r.folio, project: r.project.name, site: r.site.code, stage: STAGE_LABEL[r.stage], author: r.author.name, crew: r.crewSize || '', hours: r.hoursWorked || '', photos: r._count.photos, cost: r.usages.reduce((s, u) => s + u.quantity * u.unitCost, 0), summary: r.summary, issues: r.issues || '', status: r.status === 'APPROVED' ? 'Aprobado' : 'Enviado' })
    wsR.getColumn('cost').numFmt = money

    // Hoja: Bitácora
    const logs = await prisma.fieldLog.findMany({ where: { project: { deletedAt: null }, ...(req.query.projectId && { projectId: clean(req.query.projectId, 40) }) }, include: { site: { select: { code: true } }, project: { select: { name: true } }, author: USER_SEL }, orderBy: { logDate: 'asc' } })
    const wsL = wb.addWorksheet('Bitácora')
    wsL.columns = [{ header: 'Fecha', key: 'date', width: 12 }, { header: 'Obra', key: 'project', width: 30 }, { header: 'Bóveda', key: 'site', width: 14 }, { header: 'Tipo', key: 'kind', width: 12 }, { header: 'Bloqueante', key: 'blocking', width: 11 }, { header: 'Resuelto', key: 'resolved', width: 12 }, { header: 'Autor', key: 'author', width: 22 }, { header: 'Nota', key: 'body', width: 80 }]
    head(wsL)
    for (const l of logs) wsL.addRow({ date: new Date(l.logDate).toISOString().slice(0, 10), project: l.project.name, site: l.site?.code || '', kind: LOG_LABEL[l.kind], blocking: l.blocking ? 'Sí' : '', resolved: l.resolvedAt ? new Date(l.resolvedAt).toISOString().slice(0, 10) : '', author: l.author.name, body: l.body })
    // Hoja: Asistencia
    const att = await prisma.fieldAttendance.findMany({ where: { project: { deletedAt: null }, ...(req.query.projectId && { projectId: clean(req.query.projectId, 40) }) }, include: { site: { select: { code: true } }, project: { select: { name: true } } }, orderBy: [{ workDate: 'asc' }, { workerName: 'asc' }] })
    const wsA = wb.addWorksheet('Asistencia')
    wsA.columns = [{ header: 'Fecha', key: 'date', width: 12 }, { header: 'Obra', key: 'project', width: 30 }, { header: 'Bóveda', key: 'site', width: 14 }, { header: 'Persona', key: 'name', width: 26 }, { header: 'Rol', key: 'role', width: 14 }, { header: 'Horas', key: 'hours', width: 8 }, { header: 'Nota', key: 'note', width: 40 }]
    head(wsA)
    for (const a of att) wsA.addRow({ date: new Date(a.workDate).toISOString().slice(0, 10), project: a.project.name, site: a.site?.code || '', name: a.workerName, role: a.role || '', hours: a.hours ?? '', note: a.note || '' })
    await logActivity({ userId: req.user.id, action: 'field_export', detail: `exportó el recuento de material de campo${req.query.projectId ? ' de una obra' : ''}` })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Campo-material.xlsx"`)
    await wb.xlsx.write(res); res.end()
  } catch (err) {
    console.error('Error export campo:', err.message)
    res.status(500).json({ error: 'Error al exportar' })
  }
})

// Recordatorio diario (llamado desde index.js ~18:30): instaladores con obra activa y sin reporte hoy
export async function runDailyReportReminder() {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const assignments = await prisma.fieldAssignment.findMany({ where: { project: { deletedAt: null, status: 'ACTIVE' }, user: { isActive: true, role: 'INSTALLER' } }, include: { user: { select: { id: true } }, project: { select: { id: true, name: true } } } })
    const seen = new Set()
    for (const a of assignments) {
      if (seen.has(a.userId)) continue
      const has = (await prisma.fieldReport.findFirst({ where: { authorId: a.userId, reportDate: { gte: start } }, select: { id: true } }))
        || (await prisma.fieldLog.findFirst({ where: { authorId: a.userId, logDate: { gte: start } }, select: { id: true } }))
        || (await prisma.fieldAttendance.findFirst({ where: { authorId: a.userId, workDate: { gte: start } }, select: { id: true } }))
      if (!has) { seen.add(a.userId); await notify({ userId: a.userId, type: 'field_reminder', title: 'Falta tu reporte de hoy', message: `Registra el avance y el material usado en ${a.project.name}`, link: '/campo' }) }
    }
  } catch (err) { console.error('Error recordatorio de reportes:', err.message) }
}

export default router
