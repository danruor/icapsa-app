import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './lib/authStore'
import { applyBrand, brandForEmail } from './lib/brand'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Board from './pages/Board'
import Partners from './pages/Partners'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Inventory from './pages/Inventory'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'
import Quotes from './pages/Quotes'
import Layout from './components/Layout'
import ClientLayout from './components/ClientLayout'
import Support from './pages/Support'
import TicketDetail from './pages/TicketDetail'
import ClientPortal from './pages/ClientPortal'
import InstallerLayout from './components/InstallerLayout'
import { InstallerHome, InstallerProject, InstallerSite, InstallerReport } from './pages/InstallerPortal'
import FieldOps, { FieldProject, FieldSite, FieldReportDetail } from './pages/FieldOps'
import OpeningPage from './pages/OpeningPage'

// Sistema interno: requiere sesión y NO ser cliente externo (los clientes van a su portal)
const PrivateRoute = ({ children }) => {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'CLIENT') return <Navigate to="/portal" replace />
  if (user?.role === 'INSTALLER') return <Navigate to="/campo" replace />
  return children
}

// Portal de instaladores: requiere sesión de instalador
const InstallerRoute = ({ children }) => {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'INSTALLER') return <Navigate to={user?.role === 'CLIENT' ? '/portal' : '/dashboard'} replace />
  return children
}

// Portal de clientes: requiere sesión de cliente (el personal interno va al dashboard)
const ClientRoute = ({ children }) => {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'CLIENT') return <Navigate to="/dashboard" replace />
  return children
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

// Sociedad: solo super admin o pestaña 'partners' otorgada explícitamente
const PartnersRoute = ({ children }) => {
  const user = useAuthStore((s) => s.user)
  const allowed = (user?.visibleTabs || '').split(',').map(t => t.trim())
  return (user?.role === 'SUPER_ADMIN' || allowed.includes('partners')) ? children : <Navigate to="/dashboard" replace />
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
        <Route path="/portal" element={<ClientRoute><ClientLayout /></ClientRoute>}>
          <Route index element={<ClientPortal />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
        </Route>
        <Route path="/campo" element={<InstallerRoute><InstallerLayout /></InstallerRoute>}>
          <Route index element={<InstallerHome />} />
          <Route path="bovedas/:siteId/nuevo" element={<InstallerReport />} />
          <Route path="bovedas/:siteId" element={<InstallerSite />} />
          <Route path="ventanas/:openingId" element={<OpeningPage mode="installer" />} />
          <Route path="reportes/:reportId" element={<InstallerReport />} />
          <Route path=":projectId" element={<InstallerProject />} />
        </Route>
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chat" element={<TabRoute tab="chat"><Chat /></TabRoute>} />
          <Route path="board" element={<TabRoute tab="board"><Board /></TabRoute>} />
          <Route path="partners" element={<PartnersRoute><Partners /></PartnersRoute>} />
          <Route path="projects" element={<TabRoute tab="projects"><Projects /></TabRoute>} />
          <Route path="projects/:id" element={<TabRoute tab="projects"><ProjectDetail /></TabRoute>} />
          <Route path="inventory" element={<TabRoute tab="inventory"><Inventory /></TabRoute>} />
          <Route path="calendar" element={<TabRoute tab="calendar"><Calendar /></TabRoute>} />
          <Route path="support" element={<TabRoute tab="support"><Support /></TabRoute>} />
          <Route path="support/:id" element={<TabRoute tab="support"><TicketDetail /></TabRoute>} />
          <Route path="field" element={<TabRoute tab="field"><FieldOps /></TabRoute>} />
          <Route path="field/obras/:projectId" element={<TabRoute tab="field"><FieldProject /></TabRoute>} />
          <Route path="field/bovedas/:siteId" element={<TabRoute tab="field"><FieldSite /></TabRoute>} />
          <Route path="field/reports/:reportId" element={<TabRoute tab="field"><FieldReportDetail /></TabRoute>} />
          <Route path="field/ventanas/:openingId" element={<TabRoute tab="field"><OpeningPage mode="office" /></TabRoute>} />
          <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
          <Route path="quotes" element={<SuperAdminRoute><Quotes /></SuperAdminRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
