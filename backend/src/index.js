import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import taskRoutes from './routes/tasks.js'
import fileRoutes from './routes/files.js'
import dashboardRoutes from './routes/dashboard.js'
import inventoryRoutes from './routes/inventory.js'
import calendarRoutes from './routes/calendar.js'
import adminRoutes from './routes/admin.js'
import notificationRoutes from './routes/notifications.js'
import exportRoutes from './routes/export.js'
import quotesRoutes from './routes/quotes.js'
import purchaseOrderRoutes from './routes/purchase-orders.js'
import deliveryRoutes from './routes/deliveries.js'
import searchRoutes from './routes/search.js'
import chatRoutes from './routes/chat.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Railway corre detrás de un proxy: necesario para que el rate limit identifique IPs reales
app.set('trust proxy', 1)

// Headers de seguridad (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' } // permite servir /uploads al frontend
}))

// CORS restringido: solo los dominios propios (nunca '*')
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://app.icapsa.net',
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Permitir peticiones sin origin (curl, apps móviles, health checks)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('Origen no permitido por CORS'))
  }
}))

// Límite de tamaño del body (las fotos van por multipart, no JSON)
app.use(express.json({ limit: '2mb' }))

// Rate limit global: 1000 peticiones por IP cada 15 min (con margen para el chat en tiempo real)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' }
}))

// Rate limit estricto para login/registro: 15 intentos por IP cada 15 min (anti fuerza bruta)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos.' }
})

app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'))

app.use('/api/auth',      authLimiter, authRoutes)
app.use('/api/projects',  projectRoutes)
app.use('/api/tasks',     taskRoutes)
app.use('/api/files',     fileRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/calendar',  calendarRoutes)
app.use('/api/admin',     adminRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/export',    exportRoutes)
app.use('/api/quotes',    quotesRoutes)
app.use('/api/purchase-orders', purchaseOrderRoutes)
app.use('/api/deliveries', deliveryRoutes)
app.use('/api/search',    searchRoutes)
app.use('/api/chat',      chatRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

// 404 para rutas inexistentes
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

// Manejador global de errores: nunca filtrar detalles internos
app.use((err, req, res, _next) => {
  console.error('Error no controlado:', err.message)
  if (err.message === 'Origen no permitido por CORS')
    return res.status(403).json({ error: 'Origen no permitido' })
  res.status(500).json({ error: 'Error interno del servidor' })
})

app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`))
