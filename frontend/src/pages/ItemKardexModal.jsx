import { useQuery } from '@tanstack/react-query'
import { X, ArrowUp, ArrowDown, Settings2, History } from 'lucide-react'
import api from '../lib/api'

const typeConfig = {
  IN:     { label: 'Entrada', color: 'text-green-600', bg: 'bg-green-50', icon: ArrowUp, sign: '+' },
  OUT:    { label: 'Salida',  color: 'text-orange-600', bg: 'bg-orange-50', icon: ArrowDown, sign: '−' },
  ADJUST: { label: 'Ajuste',  color: 'text-blue-600', bg: 'bg-blue-50', icon: Settings2, sign: '=' }
}

export default function ItemKardexModal({ item, onClose }) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['inventory-movements', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/movements`).then(r => r.data)
  })

  // Documento origen de un movimiento
  const sourceDoc = (m) => {
    if (m.purchaseOrder) return { label: m.purchaseOrder.folio, sub: m.purchaseOrder.supplier, color: 'text-green-600' }
    if (m.delivery) {
      const quote = m.delivery.quote ? ` · ${m.delivery.quote.folio}` : ''
      return { label: m.delivery.folio + quote, sub: m.delivery.recipient, color: 'text-orange-600' }
    }
    return { label: m.note || '—', sub: '', color: 'text-gray-400' }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <History size={18} className="text-brand-500" />
              <h2 className="text-lg font-semibold text-gray-900">Kardex — {item.name}</h2>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>Existencia actual: <span className="font-semibold text-gray-900">{item.quantity} {item.unit}</span></span>
              {item.location && <span>Ubicación: {item.location}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Tabla de movimientos */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <p className="text-center text-gray-400 py-8">Cargando historial...</p>
          ) : movements.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <History size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin movimientos registrados todavía</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium text-right">Cantidad</th>
                    <th className="px-3 py-2 font-medium text-right">Saldo</th>
                    <th className="px-3 py-2 font-medium">Documento origen</th>
                    <th className="px-3 py-2 font-medium">Por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movements.map(m => {
                    const cfg = typeConfig[m.type]
                    const Icon = cfg.icon
                    const doc = sourceDoc(m)
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                            <Icon size={11} /> {cfg.label}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-medium ${cfg.color}`}>
                          {cfg.sign}{m.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{m.balanceAfter} {item.unit}</td>
                        <td className="px-3 py-2.5">
                          <div className={`font-medium ${doc.color}`}>{doc.label}</div>
                          {doc.sub && <div className="text-xs text-gray-400">{doc.sub}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{m.user?.name || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Cada entrada se liga a su Orden de Compra; cada salida a su Entrega (y cotización si aplica).
          </p>
          <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm py-1.5 px-4 rounded-lg">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
