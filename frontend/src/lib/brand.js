// Sistema multi-marca: cada rama ve su identidad según el dominio de su correo.
// Los colores se aplican como variables CSS que alimentan las clases brand-* de Tailwind.

export const BRANDS = {
  icapsa: {
    key: 'icapsa',
    domain: 'icapsa.net',
    name: 'ICAPSA',
    fullName: 'Ingeniería de Calidad Aplicada S.A. de C.V.',
    logo: '/brands/icapsa.png',
    hex500: '#22A2DE',
    rgb: { 50: '240 248 253', 100: '220 240 250', 200: '180 223 244', 400: '69 177 227', 500: '34 162 222', 600: '29 138 189', 700: '24 113 155', 900: '14 68 93' }
  },
  greedy: {
    key: 'greedy',
    domain: 'greedy.mx',
    name: 'GREEDY',
    fullName: 'Greedy IoT Solutions',
    logo: '/brands/greedy.png',
    hex500: '#11507F',
    rgb: { 50: '238 243 246', 100: '217 227 235', 200: '174 196 211', 400: '55 108 147', 500: '17 80 127', 600: '14 68 108', 700: '12 56 89', 900: '7 34 53' }
  },
  delevsis: {
    key: 'delevsis',
    domain: 'delevsis.com',
    name: 'DELEVSIS',
    fullName: 'Delevsis',
    logo: '/brands/delevsis.png',
    hex500: '#D42528',
    rgb: { 50: '252 240 240', 100: '248 220 221', 200: '240 181 182', 400: '219 72 74', 500: '212 37 40', 600: '180 31 34', 700: '148 26 28', 900: '89 16 17' }
  }
}

export const DEFAULT_BRAND = BRANDS.icapsa

// Marca según el dominio del correo (@icapsa.net, @greedy.mx, @delevsis.com)
export function brandForEmail(email) {
  const domain = (email || '').split('@')[1]?.trim().toLowerCase() || ''
  return Object.values(BRANDS).find(b => b.domain === domain) || DEFAULT_BRAND
}

// Aplica la marca al documento: colores, título de la pestaña y favicon
export function applyBrand(brand) {
  const root = document.documentElement
  Object.entries(brand.rgb).forEach(([tone, rgb]) => {
    root.style.setProperty(`--brand-${tone}`, rgb)
  })
  document.title = `${brand.name} — Sistema de Gestión`
  let icon = document.querySelector("link[rel~='icon']")
  if (!icon) {
    icon = document.createElement('link')
    icon.rel = 'icon'
    document.head.appendChild(icon)
  }
  icon.type = 'image/png'
  icon.href = brand.logo
}
