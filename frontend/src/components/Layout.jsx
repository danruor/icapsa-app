import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Package, Calendar, Settings, FileText, LogOut, Building2, Menu, X } from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import NotificationBell from './NotificationBell'
import clsx from 'clsx'

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects',  icon: FolderKanban,    label: 'Proyectos' },
  { to: '/inventory', icon: Package,         label: 'Inventario' },
  { to: '/calendar',  icon: Calendar,        label: 'Calendario' }
]

const adminNav = [
  { to: '/settings', icon: Settings, label: 'Administración' }
]

const superAdminNav = [
  { to: '/quotes', icon: FileText, label: 'Cotizaciones' }
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role)

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  let navItems = [...nav]
  if (isSuperAdmin) navItems = [...navItems, ...superAdminNav]
  if (isAdmin) navItems = [...navItems, ...adminNav]

  const SidebarContent = () => (
    <>
      <div className="px-6 py-5 flex items-center gap-2 border-b border-gray-700">
        <Building2 size={20} className="text-brand-500" />
        <span className="text-white font-semibold tracking-wide">ICAPSA</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
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
          <div className="flex items-center gap-2 flex-1">
            <Building2 size={18} className="text-brand-500" />
            <span className="text-white font-semibold text-sm">ICAPSA</span>
          </div>
          <NotificationBell dark />
        </header>

        {/* Desktop top bar with notifications */}
        <header className="hidden md:flex items-center justify-end px-8 py-3 bg-white border-b border-gray-200">
          <div className="text-gray-600">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
