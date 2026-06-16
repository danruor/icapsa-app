import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import taskRoutes from './routes/tasks.js'
import fileRoutes from './routes/files.js'
import dashboardRoutes from './routes/dashboard.js'
import inventoryRoutes from './routes/inventory.js'
import calendarRoutes from './routes/calendar.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json())
app.use('/uploads', express.static('uploads'))

app.use('/api/auth',      authRoutes)
app.use('/api/projects',  projectRoutes)
app.use('/api/tasks',     taskRoutes)
app.use('/api/files',     fileRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/calendar',  calendarRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`))
