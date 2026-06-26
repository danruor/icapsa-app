import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Truck, X, ShoppingCart, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../lib/api'

export default function PurchaseOrdersView({ inventory, projects }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get('/purchase-orders').then(r => r.data)
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/purchase-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['purchase-orders'])
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
          <Plus size={16} /> Nueva orden de compra
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Folio</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium text-center">Artículos</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && orders.length === 0 && (
              <tr><td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Sin órdenes de compra. Crea la primera.
              </td></tr>
            )}
            {orders.map(o => (
              <>
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="text-gray-400 hover:text-gray-600">
                      {expanded === o.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.folio}</td>
                  <td className="px-4 py-3 text-gray-700">{o.supplier}</td>
                  <td className="px-4 py-3">
                    {o.project ? (
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.project.color }} />{o.project.name}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">${o.total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(o.date).toLocaleDateString('es-MX')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { if (confirm(`¿Eliminar ${o.folio}? Se revertirá el stock que esta orden agregó.`)) remove.mutate(o.id) }}
                      className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
                {expanded === o.id && (
                  <tr key={o.id + '-detail'}>
                    <td colSpan="8" className="px-4 py-3 bg-gray-50">
                      <div className="text-xs text-gray-500 mb-2">Artículos recibidos:</div>
                      <div className="space-y-1">
                        {o.movements.map(m => (
                          <div key={m.id} className="flex items-center justify-between text-sm bg-white rounded px-3 py-1.5 border border-gray-100">
                            <span className="text-gray-700">{m.item.name}</span>
                            <span className="text-gray-500">+{m.quantity} {m.item.unit} {m.unitPrice ? `· $${m.unitPrice.toLocaleString('es-MX')}` : ''}</span>
                          </div>
                        ))}
                      </div>
                      {o.notes && <p className="text-xs text-gray-400 mt-2">Nota: {o.notes}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PurchaseOrderForm inventory={inventory} projects={projects}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries(['purchase-orders'])
            qc.invalidateQueries(['inventory'])
            qc.invalidateQueries(['inventory-summary'])
          }} />
      )}
    </div>
  )
}

function PurchaseOrderForm({ inventory, projects, onClose, onSaved }) {
  const [header, setHeader] = useState({ supplier: '', notes: '', date: new Date().toISOString().split('T')[0], projectId: '' })
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')

  const save = useMutation({
    mutationFn: (data) => api.post('/purchase-orders', data),
    onSuccess: onSaved,
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const addExisting = (invItem) => {
    if (items.some(i => i.itemId === invItem.id)) return
    setItems(prev => [...prev, { itemId: invItem.id, name: invItem.name, unit: invItem.unit, quantity: 1, unitPrice: invItem.unitPrice || '' }])
    setSearch('')
  }
  const addNew = () => setItems(prev => [...prev, { itemId: null, name: '', unit: 'pza', quantity: 1, unitPrice: '', isNew: true }])
  const updateItem = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const total = items.reduce((s, it) => s + (it.quantity * (parseFloat(it.unitPrice) || 0)), 0)
  const filtered = inventory.filter(p => search && p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Nueva orden de compra</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proveedor *</label>
            <input value={header.supplier} onChange={e => setHeader(h => ({ ...h, supplier: e.target.value }))}
              placeholder="Ej: Electro Industrial SA"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha</label>
            <input type="date" value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Proyecto (opcional)</label>
            <select value={header.projectId} onChange={e => setHeader(h => ({ ...h, projectId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
              <option value="">Sin proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Buscar artículo existente */}
        <div className="relative mb-3">
          <ShoppingCart size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículo existente para surtir..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          {filtered.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
              {filtered.map(p => (
                <button key={p.id} onClick={() => addExisting(p)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-gray-400">{p.quantity} {p.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-2 mb-2">
          {items.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Busca artículos existentes o agrega uno nuevo</p>}
          {items.map((it, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg">
              {it.isNew ? (
                <input value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Nombre del artículo nuevo"
                  className="flex-1 min-w-[120px] border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
              ) : (
                <span className="flex-1 min-w-[120px] text-sm text-gray-700 px-1">{it.name}</span>
              )}
              {it.isNew && (
                <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="ud"
                  className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
              )}
              <input type="number" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} title="Cantidad"
                className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
              <input type="number" step="0.01" value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)} placeholder="$ unit." title="Precio unitario"
                className="w-24 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
              <span className="text-sm text-gray-600 w-24 text-right">${(it.quantity * (parseFloat(it.unitPrice) || 0)).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
              <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button onClick={addNew} className="text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1 mb-4">
          <Plus size={15} /> Agregar artículo nuevo
        </button>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-500">Total: <span className="font-semibold text-gray-900">${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg">Cancelar</button>
            <button onClick={() => save.mutate({ ...header, items })} disabled={!header.supplier || items.length === 0 || save.isPending}
              className="bg-brand-500 text-white text-sm py-2 px-4 rounded-lg disabled:opacity-50">
              {save.isPending ? 'Guardando...' : 'Registrar entrada'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
