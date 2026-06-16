# ICAPSA — Sistema de Gestión

Stack: React + Vite + Tailwind (frontend) · Node.js + Express + Prisma + PostgreSQL (backend)

## Estructura

```
icapsa-app/
├── frontend/   React + Vite + Tailwind
└── backend/    Node.js + Express + Prisma
```

## Desarrollo local

### Backend
```bash
cd backend
npm install
cp .env.example .env        # edita DATABASE_URL y JWT_SECRET
npx prisma migrate dev      # crea las tablas
npm run dev                 # corre en http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                 # corre en http://localhost:5173
```

## Deploy en Railway

### Backend
1. Nuevo proyecto en Railway → "Deploy from GitHub repo" → selecciona `icapsa-app`
2. Agrega servicio PostgreSQL (botón "+ New" → Database → PostgreSQL)
3. En el servicio backend, variables de entorno:
   - `DATABASE_URL` → copia el valor de tu PostgreSQL en Railway (lo da automático)
   - `JWT_SECRET` → genera uno seguro (ej: `openssl rand -hex 32`)
   - `FRONTEND_URL` → URL de tu frontend en Railway
   - `PORT` → Railway lo asigna automáticamente
4. En Settings → Root Directory → escribe `backend`
5. Start command: `npm run db:migrate && npm start`

### Frontend
1. "+ New" → Service → GitHub → mismo repo
2. Settings → Root Directory → `frontend`
3. Variables:
   - `VITE_API_URL` → URL del backend en Railway + `/api`
4. Build command: `npm run build`
5. Start command: `npx serve dist`

## Módulos incluidos

- ✅ Autenticación con JWT (login, registro, roles)
- ✅ Proyectos (crear, listar, detalle)
- ✅ Tareas con tablero Kanban (por hacer / en progreso / revisión / completado)
- ✅ Dashboard con estadísticas
- ✅ Subida de archivos (PDF, imágenes, documentos)
- ✅ Comentarios en tareas
