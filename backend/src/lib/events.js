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
