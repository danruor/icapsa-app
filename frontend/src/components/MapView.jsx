import { useEffect, useRef, useState } from 'react'

// Carga Leaflet desde CDN una sola vez
let leafletPromise = null
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.setAttribute('data-leaflet', 'true')
      document.head.appendChild(link)
    }
    // JS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve(window.L)
    script.onerror = reject
    document.head.appendChild(script)
  })
  return leafletPromise
}

// Mapa de solo lectura que muestra un pin en una ubicación
export function LocationMap({ latitude, longitude, label, height = 280 }) {
  const ref = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!latitude || !longitude) return
    let cancelled = false

    loadLeaflet().then(L => {
      if (cancelled || !ref.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { scrollWheelZoom: false }).setView([latitude, longitude], 15)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19
        }).addTo(mapRef.current)
        L.marker([latitude, longitude]).addTo(mapRef.current)
        if (label) L.marker([latitude, longitude]).bindPopup(label)
      } else {
        mapRef.current.setView([latitude, longitude], 15)
      }
      // Fix render en contenedores que cambian de tamaño
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 100)
    })

    return () => { cancelled = true }
  }, [latitude, longitude, label])

  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  if (!latitude || !longitude) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg text-sm text-gray-400" style={{ height }}>
        Sin ubicación definida
      </div>
    )
  }

  return <div ref={ref} className="rounded-lg overflow-hidden border border-gray-200" style={{ height, width: '100%' }} />
}

// Selector de ubicación: buscar dirección (geocoding) + click en mapa
export function LocationPicker({ value, onChange, height = 260 }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [ready, setReady] = useState(false)

  const lat = value?.latitude
  const lng = value?.longitude

  useEffect(() => {
    let cancelled = false
    loadLeaflet().then(L => {
      if (cancelled || !ref.current || mapRef.current) return

      const startLat = lat || 20.9674  // Mérida por defecto
      const startLng = lng || -89.5926
      mapRef.current = L.map(ref.current).setView([startLat, startLng], lat ? 15 : 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19
      }).addTo(mapRef.current)

      if (lat && lng) {
        markerRef.current = L.marker([lat, lng]).addTo(mapRef.current)
      }

      // Click para colocar pin
      mapRef.current.on('click', (e) => {
        const { lat: clat, lng: clng } = e.latlng
        if (markerRef.current) markerRef.current.setLatLng([clat, clng])
        else markerRef.current = L.marker([clat, clng]).addTo(mapRef.current)
        onChange({ latitude: clat, longitude: clng, address: value?.address || '' })
      })

      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 100)
      setReady(true)
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Geocodificar dirección con Nominatim (gratis)
  const geocode = async () => {
    if (!search.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(search)}`)
      const data = await res.json()
      if (data.length > 0) {
        const { lat: glat, lon: glng, display_name } = data[0]
        const nlat = parseFloat(glat), nlng = parseFloat(glng)
        const L = window.L
        if (mapRef.current) {
          mapRef.current.setView([nlat, nlng], 16)
          if (markerRef.current) markerRef.current.setLatLng([nlat, nlng])
          else markerRef.current = L.marker([nlat, nlng]).addTo(mapRef.current)
        }
        onChange({ latitude: nlat, longitude: nlng, address: search })
      } else {
        alert('No se encontró la dirección. Intenta ser más específico o coloca el pin manualmente.')
      }
    } catch {
      alert('Error al buscar la dirección')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); geocode() } }}
          placeholder="Buscar dirección (calle, ciudad)..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        />
        <button type="button" onClick={geocode} disabled={searching}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 rounded-lg disabled:opacity-50">
          {searching ? '...' : 'Buscar'}
        </button>
      </div>
      <div ref={ref} className="rounded-lg overflow-hidden border border-gray-200" style={{ height, width: '100%' }} />
      <p className="text-xs text-gray-400">
        {lat && lng
          ? `📍 Ubicación: ${lat.toFixed(5)}, ${lng.toFixed(5)} — toca el mapa para ajustar`
          : 'Busca una dirección o toca el mapa para colocar el pin'}
      </p>
    </div>
  )
}
