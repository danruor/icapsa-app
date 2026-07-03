// Envío de notificaciones push (Expo Push API) — sin dependencias extra.
// Los tokens se registran desde la app iOS; los inválidos se limpian solos.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const CHUNK = 100 // límite de la API de Expo por petición

// Envía un push a uno o varios usuarios: sendPushToUsers(['id1','id2'], { title, body, data })
// data.link usa las mismas rutas que las notificaciones in-app ('/projects/:id', '/chat', '/board', '/inventory')
export async function sendPushToUsers(userIds, { title, body, data = {} }) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))]
    if (!ids.length) return

    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: ids }, user: { isActive: true } },
      select: { token: true }
    })
    if (!tokens.length) return

    const messages = tokens.map(t => ({
      to: t.token,
      sound: 'default',
      title: (title || 'ICAPSA').slice(0, 120),
      body: (body || '').slice(0, 160),
      data
    }))

    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK)
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      })
      const json = await res.json().catch(() => null)

      // Limpiar tokens muertos (dispositivo borró la app o token rotado)
      const tickets = json?.data || []
      for (let j = 0; j < tickets.length; j++) {
        const t = tickets[j]
        if (t?.details?.error === 'DeviceNotRegistered') {
          await prisma.pushToken.deleteMany({ where: { token: chunk[j].to } }).catch(() => {})
        }
      }
    }
  } catch (err) {
    // El push nunca debe tumbar la operación principal
    console.error('Error enviando push:', err.message)
  }
}
