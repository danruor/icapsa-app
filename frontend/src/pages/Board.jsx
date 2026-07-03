import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, MoreVertical, Pencil, Trash2, Calendar, FolderKanban,
  FileText, ShoppingCart, GripVertical, KanbanSquare, AlertCircle
} from 'lucide-react'
import api from '../lib/api'

const AVATAR_COLORS = ['#1D9E75', '#2563EB', '#9333EA', '#DC2626', '#EA580C', '#0891B2', '#4F46E5', '#BE185D']
const avatarColor = (name = '') => AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

const PRIORITIES = {
  HIGH: { label: 'Alta', bar: 'bg-red-500', chip: 'bg-red-50 text-red-600' },
  MEDIUM: { label: 'Media', bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-600' },
  LOW: { label: 'Baja', bar: 'bg-gray-300', chip: 'bg-gray-100 text-gray-500' }
}

const COLUMN_COLORS = ['#94A3B8', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E', '#EF4444', '#06B6D4']

export default function Board() {
  const qc = useQueryClient()
  const [dragging, setDragging] = useState(null)      // card id en arrastre
  const [overColumn, setOverColumn] = useState(null)  // columna resaltada
  const [editCard, setEditCard] = useState(null)      // tarjeta abierta en modal
  const [newCardCol, setNewCardCol] = useState(null)  // ¿en qué columna se está creando?
  const [showNewCol, setShowNewCol] = useState(false)

  const { data: columns = [], isLoading } = useQuery({
    queryKey: ['board'],
    queryFn: () => api.get('/board').then(r => r.data),
    refetchInterval: 10000
  })

  // ===== Mover tarjeta (con actualización optimista para fluidez total) =====
  const move = useMutation({
    mutationFn: ({ cardId, columnId, index }) => api.post(`/board/cards/${cardId}/move`, { columnId, index }),
    onMutate: async ({ cardId, columnId, index }) => {
      await qc.cancelQueries(['board'])
      const prev = qc.getQueryData(['board'])
      qc.setQueryData(['board'], (cols) => {
        if (!cols) return cols
        const clone = cols.map(c => ({ ...c, cards: [...c.cards] }))
        let card
        for (const c of clone) {
          const i = c.cards.findIndex(x => x.id === cardId)
          if (i >= 0) { card = c.cards.splice(i, 1)[0]; break }
        }
        if (!card) return cols
        const dest = clone.find(c => c.id === columnId)
        if (!dest) return cols
        dest.cards.splice(Math.min(index, dest.cards.length), 0, { ...card, columnId })
        return clone
      })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(['board'], ctx.prev)
      alert(e.response?.data?.error || 'Error al mover')
    },
    onSettled: () => qc.invalidateQueries(['board'])
  })

  // ===== Drag & drop nativo =====
  const onDragStart = (e, cardId) => {
    setDragging(cardId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', cardId)
  }
  const onDragEnd = () => { setDragging(null); setOverColumn(null) }

  const dropOnColumn = (e, col) => {
    e.preventDefault()
    const cardId = e.dataTransfer.getData('text/plain')
    if (cardId) move.mutate({ cardId, columnId: col.id, index: col.cards.length })
    onDragEnd()
  }
  const dropOnCard = (e, col, index) => {
    e.preventDefault()
    e.stopPropagation()
    const cardId = e.dataTransfer.getData('text/plain')
    if (cardId && cardId !== col.cards[index]?.id) move.mutate({ cardId, columnId: col.id, index })
    onDragEnd()
  }

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <KanbanSquare size={22} className="text-brand-500" /> Pendientes
          </h1>
          <p className="text-sm text-gray-500 mt-1">Tablero de trabajo del equipo — arrastra las tarjetas entre columnas</p>
        </div>
        <button onClick={() => setShowNewCol(true)}
          className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg flex-shrink-0">
          <Plus size={15} /> <span className="hidden sm:inline">Columna</span>
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-16">Cargando tablero...</p>
      ) : (
        <div className="flex-1 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-8 md:px-8">
          <div className="flex gap-4 items-start min-h-[60vh]">
            {columns.map(col => (
              <ColumnView key={col.id} col={col}
                dragging={dragging} overColumn={overColumn} setOverColumn={setOverColumn}
                onDragStart={onDragStart} onDragEnd={onDragEnd}
                dropOnColumn={dropOnColumn} dropOnCard={dropOnCard}
                onOpenCard={setEditCard}
                creating={newCardCol === col.id} setCreating={(v) => setNewCardCol(v ? col.id : null)} />
            ))}
            {columns.length === 0 && <p className="text-gray-400 text-sm py-10">Sin columnas — crea la primera</p>}
          </div>
        </div>
      )}

      {editCard && <CardModal card={editCard} columns={columns} onClose={() => setEditCard(null)} />}
      {showNewCol && <NewColumnModal onClose={() => setShowNewCol(false)} />}
    </div>
  )
}

