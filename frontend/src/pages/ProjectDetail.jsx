import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, CheckSquare, Pencil, Trash2, AlertTriangle, Search, Activity, Download, FileText, Camera, Image as ImageIcon, MapPin, DollarSign, Users, UserPlus, X } from 'lucide-react'
import api, { downloadFile } from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { LocationMap, LocationPicker } from '../components/MapView'

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
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const [tab, setTab] = useState('tasks')

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', dueDate: '', assigneeId: '' })

  // Project edit form
  const [showEditProject, setShowEditProject] = useState(false)
  const [projForm, setProjForm] = useState({ name: '', description: '', status: 'ACTIVE', startDate: '', endDate: '', color: '#2196F3', client: '', budget: '', address: '', latitude: null, longitude: null })

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

  const { data: activity = [] } = useQuery({
    queryKey: ['project-activity', id],
    queryFn: () => api.get(`/projects/${id}/activity`).then(r => r.data),
    enabled: tab === 'activity'
  })

  const { data: projectQuotes = [] } = useQuery({
    queryKey: ['project-quotes', id],
    queryFn: () => api.get(`/projects/${id}/quotes`).then(r => r.data),
    enabled: tab === 'budgets'
  })

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', id],
    queryFn: () => api.get(`/projects/${id}/members`).then(r => r.data),
    enabled: tab === 'members'
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/auth/users').then(r => r.data),
    enabled: tab === 'members'
  })

  const addMember = useMutation({
    mutationFn: (userId) => api.post(`/projects/${id}/members`, { userId }),
    onSuccess: () => { qc.invalidateQueries(['project-members', id]); qc.invalidateQueries(['project', id]) },
    onError: (e) => alert(e.response?.data?.error || 'Error al agregar miembro')
  })

  const removeMember = useMutation({
    mutationFn: (userId) => api.delete(`/projects/${id}/members/${userId}`),
    onSuccess: () => { qc.invalidateQueries(['project-members', id]); qc.invalidateQueries(['project', id]) }
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

  const [uploadingTask, setUploadingTask] = useState(null)

  const uploadPhoto = async (taskId, file) => {
    setUploadingTask(taskId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('taskId', taskId)
      fd.append('projectId', id)
      await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries(['project', id])
      qc.invalidateQueries(['task-files', taskId])
    } catch (err) {
      alert('Error al subir la foto')
    } finally {
      setUploadingTask(null)
    }
  }

  const openEditProject = () => {
    setProjForm({
      name: project.name,
      description: project.description || '',
      status: project.status,
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      color: project.color || '#2196F3',
      client: project.client || '',
      budget: project.budget != null ? String(project.budget) : '',
      address: project.address || '',
      latitude: project.latitude ?? null,
      longitude: project.longitude ?? null
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
    <div className="p-4 md:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: project?.color }} />
          <h1 className="text-lg md:text-xl font-semibold text-gray-900 truncate">{project?.name}</h1>
          <button onClick={openEditProject} className="text-gray-400 hover:text-brand-500 flex-shrink-0">
            <Pencil size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => downloadFile(`/export/project/${id}.pdf`, 'proyecto.pdf')}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg">
            <FileText size={16} /> <span className="hidden sm:inline">PDF</span>
          </button>
          {(tab === 'tasks' || tab === 'inventory') && (
            <button onClick={() => tab === 'tasks' ? setShowTaskForm(true) : openNewInv()}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus size={16} /> <span className="hidden sm:inline">{tab === 'tasks' ? 'Nueva tarea' : 'Agregar pieza'}</span>
            </button>
          )}
        </div>
      </div>
      {project?.description && <p className="text-sm text-gray-500 mb-2">{project.description}</p>}
      {/* Info ejecutiva */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500 mb-4">
        {project?.client && <span className="flex items-center gap-1"><Users size={14} className="text-gray-400" /> {project.client}</span>}
        {project?.budget != null && <span className="flex items-center gap-1"><DollarSign size={14} className="text-gray-400" /> Presupuesto: <span className="font-medium text-gray-700">${project.budget.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span></span>}
        {project?.address && <span className="flex items-center gap-1"><MapPin size={14} className="text-gray-400" /> {project.address}</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-thin -mx-4 px-4 md:mx-0 md:px-0">
        <button onClick={() => setTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${tab === 'tasks' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <CheckSquare size={15} /> Tareas <span className="text-xs text-gray-400">({project?.tasks?.length || 0})</span>
        </button>
        <button onClick={() => setTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${tab === 'inventory' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Package size={15} /> Inventario <span className="text-xs text-gray-400">({inventory.length})</span>
        </button>
        <button onClick={() => setTab('activity')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${tab === 'activity' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Activity size={15} /> Actividad
        </button>
        <button onClick={() => setTab('map')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${tab === 'map' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <MapPin size={15} /> Ubicación
        </button>
        <button onClick={() => setTab('members')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${tab === 'members' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Users size={15} /> Miembros <span className="text-xs text-gray-400">({project?.members?.length || 0})</span>
        </button>
        {isSuperAdmin && (
          <button onClick={() => setTab('budgets')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${tab === 'budgets' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <DollarSign size={15} /> Presupuestos
          </button>
        )}
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
                      <div className="flex items-center gap-2 mt-2">
                        <label className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-500 cursor-pointer">
                          {uploadingTask === task.id ? (
                            <span className="text-xs">Subiendo...</span>
                          ) : (
                            <><Camera size={13} /> Foto</>
                          )}
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => e.target.files[0] && uploadPhoto(task.id, e.target.files[0])} />
                        </label>
                        {task._count?.files > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <ImageIcon size={12} /> {task._count.files}
                          </span>
                        )}
                      </div>
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

      {/* TAB: Activity */}
      {tab === 'activity' && (
        <div className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {activity.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Activity size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin actividad registrada aún</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-xs font-medium text-brand-600 flex-shrink-0">
                      {a.user.name.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </div>
                    <div className="flex-1 min-w-0 pb-4 border-b border-gray-50">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{a.user.name}</span> {a.detail}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(a.createdAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Ubicación (Mapa) */}
      {tab === 'map' && (
        <div className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">Ubicación de la obra</h3>
                {project?.address && <p className="text-xs text-gray-400 mt-0.5">{project.address}</p>}
              </div>
              <button onClick={openEditProject} className="text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1">
                <Pencil size={14} /> Editar ubicación
              </button>
            </div>
            {project?.latitude && project?.longitude ? (
              <>
                <LocationMap latitude={project.latitude} longitude={project.longitude} label={project.name} height={420} />
                <div className="flex items-center gap-2 mt-3">
                  <a href={`https://www.google.com/maps?q=${project.latitude},${project.longitude}`} target="_blank" rel="noreferrer"
                    className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1">
                    <MapPin size={12} /> Abrir en Google Maps
                  </a>
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <MapPin size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm mb-3">Este proyecto no tiene ubicación definida</p>
                <button onClick={openEditProject} className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg">
                  Agregar ubicación
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Miembros */}
      {tab === 'members' && (
        <div className="flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Miembros actuales */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Miembros del proyecto ({members.length})</h3>
              <div className="space-y-2">
                {members.length === 0 && <p className="text-sm text-gray-400">Sin miembros aún</p>}
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center text-xs font-medium text-brand-600">
                        {m.user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.user.name}</p>
                        <p className="text-xs text-gray-400">{m.user.position || m.user.email}</p>
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <button onClick={() => { if (confirm(`¿Quitar a ${m.user.name} del proyecto?`)) removeMember.mutate(m.user.id) }}
                        className="text-gray-300 hover:text-red-500" title="Quitar">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Agregar miembros (solo super admin) */}
            {isSuperAdmin ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
                  <UserPlus size={15} /> Agregar miembros
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allUsers.filter(u => !members.some(m => m.user.id === u.id)).length === 0 && (
                    <p className="text-sm text-gray-400">Todos los usuarios ya son miembros</p>
                  )}
                  {allUsers.filter(u => !members.some(m => m.user.id === u.id)).map(u => (
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                          {u.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.position || u.email}</p>
                        </div>
                      </div>
                      <button onClick={() => addMember.mutate(u.id)} disabled={addMember.isPending}
                        className="text-xs bg-brand-50 text-brand-600 hover:bg-brand-100 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
                        <Plus size={13} /> Agregar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 flex items-center justify-center text-center">
                <p className="text-sm text-gray-400">Solo el super administrador puede gestionar los miembros del proyecto.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Presupuestos (solo super admin) */}
      {tab === 'budgets' && isSuperAdmin && (
        <div className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">Presupuestos vinculados a este proyecto</h3>
              <a href="/quotes" className="text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1">
                <Plus size={14} /> Ir a Cotizaciones
              </a>
            </div>
            {projectQuotes.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm mb-1">Sin presupuestos vinculados</p>
                <p className="text-xs">Crea una cotización en la sección Cotizaciones y vincúlala a este proyecto.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                        <th className="px-3 py-2 font-medium">Folio</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium text-right">Total</th>
                        <th className="px-3 py-2 font-medium text-right">Pagado</th>
                        <th className="px-3 py-2 font-medium text-right">Saldo</th>
                        <th className="px-3 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {projectQuotes.map(q => (
                        <tr key={q.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900">{q.folio}</td>
                          <td className="px-3 py-2 text-gray-600">{q.clientName}</td>
                          <td className="px-3 py-2 text-right font-medium">${q.total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                          <td className="px-3 py-2 text-right text-green-600">${q.paidAmount.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                          <td className="px-3 py-2 text-right">{q.balance > 0 ? <span className="text-orange-600">${q.balance.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span> : <span className="text-green-600 text-xs">Liquidada</span>}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => downloadFile(`/export/quote/${q.id}.pdf`, `${q.folio}.pdf`)} className="text-gray-400 hover:text-brand-500"><FileText size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Totales */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-6 justify-end text-sm">
                  <span className="text-gray-500">Total cotizado: <span className="font-semibold text-gray-900">${projectQuotes.reduce((s, q) => s + q.total, 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></span>
                  <span className="text-gray-500">Cobrado: <span className="font-semibold text-green-600">${projectQuotes.reduce((s, q) => s + q.paidAmount, 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></span>
                  <span className="text-gray-500">Por cobrar: <span className="font-semibold text-orange-600">${projectQuotes.reduce((s, q) => s + q.balance, 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></span>
                </div>
              </>
            )}
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar proyecto</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                <input value={projForm.name} onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cliente</label>
                <input value={projForm.client} onChange={e => setProjForm(f => ({ ...f, client: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Presupuesto estimado</label>
                <input type="number" step="0.01" value={projForm.budget} onChange={e => setProjForm(f => ({ ...f, budget: e.target.value }))}
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ubicación de la obra</label>
              <LocationPicker
                value={{ latitude: projForm.latitude, longitude: projForm.longitude, address: projForm.address }}
                onChange={(loc) => setProjForm(f => ({ ...f, ...loc }))}
                height={300}
              />
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
