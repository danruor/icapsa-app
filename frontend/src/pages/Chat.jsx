import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessagesSquare, Plus, Search, Send, X, Users, User, ChevronLeft,
  MoreVertical, Pencil, LogOut, UserPlus, UserMinus, Trash2, Shield
} from 'lucide-react'
import { useAuthStore } from '../lib/authStore'
import api from '../lib/api'

// Color determinístico por nombre (avatares)
const AVATAR_COLORS = ['#1D9E75', '#2563EB', '#9333EA', '#DC2626', '#EA580C', '#0891B2', '#4F46E5', '#BE185D']
const avatarColor = (name = '') => AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

const fmtTime = (d) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const fmtDay = (d) => {
  const date = new Date(d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(date); that.setHours(0, 0, 0, 0)
  const diff = (today - that) / 86400000
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: diff > 300 ? 'numeric' : undefined })
}

export default function Chat() {
  const [activeId, setActiveId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState('')
  const qc = useQueryClient()

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['chat-convs'],
    queryFn: () => api.get('/chat/conversations').then(r => r.data),
    refetchInterval: 8000
  })

  const active = conversations.find(c => c.id === activeId)
  const filtered = conversations.filter(c => !filter || c.name.toLowerCase().includes(filter.toLowerCase()))

  const openConversation = (id) => {
    setActiveId(id)
    qc.invalidateQueries(['chat-unread'])
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Chat interno</h1>
        <p className="text-sm text-gray-500 mt-1">Conversaciones directas y grupos de trabajo</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex" style={{ height: 'calc(100dvh - 210px)', minHeight: '420px' }}>
        {/* ===== Panel izquierdo: lista ===== */}
        <div className={`w-full md:w-80 md:flex-shrink-0 border-r border-gray-100 flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-gray-100 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar conversación..."
                className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
            </div>
            <button onClick={() => setShowNew(true)} title="Nueva conversación"
              className="bg-brand-500 hover:bg-brand-600 text-white p-2 rounded-lg flex-shrink-0">
              <Plus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && <p className="text-center text-gray-400 text-sm py-8">Cargando...</p>}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-12 px-4 text-gray-400">
                <MessagesSquare size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin conversaciones todavía.</p>
                <p className="text-xs mt-1">Crea una con el botón +</p>
              </div>
            )}
            {filtered.map(c => (
              <button key={c.id} onClick={() => openConversation(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 ${activeId === c.id ? 'bg-brand-50' : ''}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                  style={{ background: c.type === 'GROUP' ? '#374151' : avatarColor(c.name) }}>
                  {c.type === 'GROUP' ? <Users size={17} /> : initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${c.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>{c.name}</p>
                    {c.lastMessage && <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtTime(c.lastMessage.createdAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 truncate">
                      {c.lastMessage
                        ? (c.lastMessage.isSystem ? c.lastMessage.content
                          : `${c.lastMessage.isMine ? 'Tú: ' : (c.type === 'GROUP' && c.lastMessage.senderName ? c.lastMessage.senderName.split(' ')[0] + ': ' : '')}${c.lastMessage.content}`)
                        : c.subtitle}
                    </p>
                    {c.unread > 0 && (
                      <span className="bg-brand-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center flex-shrink-0">
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ===== Panel derecho: conversación ===== */}
        <div className={`flex-1 flex-col min-w-0 ${activeId ? 'flex' : 'hidden md:flex'}`}>
          {active ? (
            <ChatWindow key={active.id} conversation={active} onBack={() => setActiveId(null)}
              onLeft={() => { setActiveId(null); qc.invalidateQueries(['chat-convs']) }} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
              <MessagesSquare size={48} className="mb-3 opacity-40" />
              <p className="text-sm text-gray-400">Selecciona una conversación o crea una nueva</p>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewConversationModal onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); qc.invalidateQueries(['chat-convs']).then(() => setActiveId(id)) }} />
      )}
    </div>
  )
}

// ============ Ventana de conversación ============
function ChatWindow({ conversation, onBack, onLeft }) {
  const me = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const bottomRef = useRef(null)
  const boxRef = useRef(null)

  const { data: messages = [] } = useQuery({
    queryKey: ['chat-msgs', conversation.id],
    queryFn: () => api.get(`/chat/conversations/${conversation.id}/messages`).then(r => r.data),
    refetchInterval: 4000
  })

  const send = useMutation({
    mutationFn: (content) => api.post(`/chat/conversations/${conversation.id}/messages`, { content }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries(['chat-msgs', conversation.id])
      qc.invalidateQueries(['chat-convs'])
    },
    onError: (e) => alert(e.response?.data?.error || 'Error al enviar')
  })

  const delMsg = useMutation({
    mutationFn: (id) => api.delete(`/chat/messages/${id}`),
    onSuccess: () => qc.invalidateQueries(['chat-msgs', conversation.id])
  })

  const rename = useMutation({
    mutationFn: (name) => api.patch(`/chat/conversations/${conversation.id}`, { name }),
    onSuccess: () => { qc.invalidateQueries(['chat-convs']); qc.invalidateQueries(['chat-msgs', conversation.id]) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const deleteConv = useMutation({
    mutationFn: () => api.delete(`/chat/conversations/${conversation.id}`),
    onSuccess: onLeft,
    onError: (e) => alert(e.response?.data?.error || 'Error al eliminar')
  })

  const removeMember = useMutation({
    mutationFn: (userId) => api.delete(`/chat/conversations/${conversation.id}/participants/${userId}`),
    onSuccess: (_, userId) => {
      if (userId === me.id) return onLeft()
      qc.invalidateQueries(['chat-convs'])
      qc.invalidateQueries(['chat-msgs', conversation.id])
    },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  // Auto-scroll al fondo con mensajes nuevos (si ya estabas cerca del fondo)
  const prevCount = useRef(0)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160
    if (messages.length !== prevCount.current && (nearBottom || prevCount.current === 0)) {
      bottomRef.current?.scrollIntoView({ behavior: prevCount.current === 0 ? 'auto' : 'smooth' })
    }
    prevCount.current = messages.length
  }, [messages])

  const submit = () => {
    const t = text.trim()
    if (t && !send.isPending) send.mutate(t)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const doRename = () => {
    const name = prompt('Nuevo nombre del grupo:', conversation.name)
    if (name && name.trim()) rename.mutate(name.trim())
    setMenuOpen(false)
  }

  const isGroup = conversation.type === 'GROUP'

  // Agrupar mensajes por día
  const grouped = useMemo(() => {
    const out = []
    let lastDay = null
    for (const m of messages) {
      const day = new Date(m.createdAt).toDateString()
      if (day !== lastDay) { out.push({ divider: true, id: 'd-' + day, label: fmtDay(m.createdAt) }); lastDay = day }
      out.push(m)
    }
    return out
  }, [messages])

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="md:hidden text-gray-500"><ChevronLeft size={20} /></button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
          style={{ background: isGroup ? '#374151' : avatarColor(conversation.name) }}>
          {isGroup ? <Users size={16} /> : initials(conversation.name)}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => isGroup && setShowMembers(v => !v)}>
          <p className="text-sm font-semibold text-gray-900 truncate">{conversation.name}</p>
          <p className="text-xs text-gray-400 truncate">{conversation.subtitle}{isGroup ? ' · toca para ver' : ''}</p>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)} className="text-gray-400 hover:text-gray-600 p-1"><MoreVertical size={18} /></button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-56 py-1">
              {isGroup ? (
                <>
                  <button onClick={() => { setShowMembers(true); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Users size={14} /> Ver integrantes
                  </button>
                  {conversation.myIsAdmin && (
                    <>
                      <button onClick={() => { setShowAdd(true); setMenuOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <UserPlus size={14} /> Agregar integrantes
                      </button>
                      <button onClick={doRename}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <Pencil size={14} /> Renombrar grupo
                      </button>
                    </>
                  )}
                  <button onClick={() => { setMenuOpen(false); if (confirm('¿Salir de este grupo?')) removeMember.mutate(me.id) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={14} /> Salir del grupo
                  </button>
                  {(conversation.myIsAdmin || me?.role === 'SUPER_ADMIN') && (
                    <button onClick={() => {
                      setMenuOpen(false)
                      if (confirm(`¿Eliminar el grupo «${conversation.name}» PARA TODOS?\n\nSe borrarán todos los mensajes de los ${conversation.participants.length} integrantes. Esta acción no se puede deshacer.`)) deleteConv.mutate()
                    }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100">
                      <Trash2 size={14} /> Eliminar grupo (todos)
                    </button>
                  )}
                </>
              ) : (
                <button onClick={() => {
                  setMenuOpen(false)
                  if (confirm(`¿Eliminar este chat de tu lista?\n\nTu historial se borrará solo para ti; ${conversation.name} conserva el suyo. Si te vuelve a escribir, el chat reaparecerá.`)) deleteConv.mutate()
                }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 size={14} /> Eliminar chat
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Integrantes (grupos) */}
      {isGroup && showMembers && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0 max-h-40 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Integrantes</p>
          <div className="space-y-1.5">
            {conversation.participants.map(p => (
              <div key={p.userId} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium"
                  style={{ background: avatarColor(p.name) }}>{initials(p.name)}</div>
                <span className="text-sm text-gray-700 flex-1 truncate">
                  {p.name}{p.userId === me.id && ' (tú)'}
                  {p.position && <span className="text-xs text-gray-400"> · {p.position}</span>}
                </span>
                {p.isAdmin && <Shield size={12} className="text-brand-500" title="Administrador" />}
                {conversation.myIsAdmin && p.userId !== me.id && (
                  <button onClick={() => { if (confirm(`¿Quitar a ${p.name} del grupo?`)) removeMember.mutate(p.userId) }}
                    className="text-gray-300 hover:text-red-500" title="Quitar"><UserMinus size={14} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div ref={boxRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 bg-gray-50/50">
        {grouped.map(m => m.divider ? (
          <div key={m.id} className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] text-gray-400 font-medium">{m.label}</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        ) : m.type === 'SYSTEM' ? (
          <p key={m.id} className="text-center text-[11px] text-gray-400 py-1">{m.content}</p>
        ) : (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'} group`}>
            <div className={`max-w-[78%] rounded-2xl px-3 py-2 relative ${m.mine ? 'bg-brand-500 text-white rounded-br-md' : 'bg-white border border-gray-100 text-gray-900 rounded-bl-md'}`}>
              {!m.mine && conversation.type === 'GROUP' && m.sender && (
                <p className="text-[11px] font-semibold mb-0.5" style={{ color: avatarColor(m.sender.name) }}>{m.sender.name}</p>
              )}
              {m.deleted ? (
                <p className={`text-sm italic ${m.mine ? 'text-white/60' : 'text-gray-400'}`}>Mensaje eliminado</p>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
              )}
              <p className={`text-[9px] mt-0.5 text-right ${m.mine ? 'text-white/60' : 'text-gray-300'}`}>{fmtTime(m.createdAt)}</p>
              {m.mine && !m.deleted && (
                <button onClick={() => { if (confirm('¿Eliminar este mensaje?')) delMsg.mutate(m.id) }}
                  className="absolute -left-6 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar"><Trash2 size={13} /></button>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100 flex items-end gap-2 flex-shrink-0">
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey}
          placeholder="Escribe un mensaje... (Enter para enviar)"
          rows={Math.min(4, Math.max(1, text.split('\n').length))}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-500" />
        <button onClick={submit} disabled={!text.trim() || send.isPending}
          className="bg-brand-500 hover:bg-brand-600 text-white p-2.5 rounded-xl disabled:opacity-40 flex-shrink-0">
          <Send size={17} />
        </button>
      </div>

      {showAdd && (
        <AddMembersModal conversation={conversation} onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); qc.invalidateQueries(['chat-convs']); qc.invalidateQueries(['chat-msgs', conversation.id]) }} />
      )}
    </>
  )
}

