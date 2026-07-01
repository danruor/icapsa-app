import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Headers de seguridad (sin dependencias externas)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')          // evita sniffing de MIME
  res.setHeader('X-Frame-Options', 'DENY')                    // evita clickjacking (iframes)
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains') // fuerza HTTPS
  next()
})

const distPath = join(__dirname, 'dist')
app.use(express.static(distPath))

// SPA fallback: every route returns index.html so React Router works
app.get('*', (_, res) => res.sendFile(join(distPath, 'index.html')))

app.listen(PORT, () => console.log(`Frontend corriendo en puerto ${PORT}`))
