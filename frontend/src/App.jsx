import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './lib/authStore'
import { applyBrand, brandForEmail } from './lib/brand'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Board from './pages/Board'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Inventory from './pages/Inventory'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'
import Quotes from './pages/Quotes'
import Layout from './components/Layout'

const PrivateRoute = ({ children }) => {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

const AdminRoute = ({ children }) => {
  const user = useAuthStore((s) => s.user)
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role)
  return isAdmin ? children : <Navigate to="/dashboard" replace />
}

// Aplica la identidad de marca según el correo del usuario conectado
const BrandApplier = () => {
  const user = useAuthStore((s) => s.user)
  useEffect(() => { applyBrand(brandForEmail(user?.email)) }, [user?.email])
  return null
}

const SuperAdminRoute = ({ children }) => {
  const user = useAuthStore((s) => s.user)
  return user?.role === 'SUPER_ADMIN' ? children : <Navigate to="/dashboard" replace />
}

// Verifica si el usuario puede ver una pestaña específica (admins ven todo)
const TabRoute = ({ tab, children }) => {
  const user = useAuthStore((s) => s.user)
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role)
  if (isAdmin) return children
  const allowed = (user?.visibleTabs || '').split(',').map(t => t.trim()).filter(Boolean)
  return allowed.includes(tab) ? children : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <BrandApplier />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="board" element={<Board />} />
          <Route path="projects" element={<TabRoute tab="projects"><Projects /></TabRoute>} />
          <Route path="projects/:id" element={<TabRoute tab="projects"><ProjectDetail /></TabRoute>} />
          <Route path="inventory" element={<TabRoute tab="inventory"><Inventory /></TabRoute>} />
          <Route path="calendar" element={<TabRoute tab="calendar"><Calendar /></TabRoute>} />
          <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
          <Route path="quotes" element={<SuperAdminRoute><Quotes /></SuperAdminRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
