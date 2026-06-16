import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, AlertTriangle, Boxes, DollarSign, Search, Trash2, Pencil } from 'lucide-react'
import api from '../lib/api'

export default function Inventory() {
  const qc = useQueryClient()
  const [filterProject, setFilterProject] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '', sku: '', quantity: '', unit: 'pza', minStock: '',
    location: '', category: '', unitPrice: '', projectId: ''
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory', filterProject],
    queryFn: () => api.get('/inventory', { params: filterProject ? { projectId: filterProject } : {} }).then(r => r.data)
  })

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api.get('/inventory/summary').then(r => r.data)
  })

  const save = useMutation({
    mutationFn: (data) => editing
      ? api.patch(`/inventory/${editing}`, data)
      : api.post('/inventory', data),
    onSuccess: () => {
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventory-summary'])
      closeForm()
    }
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/inventory/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventory-summary'])
    }
  })

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', sku: '', quantity: '', unit: 'pza', minStock: '', location: '', category: '', unitPrice: '', projectId: filterProject || '' })
    setShowForm(true)
  }

  const openEdit = (item) => {
    setEditing(item.id)
    setForm({
      name: item.name, sku: item.sku || '', quantity: String(item.quantity),
      unit: item.unit, minStock: String(item.minStock), location: item.location || '',
      category: item.category || '', unitPrice: item.unitPrice ? String(item.unitPrice) : '',
      projectId: item.projectId || ''
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null) }

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku && i.sku.toLowerCase().includes(search.toLowerCase()))
  )

  const cards = [
    { label: 'Artículos', value: summary?.totalItems ?? 0, icon: Package, color: 'text-brand-500' },
    { label: 'Unidades totales', value: summary?.totalUnits ?? 0, icon: Boxes, color: 'text-blue-500' },
    { label: 'Stock bajo', value: summary?.lowStockCount ?? 0, icon: AlertTriangle, color: 'text-orange-500' },
    { label: 'Valor total', value: `$${(summary?.totalValue ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-green-500' }
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} artículos</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nuevo artículo
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className="text-2xl font-semibold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        >
          <option value="">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium text-right">Cantidad</th>
              <th className="px-4 py-3 font-medium">Ubicación</th>
              <th className="px-4 py-3 font-medium text-right">P. Unit.</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                Sin artículos. Agrega el primero.
              </td></tr>
            )}
            {filtered.map(item => {
              const low = item.quantity <= item.minStock
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    {item.category && <div className="text-xs text-gray-400">{item.category}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.sku || '—'}</td>
                  <td className="px-4 py-3">
                    {item.project ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ background: item.project.color }} />
                        {item.project.name}
                      </span>
                    ) : <span className="text-xs text-gray-400">General</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={low ? 'text-orange-600 font-medium' : 'text-gray-900'}>
                      {item.quantity} {item.unit}
                    </span>
                    {low && <AlertTriangle size={12} className="inline ml-1 text-orange-500" />}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.location || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {item.unitPrice ? `$${item.unitPrice.toLocaleString('es-MX')}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-brand-500">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove.mutate(item.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editing ? 'Editar artículo' : 'Nuevo artículo'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKU / Código</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="pza">pza</option>
                  <option value="m">m</option>
                  <option value="m2">m²</option>
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="caja">caja</option>
                  <option value="rollo">rollo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stock mínimo</label>
                <input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio unitario</label>
                <input type="number" step="0.01" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ubicación</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Proyecto</label>
                <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="">Inventario general (sin proyecto)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={closeForm} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => save.mutate(form)} disabled={!form.name || save.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {save.isPending ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear artículo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
