// Dibujo del plano de sellado (packing plan) en PDF con pdfkit — mismas reglas que lib/roxtec.js
import { MODULES, WEDGE_HEIGHT, BAR, framePacking, layoutGeometry, moduleColor } from './roxtec.js'

const DIM = 26 // mm reservados a la izquierda para la cota de altura

function hatch(doc, x, y, w, h) {
  doc.save().rect(x, y, w, h).clip().lineWidth(0.4).strokeColor('#9CA3AF')
  for (let d = -h; d < w; d += 4) doc.moveTo(x + d, y + h).lineTo(x + d + h, y).stroke()
  doc.restore()
}

// Dibuja el layout a escala dentro del rectángulo (x, y, maxW × maxH). Devuelve la altura usada en puntos.
export function drawLayout(doc, layout, x, y, maxW, maxH = 250) {
  const geo = layoutGeometry(layout, 20)
  if (!geo.frames.length) { doc.fontSize(8).fillColor('#9CA3AF').text('Sin marcos dibujados', x, y); return 14 }
  const scale = Math.min(maxW / (geo.width + DIM), maxH / (geo.height + 16), 1.5)
  const S = (mm) => mm * scale
  const ox = x + S(DIM), oy = y
  layout.frames.forEach((f, fi) => {
    const g = geo.frames[fi]
    const pk = framePacking(f)
    doc.save().lineWidth(1).rect(ox + S(g.x), oy, S(g.w), S(g.h)).fillAndStroke('#9CA3AF', '#374151').restore()
    g.bays.forEach((b, bi) => {
      const bay = f.bays[bi]
      const bx = ox + S(b.x), top = oy + S(b.y), bottom = top + S(b.h)
      doc.rect(bx, top, S(b.w), S(b.h)).fill('#F3F4F6')
      let yCur = bottom
      for (const r of bay.rows) {
        const rh = S(r.h); yCur -= rh
        let xCur = bx
        for (const m of r.modules) {
          const spec = MODULES[m.sku]; const mw = S(spec.w)
          const spare = !m.cables.length
          doc.save().lineWidth(0.5).rect(xCur, yCur, mw, rh).fillAndStroke(m.solid ? '#6B7280' : spare ? '#FFFFFF' : moduleColor(m.sku), '#374151').restore()
          if (spare && !m.solid) hatch(doc, xCur, yCur, mw, rh)
          const n = m.cables.length
          const fs = Math.max(3.5, Math.min(7, rh * 0.3))
          let tagInside = false
          m.cables.forEach((c, ci) => {
            const cx = xCur + mw * ((ci + 0.5) / n), cy = yCur + rh / 2
            const maxR = Math.min(mw / n, rh) * 0.42
            const rad = c.d ? Math.min(S(c.d) / 2, maxR) : maxR * 0.6
            doc.save().lineWidth(0.5).circle(cx, cy, rad).fillAndStroke('#1F2937', '#111827').restore()
            // cable grande: etiqueta en blanco dentro del círculo (como Transit Designer)
            if (n === 1 && rad >= 7 && (c.tag || c.d)) {
              tagInside = true
              const t1 = c.tag || `Ø${c.d}`
              doc.fontSize(Math.min(fs, rad * 0.5)).fillColor('#FFFFFF').text(t1, cx - rad, cy - (c.tag && c.d ? fs * 0.75 : fs * 0.35), { width: rad * 2, align: 'center', lineBreak: false })
              if (c.tag && c.d) doc.fontSize(Math.min(fs - 1, rad * 0.4)).fillColor('#D1D5DB').text(`Ø${c.d}`, cx - rad, cy + 1, { width: rad * 2, align: 'center', lineBreak: false })
            }
          })
          if (rh > 8 && mw > 12) {
            doc.fontSize(fs).fillColor(m.solid ? '#F9FAFB' : '#111827').text(spec.name.replace('RM ', '') + (m.solid ? '/0' : ''), xCur, yCur + 1, { width: mw, align: 'center', lineBreak: false })
            const tag = m.cables.map(c => c.tag || (c.d ? `Ø${c.d}` : '')).filter(Boolean).join(' / ')
            if (tag && rh > 15 && !tagInside) doc.fontSize(Math.max(3, fs - 1.5)).fillColor('#111827').text(tag, xCur, yCur + rh - fs, { width: mw, align: 'center', lineBreak: false })
            else if (spare && !m.solid && rh > 15) doc.fontSize(Math.max(3, fs - 1.5)).fillColor('#6B7280').text('reserva', xCur, yCur + rh - fs, { width: mw, align: 'center', lineBreak: false })
          }
          xCur += mw
        }
        doc.save().lineWidth(Math.max(0.8, S(1.5))).strokeColor('#111827').moveTo(bx, yCur).lineTo(bx + S(b.w), yCur).stroke().restore()
      }
      const used = bay.rows.reduce((s, r) => s + r.h, 0)
      const packTop = bottom - S(pk)
      if (used < pk) {
        doc.save().lineWidth(0.5).rect(bx, packTop, S(b.w), S(pk - used)).fillAndStroke('#FEE2E2', '#EF4444').restore()
        if (S(pk - used) > 9) doc.fontSize(5).fillColor('#B91C1C').text(bay.rows.length ? `faltan ${pk - used} mm` : 'abertura vacía', bx, packTop + S(pk - used) / 2 - 3, { width: S(b.w), align: 'center', lineBreak: false })
      }
      if (bay.rows.length) {
        const wTop = packTop - S(WEDGE_HEIGHT)
        doc.save().lineWidth(0.5).moveTo(bx + S(5), wTop).lineTo(bx + S(b.w) - S(5), wTop).lineTo(bx + S(b.w), packTop).lineTo(bx, packTop).closePath().fillAndStroke('#FCD34D', '#92400E').restore()
        doc.fontSize(Math.max(3.5, Math.min(6, S(WEDGE_HEIGHT) * 0.32))).fillColor('#78350F').text('WEDGE 120', bx, wTop + S(WEDGE_HEIGHT) / 2 - 3, { width: S(b.w), align: 'center', lineBreak: false })
      }
    })
    doc.fontSize(6).fillColor('#374151').text(f.type === 'CUSTOM' ? `${f.sku} · ${pk} mm` : `${f.type} ${f.size}x${f.cols}`, ox + S(g.x), oy + S(g.h) + 2, { width: S(g.w), align: 'center', lineBreak: false })
    doc.fontSize(5).fillColor('#6B7280').text(`${pk} mm`, x, oy + S(g.h) - S(BAR) - S(pk) / 2 - 3, { width: S(DIM) - 2, align: 'right', lineBreak: false })
    doc.save().lineWidth(0.4).strokeColor('#9CA3AF').moveTo(x + S(DIM) - 1, oy + S(g.h) - S(BAR)).lineTo(x + S(DIM) - 1, oy + S(g.h) - S(BAR) - S(pk)).stroke().restore()
  })
  return S(geo.height) + 12
}

