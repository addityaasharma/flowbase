<p><img src="apps/web/public/flowbase-mark.svg" alt="Flowbase" width="72"></p>

# Flowbase

An open-source work tracker (boards, tickets, teams) in the spirit of Jira/Linear. Anyone can sign up and create a
project; the creator becomes that project's **admin** and invites teammates by email. Projects are private to their members.

- `apps/web` – Next.js 15 · Tailwind 4 · dnd-kit · TanStack Query
- `apps/api` – Express · TypeScript · Prisma · PostgreSQL (JWT auth, invitations via Resend)
- `packages/shared` – shared enums and zod schemas
- Turborepo + pnpm workspaces

## Roles (per project)
| Role | Can |
|---|---|
| ADMIN | everything: invite/remove people, change roles, delete the project |
| MANAGER | invite people |
| MEMBER | create/edit/move tickets, comment |

Only a ticket's creator can delete it.

## Run locally
```bash
pnpm install
pnpm db:up                                   # Postgres via docker compose (or point DATABASE_URL at your own)
cp apps/api/.env.example apps/api/.env       # then edit
pnpm db:migrate
pnpm dev                                     # web :3000, api :4000
```
Sign up in the UI, create a project, then invite people from **Team & Roles**.
Without `RESEND_API_KEY` no email is sent; the invite screen shows a copy-able link instead.

## Deploy
Pushes to `main` are built and deployed automatically (see `.github/workflows/deploy.yml` and `deploy/DEPLOY.md`).