// ============ Modal: nueva conversación ============
function NewConversationModal({ onClose, onCreated }) {
  const [tab, setTab] = useState('DIRECT')
  const [search, setSearch] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState([])

  const { data: users = [] } = useQuery({
    queryKey: ['chat-users'],
    queryFn: () => api.get('/chat/users').then(r => r.data)
  })

  const create = useMutation({
    mutationFn: (data) => api.post('/chat/conversations', data),
    onSuccess: (r) => onCreated(r.data.id),
    onError: (e) => alert(e.response?.data?.error || 'Error al crear')
  })

  const filtered = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Nueva conversación</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          {[{ k: 'DIRECT', label: 'Directa', icon: User }, { k: 'GROUP', label: 'Grupo', icon: Users }].map(t => (
            <button key={t.k} onClick={() => { setTab(t.k); setSelected([]) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.k ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-hidden flex flex-col">
          {tab === 'GROUP' && (
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nombre del grupo *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
          )}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar personas..."
              className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-[200px]">
            {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Sin usuarios</p>}
            {filtered.map(u => (
              <button key={u.id}
                onClick={() => tab === 'DIRECT' ? create.mutate({ type: 'DIRECT', participantIds: [u.id] }) : toggle(u.id)}
                className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded-lg text-left">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ background: avatarColor(u.name) }}>{initials(u.name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{u.name}</p>
                  {u.position && <p className="text-xs text-gray-400 truncate">{u.position}</p>}
                </div>
                {tab === 'GROUP' && (
                  <input type="checkbox" readOnly checked={selected.includes(u.id)} className="pointer-events-none" />
                )}
              </button>
            ))}
          </div>

          {tab === 'GROUP' && (
            <button onClick={() => create.mutate({ type: 'GROUP', name: groupName, participantIds: selected })}
              disabled={!groupName.trim() || selected.length === 0 || create.isPending}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
              {create.isPending ? 'Creando...' : `Crear grupo${selected.length ? ` (${selected.length + 1} integrantes)` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Modal: agregar integrantes a un grupo ============
function AddMembersModal({ conversation, onClose, onAdded }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])

  const { data: users = [] } = useQuery({
    queryKey: ['chat-users'],
    queryFn: () => api.get('/chat/users').then(r => r.data)
  })

  const add = useMutation({
    mutationFn: () => api.post(`/chat/conversations/${conversation.id}/participants`, { participantIds: selected }),
    onSuccess: onAdded,
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const memberIds = conversation.participants.map(p => p.userId)
  const candidates = users.filter(u => !memberIds.includes(u.id) && (!search || u.name.toLowerCase().includes(search.toLowerCase())))
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">Agregar integrantes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar personas..."
              className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex-1 overflow-y-auto min-h-[160px]">
            {candidates.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Todos ya están en el grupo</p>}
            {candidates.map(u => (
              <button key={u.id} onClick={() => toggle(u.id)}
                className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded-lg text-left">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ background: avatarColor(u.name) }}>{initials(u.name)}</div>
                <span className="flex-1 text-sm text-gray-900 truncate">{u.name}</span>
                <input type="checkbox" readOnly checked={selected.includes(u.id)} className="pointer-events-none" />
              </button>
            ))}
          </div>
          <button onClick={() => add.mutate()} disabled={selected.length === 0 || add.isPending}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
            {add.isPending ? 'Agregando...' : `Agregar (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
