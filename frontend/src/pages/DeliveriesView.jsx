import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, PackageCheck, X, Search, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import api from '../lib/api'

export default function DeliveriesView({ inventory, projects }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => api.get('/deliveries').then(r => r.data)
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/deliveries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['deliveries'])
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventory-summary'])
    },
    onError: (e) => alert(e.response?.data?.error || 'Error al eliminar')
  })

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nueva entrega
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Folio</th>
              <th className="px-4 py-3 font-medium">Destinatario</th>
              <th className="px-4 py-3 font-medium">Cotización</th>
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium text-center">Artículos</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && deliveries.length === 0 && (
              <tr><td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                <PackageCheck size={32} className="mx-auto mb-2 opacity-30" />Sin entregas registradas. Crea la primera.
              </td></tr>
            )}
            {deliveries.map(d => (
              <>
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-gray-400 hover:text-gray-600">
                      {expanded === d.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.folio}</td>
                  <td className="px-4 py-3 text-gray-700">{d.recipient}</td>
                  <td className="px-4 py-3">{d.quote ? <span className="text-xs text-brand-600">{d.quote.folio}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {d.project ? (
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.project.color }} />{d.project.name}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{d.itemCount}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(d.date).toLocaleDateString('es-MX')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { if (confirm(`¿Eliminar ${d.folio}? El material entregado regresará al inventario.`)) remove.mutate(d.id) }}
                      className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
                {expanded === d.id && (
                  <tr key={d.id + '-detail'}>
                    <td colSpan="8" className="px-4 py-3 bg-gray-50">
                      <div className="text-xs text-gray-500 mb-2">Artículos entregados:</div>
                      <div className="space-y-1">
                        {d.movements.map(m => (
                          <div key={m.id} className="flex items-center justify-between text-sm bg-white rounded px-3 py-1.5 border border-gray-100">
                            <span className="text-gray-700">{m.item.name}</span>
                            <span className="text-orange-600">−{m.quantity} {m.item.unit}</span>
                          </div>
                        ))}
                      </div>
                      {d.notes && <p className="text-xs text-gray-400 mt-2">Nota: {d.notes}</p>}
                      {d.signature && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">Firma de recibido:</p>
                          <img src={d.signature} alt="Firma" className="h-20 bg-white border border-gray-200 rounded" />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <DeliveryForm inventory={inventory} projects={projects}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries(['deliveries'])
            qc.invalidateQueries(['inventory'])
            qc.invalidateQueries(['inventory-summary'])
          }} />
      )}
    </div>
  )
}

function DeliveryForm({ inventory, projects, onClose, onSaved }) {
  const [header, setHeader] = useState({ recipient: '', notes: '', date: new Date().toISOString().split('T')[0], projectId: '', quoteId: '' })
  const [signature, setSignature] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')

  const { data: quotesList = [] } = useQuery({
    queryKey: ['deliveries-quotes'],
    queryFn: () => api.get('/deliveries/list/quotes').then(r => r.data)
  })

  const save = useMutation({
    mutationFn: (data) => api.post('/deliveries', data),
    onSuccess: onSaved,
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const addItem = (invItem) => {
    if (items.some(i => i.itemId === invItem.id)) return
    setItems(prev => [...prev, { itemId: invItem.id, name: invItem.name, unit: invItem.unit, available: invItem.quantity, quantity: 1 }])
    setSearch('')
  }
  const updateItem = (idx, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it))
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  // Solo artículos con stock > 0
  const filtered = inventory.filter(p => search && p.quantity > 0 && p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Nueva entrega de material</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Destinatario / recibe *</label>
            <input value={header.recipient} onChange={e => setHeader(h => ({ ...h, recipient: e.target.value }))}
              placeholder="Ej: Cuadrilla de campo, cliente..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha</label>
            <input type="date" value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cotización (opcional)</label>
            <select value={header.quoteId} onChange={e => setHeader(h => ({ ...h, quoteId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
              <option value="">Sin cotización</option>
              {quotesList.map(q => <option key={q.id} value={q.id}>{q.folio} — {q.clientName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proyecto (opcional)</label>
            <select value={header.projectId} onChange={e => setHeader(h => ({ ...h, projectId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
              <option value="">Sin proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Buscar artículo */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículo del inventario para entregar..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          {filtered.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
              {filtered.map(p => (
                <button key={p.id} onClick={() => addItem(p)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-gray-400">disp: {p.quantity} {p.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-2 mb-4">
          {items.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Busca artículos del inventario para entregar</p>}
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <span className="flex-1 text-sm text-gray-700 px-1">{it.name}</span>
              <span className="text-xs text-gray-400">disp: {it.available}</span>
              <input type="number" max={it.available} value={it.quantity} onChange={e => updateItem(idx, e.target.value)} title="Cantidad a entregar"
                className={`w-20 border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500 ${it.quantity > it.available ? 'border-red-400 text-red-600' : 'border-gray-200'}`} />
              <span className="text-sm text-gray-500 w-10">{it.unit}</span>
              <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Firma de recibido (opcional)</label>
          <SignaturePad onChange={setSignature} />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg">Cancelar</button>
          <button onClick={() => save.mutate({ ...header, items, signature })}
            disabled={!header.recipient || items.length === 0 || items.some(i => i.quantity > i.available || i.quantity <= 0) || save.isPending}
            className="bg-brand-500 text-white text-sm py-2 px-4 rounded-lg disabled:opacity-50">
            {save.isPending ? 'Registrando...' : 'Registrar salida'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ===== Pad de firma (canvas táctil, sin dependencias) =====
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    // Ajustar resolución al tamaño real
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasInk.current = true
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    if (hasInk.current) onChange(canvasRef.current.toDataURL('image/png'))
  }
  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas ref={canvasRef}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        className="w-full h-32 border border-dashed border-gray-300 rounded-lg bg-gray-50 touch-none cursor-crosshair" />
      <div className="flex justify-between items-center mt-1">
        <p className="text-xs text-gray-400">Firma de quien recibe (con el dedo o mouse)</p>
        <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-red-500">Limpiar</button>
      </div>
    </div>
  )
}
