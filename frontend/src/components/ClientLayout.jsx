import { Outlet, useNavigate, NavLink } from 'react-router-dom'
import { LogOut, LifeBuoy } from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import { brandForEmail } from '../lib/brand'
import NotificationBell from './NotificationBell'

// Portal de clientes: entorno aislado del sistema interno. Solo tickets de soporte.
export default function ClientLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const brand = brandForEmail('') // el portal usa la marca matriz

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <NavLink to="/portal" className="bg-white rounded-md px-2 py-1 flex items-center flex-shrink-0">
            <img src={brand.logo} alt={brand.name} className="h-6 object-contain" />
          </NavLink>
          <span className="hidden sm:flex items-center gap-1.5 text-sm text-gray-300"><LifeBuoy size={15} /> Portal de soporte</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight">{user?.name}</p>
              <p className="text-[11px] text-gray-400 leading-tight">{user?.company}</p>
            </div>
            <NotificationBell dark />
            <button onClick={handleLogout} className="text-gray-400 hover:text-white p-1" title="Cerrar sesión"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
      <footer className="text-center text-[11px] text-gray-400 py-4">
        {brand.fullName} · Soporte técnico
      </footer>
    </div>
  )
}