// Tabla simple de material: cols = [{ key, label, width, align }]
export function drawTable(doc, x, y, cols, rows, opts = {}) {
  const rowH = opts.rowH || 13, fs = opts.fontSize || 7.5
  const totalW = cols.reduce((s, c) => s + c.width, 0)
  const header = (yy) => {
    doc.rect(x, yy, totalW, rowH).fill(opts.headerColor || '#22A2DE')
    let cx = x
    doc.fontSize(fs).fillColor('#FFFFFF')
    for (const c of cols) { doc.text(c.label, cx + 3, yy + 3.5, { width: c.width - 6, align: c.align || 'left', lineBreak: false }); cx += c.width }
    return yy + rowH
  }
  let yy = header(y), segStart = y
  const border = (from, to) => doc.save().lineWidth(0.5).strokeColor('#E5E7EB').rect(x, from, totalW, to - from).stroke().restore()
  rows.forEach((r, i) => {
    if (yy + rowH > doc.page.height - doc.page.margins.bottom) { border(segStart, yy); doc.addPage(); segStart = doc.page.margins.top; yy = header(segStart) }
    if (i % 2 === 0) doc.rect(x, yy, totalW, rowH).fill('#F9FAFB')
    let cx = x
    for (const c of cols) {
      const v = r[c.key]
      doc.fontSize(fs).fillColor(r._color?.[c.key] || (r._bold ? '#111827' : '#374151'))
      doc.text(v === null || v === undefined ? '' : String(v), cx + 3, yy + 3.5, { width: c.width - 6, align: c.align || 'left', lineBreak: false })
      cx += c.width
    }
    yy += rowH
  })
  border(segStart, yy)
  return yy
}
