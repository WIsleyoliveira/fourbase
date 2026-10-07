import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authLimiter } from './_lib/auth.js'
import authRoutes from './_lib/routes/auth.js'
import profileRoutes from './_lib/routes/profile.js'
import tasksRoutes from './_lib/routes/tasks.js'
import membersRoutes from './_lib/routes/members.js'
import notesRoutes from './_lib/routes/notes.js'
import todosRoutes from './_lib/routes/todos.js'
import mediaRoutes from './_lib/routes/media.js'
import foldersRoutes from './_lib/routes/folders.js'
import columnsRoutes from './_lib/routes/columns.js'
import tagsRoutes from './_lib/routes/tags.js'
import teamRoutes from './_lib/routes/team.js'
import clientsRoutes from './_lib/routes/clients.js'
import reportsRoutes from './_lib/routes/reports.js'
import notificationsRoutes from './_lib/routes/notifications.js'

// Ponto de entrada da API. A Vercel publica o default export deste arquivo como
// Serverless Function (vercel.json reescreve /api/* para cá); localmente quem
// sobe é o server.js. As rotas ficam em api/_lib/routes/ — o prefixo "_" impede
// a Vercel de tratar cada arquivo como uma função separada.

const app = express()
// Na Vercel a API fica atrás de um proxy: sem isto o rate limit veria o IP do
// proxy e bloquearia todo mundo junto.
app.set('trust proxy', 1)
// A API só responde JSON (o frontend é servido pela Vercel como estático), então
// a CSP padrão do helmet aqui não afeta imagens/uploads do app.
app.use(helmet())
// O frontend chama a API na mesma origem (Vercel em produção, proxy do Vite em
// dev), o que dispensa CORS. Só libera outra origem se APP_URL for definido.
app.use(cors({ origin: process.env.APP_URL || false }))
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'weflow-api' }))

// Cadastro público desativado: contas só nascem de um convite emitido pelo
// gestor do workspace (POST /api/members/invite → POST /api/auth/invitations/:token/accept).
app.post('/api/auth/register', (req, res) =>
  res.status(403).json({
    error: 'O cadastro é feito por convite do gestor. Solicite um convite para acessar o weFlow.',
  }),
)

app.use(['/api/auth/login', '/api/auth/invitations', '/api/profile/password'], authLimiter)

app.use(authRoutes)
app.use(profileRoutes)
app.use(tasksRoutes)
app.use(membersRoutes)
app.use(notesRoutes)
app.use(todosRoutes)
app.use(mediaRoutes)
app.use(foldersRoutes)
app.use(columnsRoutes)
app.use(tagsRoutes)
app.use(teamRoutes)
app.use(clientsRoutes)
app.use(reportsRoutes)
app.use(notificationsRoutes)

export default app

