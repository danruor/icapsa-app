import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, FolderKanban, CheckSquare, Users, Trash2 } from 'lucide-react'
import api from '../lib/api'

const statusColor = { ACTIVE: 'bg-green-100 text-green-700', PAUSED: 'bg-yellow-100 text-yellow-700', COMPLETED: 'bg-blue-100 text-blue-700', ARCHIVED: 'bg-gray-100 text-gray-500' }
const statusLabel = { ACTIVE: 'Activo', PAUSED: 'Pausado', COMPLETED: 'Completado', ARCHIVED: 'Archivado' }

export default function Projects() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#2196F3' })
  const qc = useQueryClient()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const create = useMutation({
    mutationFn: (data) => api.post('/projects', data),
    onSuccess: () => { qc.invalidateQueries(['projects']); setShowForm(false); setForm({ name: '', description: '', color: '#2196F3' }) }
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries(['projects'])
  })

  const handleDelete = (e, project) => {
    e.preventDefault()
    e.stopPropagation()
    if (confirm(`¿Eliminar el proyecto "${project.name}"? Esto borrará sus tareas e inventario asociado. Esta acción no se puede deshacer.`)) {
      remove.mutate(project.id)
    }
  }

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Cargando...</div>

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-500 mt-1">{projects.length} proyectos en total</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Nuevo proyecto
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Nuevo proyecto</h2>
            <div className="space-y-3">
              <input
                type="text" placeholder="Nombre del proyecto"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              />
              <textarea
                placeholder="Descripción (opcional)"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
                rows={3}
              />
              <div>
                <label className="block text-xs text-gray-500 mb-2">Color del proyecto (para el calendario)</label>
                <div className="flex items-center gap-2">
                  {['#2196F3', '#1D9E75', '#D85A30', '#D4537E', '#7F77DD', '#BA7517', '#888780'].map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-7 h-7 rounded-full transition-transform"
                      style={{ background: c, transform: form.color === c ? 'scale(1.2)' : 'scale(1)', outline: form.color === c ? '2px solid #00000020' : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button
                onClick={() => create.mutate(form)} disabled={!form.name || create.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {create.isPending ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => (
          <Link key={project.id} to={`/projects/${project.id}`}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-500 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <FolderKanban size={20} className="text-brand-500" />
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[project.status]}`}>
                  {statusLabel[project.status]}
                </span>
                <button onClick={(e) => handleDelete(e, project)}
                  className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <h3 className="font-medium text-gray-900 mb-1">{project.name}</h3>
            {project.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{project.description}</p>}
            <div className="flex items-center gap-4 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
              <span className="flex items-center gap-1"><CheckSquare size={12} />{project._count.tasks} tareas</span>
              <span className="flex items-center gap-1"><Users size={12} />{project.members.length} miembros</span>
            </div>
          </Link>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay proyectos aún. Crea el primero.</p>
        </div>
      )}
    </div>
  )
}
