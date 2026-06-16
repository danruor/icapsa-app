import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Package, Plus, Pencil, Trash2, Search, Download, X, ShoppingCart } from 'lucide-react'
import api, { downloadFile } from '../lib/api'

const statusBadge = {
  DRAFT:    'bg-gray-100 text-gray-600',
  SENT:     'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED:  'bg-yellow-100 text-yellow-700'
}
const statusLabel = { DRAFT: 'Borrador', SENT: 'Enviada', APPROVED: 'Aprobada', REJECTED: 'Rechazada', EXPIRED: 'Vencida' }

export default function Quotes() {
  const qc = useQueryClient()
  const [view, setView] = useState('quotes') // quotes | products

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={20} className="text-brand-500" />
        <h1 className="text-xl font-semibold text-gray-900">Cotizaciones</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Genera cotizaciones para clientes con tu catálogo de productos</p>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button onClick={() => setView('quotes')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === 'quotes' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <FileText size={15} /> Cotizaciones
        </button>
        <button onClick={() => setView('products')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === 'products' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Package size={15} /> Catálogo de productos
        </button>
      </div>

      {view === 'products' ? <ProductsView /> : <QuotesView />}
    </div>
  )
}

// ===== CATÁLOGO DE PRODUCTOS =====
function ProductsView() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', sku: '', category: '', unit: 'pza', price: '', cost: '', description: '' })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/quotes/products').then(r => r.data)
  })

  const save = useMutation({
    mutationFn: (data) => editing ? api.patch(`/quotes/products/${editing}`, data) : api.post('/quotes/products', data),
    onSuccess: () => { qc.invalidateQueries(['products']); close() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/quotes/products/${id}`),
    onSuccess: () => qc.invalidateQueries(['products'])
  })

  const openNew = () => { setEditing(null); setForm({ name: '', sku: '', category: '', unit: 'pza', price: '', cost: '', description: '' }); setShowForm(true) }
  const openEdit = (p) => { setEditing(p.id); setForm({ name: p.name, sku: p.sku || '', category: p.category || '', unit: p.unit, price: String(p.price), cost: p.cost ? String(p.cost) : '', description: p.description || '' }); setShowForm(true) }
  const close = () => { setShowForm(false); setEditing(null) }

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-right">Precio</th>
              <th className="px-4 py-3 font-medium text-right">Costo</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400">
                <Package size={32} className="mx-auto mb-2 opacity-30" />Sin productos. Agrega el primero.
              </td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{p.name}</div>
                  {p.description && <div className="text-xs text-gray-400 line-clamp-1">{p.description}</div>}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.sku || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.category || '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">${p.price.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                <td className="px-4 py-3 text-right text-gray-400">{p.cost ? `$${p.cost.toLocaleString('es-MX')}` : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-brand-500"><Pencil size={15} /></button>
                    <button onClick={() => { if (confirm(`¿Eliminar ${p.name}?`)) remove.mutate(p.id) }} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKU</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio de venta *</label>
                <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Costo (opcional)</label>
                <input type="number" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="pza">pza</option><option value="m">m</option><option value="m2">m²</option>
                  <option value="kg">kg</option><option value="L">L</option><option value="servicio">servicio</option><option value="lote">lote</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none" rows={2} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={close} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
              <button onClick={() => save.mutate(form)} disabled={!form.name || save.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                {save.isPending ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== COTIZACIONES =====
function QuotesView() {
  const qc = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingQuote, setEditingQuote] = useState(null)

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => api.get('/quotes').then(r => r.data)
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/quotes/${id}`),
    onSuccess: () => qc.invalidateQueries(['quotes'])
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/quotes/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries(['quotes'])
  })

  if (showBuilder) {
    return <QuoteBuilder
      existing={editingQuote}
      onClose={() => { setShowBuilder(false); setEditingQuote(null); qc.invalidateQueries(['quotes']) }}
    />
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditingQuote(null); setShowBuilder(true) }}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nueva cotización
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium">Folio</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && quotes.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />Sin cotizaciones. Crea la primera.
              </td></tr>
            )}
            {quotes.map(q => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{q.folio}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-900">{q.clientName}</div>
                  {q.clientEmail && <div className="text-xs text-gray-400">{q.clientEmail}</div>}
                </td>
                <td className="px-4 py-3">
                  <select value={q.status} onChange={e => updateStatus.mutate({ id: q.id, status: e.target.value })}
                    className={`text-xs px-2 py-1 rounded-full font-medium border-none cursor-pointer ${statusBadge[q.status]}`}>
                    {Object.entries(statusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">${q.total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(q.createdAt).toLocaleDateString('es-MX')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => downloadFile(`/export/quote/${q.id}.pdf`, `${q.folio}.pdf`)} title="PDF" className="text-gray-400 hover:text-brand-500"><Download size={15} /></button>
                    <button onClick={() => { setEditingQuote(q.id); setShowBuilder(true) }} className="text-gray-400 hover:text-brand-500"><Pencil size={15} /></button>
                    <button onClick={() => { if (confirm(`¿Eliminar ${q.folio}?`)) remove.mutate(q.id) }} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ===== CONSTRUCTOR DE COTIZACIÓN =====
function QuoteBuilder({ existing, onClose }) {
  const qc = useQueryClient()
  const [client, setClient] = useState({ clientName: '', clientEmail: '', clientPhone: '', notes: '', taxRate: 16, validUntil: '' })
  const [items, setItems] = useState([])
  const [productSearch, setProductSearch] = useState('')

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/quotes/products').then(r => r.data)
  })

  // Cargar cotización existente
  const { data: existingData } = useQuery({
    queryKey: ['quote', existing],
    queryFn: () => api.get(`/quotes/${existing}`).then(r => r.data),
    enabled: !!existing
  })

  // Inicializar form con datos existentes
  if (existingData && client.clientName === '' && items.length === 0 && existingData.clientName) {
    setClient({
      clientName: existingData.clientName, clientEmail: existingData.clientEmail || '',
      clientPhone: existingData.clientPhone || '', notes: existingData.notes || '',
      taxRate: existingData.taxRate, validUntil: existingData.validUntil ? existingData.validUntil.split('T')[0] : ''
    })
    setItems(existingData.items.map(i => ({ name: i.name, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, productId: i.productId })))
  }

  const save = useMutation({
    mutationFn: (data) => existing ? api.patch(`/quotes/${existing}`, data) : api.post('/quotes', data),
    onSuccess: onClose,
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const addProduct = (p) => {
    setItems(prev => [...prev, { name: p.name, unit: p.unit, quantity: 1, unitPrice: p.price, discount: 0, productId: p.id }])
    setProductSearch('')
  }

  const addBlankItem = () => setItems(prev => [...prev, { name: '', unit: 'pza', quantity: 1, unitPrice: 0, discount: 0, productId: null }])
  const updateItem = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const subtotal = items.reduce((s, it) => s + (it.unitPrice * it.quantity - it.discount), 0)
  const tax = subtotal * (client.taxRate / 100)
  const total = subtotal + tax

  const filteredProducts = products.filter(p => productSearch && p.name.toLowerCase().includes(productSearch.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <X size={16} /> Cerrar
        </button>
        <button onClick={() => save.mutate({ ...client, items })} disabled={!client.clientName || items.length === 0 || save.isPending}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
          {save.isPending ? 'Guardando...' : existing ? 'Guardar cambios' : 'Crear cotización'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datos del cliente */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Datos del cliente</h3>
            <div className="space-y-3">
              <input value={client.clientName} onChange={e => setClient(c => ({ ...c, clientName: e.target.value }))} placeholder="Nombre del cliente *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              <input value={client.clientEmail} onChange={e => setClient(c => ({ ...c, clientEmail: e.target.value }))} placeholder="Correo"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              <input value={client.clientPhone} onChange={e => setClient(c => ({ ...c, clientPhone: e.target.value }))} placeholder="Teléfono"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">IVA %</label>
                  <input type="number" value={client.taxRate} onChange={e => setClient(c => ({ ...c, taxRate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Válida hasta</label>
                  <input type="date" value={client.validUntil} onChange={e => setClient(c => ({ ...c, validUntil: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <textarea value={client.notes} onChange={e => setClient(c => ({ ...c, notes: e.target.value }))} placeholder="Notas"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none" rows={2} />
            </div>

            {/* Totales */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>${subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
              <div className="flex justify-between text-sm text-gray-600"><span>IVA ({client.taxRate}%)</span><span>${tax.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-100"><span>Total</span><span>${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">Conceptos</h3>
            </div>

            {/* Buscar producto del catálogo */}
            <div className="relative mb-4">
              <ShoppingCart size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar producto del catálogo para agregar..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              {filteredProducts.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-gray-400">${p.price.toLocaleString('es-MX')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista de items */}
            <div className="space-y-2">
              {items.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Busca productos arriba o agrega un concepto manual</p>}
              {items.map((it, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <input value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Concepto"
                    className="flex-1 min-w-[120px] border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                  <input type="number" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} title="Cantidad"
                    className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                  <input type="number" step="0.01" value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)} title="Precio unit."
                    className="w-24 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500" />
                  <span className="text-sm text-gray-600 w-24 text-right">${(it.unitPrice * it.quantity - it.discount).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                  <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            <button onClick={addBlankItem} className="mt-3 text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1">
              <Plus size={15} /> Agregar concepto manual
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
