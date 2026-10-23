import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Paperclip, CalendarClock, ChevronRight, AlertTriangle, CheckCircle2, Clock, MessageSquareText } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { CATEGORY, PRIORITY, STATUS, fmtDateTime, relTime, fileSize } from '../lib/support'

export default function ClientPortal() {
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)
  const [tab, setTab] = useState('ACTIVE')
  const [showNew, setShowNew] = useState(false)

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', 'portal', tab],
    queryFn: () => api.get(`/support/tickets${tab === 'ACTIVE' ? '?status=ACTIVE' : ''}`).then(r => r.data),
    refetchInterval: 20000
  })
  const { data: visits = [] } = useQuery({
    queryKey: ['portal-visits'],
    queryFn: () => api.get('/support/visits/upcoming').then(r => r.data),
    refetchInterval: 60000
  })

  const shown = tab === 'ACTIVE' ? tickets : tickets.filter(t => !t.isOpen)
  const needsMe = tickets.filter(t => t.status === 'WAITING_CLIENT' || t.status === 'RESOLVED')

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hola, {me?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">Levanta un ticket y sigue su atención paso a paso.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={16} /> Nuevo ticket
        </button>
      </div>

      {/* Avisos que requieren acción del cliente */}
      {needsMe.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1"><AlertTriangle size={13} /> Requieren tu atención</p>
          <div className="space-y-1">
            {needsMe.map(t => (
              <button key={t.id} onClick={() => navigate(`/portal/tickets/${t.id}`)} className="w-full text-left text-sm text-amber-900 hover:underline flex items-center gap-2">
                <ChevronRight size={14} /> <span className="font-mono text-xs">{t.folio}</span> {t.title}
                <span className="text-xs text-amber-700 ml-auto">{t.status === 'RESOLVED' ? 'confirma la solución' : 'esperan tu respuesta'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="flex gap-1 border-b border-gray-200 mb-3">
            {[{ k: 'ACTIVE', l: 'En curso' }, { k: 'ALL', l: 'Historial' }].map(x => (
              <button key={x.k} onClick={() => setTab(x.k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === x.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'}`}>{x.l}</button>
            ))}
          </div>
          {isLoading && <p className="text-center text-gray-400 py-10">Cargando...</p>}
          {!isLoading && shown.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
              <MessageSquareText size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">{tab === 'ACTIVE' ? 'No tienes tickets en curso' : 'Sin tickets cerrados todavía'}</p>
              {tab === 'ACTIVE' && <button onClick={() => setShowNew(true)} className="mt-3 text-sm text-brand-600 font-medium hover:underline">Levantar mi primer ticket</button>}
            </div>
          )}
          <div className="space-y-2">
            {shown.map(t => {
              const st = STATUS[t.status], pr = PRIORITY[t.priority], cat = CATEGORY[t.category]
              return (
                <button key={t.id} onClick={() => navigate(`/portal/tickets/${t.id}`)} className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-brand-300 hover:shadow-sm p-4 transition-all">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs text-gray-400">{t.folio}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st?.chip}`}>{st?.label}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${pr?.chip}`}>{pr?.label}</span>
                    <span className="text-[11px] text-gray-400 ml-auto">{relTime(t.createdAt)}</span>
                  </div>
                  <p className="font-medium text-gray-900">{t.title}</p>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span>{cat?.icon} {cat?.label}</span>
                    <span>· {t._count.messages} mensaje{t._count.messages !== 1 ? 's' : ''}</span>
                    {t.assignee ? <span>· Atiende: <b className="text-gray-700">{t.assignee.name}</b></span> : <span className="text-gray-400">· Pendiente de asignar</span>}
                    {t.rating && <span className="text-amber-500">· {'★'.repeat(t.rating)}</span>}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><CalendarClock size={15} className="text-purple-500" /> Próximas visitas</p>
            {visits.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">No hay visitas programadas</p> : (
              <div className="space-y-1.5">
                {visits.map(v => (
                  <button key={v.id} onClick={() => navigate(`/portal/tickets/${v.ticket.id}`)} className="w-full text-left text-xs bg-purple-50/60 hover:bg-purple-50 rounded-lg px-2.5 py-2">
                    <p className="font-medium text-gray-900">{fmtDateTime(v.scheduledAt)}</p>
                    <p className="text-gray-500">{v.ticket.folio} · {v.ticket.title}</p>
                    {v.technician && <p className="text-gray-500">Técnico: {v.technician.name}</p>}
                    {v.notes && <p className="text-gray-600 mt-0.5">{v.notes}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-xs text-gray-700 space-y-1.5">
            <p className="font-semibold text-gray-900">¿Cómo funciona?</p>
            <p className="flex gap-2"><Clock size={13} className="flex-shrink-0 mt-0.5 text-brand-600" /> Cada ticket tiene un tiempo de atención según su prioridad: urgente 4 h, alta 24 h, media 72 h, baja 7 días.</p>
            <p className="flex gap-2"><MessageSquareText size={13} className="flex-shrink-0 mt-0.5 text-brand-600" /> Toda la conversación, fotos y visitas quedan en el ticket. Recibirás una notificación en cada avance.</p>
            <p className="flex gap-2"><CheckCircle2 size={13} className="flex-shrink-0 mt-0.5 text-brand-600" /> Cuando lo marquemos resuelto, confirma y califica la atención para cerrarlo.</p>
          </div>
        </div>
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

function NewTicketModal({ onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ title: '', description: '', category: 'FAILURE', priority: 'MEDIUM', location: '', equipment: '' })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  const submit = async () => {
    setBusy(true)
    try {
      const { data: t } = await api.post('/support/tickets', form)
      for (const f of files) {
        const fd = new FormData(); fd.append('file', f)
        await api.post(`/support/tickets/${t.id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      qc.invalidateQueries(['tickets'])
      onClose()
      navigate(`/portal/tickets/${t.id}`)
    } catch (e) {
      alert(e.response?.data?.error || 'Error al crear el ticket')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Levantar ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">¿Qué sucede? *</label>
            <input value={form.title} onChange={set('title')} placeholder="Ej: El medidor no reporta lecturas desde ayer" className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Cuéntanos con detalle *</label>
            <textarea rows={4} value={form.description} onChange={set('description')} placeholder="Qué observas, desde cuándo, qué ya intentaste..." className={inputCls + ' resize-none'} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <select value={form.category} onChange={set('category')} className={inputCls}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Urgencia</label>
              <select value={form.priority} onChange={set('priority')} className={inputCls}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label} (atención en {v.sla})</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Ubicación / sitio</label><input value={form.location} onChange={set('location')} placeholder="Obra, dirección..." className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Equipo / serie</label><input value={form.equipment} onChange={set('equipment')} placeholder="Medidor, tarjeta..." className={inputCls} /></div>
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={e => { setFiles(arr => [...arr, ...Array.from(e.target.files || [])].slice(0, 5)); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full justify-center">
              <Paperclip size={14} /> Adjuntar fotos o PDF (opcional, máx. 5)
            </button>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-lg px-2 py-1">{f.name} <span className="text-gray-400">({fileSize(f.size)})</span>
                    <button onClick={() => setFiles(arr => arr.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={12} /></button></span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button onClick={submit} disabled={!form.title.trim() || !form.description.trim() || busy}
          className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
          {busy ? 'Enviando...' : 'Enviar ticket'}
        </button>
      </div>
    </div>
  )
}
