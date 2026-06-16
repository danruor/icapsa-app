import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, FolderKanban, CheckSquare, Users, Trash2, MapPin, DollarSign, TrendingUp, LayoutGrid, List } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { LocationPicker } from '../components/MapView'

const statusColor = { ACTIVE: 'bg-green-100 text-green-700', PAUSED: 'bg-yellow-100 text-yellow-700', COMPLETED: 'bg-blue-100 text-blue-700', ARCHIVED: 'bg-gray-100 text-gray-500' }
const statusLabel = { ACTIVE: 'Activo', PAUSED: 'Pausado', COMPLETED: 'Completado', ARCHIVED: 'Archivado' }
const COLORS = ['#2196F3', '#1D9E75', '#D85A30', '#D4537E', '#7F77DD', '#BA7517', '#888780']

const emptyForm = { name: '', description: '', color: '#2196F3', client: '', budget: '', address: '', latitude: null, longitude: null }

export default function Projects() {
  const user = useAuthStore(s => s.user)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [layout, setLayout] = useState('grid')
  const qc = useQueryClient()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const create = useMutation({
    mutationFn: (data) => api.post('/projects', data),
    onSuccess: () => { qc.invalidateQueries(['projects']); setShowForm(false); setForm(emptyForm) },
    onError: (e) => alert(e.response?.data?.error || 'Error al crear')
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries(['projects'])
  })

  const handleDelete = (e, project) => {
    e.preventDefault(); e.stopPropagation()
    if (confirm(`¿Eliminar el proyecto "${project.name}"? Esto borrará sus tareas e inventario asociado. Esta acción no se puede deshacer.`)) {
      remove.mutate(project.id)
    }
  }

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Cargando...</div>

  const activeCount = projects.filter(p => p.status === 'ACTIVE').length
  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0)
  const totalQuoted = projects.reduce((s, p) => s + (p.quotedTotal || 0), 0)
  const avgProgress = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0

  const summaryCards = [
    { label: 'Proyectos activos', value: activeCount, icon: FolderKanban, color: 'text-brand-500' },
    { label: 'Presupuesto total', value: `$${totalBudget.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-green-500' },
    { label: 'Cotizado vinculado', value: `$${totalQuoted.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Avance promedio', value: `${avgProgress}%`, icon: CheckSquare, color: 'text-orange-500' }
  ]

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-500 mt-1">{projects.length} proyectos en total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center border border-gray-200 rounded-lg p-0.5">
            <button onClick={() => setLayout('grid')} className={`p-1.5 rounded ${layout === 'grid' ? 'bg-gray-100 text-gray-700' : 'text-gray-400'}`}><LayoutGrid size={16} /></button>
            <button onClick={() => setLayout('list')} className={`p-1.5 rounded ${layout === 'list' ? 'bg-gray-100 text-gray-700' : 'text-gray-400'}`}><List size={16} /></button>
          </div>
          <button onClick={() => { setForm(emptyForm); setShowForm(true) }}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={16} /> <span className="hidden sm:inline">Nuevo proyecto</span><span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className="text-xl font-semibold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Nuevo proyecto</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre del proyecto *</label>
                  <input type="text" placeholder="Ej: Subestación Norte"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cliente</label>
                  <input type="text" placeholder="Ej: CFE División Jalisco"
                    value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Presupuesto estimado</label>
                  <input type="number" step="0.01" placeholder="0.00"
                    value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                  <textarea placeholder="Descripción (opcional)"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none" rows={2} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Color del proyecto</label>
                  <div className="flex items-center gap-2">
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                        className="w-7 h-7 rounded-full transition-transform"
                        style={{ background: c, transform: form.color === c ? 'scale(1.2)' : 'scale(1)', outline: form.color === c ? '2px solid #00000020' : 'none', outlineOffset: '2px' }} />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ubicación de la obra</label>
                <LocationPicker
                  value={{ latitude: form.latitude, longitude: form.longitude, address: form.address }}
                  onChange={(loc) => setForm(f => ({ ...f, ...loc }))}
                  height={300}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => create.mutate(form)} disabled={!form.name || create.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                {create.isPending ? 'Creando...' : 'Crear proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {layout === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <Link key={project.id} to={`/projects/${project.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-500 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: (project.color || '#2196F3') + '18' }}>
                  <FolderKanban size={18} style={{ color: project.color || '#2196F3' }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[project.status]}`}>{statusLabel[project.status]}</span>
                  <button onClick={(e) => handleDelete(e, project)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
              <h3 className="font-medium text-gray-900 mb-0.5">{project.name}</h3>
              {project.client && <p className="text-xs text-gray-500 mb-2">{project.client}</p>}

              <div className="mt-3 mb-3">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Avance</span>
                  <span className="font-medium text-gray-600">{project.progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${project.progress}%`, background: project.color || '#2196F3' }} />
                </div>
              </div>

              {(project.budget != null || project.quotedTotal > 0) && (
                <div className="flex items-center gap-4 text-xs mb-3">
                  {project.budget != null && (
                    <span className="text-gray-500">Presup: <span className="font-medium text-gray-700">${project.budget.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span></span>
                  )}
                  {project.quotedTotal > 0 && (
                    <span className="text-gray-500">Cotizado: <span className="font-medium text-green-600">${project.quotedTotal.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span></span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                <span className="flex items-center gap-1"><CheckSquare size={12} />{project.doneTasks}/{project.totalTasks}</span>
                <span className="flex items-center gap-1"><Users size={12} />{project.members.length}</span>
                {project.latitude && <span className="flex items-center gap-1 text-brand-500"><MapPin size={12} />Ubicada</span>}
                <div className="flex -space-x-1.5 ml-auto">
                  {project.members.slice(0, 4).map(m => (
                    <div key={m.id} className="w-6 h-6 rounded-full bg-brand-50 border-2 border-white flex items-center justify-center text-[9px] font-medium text-brand-600" title={m.user.name}>
                      {m.user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                  ))}
                  {project.members.length > 4 && (
                    <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[9px] font-medium text-gray-500">+{project.members.length - 4}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Avance</th>
                <th className="px-4 py-3 font-medium text-right">Presupuesto</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {projects.map(project => (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/projects/${project.id}`} className="flex items-center gap-2 font-medium text-gray-900 hover:text-brand-600">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: project.color || '#2196F3' }} />
                      {project.name}
                      {project.latitude && <MapPin size={12} className="text-brand-400" />}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{project.client || '—'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[project.status]}`}>{statusLabel[project.status]}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${project.progress}%`, background: project.color || '#2196F3' }} />
                      </div>
                      <span className="text-xs text-gray-500">{project.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{project.budget != null ? `$${project.budget.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex -space-x-1.5">
                      {project.members.slice(0, 3).map(m => (
                        <div key={m.id} className="w-6 h-6 rounded-full bg-brand-50 border-2 border-white flex items-center justify-center text-[9px] font-medium text-brand-600" title={m.user.name}>
                          {m.user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                      ))}
                      {project.members.length > 3 && <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[9px] text-gray-500">+{project.members.length - 3}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={(e) => handleDelete(e, project)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {projects.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay proyectos aún. Crea el primero.</p>
        </div>
      )}
    </div>
  )
}
