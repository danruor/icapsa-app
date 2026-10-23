import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Send, Paperclip, Lock, Clock, AlertTriangle, CalendarClock, MapPin, Wrench, Star,
  RotateCcw, CheckCircle2, X, FolderKanban, FileText, ShoppingCart, Truck, Building2, Phone, Mail, UserCheck, Trash2
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../lib/authStore'
import { CATEGORY, PRIORITY, STATUS, VISIT_STATUS, fmtDateTime, relTime, slaHoursLeft, avatarColor, initials, fileSize, toLocalInput } from '../lib/support'

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const isClient = me?.role === 'CLIENT'
  const isSuper = me?.role === 'SUPER_ADMIN'
  const backTo = isClient ? '/portal' : '/support'

  const { data: t, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api.get(`/support/tickets/${id}`).then(r => r.data),
    refetchInterval: 10000
  })
  const { data: users } = useQuery({
    queryKey: ['support-users'],
    queryFn: () => api.get('/support/users').then(r => r.data),
    enabled: !isClient
  })
  const { data: links } = useQuery({
    queryKey: ['support-links'],
    queryFn: () => api.get('/support/links').then(r => r.data),
    enabled: !isClient
  })

  const refresh = () => { qc.invalidateQueries(['ticket', id]); qc.invalidateQueries(['tickets']); qc.invalidateQueries(['support-metrics']) }
  const patch = useMutation({
    mutationFn: (data) => api.patch(`/support/tickets/${id}`, data),
    onSuccess: refresh,
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const reopen = useMutation({
    mutationFn: (reason) => api.post(`/support/tickets/${id}/reopen`, { reason }),
    onSuccess: refresh,
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const remove = useMutation({
    mutationFn: () => api.delete(`/support/tickets/${id}`),
    onSuccess: () => { qc.invalidateQueries(['tickets']); navigate('/support') },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const [showVisit, setShowVisit] = useState(false)
  const [showRate, setShowRate] = useState(false)

  if (isLoading) return <p className="text-center text-gray-400 py-16">Cargando ticket...</p>
  if (error || !t) return <p className="text-center text-gray-400 py-16">Ticket no encontrado</p>

  const st = STATUS[t.status] || STATUS.OPEN
  const pr = PRIORITY[t.priority] || PRIORITY.MEDIUM
  const cat = CATEGORY[t.category] || CATEGORY.OTHER
  const hoursLeft = slaHoursLeft(t)
  const clientUser = t.createdBy

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Encabezado */}
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft size={15} /> {isClient ? 'Mis tickets' : 'Soporte'}
      </button>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-sm text-gray-500">{t.folio}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.chip}`}>{st.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pr.chip}`}>{pr.label}</span>
            <span className="text-xs text-gray-500">{cat.icon} {cat.label}</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{t.title}</h1>
        </div>
        <SlaBadge ticket={t} hoursLeft={hoursLeft} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna principal: descripción + línea de tiempo + redactor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Descripción del problema</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{t.description}</p>
            {(t.location || t.equipment) && (
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                {t.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {t.location}</span>}
                {t.equipment && <span className="inline-flex items-center gap-1"><Wrench size={12} /> {t.equipment}</span>}
              </div>
            )}
          </div>

          <Timeline ticket={t} me={me} isClient={isClient} />

          <Composer ticket={t} isClient={isClient} onSent={refresh} />
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Acciones del cliente */}
          {isClient && t.status === 'RESOLVED' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={16} /> Marcado como resuelto</p>
              <p className="text-xs text-emerald-700 mt-1 mb-3">¿Quedó solucionado? Confirma y califica la atención para cerrar el ticket.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowRate(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 rounded-lg">Sí, calificar</button>
                <button onClick={() => { const r = prompt('¿Qué sigue fallando?'); if (r !== null) reopen.mutate(r) }}
                  className="flex-1 border border-emerald-300 text-emerald-800 text-sm font-medium py-2 rounded-lg">No, reabrir</button>
              </div>
            </div>
          )}
          {t.status === 'CLOSED' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-700">Ticket cerrado</p>
              {t.rating ? (
                <p className="text-amber-500 mt-1">{'★'.repeat(t.rating)}<span className="text-gray-300">{'★'.repeat(5 - t.rating)}</span>
                  {t.ratingComment && <span className="block text-xs text-gray-500 mt-1">«{t.ratingComment}»</span>}</p>
              ) : <p className="text-xs text-gray-400 mt-1">Sin calificación</p>}
              <button onClick={() => { const r = prompt('Motivo para reabrir:'); if (r !== null) reopen.mutate(r) }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-white text-sm py-2 rounded-lg">
                <RotateCcw size={14} /> Reabrir ticket
              </button>
            </div>
          )}

          {/* Gestión (personal) */}
          {!isClient && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gestión</p>
              <Field label="Estado">
                <select value={t.status} onChange={e => patch.mutate({ status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Prioridad">
                <select value={t.priority} onChange={e => patch.mutate({ priority: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500">
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label} · SLA {v.sla}</option>)}
                </select>
              </Field>
              <Field label="Técnico asignado">
                <select value={t.assignee?.id || ''} onChange={e => patch.mutate({ assigneeId: e.target.value || null })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500">
                  <option value="">Sin asignar</option>
                  {users?.technicians.map(u => <option key={u.id} value={u.id}>{u.name}{u.position ? ` · ${u.position}` : ''}</option>)}
                </select>
              </Field>
              <Field label="Categoría">
                <select value={t.category} onChange={e => patch.mutate({ category: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500">
                  {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </Field>
              <button onClick={() => setShowVisit(true)}
                className="w-full flex items-center justify-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 rounded-lg">
                <CalendarClock size={15} /> Programar visita
              </button>
              {t.status === 'CLOSED' || t.status === 'RESOLVED' ? null : (
                <button onClick={() => patch.mutate({ status: 'RESOLVED' })}
                  className="w-full flex items-center justify-center gap-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-medium py-2 rounded-lg">
                  <CheckCircle2 size={15} /> Marcar como resuelto
                </button>
              )}
            </div>
          )}

          {/* Datos del ticket */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2.5 text-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Información</p>
            {!isClient && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-xs text-gray-400 mb-0.5">Cliente</p>
                <p className="font-medium text-gray-900 flex items-center gap-1.5"><Building2 size={13} className="text-gray-400" /> {t.company || 'Sin empresa'}</p>
                <p className="text-xs text-gray-600 mt-1">{clientUser?.name}{clientUser?.role !== 'CLIENT' ? ' (registrado por el equipo)' : ''}</p>
                {clientUser?.email && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail size={11} /> {clientUser.email}</p>}
                {clientUser?.phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11} /> {clientUser.phone}</p>}
              </div>
            )}
            <Row label="Atendido por">
              {t.assignee ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full text-white text-[9px] font-semibold flex items-center justify-center" style={{ background: avatarColor(t.assignee.name) }}>{initials(t.assignee.name)}</span>
                  {t.assignee.name}
                </span>
              ) : <span className="text-gray-400">Pendiente de asignar</span>}
            </Row>
            <Row label="Creado">{fmtDateTime(t.createdAt)}</Row>
            <Row label="Límite de atención">{t.slaDueAt ? fmtDateTime(t.slaDueAt) : '—'}</Row>
            <Row label="Primera respuesta">{t.firstResponseAt ? fmtDateTime(t.firstResponseAt) : <span className="text-gray-400">pendiente</span>}</Row>
            {t.resolvedAt && <Row label="Resuelto">{fmtDateTime(t.resolvedAt)}</Row>}
            {t.closedAt && <Row label="Cerrado">{fmtDateTime(t.closedAt)}</Row>}
          </div>

          {/* Vínculos */}
          {!isClient && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vinculado con</p>
              <LinkSelect icon={FolderKanban} label="Proyecto" value={t.project?.id || ''} options={links?.projects.map(p => ({ id: p.id, label: p.name }))} onChange={v => patch.mutate({ projectId: v })} />
              <LinkSelect icon={FileText} label="Cotización" value={t.quote?.id || ''} options={links?.quotes.map(q => ({ id: q.id, label: `${q.folio} — ${q.clientName}` }))} onChange={v => patch.mutate({ quoteId: v })} />
              <LinkSelect icon={ShoppingCart} label="Orden de compra" value={t.purchaseOrder?.id || ''} options={links?.purchaseOrders.map(o => ({ id: o.id, label: `${o.folio} — ${o.supplier}` }))} onChange={v => patch.mutate({ purchaseOrderId: v })} />
              <LinkSelect icon={Truck} label="Entrega" value={t.delivery?.id || ''} options={links?.deliveries.map(d => ({ id: d.id, label: d.folio }))} onChange={v => patch.mutate({ deliveryId: v })} />
            </div>
          )}
          {isClient && (t.project || t.quote || t.purchaseOrder || t.delivery) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Referencias</p>
              {t.project && <p className="flex items-center gap-1.5 text-gray-700"><FolderKanban size={13} className="text-gray-400" /> {t.project.name}</p>}
              {t.quote && <p className="flex items-center gap-1.5 text-gray-700"><FileText size={13} className="text-gray-400" /> Cotización {t.quote.folio}</p>}
              {t.purchaseOrder && <p className="flex items-center gap-1.5 text-gray-700"><ShoppingCart size={13} className="text-gray-400" /> OC {t.purchaseOrder.folio}</p>}
              {t.delivery && <p className="flex items-center gap-1.5 text-gray-700"><Truck size={13} className="text-gray-400" /> Entrega {t.delivery.folio}</p>}
            </div>
          )}

          {/* Visitas */}
          <VisitsPanel ticket={t} isClient={isClient} onChanged={refresh} />

          {/* Adjuntos */}
          {t.attachments?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Adjuntos ({t.attachments.length})</p>
              <div className="space-y-1.5">
                {t.attachments.map(a => <AttachmentChip key={a.id} a={a} />)}
              </div>
            </div>
          )}

          {isSuper && (
            <button onClick={() => { if (confirm(`¿Eliminar el ticket ${t.folio} y toda su conversación? Esta acción no se puede deshacer.`)) remove.mutate() }}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:bg-red-50 py-2 rounded-lg">
              <Trash2 size={13} /> Eliminar ticket
            </button>
          )}
        </div>
      </div>

      {showVisit && <VisitModal ticketId={t.id} technicians={users?.technicians || []} defaultTech={t.assignee?.id} onClose={() => setShowVisit(false)} onSaved={refresh} />}
      {showRate && <RateModal ticketId={t.id} onClose={() => setShowRate(false)} onSaved={refresh} />}
    </div>
  )
}

// ---------- Piezas ----------
function SlaBadge({ ticket, hoursLeft }) {
  if (!ticket.isOpen) {
    return ticket.resolvedAt
      ? <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-medium"><CheckCircle2 size={14} /> Atendido en {Math.max(1, Math.round((new Date(ticket.resolvedAt) - new Date(ticket.createdAt)) / 3600000))} h</span>
      : null
  }
  if (ticket.status === 'WAITING_CLIENT') return <span className="inline-flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-medium"><Clock size={14} /> SLA en pausa (esperando al cliente)</span>
  if (hoursLeft === null) return null
  if (hoursLeft < 0) return <span className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-semibold animate-pulse"><AlertTriangle size={14} /> SLA vencido {relTime(ticket.slaDueAt)}</span>
  const urgent = hoursLeft < 4
  return <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium ${urgent ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}><Clock size={14} /> Límite {relTime(ticket.slaDueAt)}</span>
}

const Field = ({ label, children }) => <div><label className="block text-[10px] text-gray-400 mb-1">{label}</label>{children}</div>
const Row = ({ label, children }) => <div className="flex justify-between gap-3"><span className="text-xs text-gray-400">{label}</span><span className="text-xs text-gray-800 text-right">{children}</span></div>

function LinkSelect({ icon: Icon, label, value, options = [], onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-gray-400 flex-shrink-0" />
      <select value={value} onChange={e => onChange(e.target.value || null)} className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand-500">
        <option value="">Sin {label.toLowerCase()}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

function AttachmentChip({ a }) {
  const isImg = a.mimeType?.startsWith('image/')
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-gray-700 hover:text-brand-600 bg-gray-50 hover:bg-gray-100 rounded-lg px-2 py-1.5">
      {isImg ? <img src={a.url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" /> : <FileText size={16} className="text-red-400 flex-shrink-0" />}
      <span className="truncate flex-1">{a.name}</span>
      <span className="text-gray-400 flex-shrink-0">{fileSize(a.size)}</span>
    </a>
  )
}

// ---------- Línea de tiempo ----------
function Timeline({ ticket, me, isClient }) {
  const endRef = useRef(null)
  const count = ticket.messages?.length || 0
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [count])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Seguimiento ({count})</p>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {ticket.messages?.map(m => {
          if (m.kind === 'SYSTEM') return (
            <div key={m.id} className="flex items-center gap-2 text-[11px] text-gray-400 py-0.5">
              <span className="flex-1 border-t border-dashed border-gray-200" />
              <span className="text-center max-w-[80%]">{m.body} · {fmtDateTime(m.createdAt)}</span>
              <span className="flex-1 border-t border-dashed border-gray-200" />
            </div>
          )
          const mine = m.author?.id === me?.id
          const fromClient = m.author?.role === 'CLIENT'
          const internal = m.kind === 'INTERNAL'
          const name = m.author?.name || 'Sistema'
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-1" style={{ background: avatarColor(name) }} title={name}>{initials(name)}</div>
              <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${internal ? 'bg-amber-50 border border-amber-200 text-amber-900' : mine ? 'bg-brand-500 text-white' : fromClient ? 'bg-gray-100 text-gray-900' : 'bg-brand-50 text-gray-900'}`}>
                  {internal && <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1 mb-0.5"><Lock size={10} /> Nota interna · solo equipo</p>}
                  {m.body}
                  {m.attachments?.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {m.attachments.map(a => (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className={`flex items-center gap-1.5 text-xs underline ${mine && !internal ? 'text-white/90' : 'text-brand-700'}`}>
                          <Paperclip size={11} /> {a.name} <span className="opacity-70">({fileSize(a.size)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 px-1">{name}{!isClient && fromClient ? ' · cliente' : ''} · {fmtDateTime(m.createdAt)}</p>
              </div>
            </div>
          )
        })}
        {count === 0 && <p className="text-center text-xs text-gray-400 py-6">Aún no hay mensajes</p>}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ---------- Redactor ----------
function Composer({ ticket, isClient, onSent }) {
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [setStatus, setSetStatus] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef(null)

  const closed = ticket.status === 'CLOSED'
  if (closed && isClient) return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-500">Este ticket está cerrado. Si el problema persiste, reábrelo desde el panel lateral.</div>
  )

  const send = async () => {
    if (!body.trim() && files.length === 0) return
    setSending(true)
    try {
      const attachmentIds = []
      for (const f of files) {
        const fd = new FormData()
        fd.append('file', f)
        const { data } = await api.post(`/support/tickets/${ticket.id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        attachmentIds.push(data.id)
      }
      await api.post(`/support/tickets/${ticket.id}/messages`, {
        body: body.trim(), kind: internal ? 'INTERNAL' : 'MESSAGE', attachmentIds,
        ...(setStatus && !internal && { status: setStatus })
      })
      setBody(''); setFiles([]); setSetStatus(''); setInternal(false)
      onSent()
    } catch (e) {
      alert(e.response?.data?.error || 'Error al enviar')
    } finally { setSending(false) }
  }

  return (
    <div className={`rounded-xl border p-3 ${internal ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
        placeholder={internal ? 'Nota interna (el cliente no la ve)...' : isClient ? 'Escribe tu mensaje al equipo de soporte...' : 'Responder al cliente...'}
        className="w-full text-sm resize-none focus:outline-none bg-transparent" />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-lg px-2 py-1">
              <Paperclip size={11} /> {f.name} <span className="text-gray-400">({fileSize(f.size)})</span>
              <button onClick={() => setFiles(arr => arr.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden"
          onChange={e => { setFiles(arr => [...arr, ...Array.from(e.target.files || [])].slice(0, 5)); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100" title="Adjuntar foto o PDF (máx. 10 MB)">
          <Paperclip size={14} /> Adjuntar
        </button>
        {!isClient && (
          <>
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer px-2 py-1.5">
              <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> <Lock size={12} /> Nota interna
            </label>
            {!internal && (
              <select value={setStatus} onChange={e => setSetStatus(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                <option value="">y mantener estado</option>
                <option value="WAITING_CLIENT">y esperar al cliente</option>
                <option value="RESOLVED">y marcar resuelto</option>
                <option value="IN_PROGRESS">y poner en atención</option>
              </select>
            )}
          </>
        )}
        <span className="text-[10px] text-gray-300 ml-auto hidden sm:inline">Ctrl+Enter para enviar</span>
        <button onClick={send} disabled={sending || (!body.trim() && files.length === 0)}
          className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40">
          <Send size={14} /> {sending ? 'Enviando...' : internal ? 'Guardar nota' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

// ---------- Visitas ----------
function VisitsPanel({ ticket, isClient, onChanged }) {
  const patch = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/support/visits/${id}`, data),
    onSuccess: onChanged,
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const visits = ticket.visits || []
  if (visits.length === 0) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Visitas en sitio</p>
      <div className="space-y-2">
        {visits.map(v => {
          const vs = VISIT_STATUS[v.status] || VISIT_STATUS.SCHEDULED
          return (
            <div key={v.id} className="border border-gray-100 rounded-lg p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900 flex items-center gap-1"><CalendarClock size={13} className="text-purple-500" /> {fmtDateTime(v.scheduledAt)}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium ${vs.chip}`}>{vs.label}</span>
              </div>
              <p className="text-gray-500 mt-1">{v.durationMin} min{v.technician ? ` · ${v.technician.name}` : ''}</p>
              {v.notes && <p className="text-gray-600 mt-1">{v.notes}</p>}
              {v.outcome && <p className="text-emerald-700 mt-1">Resultado: {v.outcome}</p>}
              {!isClient && v.status === 'SCHEDULED' && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { const o = prompt('Resultado de la visita:'); if (o !== null) patch.mutate({ id: v.id, data: { status: 'DONE', outcome: o } }) }}
                    className="text-emerald-700 hover:underline">Marcar realizada</button>
                  <button onClick={() => { const d = prompt('Nueva fecha y hora (AAAA-MM-DD HH:MM, hora local):', toLocalInput(v.scheduledAt).replace('T', ' ')); if (d) patch.mutate({ id: v.id, data: { scheduledAt: d.replace(' ', 'T') } }) }}
                    className="text-gray-600 hover:underline">Reprogramar</button>
                  <button onClick={() => { if (confirm('¿Cancelar esta visita?')) patch.mutate({ id: v.id, data: { status: 'CANCELLED' } }) }}
                    className="text-red-500 hover:underline">Cancelar</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VisitModal({ ticketId, technicians, defaultTech, onClose, onSaved }) {
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(10, 0, 0, 0)
  const [form, setForm] = useState({ scheduledAt: toLocalInput(tomorrow), durationMin: 120, technicianId: defaultTech || '', notes: '' })
  const save = useMutation({
    mutationFn: () => api.post(`/support/tickets/${ticketId}/visits`, form),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2"><CalendarClock size={18} className="text-purple-500" /> Programar visita</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">Fecha y hora</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Duración estimada (min)</label>
            <input type="number" min="15" step="15" value={form.durationMin} onChange={set('durationMin')} className={inputCls} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Técnico</label>
            <select value={form.technicianId} onChange={set('technicianId')} className={inputCls}>
              <option value="">Por definir</option>
              {technicians.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Indicaciones (el cliente las ve)</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Acceso, contacto en sitio, material necesario..." className={inputCls + ' resize-none'} /></div>
          <p className="text-[10px] text-gray-400">La visita aparece en el Calendario del equipo y el cliente recibe la notificación.</p>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="w-full mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
          {save.isPending ? 'Programando...' : 'Programar visita'}
        </button>
      </div>
    </div>
  )
}

// ---------- Calificación ----------
function RateModal({ ticketId, onClose, onSaved }) {
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const save = useMutation({
    mutationFn: () => api.post(`/support/tickets/${ticketId}/rate`, { rating, comment }),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 text-center">
        <h2 className="text-base font-semibold mb-1">¿Cómo fue la atención?</h2>
        <p className="text-xs text-gray-500 mb-4">Tu calificación nos ayuda a mejorar</p>
        <div className="flex justify-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}>
              <Star size={32} className={(hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
            </button>
          ))}
        </div>
        <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentario (opcional)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none mb-3" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-40">
            {save.isPending ? '...' : 'Confirmar y cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
