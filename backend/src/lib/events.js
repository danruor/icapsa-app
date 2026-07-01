import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Crear una notificación para un usuario
export async function notify({ userId, type, title, message, link }) {
  if (!userId) return
  try {
    await prisma.notification.create({
      data: { userId, type, title, message, link }
    })
  } catch (err) {
    console.error('Error creando notificación:', err.message)
  }
}

// Registrar actividad en un proyecto
export async function logActivity({ userId, projectId, action, detail }) {
  try {
    await prisma.activity.create({
      data: { userId, projectId, action, detail }
    })
  } catch (err) {
    console.error('Error registrando actividad:', err.message)
  }
}

// Alerta de stock mínimo: notifica a todos los administradores (evita duplicados no leídos)
export async function notifyLowStock(item) {
  try {
    if (!item || item.minStock <= 0 || item.quantity > item.minStock) return
    const admins = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
      select: { id: true }
    })
    for (const a of admins) {
      const existing = await prisma.notification.findFirst({
        where: { userId: a.id, type: 'stock_low', read: false, message: { contains: `"${item.name}"` } }
      })
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: a.id, type: 'stock_low',
            title: 'Stock bajo',
            message: `El artículo "${item.name}" quedó en ${item.quantity} ${item.unit} (mínimo: ${item.minStock})`,
            link: '/inventory'
          }
        })
      }
    }
  } catch (err) {
    console.error('Error alerta stock:', err.message)
  }
}
