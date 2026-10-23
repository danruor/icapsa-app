import { Outlet, useNavigate, NavLink } from 'react-router-dom'
import { LogOut, HardHat } from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import { brandForEmail } from '../lib/brand'
import NotificationBell from './NotificationBell'

// Portal del instalador: entorno aislado, pensado para el celular en obra
export default function InstallerLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const brand = brandForEmail(user?.email)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-900 text-white sticky top-0 z-30 safe-top">
        <div className="max-w-3xl mx-auto px-3 h-14 flex items-center gap-3">
          <NavLink to="/campo" className="bg-white rounded-md px-2 py-1 flex items-center flex-shrink-0">
            <img src={brand.logo} alt={brand.name} className="h-6 object-contain" />
          </NavLink>
          <span className="flex items-center gap-1.5 text-sm text-gray-300 truncate"><HardHat size={15} className="flex-shrink-0" /> <span className="truncate">{user?.name}</span></span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell dark />
            <button onClick={() => { logout(); navigate('/login') }} className="text-gray-400 hover:text-white p-1" title="Cerrar sesión"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-8">
        <div className="max-w-3xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
