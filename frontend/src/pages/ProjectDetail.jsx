import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, CheckSquare, Pencil, Trash2, AlertTriangle, Search } from 'lucide-react'
import api from '../lib/api'

const columns = [
  { key: 'TODO',        label: 'Por hacer',   color: 'bg-gray-100' },
  { key: 'IN_PROGRESS', label: 'En progreso',  color: 'bg-blue-50' },
  { key: 'REVIEW',      label: 'En revisión',  color: 'bg-yellow-50' },
  { key: 'DONE',        label: 'Completado',   color: 'bg-green-50' }
]

const priorityColor = { LOW: 'text-gray-400', MEDIUM: 'text-blue-500', HIGH: 'text-orange-500', URGENT: 'text-red-500' }
const COLORS = ['#2196F3', '#1D9E75', '#D85A30', '#D4537E', '#7F77DD', '#BA7517', '#888780']

export default function ProjectDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState('tasks')

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', dueDate: '', assigneeId: '' })

  // Project edit form
  const [showEditProject, setShowEditProject] = useState(false)
  const [projForm, setProjForm] = useState({ name: '', description: '', status: 'ACTIVE', startDate: '', endDate: '', color: '#2196F3' })

  // Inventory form
  const [showInvForm, setShowInvForm] = useState(false)
  const [editingInv, setEditingInv] = useState(null)
  const [invForm, setInvForm] = useState({ name: '', sku: '', quantity: '', unit: 'pza', minStock: '', location: '', category: '', unitPrice: '' })
  const [invSearch, setInvSearch] = useState('')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/auth/users').then(r => r.data)
  })

  const createTask = useMutation({
    mutationFn: (data) => api.post('/tasks', { ...data, projectId: id }),
    onSuccess: () => { qc.invalidateQueries(['project', id]); setShowTaskForm(false); setTaskForm({ title: '', description: '', priority: 'MEDIUM', dueDate: '', assigneeId: '' }) }
  })

  const updateTask = useMutation({
    mutationFn: ({ taskId, ...data }) => api.patch(`/tasks/${taskId}`, data),
    onSuccess: () => qc.invalidateQueries(['project', id])
  })

  const updateProject = useMutation({
    mutationFn: (data) => api.patch(`/projects/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['project', id]); qc.invalidateQueries(['projects']); setShowEditProject(false) }
  })

  const saveInv = useMutation({
    mutationFn: (data) => editingInv
      ? api.patch(`/inventory/${editingInv}`, data)
      : api.post('/inventory', { ...data, projectId: id }),
    onSuccess: () => { qc.invalidateQueries(['project', id]); qc.invalidateQueries(['inventory']); qc.invalidateQueries(['inventory-summary']); closeInvForm() }
  })

  const removeInv = useMutation({
    mutationFn: (itemId) => api.delete(`/inventory/${itemId}`),
    onSuccess: () => { qc.invalidateQueries(['project', id]); qc.invalidateQueries(['inventory']); qc.invalidateQueries(['inventory-summary']) }
  })

  const openEditProject = () => {
    setProjForm({
      name: project.name,
      description: project.description || '',
      status: project.status,
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      color: project.color || '#2196F3'
    })
    setShowEditProject(true)
  }

  const openNewInv = () => {
    setEditingInv(null)
    setInvForm({ name: '', sku: '', quantity: '', unit: 'pza', minStock: '', location: '', category: '', unitPrice: '' })
    setShowInvForm(true)
  }

  const openEditInv = (item) => {
    setEditingInv(item.id)
    setInvForm({
      name: item.name, sku: item.sku || '', quantity: String(item.quantity), unit: item.unit,
      minStock: String(item.minStock), location: item.location || '', category: item.category || '',
      unitPrice: item.unitPrice ? String(item.unitPrice) : ''
    })
    setShowInvForm(true)
  }

  const closeInvForm = () => { setShowInvForm(false); setEditingInv(null) }

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Cargando...</div>

  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.key] = project?.tasks?.filter(t => t.status === col.key) || []
    return acc
  }, {})

  const inventory = project?.inventory || []
  const filteredInv = inventory.filter(i =>
    !invSearch || i.name.toLowerCase().includes(invSearch.toLowerCase()) ||
    (i.sku && i.sku.toLowerCase().includes(invSearch.toLowerCase()))
  )

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="w-3.5 h-3.5 rounded-full" style={{ background: project?.color }} />
          <h1 className="text-xl font-semibold text-gray-900">{project?.name}</h1>
          <button onClick={openEditProject} className="text-gray-400 hover:text-brand-500">
            <Pencil size={16} />
          </button>
        </div>
        <button
          onClick={() => tab === 'tasks' ? setShowTaskForm(true) : openNewInv()}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> {tab === 'tasks' ? 'Nueva tarea' : 'Agregar pieza'}
        </button>
      </div>
      {project?.description && <p className="text-sm text-gray-500 mb-4">{project.description}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button onClick={() => setTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'tasks' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <CheckSquare size={15} /> Tareas <span className="text-xs text-gray-400">({project?.tasks?.length || 0})</span>
        </button>
        <button onClick={() => setTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'inventory' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Package size={15} /> Inventario <span className="text-xs text-gray-400">({inventory.length})</span>
        </button>
      </div>

      {/* TAB: Tasks (Kanban) */}
      {tab === 'tasks' && (
        <div className="flex gap-3 md:gap-4 flex-1 overflow-x-auto pb-4 scrollbar-thin">
          {columns.map(col => (
            <div key={col.key} className="flex-1 min-w-[160px] sm:min-w-[220px]">
              <div className={`rounded-xl ${col.color} p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">{col.label}</h3>
                  <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{tasksByStatus[col.key].length}</span>
                </div>
                <div className="space-y-2">
                  {tasksByStatus[col.key].map(task => (
                    <div key={task.id} className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                      <p className="text-sm text-gray-900 font-medium mb-1">{task.title}</p>
                      {task.description && <p className="text-xs text-gray-400 mb-2 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs font-medium ${priorityColor[task.priority]}`}>{task.priority}</span>
                        <select value={task.status} onChange={e => updateTask.mutate({ taskId: task.id, status: e.target.value })}
                          className="text-xs text-gray-500 border-none bg-transparent focus:outline-none cursor-pointer">
                          <option value="TODO">Por hacer</option>
                          <option value="IN_PROGRESS">En progreso</option>
                          <option value="REVIEW">En revisión</option>
                          <option value="DONE">Completado</option>
                        </select>
                      </div>
                      {task.dueDate && <p className="text-xs text-orange-400 mt-1">{new Date(task.dueDate).toLocaleDateString('es-MX')}</p>}
                      {task.assignee && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
                          <div className="w-5 h-5 rounded-full bg-brand-50 flex items-center justify-center text-[9px] font-medium text-brand-600">
                            {task.assignee.name.split(' ').map(n => n[0]).slice(0,2).join('')}
                          </div>
                          <span className="text-xs text-gray-500">{task.assignee.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Inventory */}
      {tab === 'inventory' && (
        <div className="flex-1">
          <div className="relative max-w-xs mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={invSearch} onChange={e => setInvSearch(e.target.value)} placeholder="Buscar pieza"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Pieza</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 font-medium text-right">P. Unit.</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredInv.length === 0 && (
                  <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    Sin piezas en este proyecto. Agrega la primera.
                  </td></tr>
                )}
                {filteredInv.map(item => {
                  const low = item.quantity <= item.minStock
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        {item.category && <div className="text-xs text-gray-400">{item.category}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.sku || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={low ? 'text-orange-600 font-medium' : 'text-gray-900'}>{item.quantity} {item.unit}</span>
                        {low && <AlertTriangle size={12} className="inline ml-1 text-orange-500" />}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.location || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{item.unitPrice ? `$${item.unitPrice.toLocaleString('es-MX')}` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEditInv(item)} className="text-gray-400 hover:text-brand-500"><Pencil size={15} /></button>
                          <button onClick={() => removeInv.mutate(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: New Task */}
      {showTaskForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Nueva tarea</h2>
            <div className="space-y-3">
              <input type="text" placeholder="Título de la tarea" value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              <textarea placeholder="Descripción (opcional)" value={taskForm.description}
                onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none" rows={2} />
              <div className="grid grid-cols-2 gap-2">
                <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="LOW">Baja</option><option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option><option value="URGENT">Urgente</option>
                </select>
                <input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Asignar a</label>
                <select value={taskForm.assigneeId} onChange={e => setTaskForm(f => ({ ...f, assigneeId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="">Sin asignar</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowTaskForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
              <button onClick={() => createTask.mutate(taskForm)} disabled={!taskForm.title || createTask.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                {createTask.isPending ? 'Creando...' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Project */}
      {showEditProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar proyecto</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                <input value={projForm.name} onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                <textarea value={projForm.description} onChange={e => setProjForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Estado</label>
                  <select value={projForm.status} onChange={e => setProjForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                    <option value="ACTIVE">Activo</option><option value="PAUSED">Pausado</option>
                    <option value="COMPLETED">Completado</option><option value="ARCHIVED">Archivado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Color</label>
                  <div className="flex items-center gap-1.5 pt-1.5">
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setProjForm(f => ({ ...f, color: c }))}
                        className="w-6 h-6 rounded-full"
                        style={{ background: c, transform: projForm.color === c ? 'scale(1.2)' : 'scale(1)', outline: projForm.color === c ? '2px solid #00000020' : 'none', outlineOffset: '2px' }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha inicio</label>
                  <input type="date" value={projForm.startDate} onChange={e => setProjForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha entrega</label>
                  <input type="date" value={projForm.endDate} onChange={e => setProjForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowEditProject(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
              <button onClick={() => updateProject.mutate({ ...projForm, startDate: projForm.startDate || null, endDate: projForm.endDate || null })}
                disabled={!projForm.name || updateProject.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                {updateProject.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Inventory item */}
      {showInvForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingInv ? 'Editar pieza' : 'Agregar pieza al proyecto'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                <input value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKU / Código</label>
                <input value={invForm.sku} onChange={e => setInvForm(f => ({ ...f, sku: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                <input value={invForm.category} onChange={e => setInvForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                <input type="number" value={invForm.quantity} onChange={e => setInvForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                <select value={invForm.unit} onChange={e => setInvForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="pza">pza</option><option value="m">m</option><option value="m2">m²</option>
                  <option value="kg">kg</option><option value="L">L</option><option value="caja">caja</option><option value="rollo">rollo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stock mínimo</label>
                <input type="number" value={invForm.minStock} onChange={e => setInvForm(f => ({ ...f, minStock: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio unitario</label>
                <input type="number" step="0.01" value={invForm.unitPrice} onChange={e => setInvForm(f => ({ ...f, unitPrice: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Ubicación</label>
                <input value={invForm.location} onChange={e => setInvForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={closeInvForm} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
              <button onClick={() => saveInv.mutate(invForm)} disabled={!invForm.name || saveInv.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                {saveInv.isPending ? 'Guardando...' : editingInv ? 'Guardar' : 'Agregar pieza'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
