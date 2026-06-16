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


// GET /api/export/quote/:id.pdf - cotización en PDF
router.get('/quote/:id.pdf', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Sin permisos' })

    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { items: true, createdBy: { select: { name: true } } }
    })
    if (!quote) return res.status(404).json({ error: 'No encontrada' })

    const subtotal = quote.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
    const tax = subtotal * (quote.taxRate / 100)
    const total = subtotal + tax

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio}.pdf"`)
    doc.pipe(res)

    // Encabezado
    doc.fontSize(22).fillColor('#0F6E56').text('ICAPSA', 50, 50)
    doc.fontSize(9).fillColor('#888').text('Ingeniería de Calidad Aplicada S.A. de C.V.', 50, 75)
    doc.fontSize(18).fillColor('#111').text('COTIZACIÓN', 400, 50, { align: 'right' })
    doc.fontSize(11).fillColor('#0F6E56').text(quote.folio, 400, 75, { align: 'right' })
    doc.fontSize(9).fillColor('#888').text(new Date(quote.createdAt).toLocaleDateString('es-MX'), 400, 92, { align: 'right' })

    doc.moveTo(50, 115).lineTo(562, 115).strokeColor('#ddd').stroke()

    // Cliente
    doc.fontSize(10).fillColor('#888').text('CLIENTE', 50, 130)
    doc.fontSize(12).fillColor('#111').text(quote.clientName, 50, 145)
    if (quote.clientEmail) doc.fontSize(9).fillColor('#666').text(quote.clientEmail, 50, 162)
    if (quote.clientPhone) doc.fontSize(9).fillColor('#666').text(quote.clientPhone, 50, 175)

    // Tabla de items
    let y = 210
    doc.rect(50, y, 512, 22).fill('#1D9E75')
    doc.fontSize(9).fillColor('#fff')
    doc.text('Concepto', 58, y + 7)
    doc.text('Cant.', 320, y + 7)
    doc.text('P. Unit.', 380, y + 7)
    doc.text('Importe', 480, y + 7, { width: 75, align: 'right' })
    y += 22

    quote.items.forEach((it, idx) => {
      const importe = it.unitPrice * it.quantity - it.discount
      if (idx % 2 === 0) doc.rect(50, y, 512, 20).fill('#f7f7f7')
      doc.fontSize(9).fillColor('#111')
      doc.text(it.name, 58, y + 6, { width: 255 })
      doc.text(`${it.quantity} ${it.unit}`, 320, y + 6)
      doc.text(`$${it.unitPrice.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 380, y + 6)
      doc.text(`$${importe.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 480, y + 6, { width: 75, align: 'right' })
      y += 20
    })

    // Totales
    y += 10
    doc.fontSize(10).fillColor('#666')
    doc.text('Subtotal:', 380, y, { width: 90, align: 'right' })
    doc.text(`$${subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 470, y, { width: 85, align: 'right' })
    y += 18
    doc.text(`IVA (${quote.taxRate}%):`, 380, y, { width: 90, align: 'right' })
    doc.text(`$${tax.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 470, y, { width: 85, align: 'right' })
    y += 20
    doc.rect(380, y - 4, 182, 26).fill('#0F6E56')
    doc.fontSize(12).fillColor('#fff')
    doc.text('TOTAL:', 388, y + 3)
    doc.text(`$${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 470, y + 3, { width: 85, align: 'right' })

    // Notas y validez
    if (quote.notes) {
      doc.fontSize(9).fillColor('#888').text('Notas: ' + quote.notes, 50, y + 50, { width: 300 })
    }
    if (quote.validUntil) {
      doc.fontSize(9).fillColor('#888').text(`Válida hasta: ${new Date(quote.validUntil).toLocaleDateString('es-MX')}`, 50, y + 70)
    }

    doc.end()
  } catch (err) {
    console.error('Error PDF cotización:', err.message)
    res.status(500).json({ error: 'Error al generar PDF' })
  }
})


// GET /api/export/quotes.xlsx - lista de todas las cotizaciones con estado de pago
router.get('/quotes.xlsx', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Sin permisos' })

    const quotes = await prisma.quote.findMany({
      include: { items: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'ICAPSA'
    const ws = wb.addWorksheet('Cotizaciones')

    ws.columns = [
      { header: 'Folio', key: 'folio', width: 16 },
      { header: 'Cliente', key: 'client', width: 28 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Pago', key: 'payment', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'IVA', key: 'tax', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Pagado', key: 'paid', width: 14 },
      { header: 'Saldo', key: 'balance', width: 14 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Creó', key: 'creator', width: 18 }
    ]
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D9E75' } }
    ws.getRow(1).height = 22

    const statusMap = { DRAFT: 'Borrador', SENT: 'Enviada', APPROVED: 'Aprobada', REJECTED: 'Rechazada', EXPIRED: 'Vencida' }
    const payMap = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagada' }

    quotes.forEach(q => {
      const subtotal = q.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
      const tax = subtotal * (q.taxRate / 100)
      const total = subtotal + tax
      ws.addRow({
        folio: q.folio, client: q.clientName,
        status: statusMap[q.status], payment: payMap[q.paymentStatus],
        subtotal, tax, total, paid: q.paidAmount,
        balance: Math.max(0, total - q.paidAmount),
        date: new Date(q.createdAt).toLocaleDateString('es-MX'),
        creator: q.createdBy.name
      })
    })

    ;['subtotal', 'tax', 'total', 'paid', 'balance'].forEach(col => {
      ws.getColumn(col).numFmt = '"$"#,##0.00'
    })

    // Fila de totales
    const lastRow = ws.rowCount + 1
    ws.getCell(`D${lastRow}`).value = 'TOTALES'
    ws.getCell(`D${lastRow}`).font = { bold: true }
    ws.getCell(`G${lastRow}`).value = { formula: `SUM(G2:G${ws.rowCount})` }
    ws.getCell(`H${lastRow}`).value = { formula: `SUM(H2:H${ws.rowCount})` }
    ws.getCell(`I${lastRow}`).value = { formula: `SUM(I2:I${ws.rowCount})` }
    ws.getRow(lastRow).font = { bold: true }
    ;['G', 'H', 'I'].forEach(c => ws.getCell(`${c}${lastRow}`).numFmt = '"$"#,##0.00')

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="cotizaciones-icapsa.xlsx"')
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Error export cotizaciones xlsx:', err.message)
    res.status(500).json({ error: 'Error al exportar' })
  }
})

// GET /api/export/quote/:id.xlsx - una cotización individual en Excel
router.get('/quote/:id.xlsx', async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Sin permisos' })

    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    })
    if (!quote) return res.status(404).json({ error: 'No encontrada' })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(quote.folio)

    // Encabezado de la cotización
    ws.mergeCells('A1:E1')
    ws.getCell('A1').value = `ICAPSA - Cotización ${quote.folio}`
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F6E56' } }
    ws.getCell('A3').value = 'Cliente:'
    ws.getCell('B3').value = quote.clientName
    ws.getCell('A4').value = 'Fecha:'
    ws.getCell('B4').value = new Date(quote.createdAt).toLocaleDateString('es-MX')

    // Tabla de conceptos
    const headerRow = 6
    ws.getRow(headerRow).values = ['Concepto', 'Cantidad', 'Unidad', 'P. Unitario', 'Importe']
    ws.getRow(headerRow).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(headerRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D9E75' } }
    ws.columns = [{ width: 35 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 }]

    let row = headerRow + 1
    quote.items.forEach(it => {
      const importe = it.unitPrice * it.quantity - it.discount
      ws.getRow(row).values = [it.name, it.quantity, it.unit, it.unitPrice, importe]
      ws.getCell(`D${row}`).numFmt = '"$"#,##0.00'
      ws.getCell(`E${row}`).numFmt = '"$"#,##0.00'
      row++
    })

    const subtotal = quote.items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
    const tax = subtotal * (quote.taxRate / 100)
    row++
    ws.getCell(`D${row}`).value = 'Subtotal'; ws.getCell(`E${row}`).value = subtotal; ws.getCell(`E${row}`).numFmt = '"$"#,##0.00'; row++
    ws.getCell(`D${row}`).value = `IVA ${quote.taxRate}%`; ws.getCell(`E${row}`).value = tax; ws.getCell(`E${row}`).numFmt = '"$"#,##0.00'; row++
    ws.getCell(`D${row}`).value = 'TOTAL'; ws.getCell(`D${row}`).font = { bold: true }
    ws.getCell(`E${row}`).value = subtotal + tax; ws.getCell(`E${row}`).numFmt = '"$"#,##0.00'; ws.getCell(`E${row}`).font = { bold: true }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('Error export cotización xlsx:', err.message)
    res.status(500).json({ error: 'Error al exportar' })
  }
})

export default router
