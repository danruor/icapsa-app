import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import api from '../lib/api'

const typeIcon = {
  task_assigned: '📋',
  task_due: '⏰',
  comment: '💬',
  project_added: '📁'
}

export default function NotificationBell({ dark = false }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30000 // revisar cada 30s
  })

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries(['notifications'])
  })

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries(['notifications'])
  })

  const notifications = data?.notifications || []
  const unread = data?.unreadCount || 0

  const handleClick = (n) => {
    if (!n.read) markRead.mutate(n.id)
    if (n.link) { navigate(n.link); setOpen(false) }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className={`relative transition-colors ${dark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-700"}`}>
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 font-medium">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 lg:left-auto lg:right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-900">Notificaciones</span>
              {unread > 0 && (
                <button onClick={() => markAll.mutate()} className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1">
                  <Check size={12} /> Marcar todas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  <Bell size={28} className="mx-auto mb-2 opacity-30" />
                  Sin notificaciones
                </div>
              )}
              {notifications.map(n => (
                <button key={n.id} onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.read ? 'bg-brand-50/40' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base">{typeIcon[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
