import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderKanban, CheckSquare, Package, FileText, PackageCheck, X } from 'lucide-react'
import api from '../lib/api'

const statusLabel = { TODO: 'Por hacer', IN_PROGRESS: 'En progreso', REVIEW: 'En revisión', DONE: 'Completado' }
const payLabel = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagada' }

export default function GlobalSearch({ dark = false }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  // Atajo Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Enfocar al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQ(''); setResults(null) }
  }, [open])

  // Búsqueda con debounce
  useEffect(() => {
    clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setResults(null); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get('/search', { params: { q } })
        setResults(data)
      } catch { setResults(null) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [q])

  const go = (path) => { navigate(path); setOpen(false) }

  const total = results
    ? results.projects.length + results.tasks.length + results.inventory.length + results.quotes.length + results.deliveries.length
    : 0

  return (
    <>
      <button onClick={() => setOpen(true)} title="Buscar (Ctrl+K)"
        className={`relative transition-colors ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>
        <Search size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-[10vh]" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search size={18} className="text-gray-400 flex-shrink-0" />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar proyectos, tareas, artículos, cotizaciones, entregas..."
                className="flex-1 text-sm focus:outline-none" />
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 && (
                <p className="px-4 py-8 text-center text-sm text-gray-400">Escribe al menos 2 caracteres para buscar</p>
              )}
              {loading && <p className="px-4 py-6 text-center text-sm text-gray-400">Buscando...</p>}
              {!loading && results && total === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados para "{q}"</p>
              )}

              {!loading && results && (
                <div className="py-2">
                  {results.projects.length > 0 && (
                    <Section title="Proyectos">
                      {results.projects.map(p => (
                        <Item key={p.id} onClick={() => go(`/projects/${p.id}`)}
                          icon={<span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color || '#2196F3' }} />}
                          title={p.name} sub={p.client} />
                      ))}
                    </Section>
                  )}
                  {results.tasks.length > 0 && (
                    <Section title="Tareas">
                      {results.tasks.map(t => (
                        <Item key={t.id} onClick={() => go(`/projects/${t.projectId}`)}
                          icon={<CheckSquare size={15} className="text-blue-500 flex-shrink-0" />}
                          title={t.title} sub={`${t.project.name} · ${statusLabel[t.status]}`} />
                      ))}
                    </Section>
                  )}
                  {results.inventory.length > 0 && (
                    <Section title="Inventario">
                      {results.inventory.map(i => (
                        <Item key={i.id} onClick={() => go('/inventory')}
                          icon={<Package size={15} className="text-brand-500 flex-shrink-0" />}
                          title={i.name} sub={`${i.quantity} ${i.unit}${i.location ? ' · ' + i.location : ''}`} />
                      ))}
                    </Section>
                  )}
                  {results.deliveries.length > 0 && (
                    <Section title="Entregas">
                      {results.deliveries.map(d => (
                        <Item key={d.id} onClick={() => go('/inventory')}
                          icon={<PackageCheck size={15} className="text-orange-500 flex-shrink-0" />}
                          title={d.folio} sub={`${d.recipient} · ${new Date(d.date).toLocaleDateString('es-MX')}`} />
                      ))}
                    </Section>
                  )}
                  {results.quotes.length > 0 && (
                    <Section title="Cotizaciones">
                      {results.quotes.map(qt => (
                        <Item key={qt.id} onClick={() => go('/quotes')}
                          icon={<FileText size={15} className="text-purple-500 flex-shrink-0" />}
                          title={qt.folio} sub={`${qt.clientName} · ${payLabel[qt.paymentStatus]}`} />
                      ))}
                    </Section>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex justify-between">
              <span>Atajo: Ctrl/Cmd + K</span>
              <span>Esc para cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-1">
      <p className="px-4 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function Item({ icon, title, sub, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 truncate">{title}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
    </button>
  )
}
