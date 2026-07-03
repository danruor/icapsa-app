import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Package, Calendar, Settings, FileText, LogOut, Menu, X, MessagesSquare, KanbanSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../lib/authStore'
import { brandForEmail } from '../lib/brand'
import api from '../lib/api'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import clsx from 'clsx'

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' },
  { to: '/chat',      icon: MessagesSquare,  label: 'Chat',       key: 'chat' },
  { to: '/board',     icon: KanbanSquare,    label: 'Pendientes', key: 'board' },
  { to: '/projects',  icon: FolderKanban,    label: 'Proyectos',  key: 'projects' },
  { to: '/inventory', icon: Package,         label: 'Inventario', key: 'inventory' },
  { to: '/calendar',  icon: Calendar,        label: 'Calendario', key: 'calendar' }
]

const adminNav = [
  { to: '/settings', icon: Settings, label: 'Administración' }
]

const superAdminNav = [
  { to: '/quotes', icon: FileText, label: 'Cotizaciones', key: 'quotes' }
]

export default function Layout() {
  const { user, logout, updateUser } = useAuthStore()
  const brand = brandForEmail(user?.email)
  const navigate = useNavigate()

  // Mensajes de chat sin leer (badge del menú)
  const { data: chatUnread } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => api.get('/chat/unread').then(r => r.data.unread),
    refetchInterval: 20000
  })

  // Refrescar datos del usuario (incluye pestañas permitidas) al cargar
  useEffect(() => {
    api.get('/auth/me')
      .then(r => updateUser(r.data))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role)

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Pestañas permitidas: admins ven todo; los demás solo Dashboard + lo que el super admin marcó
  let baseNav
  if (isAdmin) {
    baseNav = [...nav]
  } else {
    const allowed = (user?.visibleTabs || '').split(',').map(t => t.trim()).filter(Boolean)
    baseNav = nav.filter(item => ['dashboard', 'chat', 'board'].includes(item.key) || allowed.includes(item.key))
  }

  let navItems = [...baseNav]
  if (isSuperAdmin) navItems = [...navItems, ...superAdminNav]
  if (isAdmin) navItems = [...navItems, ...adminNav]

  const SidebarContent = () => (
    <>
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="bg-white rounded-lg px-3 py-2.5 flex items-center justify-center">
          <img src={brand.logo} alt={brand.name} className="h-9 max-w-full object-contain" />
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label, key }) => (
          <NavLink
            key={to} to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
            {key === 'chat' && chatUnread > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {chatUnread > 99 ? '99+' : chatUnread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-xs text-gray-400">{user?.name}</div>
          {isAdmin && <span className="text-[9px] bg-brand-500/20 text-brand-100 px-1.5 py-0.5 rounded uppercase font-medium">{user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</span>}
        </div>
        <div className="text-xs text-gray-600 mb-3 truncate">{user?.email}</div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-gray-900 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-gray-900 flex flex-col safe-top">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-700 safe-top">
          <button onClick={() => setMobileOpen(true)} className="text-white">
            <Menu size={22} />
          </button>
          <div className="flex items-center flex-1 min-w-0">
            <div className="bg-white rounded-md px-2 py-1 flex items-center">
              <img src={brand.logo} alt={brand.name} className="h-5 object-contain" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <GlobalSearch dark />
            <NotificationBell dark />
          </div>
        </header>

        {/* Desktop top bar with notifications */}
        <header className="hidden md:flex items-center justify-end gap-5 px-8 py-3 bg-white border-b border-gray-200">
          <GlobalSearch />
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
