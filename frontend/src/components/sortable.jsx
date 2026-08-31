import { useState, useMemo } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

// Hook de ordenamiento para tablas: recibe los renglones y un mapa de
// extractores de valor por columna. Clic en la misma columna invierte el orden.
export function useSort(items, getters, initialKey, initialDir = 'desc') {
  const [sortKey, setSortKey] = useState(initialKey)
  const [sortDir, setSortDir] = useState(initialDir)

  const sorted = useMemo(() => {
    const get = getters[sortKey]
    if (!get) return items
    return [...items].sort((a, b) => {
      const va = get(a), vb = get(b)
      const cmp = typeof va === 'string'
        ? va.localeCompare(vb, 'es', { sensitivity: 'base' })
        : (va || 0) - (vb || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key, defaultDir = 'desc') => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(defaultDir) }
  }

  return { sorted, sortKey, sortDir, toggle }
}

// Encabezado de columna ordenable con indicador de dirección
export function SortTh({ label, k, sortKey, sortDir, onToggle, align = 'left', defaultDir = 'desc', className = '' }) {
  const active = sortKey === k
  return (
    <th className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      <button onClick={() => onToggle(k, defaultDir)} title="Ordenar"
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-700 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-brand-600' : ''}`}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
          : <ArrowUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  )
}
