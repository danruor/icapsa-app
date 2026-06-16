import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Shield, Plus, Pencil, Trash2, Check, X, UserCog, FolderKanban, Power } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Administrador', desc: 'Control total del sistema' },
  { value: 'ADMIN',       label: 'Administrador',        desc: 'Gestiona usuarios y proyectos' },
  { value: 'MANAGER',     label: 'Gerente',              desc: 'Gestiona proyectos asignados' },
  { value: 'MEMBER',      label: 'Miembro',              desc: 'Acceso a proyectos asignados' }
]

const roleBadge = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN:       'bg-blue-100 text-blue-700',
  MANAGER:     'bg-teal-100 text-teal-700',
  MEMBER:      'bg-gray-100 text-gray-600'
}
const roleLabel = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', MANAGER: 'Gerente', MEMBER: 'Miembro' }

export default function Settings() {
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MEMBER', phone: '', position: '', projectIds: [] })
  const [projectModal, setProjectModal] = useState(null) // user being edited for projects

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data)
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data)
  })

  const save = useMutation({
    mutationFn: (data) => editing
      ? api.patch(`/admin/users/${editing}`, data)
      : api.post('/admin/users', data),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); qc.invalidateQueries(['admin-stats']); closeForm() },
    onError: (err) => alert(err.response?.data?.error || 'Error al guardar')
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/admin/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries(['admin-users']),
    onError: (err) => alert(err.response?.data?.error || 'Error')
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/admin/users/${id}`),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); qc.invalidateQueries(['admin-stats']) },
    onError: (err) => alert(err.response?.data?.error || 'Error al eliminar')
  })

  const saveProjects = useMutation({
    mutationFn: ({ userId, projectIds }) => api.put(`/admin/users/${userId}/projects`, { projectIds }),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); setProjectModal(null) },
    onError: (err) => alert(err.response?.data?.error || 'Error')
  })

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: 'MEMBER', phone: '', position: '', projectIds: [] })
    setShowForm(true)
  }

  const openEdit = (user) => {
    setEditing(user.id)
    setForm({
      name: user.name, email: user.email, password: '', role: user.role,
      phone: user.phone || '', position: user.position || '',
      projectIds: user.projects?.map(p => p.project.id) || []
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null) }

  const availableRoles = isSuperAdmin ? ROLES : ROLES.filter(r => !['SUPER_ADMIN', 'ADMIN'].includes(r.value))

  const statCards = [
    { label: 'Usuarios', value: stats?.totalUsers ?? 0, sub: `${stats?.activeUsers ?? 0} activos`, icon: Users },
    { label: 'Proyectos', value: stats?.totalProjects ?? 0, icon: FolderKanban },
    { label: 'Tareas', value: stats?.totalTasks ?? 0, icon: Check },
    { label: 'Artículos inventario', value: stats?.totalInventory ?? 0, icon: UserCog }
  ]

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={20} className="text-brand-500" />
        <h1 className="text-xl font-semibold text-gray-900">Administración</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Gestión de usuarios, roles y permisos</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className="text-brand-500" />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className="text-2xl font-semibold text-gray-900">{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Users section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-gray-900">Usuarios</h2>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {/* Users table - responsive: cards on mobile, table on desktop */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Proyectos</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center text-xs font-medium text-brand-600">
                      {u.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                      {u.position && <div className="text-xs text-gray-400">{u.position}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleBadge[u.role]}`}>{roleLabel[u.role]}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setProjectModal(u)}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-brand-500">
                    <FolderKanban size={13} />
                    {u.projects?.length || 0} proyecto{u.projects?.length !== 1 ? 's' : ''}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                    disabled={u.id === currentUser.id}
                    className={`flex items-center gap-1.5 text-xs ${u.isActive ? 'text-green-600' : 'text-gray-400'} ${u.id === currentUser.id ? 'cursor-not-allowed opacity-60' : 'hover:opacity-70'}`}>
                    <Power size={13} />
                    {u.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(u)} className="text-gray-400 hover:text-brand-500"><Pencil size={15} /></button>
                    {u.id !== currentUser.id && (
                      <button onClick={() => { if (confirm(`¿Eliminar a ${u.name}?`)) remove.mutate(u.id) }}
                        className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {users.map(u => (
          <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center text-xs font-medium text-brand-600">
                  {u.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">{u.name}</div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleBadge[u.role]}`}>{roleLabel[u.role]}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
              <button onClick={() => setProjectModal(u)} className="text-xs text-gray-600 flex items-center gap-1">
                <FolderKanban size={13} /> {u.projects?.length || 0} proyectos
              </button>
              <button onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })} disabled={u.id === currentUser.id}
                className={`text-xs flex items-center gap-1 ${u.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                <Power size={13} /> {u.isActive ? 'Activo' : 'Inactivo'}
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(u)} className="text-gray-400"><Pencil size={15} /></button>
                {u.id !== currentUser.id && (
                  <button onClick={() => { if (confirm(`¿Eliminar a ${u.name}?`)) remove.mutate(u.id) }} className="text-gray-400"><Trash2 size={15} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: User form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre completo *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Puesto</label>
                  <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                    placeholder="Ej: Ingeniero de campo"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Correo *</label>
                  <input type="email" value={form.email} disabled={!!editing}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Teléfono</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {editing ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
                </label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rol</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500">
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>
              {!editing && (
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Proyectos con acceso</label>
                  <div className="border border-gray-200 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {projects.length === 0 && <p className="text-xs text-gray-400 p-1">No hay proyectos</p>}
                    {projects.map(p => (
                      <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-sm">
                        <input type="checkbox"
                          checked={form.projectIds.includes(p.id)}
                          onChange={e => setForm(f => ({
                            ...f,
                            projectIds: e.target.checked ? [...f.projectIds, p.id] : f.projectIds.filter(id => id !== p.id)
                          }))} />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={closeForm} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
              <button onClick={() => save.mutate(form)} disabled={!form.name || !form.email || (!editing && !form.password) || save.isPending}
                className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                {save.isPending ? 'Guardando...' : editing ? 'Guardar' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Project access */}
      {projectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1">Acceso a proyectos</h2>
            <p className="text-sm text-gray-500 mb-4">{projectModal.name}</p>
            <ProjectAccessEditor
              user={projectModal}
              projects={projects}
              onSave={(projectIds) => saveProjects.mutate({ userId: projectModal.id, projectIds })}
              onCancel={() => setProjectModal(null)}
              saving={saveProjects.isPending}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectAccessEditor({ user, projects, onSave, onCancel, saving }) {
  const [selected, setSelected] = useState(user.projects?.map(p => p.project.id) || [])

  return (
    <>
      <div className="border border-gray-200 rounded-lg p-2 max-h-64 overflow-y-auto space-y-1 mb-4">
        {projects.length === 0 && <p className="text-xs text-gray-400 p-2">No hay proyectos disponibles</p>}
        {projects.map(p => (
          <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
            <input type="checkbox"
              checked={selected.includes(p.id)}
              onChange={e => setSelected(s => e.target.checked ? [...s, p.id] : s.filter(id => id !== p.id))} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
        <button onClick={() => onSave(selected)} disabled={saving}
          className="flex-1 bg-brand-500 text-white text-sm py-2 rounded-lg disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar acceso'}
        </button>
      </div>
    </>
  )
}
