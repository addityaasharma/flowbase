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

## Developer access (Claude Code over MCP)

Set a default GitHub repo in **Team & Roles → Project settings** (admins); anyone working on a task (its assignees and creator) can also attach their own repos to that task (a fork, another repo) from the ticket's **Developer** box, and Claude is told the task's repos first, then the project default. Then create a token in **Profile → Developer access**.
Connect Claude Code (works with a Claude Pro plan):

```bash
claude mcp add --transport http flowbase https://<your-host>/api/mcp --header "Authorization: Bearer fb_..."
```

Claude acts as you, but narrower than a login: it can list/read **your assigned tasks** (and, if the token allows, read and comment on
other tasks in your projects), comment, and move *your* tasks between columns. It can never edit, assign or delete tickets, or touch
members, projects or settings. Everything it does is labelled "via <token name>". Tokens are revocable, expire (30/90/365 days or never),
are stored only as a hash, work only on `/api/agent/*` and `/api/mcp`, and are rate-limited (120 requests/minute).
Tools: `list_projects`, `list_my_tasks`, `get_task`, `comment_on_task`, `set_task_status`. The same actions are available over REST under `/api/agent`.

Claude clones the repo and does the work on *your* machine with *your* git access; Flowbase never stores GitHub credentials.

## Operations

`deploy/backup.sh` (nightly database + uploads, 14 days), `deploy/restore-test.sh`, and `deploy/healthcheck.sh` (cron every 5 minutes, emails
`ALERT_EMAIL` about downtime, disk, or missing backups). See `deploy/DEPLOY.md`.

## Quality

`pnpm test` runs the web unit tests (Markdown renderer security, per-person colours) and the API integration tests (needs `DATABASE_URL`):
accounts and email verification, privacy between projects, who may edit/move/delete, replies, subtasks, attached repos, agent tokens and the
MCP endpoint, image uploads. The GitHub pipeline runs them against a throw-away Postgres before every deploy; a failing test stops the release.

Also: dark mode (Profile → Appearance, follows the device by default), keyboard shortcuts (`?` lists them), phone layout, collapsible summary tiles.
