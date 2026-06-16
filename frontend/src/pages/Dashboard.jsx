import { useQuery } from '@tanstack/react-query'
import { FolderKanban, CheckSquare, Clock, AlertCircle } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'

const statusLabel = { TODO: 'Por hacer', IN_PROGRESS: 'En progreso', REVIEW: 'En revisión', DONE: 'Completadas' }
const statusColor = { TODO: 'bg-gray-100 text-gray-600', IN_PROGRESS: 'bg-blue-100 text-blue-700', REVIEW: 'bg-yellow-100 text-yellow-700', DONE: 'bg-green-100 text-green-700' }
const statusHex = { TODO: '#9CA3AF', IN_PROGRESS: '#378ADD', REVIEW: '#EF9F27', DONE: '#1D9E75' }
const priorityColor = { LOW: 'text-gray-400', MEDIUM: 'text-blue-500', HIGH: 'text-orange-500', URGENT: 'text-red-500' }

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data)
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-gray-400">Cargando...</div>
  )

  const stats = [
    { label: 'Proyectos activos', value: data?.stats.activeProjects, icon: FolderKanban, color: 'text-brand-500' },
    { label: 'Total proyectos',   value: data?.stats.totalProjects,  icon: FolderKanban, color: 'text-gray-400' },
    { label: 'Mis tareas',        value: data?.stats.myTasks,        icon: CheckSquare,  color: 'text-blue-500' },
    { label: 'Total tareas',      value: data?.stats.totalTasks,     icon: AlertCircle,  color: 'text-gray-400' }
  ]

  // Datos para gráficas
  const pieData = (data?.tasksByStatus || []).map(s => ({
    name: statusLabel[s.status], value: s._count, status: s.status
  }))

  const barData = (data?.tasksByStatus || []).map(s => ({
    name: statusLabel[s.status], tareas: s._count, fill: statusHex[s.status]
  }))

  const totalTasks = pieData.reduce((sum, d) => sum + d.value, 0)
  const doneTasks = pieData.find(d => d.status === 'DONE')?.value || 0
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Bienvenido, {user?.name}</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen de actividad</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className="text-2xl font-semibold text-gray-900">{value ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Distribución de tareas (dona) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Distribución de tareas</h2>
          {totalTasks === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">Sin tareas aún</p>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={statusHex[entry.status]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[88px] left-0 right-0 text-center pointer-events-none">
                <div className="text-2xl font-semibold text-gray-900">{progress}%</div>
                <div className="text-xs text-gray-400">completado</div>
              </div>
            </div>
          )}
        </div>

        {/* Tareas por estado (barras) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Tareas por estado</h2>
          {totalTasks === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">Sin tareas aún</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="tareas" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos vencimientos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
            <Clock size={14} /> Próximos vencimientos
          </h2>
          <div className="space-y-3">
            {data?.upcomingDeadlines?.length === 0 && (
              <p className="text-sm text-gray-400">Sin vencimientos próximos</p>
            )}
            {data?.upcomingDeadlines?.map(task => (
              <div key={task.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-gray-900 font-medium">{task.title}</p>
                  <p className="text-xs text-gray-400">{task.project.name}</p>
                </div>
                <span className="text-xs text-orange-500 whitespace-nowrap">
                  {new Date(task.dueDate).toLocaleDateString('es-MX')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tareas recientes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Tareas recientes</h2>
          <div className="divide-y divide-gray-100">
            {data?.recentTasks?.length === 0 && <p className="text-sm text-gray-400">Sin tareas</p>}
            {data?.recentTasks?.map(task => (
              <div key={task.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">{task.title}</p>
                  <p className="text-xs text-gray-400">{task.project.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${priorityColor[task.priority]}`}>{task.priority}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[task.status]}`}>{statusLabel[task.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
