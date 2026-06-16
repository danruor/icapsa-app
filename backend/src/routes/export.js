import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

router.use(authenticate)

const statusNames = { TODO: 'Por hacer', IN_PROGRESS: 'En progreso', REVIEW: 'En revisión', DONE: 'Completado' }
const priorityNames = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' }

// GET /api/export/inventory.xlsx?projectId=xxx
router.get('/inventory.xlsx', async (req, res) => {
  try {
    const { projectId } = req.query
    const items = await prisma.inventoryItem.findMany({
      where: projectId ? { projectId } : {},
      include: { project: { select: { name: true } } },
      orderBy: { name: 'asc' }
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'ICAPSA'
    const ws = wb.addWorksheet('Inventario')

    ws.columns = [
      { header: 'Artículo', key: 'name', width: 30 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Proyecto', key: 'project', width: 22 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Unidad', key: 'unit', width: 10 },
      { header: 'Stock mín.', key: 'minStock', width: 12 },
      { header: 'Ubicación', key: 'location', width: 20 },
      { header: 'P. Unitario', key: 'unitPrice', width: 14 },
      { header: 'Valor total', key: 'total', width: 14 }
    ]

    // Estilo del encabezado
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D9E75' } }
    ws.getRow(1).height = 22

    items.forEach(i => {
      ws.addRow({
        name: i.name, sku: i.sku || '', category: i.category || '',
        project: i.project?.name || 'General',
        quantity: i.quantity, unit: i.unit, minStock: i.minStock,
        location: i.location || '',
        unitPrice: i.unitPrice || 0,
        total: (i.unitPrice || 0) * i.quantity
      })
    })

    // Formato de moneda
    ws.getColumn('unitPrice').numFmt = '"$"#,##0.00'
    ws.getColumn('total').numFmt = '"$"#,##0.00'

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="inventario-icapsa.xlsx"')
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Error export inventario:', err.message)
    res.status(500).json({ error: 'Error al exportar inventario' })
  }
})

// GET /api/export/project/:id.pdf - reporte de proyecto en PDF
router.get('/project/:id.pdf', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        tasks: { include: { assignee: { select: { name: true } } } },
        inventory: true,
        members: { include: { user: { select: { name: true, position: true } } } }
      }
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="proyecto-${project.name.replace(/[^a-z0-9]/gi, '_')}.pdf"`)
    doc.pipe(res)

    // Encabezado
    doc.fontSize(20).fillColor('#0F6E56').text('ICAPSA', { continued: true })
       .fillColor('#888').fontSize(10).text('  Ingeniería de Calidad Aplicada')
    doc.moveDown(0.5)
    doc.fontSize(16).fillColor('#111').text(project.name)
    if (project.description) doc.fontSize(10).fillColor('#666').text(project.description)
    doc.moveDown(0.5)

    const statusMap = { ACTIVE: 'Activo', PAUSED: 'Pausado', COMPLETED: 'Completado', ARCHIVED: 'Archivado' }
    doc.fontSize(9).fillColor('#888')
       .text(`Estado: ${statusMap[project.status]}  |  Generado: ${new Date().toLocaleDateString('es-MX')}`)
    doc.moveDown(1)

    // Resumen de tareas
    doc.fontSize(13).fillColor('#0F6E56').text('Tareas')
    doc.moveDown(0.3)
    const byStatus = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 }
    project.tasks.forEach(t => byStatus[t.status]++)
    doc.fontSize(9).fillColor('#333')
    doc.text(`Total: ${project.tasks.length}  |  Por hacer: ${byStatus.TODO}  |  En progreso: ${byStatus.IN_PROGRESS}  |  En revisión: ${byStatus.REVIEW}  |  Completadas: ${byStatus.DONE}`)
    doc.moveDown(0.5)

    project.tasks.slice(0, 25).forEach(t => {
      doc.fontSize(9).fillColor('#111').text(`• ${t.title}`, { continued: true })
         .fillColor('#888').text(`  [${statusNames[t.status]}${t.assignee ? ' · ' + t.assignee.name : ''}]`)
    })
    doc.moveDown(1)

    // Inventario
    doc.fontSize(13).fillColor('#0F6E56').text('Inventario del proyecto')
    doc.moveDown(0.3)
    if (project.inventory.length === 0) {
      doc.fontSize(9).fillColor('#888').text('Sin artículos registrados')
    } else {
      let totalValue = 0
      project.inventory.forEach(i => {
        totalValue += (i.unitPrice || 0) * i.quantity
        doc.fontSize(9).fillColor('#111').text(`• ${i.name}`, { continued: true })
           .fillColor('#888').text(`  ${i.quantity} ${i.unit}${i.location ? ' · ' + i.location : ''}`)
      })
      doc.moveDown(0.3)
      doc.fontSize(10).fillColor('#0F6E56').text(`Valor total del inventario: $${totalValue.toLocaleString('es-MX')}`)
    }
    doc.moveDown(1)

    // Equipo
    doc.fontSize(13).fillColor('#0F6E56').text('Equipo')
    doc.moveDown(0.3)
    project.members.forEach(m => {
      doc.fontSize(9).fillColor('#111').text(`• ${m.user.name}${m.user.position ? ' — ' + m.user.position : ''}`)
    })

    doc.end()
  } catch (err) {
    console.error('Error export PDF:', err.message)
    res.status(500).json({ error: 'Error al generar PDF' })
  }
})

export default router
