import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react'
import api from '../lib/api'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const typeLabel = {
  'task': 'Tarea',
  'project-start': 'Inicio de proyecto',
  'project-end': 'Entrega de proyecto'
}

export default function Calendar() {
  const [current, setCurrent] = useState(new Date())
  const [activeProjects, setActiveProjects] = useState(null) // null = todos

  const year = current.getFullYear()
  const month = current.getMonth()

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => {
      const start = new Date(year, month, 1).toISOString()
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
      return api.get('/calendar', { params: { start, end } }).then(r => r.data)
    }
  })

  const projects = data?.projects || []
  const allEvents = data?.events || []

  // Filtrar eventos por proyectos activos
  const visibleProjectIds = activeProjects === null
    ? projects.map(p => p.id)
    : activeProjects

  const events = allEvents.filter(e => visibleProjectIds.includes(e.projectId))

  const toggleProject = (id) => {
    const base = activeProjects === null ? projects.map(p => p.id) : activeProjects
    setActiveProjects(
      base.includes(id) ? base.filter(p => p !== id) : [...base, id]
    )
  }

  const isProjectActive = (id) => visibleProjectIds.includes(id)

  // Construir grilla del mes
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const eventsForDay = (day) => {
    if (!day) return []
    return events.filter(e => {
      const ed = new Date(e.date)
      return ed.getDate() === day && ed.getMonth() === month && ed.getFullYear() === year
    })
  }

  const today = new Date()
  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const prevMonth = () => setCurrent(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrent(new Date(year, month + 1, 1))
  const goToday = () => setCurrent(new Date())

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Calendario</h1>
          <p className="text-sm text-gray-500 mt-1">Proyectos y tareas programadas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Hoy</button>
          <button onClick={prevMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium text-gray-900 min-w-[140px] text-center">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar de filtros por proyecto */}
        <div className="w-full lg:w-52 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Proyectos</h3>
            <div className="flex lg:flex-col gap-2 lg:space-y-0 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
              {projects.length === 0 && <p className="text-xs text-gray-400">Sin proyectos con fechas</p>}
              {projects.map(p => (
                <button key={p.id} onClick={() => toggleProject(p.id)}
                  className="flex items-center gap-2 w-full lg:w-full text-left text-sm group whitespace-nowrap flex-shrink-0">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0 transition-opacity"
                    style={{ background: p.color, opacity: isProjectActive(p.id) ? 1 : 0.25 }} />
                  <span className={isProjectActive(p.id) ? 'text-gray-700' : 'text-gray-400 line-through'}>
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Leyenda */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Tipos</h3>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400" />Tarea</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm bg-gray-400" />Inicio proyecto</div>
              <div className="flex items-center gap-2"><span className="w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-b-[7px] border-b-gray-400" />Entrega</div>
            </div>
          </div>
        </div>

        {/* Grilla del calendario */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-x-auto scrollbar-thin">
          <div className="min-w-[560px]">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-medium text-gray-400 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const dayEvents = eventsForDay(day)
              return (
                <div key={i} className={`min-h-[96px] border-b border-r border-gray-50 p-1.5 ${day ? '' : 'bg-gray-50/50'}`}>
                  {day && (
                    <>
                      <div className={`text-xs mb-1 ${isToday(day) ? 'bg-brand-500 text-white w-5 h-5 rounded-full flex items-center justify-center font-medium' : 'text-gray-400'}`}>
                        {day}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div key={ev.id}
                            className="text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1"
                            style={{ background: `${ev.color}1a`, color: ev.color }}
                            title={`${typeLabel[ev.type]}: ${ev.title} (${ev.projectName})`}>
                            {ev.type === 'project-end' && <span className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px]" style={{ borderBottomColor: ev.color }} />}
                            {ev.type === 'project-start' && <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: ev.color }} />}
                            {ev.type === 'task' && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ev.color }} />}
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-gray-400 px-1.5">+{dayEvents.length - 3} más</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400 mt-4 text-center">Cargando eventos...</p>}
    </div>
  )
}
