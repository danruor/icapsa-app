import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Paperclip, ChevronDown } from 'lucide-react'
import api from '../lib/api'

const columns = [
  { key: 'TODO',        label: 'Por hacer',   color: 'bg-gray-100' },
  { key: 'IN_PROGRESS', label: 'En progreso',  color: 'bg-blue-50' },
  { key: 'REVIEW',      label: 'En revisión',  color: 'bg-yellow-50' },
  { key: 'DONE',        label: 'Completado',   color: 'bg-green-50' }
]

const priorityColor = { LOW: 'text-gray-400', MEDIUM: 'text-blue-500', HIGH: 'text-orange-500', URGENT: 'text-red-500' }

export default function ProjectDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', dueDate: '' })

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data)
  })

  const createTask = useMutation({
    mutationFn: (data) => api.post('/tasks', { ...data, projectId: id }),
    onSuccess: () => { qc.invalidateQueries(['project', id]); setShowForm(false); setForm({ title: '', description: '', priority: 'MEDIUM', dueDate: '' }) }
  })

  const updateTask = useMutation({
    mutationFn: ({ taskId, ...data }) => api.patch(`/tasks/${taskId}`, data),
    onSuccess: () => qc.invalidateQueries(['project', id])
  })

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Cargando...</div>

  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.key] = project?.tasks?.filter(t => t.status === col.key) || []
    return acc
  }, {})

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{project?.name}</h1>
          {project?.description && <p className="text-sm text-gray-500 mt-1">{project.description}</p>}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {/* Task form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Nueva tarea</h2>
            <div className="space-y-3">
              <input
                type="text" placeholder="Título de la tarea"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              />
              <textarea
                placeholder="Descripción (opcional)"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
              <button
                onClick={() => createTask.mutate(form)} disabled={!form.title || createTask.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50"
              >
                {createTask.isPending ? 'Creando...' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex gap-4 flex-1 overflow-x-auto pb-4">
        {columns.map(col => (
          <div key={col.key} className="flex-1 min-w-[220px]">
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
                      <select
                        value={task.status}
                        onChange={e => updateTask.mutate({ taskId: task.id, status: e.target.value })}
                        className="text-xs text-gray-500 border-none bg-transparent focus:outline-none cursor-pointer"
                      >
                        <option value="TODO">Por hacer</option>
                        <option value="IN_PROGRESS">En progreso</option>
                        <option value="REVIEW">En revisión</option>
                        <option value="DONE">Completado</option>
                      </select>
                    </div>
                    {task.dueDate && (
                      <p className="text-xs text-orange-400 mt-1">{new Date(task.dueDate).toLocaleDateString('es-MX')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
