# fourbase — Gestão de Tarefas

App de gestão de tarefas (Kanban, notas, checklist e mídia) com:

- **Frontend:** Vite + React (`src/`)
- **Backend:** Express (`api/index.js`) — roda local via `server.js` e como Serverless Function na Vercel
- **Banco:** Supabase (Postgres) — tabelas `fourbase_tasks`, `fourbase_notes`, `fourbase_todos`, `fourbase_media`

## Rodando localmente

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173 (proxy de `/api` para o Express)
- API: http://localhost:3001/api/health

As credenciais do Supabase ficam em `.env` (já configurado; veja `.env.example`).

## Deploy na Vercel

> **Atenção: não rode `supabase db push` antes do deploy.** A migration `20261002000000_lock_down_table_rls.sql` fecha o acesso anon às tabelas: se ela rodar antes de o código novo estar no ar com `SUPABASE_SERVICE_ROLE_KEY` configurada, a API inteira (inclusive o login) para de funcionar. Siga o passo a passo em [docs/deploy-runbook.md](docs/deploy-runbook.md).

```bash
npm i -g vercel
vercel
```

Ou conecte o repositório no painel da Vercel. O `vercel.json` já:

- Faz build do frontend com Vite (`dist/`)
- Publica `api/index.js` como Serverless Function
- Reescreve `/api/*` para a função Express

**Variáveis de ambiente na Vercel** (Settings → Environment Variables):

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (secreta, só no servidor) |
| `APP_URL` | origem pública do app (links de convite e de e-mail) |
| `RESEND_API_KEY`, `EMAIL_FROM` | opcionais, para os e-mails de aviso |

No `.env` local **não** defina `SUPABASE_URL`: sem ela o servidor usa o banco mockado em `data/db.json` e não toca em produção.

## Login e perfis

A plataforma tem autenticação por e-mail/senha (JWT) com dois papéis:

- **Funcionário** — cria a própria conta na tela de login ("Criar conta"). Vê apenas as próprias tarefas, notas, checklist e mídias.
- **Gestor** — conta única já criada: `gestor@fourbase.com` / senha `gestor123`. Além do workspace próprio, tem a seção **Equipe** com o progresso de cada membro e todas as tarefas da empresa (com filtro por funcionário).

> Troque a senha do gestor em produção (atualize o hash na tabela `fourbase_users`) e defina `JWT_SECRET` nas variáveis de ambiente da Vercel.

## API

Todas as rotas de dados exigem header `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Status da API |
| POST | `/api/auth/register` | Criar conta de funcionário |
| POST | `/api/auth/login` | Entrar (retorna token JWT) |
| GET | `/api/auth/me` | Dados do usuário logado |
| GET | `/api/team/overview` | (gestor) Estatísticas por membro |
| GET | `/api/team/tasks` | (gestor) Todas as tarefas com dono |
| GET/POST | `/api/tasks` | Listar / criar tarefas |
| PATCH/DELETE | `/api/tasks/:id` | Mover, editar / excluir tarefa |
| GET/POST | `/api/notes` | Listar / criar notas |
| PUT/DELETE | `/api/notes/:id` | Editar / excluir nota |
| GET/POST | `/api/todos` | Listar / criar itens do checklist |
| PATCH/DELETE | `/api/todos/:id` | Marcar / remover item |
| GET | `/api/media` | Ler mídias (image/video) |
| PUT | `/api/media/:kind` | Salvar URL da mídia |
| DELETE | `/api/media` | Limpar mídias |

## Observações

- Os arquivos de mídia sobem **direto do navegador para o Supabase Storage** (bucket público `fourbase-media`), sem passar pela API — por isso não há limite de payload da Vercel. Limites atuais: **10MB por imagem, 50MB por vídeo** (bucket configurado com teto de 50MB por arquivo). O banco guarda apenas a URL pública.
- As tabelas têm RLS habilitado com política liberada para a chave anon (app single-tenant/demo). Para multiusuário, adicione Supabase Auth e políticas por usuário.
