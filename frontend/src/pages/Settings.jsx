import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Shield, Plus, Pencil, Trash2, Check, X, UserCog, FolderKanban, Power, ScrollText, RotateCcw } from 'lucide-react'
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
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MEMBER', phone: '', position: '', projectIds: [], visibleTabs: ['projects', 'inventory', 'calendar'] })
  const [projectModal, setProjectModal] = useState(null)
  const [adminTab, setAdminTab] = useState('users') // user being edited for projects

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
    setForm({ name: '', email: '', password: '', role: 'MEMBER', phone: '', position: '', projectIds: [], visibleTabs: ['projects', 'inventory', 'calendar'] })
    setShowForm(true)
  }

  const openEdit = (user) => {
    setEditing(user.id)
    setForm({
      name: user.name, email: user.email, password: '', role: user.role,
      visibleTabs: (user.visibleTabs || '').split(',').map(t => t.trim()).filter(Boolean),
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

      {/* Sub-pestañas (Auditoría y Papelera solo para super admin) */}
      {currentUser?.role === 'SUPER_ADMIN' && (
        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-thin">
          {[
            { key: 'users', label: 'Usuarios', icon: Users },
            { key: 'audit', label: 'Auditoría', icon: ScrollText },
            { key: 'trash', label: 'Papelera', icon: Trash2 }
          ].map(t => (
            <button key={t.key} onClick={() => setAdminTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex-shrink-0 ${adminTab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {adminTab === 'audit' && <AuditView />}
      {adminTab === 'trash' && <TrashView />}

      {adminTab === 'users' && <>

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
      </>}

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

              {/* Pestañas visibles: solo aplica a roles no-admin (admins ven todo) */}
              {!['SUPER_ADMIN', 'ADMIN'].includes(form.role) && (
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Pestañas visibles para este usuario</label>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input type="checkbox" checked disabled />
                      <span>Dashboard <span className="text-xs">(siempre visible)</span></span>
                    </label>
                    {[
                      { key: 'projects', label: 'Proyectos' },
                      { key: 'inventory', label: 'Inventario' },
                      { key: 'calendar', label: 'Calendario' }
                    ].map(tab => (
                      <label key={tab.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                        <input type="checkbox"
                          checked={form.visibleTabs.includes(tab.key)}
                          onChange={e => setForm(f => ({
                            ...f,
                            visibleTabs: e.target.checked
                              ? [...f.visibleTabs, tab.key]
                              : f.visibleTabs.filter(t => t !== tab.key)
                          }))} />
                        {tab.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Cotizaciones solo es visible para super administradores.</p>
                </div>
              )}
              {['SUPER_ADMIN', 'ADMIN'].includes(form.role) && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  Los administradores tienen acceso a todas las pestañas automáticamente.
                </div>
              )}
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


// ===== BITÁCORA DE AUDITORÍA (solo super admin) =====
function AuditView() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get('/admin/audit').then(r => r.data)
  })
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Usuario</th>
            <th className="px-4 py-3 font-medium">Acción</th>
            <th className="px-4 py-3 font-medium">Proyecto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading && <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>}
          {!isLoading && logs.length === 0 && (
            <tr><td colSpan="4" className="px-4 py-10 text-center text-gray-400">Sin registros todavía</td></tr>
          )}
          {logs.map(a => (
            <tr key={a.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                {new Date(a.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{a.user?.name || '—'}</td>
              <td className="px-4 py-2.5 text-gray-700">{a.detail}</td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">{a.project?.name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">Se muestran los últimos 300 eventos: inicios de sesión, cambios de usuarios, pagos, eliminaciones y restauraciones.</p>
    </div>
  )
}

// ===== PAPELERA (solo super admin) =====
function TrashView() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-trash'],
    queryFn: () => api.get('/admin/trash').then(r => r.data)
  })
  const restore = useMutation({
    mutationFn: (payload) => api.post('/admin/trash/restore', payload),
    onSuccess: () => {
      qc.invalidateQueries(['admin-trash'])
      qc.invalidateQueries(['projects'])
      qc.invalidateQueries(['quotes'])
    },
    onError: (e) => alert(e.response?.data?.error || 'Error al restaurar')
  })
  const purge = useMutation({
    mutationFn: ({ type, id }) => api.delete(`/admin/trash/${type}/${id}`),
    onSuccess: () => qc.invalidateQueries(['admin-trash']),
    onError: (e) => alert(e.response?.data?.error || 'Error al eliminar')
  })

  const projects = data?.projects || []
  const quotes = data?.quotes || []
  const daysLeft = (deletedAt) => Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt)) / 86400000))

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
        Lo que envíes a la papelera se conserva 30 días y luego se elimina definitivamente de forma automática.
      </div>

      {isLoading && <p className="text-center text-gray-400 py-6">Cargando papelera...</p>}
      {!isLoading && projects.length === 0 && quotes.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">
          <Trash2 size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">La papelera está vacía</p>
        </div>
      )}

      {projects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">Proyectos ({projects.length})</p>
          <div className="divide-y divide-gray-50">
            {projects.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.client || 'Sin cliente'} · {p._count.tasks} tareas · quedan {daysLeft(p.deletedAt)} días</p>
                </div>
                <button onClick={() => restore.mutate({ type: 'project', id: p.id })}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-lg">
                  <RotateCcw size={13} /> Restaurar
                </button>
                <button onClick={() => { if (confirm(`¿Eliminar DEFINITIVAMENTE el proyecto "${p.name}"? Esta acción no se puede deshacer.`)) purge.mutate({ type: 'project', id: p.id }) }}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {quotes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">Cotizaciones ({quotes.length})</p>
          <div className="divide-y divide-gray-50">
            {quotes.map(q => (
              <div key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium text-gray-900">{q.folio}</p>
                  <p className="text-xs text-gray-400">{q.clientName} · quedan {daysLeft(q.deletedAt)} días</p>
                </div>
                <button onClick={() => restore.mutate({ type: 'quote', id: q.id })}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-lg">
                  <RotateCcw size={13} /> Restaurar
                </button>
                <button onClick={() => { if (confirm(`¿Eliminar DEFINITIVAMENTE la cotización ${q.folio}? Esta acción no se puede deshacer.`)) purge.mutate({ type: 'quote', id: q.id }) }}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
