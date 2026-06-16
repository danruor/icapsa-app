import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const distPath = join(__dirname, 'dist')
app.use(express.static(distPath))

// SPA fallback: every route returns index.html so React Router works
app.get('*', (_, res) => res.sendFile(join(distPath, 'index.html')))

app.listen(PORT, () => console.log(`Frontend corriendo en puerto ${PORT}`))