// ============ Columna ============
function ColumnView({ col, dragging, overColumn, setOverColumn, onDragStart, onDragEnd, dropOnColumn, dropOnCard, onOpenCard, creating, setCreating }) {
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)

  const patchCol = useMutation({
    mutationFn: (data) => api.patch(`/board/columns/${col.id}`, data),
    onSuccess: () => qc.invalidateQueries(['board']),
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })
  const delCol = useMutation({
    mutationFn: () => api.delete(`/board/columns/${col.id}`),
    onSuccess: () => qc.invalidateQueries(['board']),
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const rename = () => {
    const name = prompt('Nombre de la columna:', col.name)
    if (name?.trim()) patchCol.mutate({ name: name.trim() })
    setMenuOpen(false)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOverColumn(col.id) }}
      onDragLeave={() => setOverColumn(o => o === col.id ? null : o)}
      onDrop={(e) => dropOnColumn(e, col)}
      className={`w-72 flex-shrink-0 bg-gray-100 rounded-xl flex flex-col max-h-[calc(100dvh-230px)] transition-shadow ${overColumn === col.id && dragging ? 'ring-2 ring-brand-400 shadow-lg' : ''}`}>

      {/* Encabezado */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
        <button onClick={rename} className="text-sm font-semibold text-gray-800 truncate hover:text-brand-600 text-left flex-1" title="Clic para renombrar">
          {col.name}
        </button>
        <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-1.5 py-0.5">{col.cards.length}</span>
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)} className="text-gray-400 hover:text-gray-600 p-0.5"><MoreVertical size={15} /></button>
          {menuOpen && (
            <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-44 py-1">
              <button onClick={rename} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <Pencil size={13} /> Renombrar
              </button>
              <div className="px-3 py-1.5">
                <p className="text-[10px] text-gray-400 mb-1">Color</p>
                <div className="flex gap-1 flex-wrap">
                  {COLUMN_COLORS.map(c => (
                    <button key={c} onClick={() => { patchCol.mutate({ color: c }); setMenuOpen(false) }}
                      className={`w-5 h-5 rounded-full border-2 ${col.color === c ? 'border-gray-700' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
              <button onClick={() => { setMenuOpen(false); if (confirm(`¿Eliminar la columna "${col.name}"${col.cards.length ? ` y sus ${col.cards.length} tarjetas` : ''}?`)) delCol.mutate() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100">
                <Trash2 size={13} /> Eliminar columna
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tarjetas */}
      <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-2">
        {col.cards.map((card, idx) => (
          <CardView key={card.id} card={card} isDragging={dragging === card.id}
            onDragStart={(e) => onDragStart(e, card.id)} onDragEnd={onDragEnd}
            onDrop={(e) => dropOnCard(e, col, idx)}
            onClick={() => onOpenCard(card)} />
        ))}
        {col.cards.length === 0 && !creating && (
          <p className="text-center text-xs text-gray-400 py-6 border-2 border-dashed border-gray-200 rounded-lg mx-1">
            Suelta tarjetas aquí
          </p>
        )}
      </div>

      {/* Agregar tarjeta rápida */}
      <div className="p-2 flex-shrink-0">
        {creating ? (
          <QuickAddCard columnId={col.id} onDone={() => setCreating(false)} />
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg px-2 py-1.5">
            <Plus size={15} /> Agregar tarjeta
          </button>
        )}
      </div>
    </div>
  )
}

// ============ Tarjeta ============
function CardView({ card, isDragging, onDragStart, onDragEnd, onDrop, onClick }) {
  const pr = card.priority ? PRIORITIES[card.priority] : null
  const overdue = card.dueDate && new Date(card.dueDate) < new Date() && new Date(card.dueDate).toDateString() !== new Date().toDateString()

  return (
    <div draggable
      onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDrop={onDrop}
      onClick={onClick}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none ${isDragging ? 'opacity-40 rotate-1' : ''}`}>

      {pr && <div className={`h-1.5 w-10 rounded-full mb-2 ${pr.bar}`} title={`Prioridad ${pr.label}`} />}

      <p className="text-sm text-gray-900 leading-snug">{card.title}</p>

      {/* Chips de vínculos */}
      {(card.project || card.quote || card.purchaseOrder) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {card.project && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: (card.project.color || '#64748B') + '22', color: card.project.color || '#64748B' }}>
              <FolderKanban size={10} /> {card.project.name}
            </span>
          )}
          {card.quote && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
              <FileText size={10} /> {card.quote.folio}
            </span>
          )}
          {card.purchaseOrder && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">
              <ShoppingCart size={10} /> {card.purchaseOrder.folio}
            </span>
          )}
        </div>
      )}

      {/* Pie: fecha + asignado */}
      {(card.dueDate || card.assignee || card.description) && (
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {card.dueDate && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${overdue ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                {overdue ? <AlertCircle size={10} /> : <Calendar size={10} />}
                {new Date(card.dueDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {card.description && <GripVertical size={12} className="text-gray-300 rotate-90" title="Tiene descripción" />}
          </div>
          {card.assignee && (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
              style={{ background: avatarColor(card.assignee.name) }} title={card.assignee.name}>
              {initials(card.assignee.name)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============ Agregar tarjeta rápida (inline) ============
function QuickAddCard({ columnId, onDone }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () => api.post('/board/cards', { title, columnId }),
    onSuccess: () => { setTitle(''); qc.invalidateQueries(['board']) },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2 shadow-sm">
      <textarea autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); title.trim() && create.mutate() } if (e.key === 'Escape') onDone() }}
        placeholder="Título del pendiente..."
        rows={2}
        className="w-full text-sm resize-none focus:outline-none" />
      <div className="flex items-center gap-2 mt-1">
        <button onClick={() => title.trim() && create.mutate()} disabled={!title.trim() || create.isPending}
          className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">
          Agregar
        </button>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        <span className="text-[10px] text-gray-300 ml-auto">Enter para guardar</span>
      </div>
    </div>
  )
}

// ============ Modal de detalle / edición de tarjeta ============
function CardModal({ card, columns, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: card.title,
    description: card.description || '',
    columnId: card.columnId,
    assigneeId: card.assignee?.id || '',
    priority: card.priority || '',
    dueDate: card.dueDate ? card.dueDate.split('T')[0] : '',
    projectId: card.project?.id || '',
    quoteId: card.quote?.id || '',
    purchaseOrderId: card.purchaseOrder?.id || ''
  })

  const { data: users = [] } = useQuery({ queryKey: ['board-users'], queryFn: () => api.get('/board/users').then(r => r.data) })
  const { data: links } = useQuery({ queryKey: ['board-links'], queryFn: () => api.get('/board/links').then(r => r.data) })

  const save = useMutation({
    mutationFn: () => api.patch(`/board/cards/${card.id}`, {
      ...form,
      assigneeId: form.assigneeId || null,
      priority: form.priority || null,
      dueDate: form.dueDate || null,
      projectId: form.projectId || null,
      quoteId: form.quoteId || null,
      purchaseOrderId: form.purchaseOrderId || null
    }),
    onSuccess: () => { qc.invalidateQueries(['board']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error al guardar')
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/board/cards/${card.id}`),
    onSuccess: () => { qc.invalidateQueries(['board']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Detalle del pendiente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Título *</label>
            <input value={form.title} onChange={set('title')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Descripción</label>
            <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls + ' resize-none'} placeholder="Notas, contexto, siguiente paso..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Columna</label>
              <select value={form.columnId} onChange={set('columnId')} className={inputCls}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Asignado a</label>
              <select value={form.assigneeId} onChange={set('assigneeId')} className={inputCls}>
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prioridad</label>
              <select value={form.priority} onChange={set('priority')} className={inputCls}>
                <option value="">Sin prioridad</option>
                <option value="HIGH">🔴 Alta</option>
                <option value="MEDIUM">🟡 Media</option>
                <option value="LOW">⚪ Baja</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha límite</label>
              <input type="date" value={form.dueDate} onChange={set('dueDate')} className={inputCls} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Vincular con</p>
            <div className="space-y-2">
              <select value={form.projectId} onChange={set('projectId')} className={inputCls}>
                <option value="">Sin proyecto</option>
                {links?.projects.map(p => <option key={p.id} value={p.id}>📁 {p.name}</option>)}
              </select>
              <select value={form.quoteId} onChange={set('quoteId')} className={inputCls}>
                <option value="">Sin cotización</option>
                {links?.quotes.map(q => <option key={q.id} value={q.id}>🧾 {q.folio} — {q.clientName}</option>)}
              </select>
              <select value={form.purchaseOrderId} onChange={set('purchaseOrderId')} className={inputCls}>
                <option value="">Sin orden de compra</option>
                {links?.purchaseOrders.map(o => <option key={o.id} value={o.id}>🛒 {o.folio} — {o.supplier}</option>)}
              </select>
            </div>
          </div>

          <p className="text-[10px] text-gray-400">Creada por {card.createdBy?.name} · {new Date(card.createdAt).toLocaleDateString('es-MX')}</p>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
          <button onClick={() => { if (confirm('¿Eliminar este pendiente?')) remove.mutate() }}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg">
            <Trash2 size={14} /> Eliminar
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg">Cancelar</button>
            <button onClick={() => save.mutate()} disabled={!form.title.trim() || save.isPending}
              className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-40">
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Modal: nueva columna ============
function NewColumnModal({ onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLUMN_COLORS[0])

  const create = useMutation({
    mutationFn: () => api.post('/board/columns', { name, color }),
    onSuccess: () => { qc.invalidateQueries(['board']); onClose() },
    onError: (e) => alert(e.response?.data?.error || 'Error')
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Nueva columna</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && create.mutate()}
          placeholder="Ej: En revisión, Bloqueado, Urgente..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 mb-3" />
        <p className="text-xs text-gray-500 mb-2">Color</p>
        <div className="flex gap-2 mb-4">
          {COLUMN_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-gray-700 scale-110' : 'border-transparent'} transition-transform`}
              style={{ background: c }} />
          ))}
        </div>
        <button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-40">
          {create.isPending ? 'Creando...' : 'Crear columna'}
        </button>
      </div>
    </div>
  )
}
