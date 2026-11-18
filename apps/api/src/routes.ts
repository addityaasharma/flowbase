import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import {
  loginSchema, registerSchema, createProjectSchema, createTicketSchema, updateTicketSchema, moveTicketSchema,
  commentSchema, inviteSchema, acceptInviteSchema, memberRoleSchema, STATUS_LABEL, PRIORITY_LABEL, type Role, type Status,
} from "@bitcode/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { requireAuth, signToken } from "./auth";
import { rateLimit } from "./rateLimit";
import { sendAssignmentEmail, sendInviteEmail } from "./mail";
import { grant, openStream, publish, revoke } from "./events";
import express from "express";
import { MAX_UPLOAD_BYTES, saveUpload, serveUpload } from "./uploads";
import { STATUSES } from "@bitcode/shared";
import { flattenMembers, ticketInclude, userSelect, withKey } from "./serialize";

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const router = Router();

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const WEB_URL = () => (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
const memberOf = (userId: string, projectId: string) =>
  prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });

/** One-line, markdown-free preview of a comment for notifications. */
const plainExcerpt = (md: string) => {
  const t = md.replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_>#]|^\s*(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, "").replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
};
const actorOf = (req: Request) => ({ id: req.user!.id, name: req.user!.name });
/** Only an assignee or the creator may change/move a ticket; everyone else in the project can read and comment. */
const canEditTicket = (t: { reporterId: string; assignees: { userId: string }[] }, userId: string) => t.reporterId === userId || t.assignees.some((a) => a.userId === userId);
const NOT_ALLOWED = { error: "Only the assignees or the person who created this ticket can change it. You can still comment." };

/** Emails the people who were just assigned (never the person who made the assignment). Fire-and-forget: a mail problem must not fail the request. */
async function emailNewAssignees(ticketId: string, userIds: string[], actor: { id: string; name: string }) {
  const ids = [...new Set(userIds)].filter((id) => id !== actor.id);
  if (!ids.length) return;
  const [t, users] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: ticketId }, include: { project: { select: { name: true, key: true } } } }),
    prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { email: true, name: true } }),
  ]);
  if (!t) return;
  for (const u of users) {
    sendAssignmentEmail({
      to: u.email, name: u.name, actor: actor.name, project: t.project.name, link: `${WEB_URL()}/?ticket=${t.id}`,
      ticket: { key: `${t.project.key}-${t.number}`, title: t.title, priority: PRIORITY_LABEL[t.priority], status: STATUS_LABEL[t.status], dueDate: t.dueDate },
    }).then((r) => { if (!r.sent) console.warn(`[mail] assignment email to ${u.email} not sent: ${r.error}`); }).catch((e) => console.error(e));
  }
}

/** Resolves the caller's role in a project, or sends 403/404 and returns null. */
async function projectAccess(req: Request, res: Response, projectId: string, allow?: Role[]) {
  const m = await memberOf(req.user!.id, projectId);
  if (!m) { res.status(404).json({ error: "Not found" }); return null; }
  if (allow && !allow.includes(m.role)) { res.status(403).json({ error: "You don't have permission to do that in this project" }); return null; }
  return m;
}

// ================= public: auth + invitation lookup =================
router.post("/auth/register", rateLimit("register", 10, 60 * 60_000), wrap(async (req, res) => {
  const d = registerSchema.parse(req.body);
  const email = d.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists" });
  const u = await prisma.user.create({ data: { name: d.name, email, passwordHash: await bcrypt.hash(d.password, 10) }, select: userSelect });
  res.status(201).json({ token: signToken(u.id), user: u });
}));

router.post("/auth/login", rateLimit("login", 20, 15 * 60_000), wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
  const { passwordHash, ...user } = u;
  void passwordHash;
  res.json({ token: signToken(u.id), user: { id: user.id, name: user.name, email: user.email, title: user.title, active: user.active } });
}));

const findPending = (token: string) =>
  prisma.invitation.findFirst({
    where: { tokenHash: hashToken(token), acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { project: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });

router.get("/invitations/token/:token", wrap(async (req, res) => {
  const inv = await findPending(req.params.token);
  if (!inv) return res.status(404).json({ error: "This invitation is invalid or has expired" });
  const existing = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
  res.json({ email: inv.email, project: inv.project?.name ?? null, invitedBy: inv.invitedBy.name, existingUser: !!existing });
}));

router.post("/invitations/accept", rateLimit("accept", 20, 15 * 60_000), wrap(async (req, res) => {
  const { token, name, password } = acceptInviteSchema.parse(req.body);
  const inv = await findPending(token);
  if (!inv) return res.status(404).json({ error: "This invitation is invalid or has expired" });
  let user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (user) {
    // existing account: prove it's them before joining the workspace
    if (!user.active || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Wrong password for this account" });
  } else {
    if (!name) return res.status(400).json({ error: "Please enter your name" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    user = await prisma.user.create({ data: { name, email: inv.email, passwordHash: await bcrypt.hash(password, 10) } });
  }
  if (inv.projectId) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: inv.projectId, userId: user.id } },
      update: {}, create: { projectId: inv.projectId, userId: user.id, role: inv.role },
    });
  }
  await prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  if (inv.projectId) { grant(user.id, inv.projectId); publish({ type: "member.joined", projectId: inv.projectId, actor: { id: user.id, name: user.name } }); }
  res.status(201).json({ token: signToken(user.id), user: { id: user.id, name: user.name, email: user.email, title: user.title, active: user.active } });
}));

// Images are fetched by <img> tags (no auth header), so the file URL itself is the secret: 128 random bits, never listed anywhere.
router.get("/uploads/:name", serveUpload);

// ================= everything below needs a signed-in user =================
router.use(requireAuth);

router.get("/auth/me", wrap(async (req, res) => {
  res.json(await prisma.user.findUnique({ where: { id: req.user!.id }, select: userSelect }));
}));

router.get("/events", wrap((req, res) => openStream(req, res)));

router.post("/uploads", rateLimit("upload", 60, 60 * 60_000), express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), wrap(saveUpload));

router.patch("/auth/me", wrap(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  res.json(await prisma.user.update({ where: { id: req.user!.id }, data: { name }, select: userSelect }));
}));

router.post("/auth/password", rateLimit("password", 10, 15 * 60_000), wrap(async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!u || !(await bcrypt.compare(currentPassword, u.passwordHash))) return res.status(400).json({ error: "Current password is incorrect" });
  if (currentPassword === newPassword) return res.status(400).json({ error: "Choose a password you haven't used here" });
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  res.json({ ok: true });
}));

// ---------- projects ----------
const projectShape = (p: { members: Parameters<typeof flattenMembers>[0] } & Record<string, unknown>, me: string) => {
  const members = flattenMembers(p.members);
  return { ...p, members, myRole: members.find((m) => m.id === me)?.role ?? "MEMBER" };
};

router.get("/projects", wrap(async (req, res) => {
  const me = req.user!.id;
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId: me } } },
    include: { members: { include: { user: { select: userSelect } }, orderBy: { user: { name: "asc" } } }, _count: { select: { tickets: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(projects.map((p) => projectShape(p, me)));
}));

router.post("/projects", rateLimit("project", 20, 60 * 60_000), wrap(async (req, res) => {
  const d = createProjectSchema.parse(req.body);
  const p = await prisma.project.create({
    data: { name: d.name, key: d.key, description: d.description, members: { create: { userId: req.user!.id, role: "ADMIN" } } }, // creator = admin
  });
  res.status(201).json(p);
}));

router.delete("/projects/:id", wrap(async (req, res) => {
  if (!(await projectAccess(req, res, req.params.id, ["ADMIN"]))) return;
  const doomed = await prisma.project.findUnique({ where: { id: req.params.id }, select: { name: true } });
  publish({ type: "project.deleted", projectId: req.params.id, actor: actorOf(req), name: doomed?.name });
  await prisma.project.delete({ where: { id: req.params.id } });
  revoke(req.params.id);
  res.json({ ok: true });
}));

const adminCount = (projectId: string) => prisma.projectMember.count({ where: { projectId, role: "ADMIN" } });

router.patch("/projects/:id/members/:userId", wrap(async (req, res) => {
  if (!(await projectAccess(req, res, req.params.id, ["ADMIN"]))) return;
  const { role } = memberRoleSchema.parse(req.body);
  const target = await memberOf(req.params.userId, req.params.id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === "ADMIN" && role !== "ADMIN" && (await adminCount(req.params.id)) <= 1)
    return res.status(400).json({ error: "A project needs at least one admin" });
  await prisma.projectMember.update({ where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } }, data: { role } });
  publish({ type: "member.role", projectId: req.params.id, actor: actorOf(req), userId: req.params.userId, role });
  res.json({ ok: true });
}));

// Admin removes someone, or anyone leaves the project themselves
router.delete("/projects/:id/members/:userId", wrap(async (req, res) => {
  const me = await projectAccess(req, res, req.params.id); if (!me) return;
  const self = req.params.userId === req.user!.id;
  if (!self && me.role !== "ADMIN") return res.status(403).json({ error: "Only a project admin can remove people" });
  const target = await memberOf(req.params.userId, req.params.id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === "ADMIN" && (await adminCount(req.params.id)) <= 1)
    return res.status(400).json({ error: "You are the only admin. Make someone else admin first, or delete the project." });
  await prisma.$transaction([
    prisma.ticketAssignee.deleteMany({ where: { userId: req.params.userId, ticket: { projectId: req.params.id } } }),
    prisma.projectMember.delete({ where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } } }),
  ]);
  publish({ type: "member.removed", projectId: req.params.id, actor: actorOf(req), userId: req.params.userId }); // sent before revoke so the removed user also learns of it
  revoke(req.params.id, req.params.userId);
  res.json({ ok: true });
}));

// ---------- invitations ----------
async function issueInvite(inv: { id: string; email: string; projectId: string | null }, inviter: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.invitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 864e5) } });
  const link = `${WEB_URL()}/invite/${token}`;
  const project = inv.projectId ? (await prisma.project.findUnique({ where: { id: inv.projectId }, select: { name: true } }))?.name : null;
  const mail = await sendInviteEmail({ to: inv.email, link, inviter, project });
  return { link, emailSent: mail.sent, emailError: mail.error };
}

router.post("/invitations", rateLimit("invite", 30, 60 * 60_000), wrap(async (req, res) => {
  const d = inviteSchema.parse(req.body);
  const me = await projectAccess(req, res, d.projectId, ["ADMIN", "MANAGER"]); if (!me) return;
  if (d.role === "ADMIN" && me.role !== "ADMIN") return res.status(403).json({ error: "Only admins can invite admins" });
  const email = d.email.toLowerCase();
  const sentToday = await prisma.invitation.count({ where: { invitedById: req.user!.id, createdAt: { gt: new Date(Date.now() - 864e5) } } });
  if (sentToday >= 30) return res.status(429).json({ error: "Daily invitation limit reached" });
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && (await memberOf(existing.id, d.projectId))) return res.status(409).json({ error: "This person is already in the project" });
  await prisma.invitation.deleteMany({ where: { email, projectId: d.projectId, acceptedAt: null } }); // one live invite per email+project
  const inv = await prisma.invitation.create({
    data: { email, role: d.role, projectId: d.projectId, invitedById: req.user!.id, tokenHash: crypto.randomUUID(), expiresAt: new Date() },
  });
  res.status(201).json({ id: inv.id, email, ...(await issueInvite(inv, req.user!.name)) });
}));

router.get("/invitations", wrap(async (req, res) => {
  const projectId = String(req.query.projectId ?? "");
  if (!(await projectAccess(req, res, projectId, ["ADMIN", "MANAGER"]))) return;
  res.json(await prisma.invitation.findMany({
    where: { projectId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { name: true } } },
  }));
}));

async function loadInvite(req: Request, res: Response) {
  const inv = await prisma.invitation.findFirst({ where: { id: req.params.id, acceptedAt: null } });
  if (!inv || !inv.projectId) { res.status(404).json({ error: "Not found" }); return null; }
  if (!(await projectAccess(req, res, inv.projectId, ["ADMIN", "MANAGER"]))) return null;
  return inv;
}
router.post("/invitations/:id/resend", rateLimit("resend", 30, 60 * 60_000), wrap(async (req, res) => {
  const inv = await loadInvite(req, res); if (!inv) return;
  res.json(await issueInvite(inv, req.user!.name));
}));
router.delete("/invitations/:id", wrap(async (req, res) => {
  const inv = await loadInvite(req, res); if (!inv) return;
  await prisma.invitation.delete({ where: { id: inv.id } });
  res.json({ ok: true });
}));

// ---------- tickets ----------
const log = (ticketId: string, actorId: string, message: string) => prisma.activity.create({ data: { ticketId, actorId, message } });

async function assigneesOk(res: Response, projectId: string, ids?: string[]) {
  const unique = [...new Set(ids ?? [])];
  if (!unique.length) return true;
  const n = await prisma.projectMember.count({ where: { projectId, userId: { in: unique } } });
  if (n === unique.length) return true;
  res.status(400).json({ error: "Assignees must be members of this project" });
  return false;
}

router.get("/tickets", wrap(async (req, res) => {
  const { projectId, assigneeId, status, q } = req.query as Record<string, string | undefined>;
  const tickets = await prisma.ticket.findMany({
    where: {
      project: { members: { some: { userId: req.user!.id } } },
      ...(projectId ? { projectId } : {}),
      ...(assigneeId === "unassigned" ? { assignees: { none: {} } } : assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}),
      ...(status ? { status: status as Status } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: ticketInclude,
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  res.json(tickets.map(withKey));
}));

router.post("/tickets", rateLimit("ticket", 300, 60 * 60_000), wrap(async (req, res) => {
  const d = createTicketSchema.parse(req.body);
  if (!(await projectAccess(req, res, d.projectId))) return;
  if (!(await assigneesOk(res, d.projectId, d.assigneeIds))) return;
  const last = await prisma.ticket.findFirst({ where: { projectId: d.projectId, status: d.status }, orderBy: { position: "desc" }, select: { position: true } });
  const t = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: d.projectId }, data: { ticketSeq: { increment: 1 } } });
    return tx.ticket.create({
      data: {
        projectId: d.projectId, number: p.ticketSeq, title: d.title, description: d.description,
        type: d.type, priority: d.priority, status: d.status, labels: d.labels,
        assignees: { create: [...new Set(d.assigneeIds)].map((userId) => ({ userId })) }, reporterId: req.user!.id,
        dueDate: d.dueDate ? new Date(d.dueDate) : null, position: (last?.position ?? 0) + 1000,
      },
      include: ticketInclude,
    });
  });
  await log(t.id, req.user!.id, "created this ticket");
  const created = withKey(t);
  void emailNewAssignees(t.id, d.assigneeIds ?? [], actorOf(req)).catch(console.error);
  publish({ type: "ticket.created", projectId: d.projectId, actor: actorOf(req), ticket: { id: t.id, key: created.key, title: t.title, status: t.status } });
  res.status(201).json(created);
}));

async function loadTicket(req: Request, res: Response) {
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: ticketInclude });
  if (!t || !(await memberOf(req.user!.id, t.projectId))) { res.status(404).json({ error: "Not found" }); return null; }
  return t;
}

router.get("/tickets/:id", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  const [comments, activities] = await Promise.all([
    prisma.comment.findMany({ where: { ticketId: t.id }, include: { author: { select: userSelect } }, orderBy: { createdAt: "asc" } }),
    prisma.activity.findMany({ where: { ticketId: t.id }, include: { actor: { select: userSelect } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  res.json({ ...withKey(t), comments, activities });
}));

router.patch("/tickets/:id", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (!canEditTicket(t, req.user!.id)) return res.status(403).json(NOT_ALLOWED);
  const d = updateTicketSchema.parse(req.body);
  if (!(await assigneesOk(res, t.projectId, d.assigneeIds))) return;
  const { dueDate, assigneeIds, ...rest } = d;
  const ops: Prisma.PrismaPromise<unknown>[] = [prisma.ticket.update({ where: { id: t.id }, data: { ...rest, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) } })];
  const before = new Set(t.assignees.map((a) => a.userId));
  const after = new Set(assigneeIds ?? [...before]);
  const added = [...after].filter((id) => !before.has(id)), removed = [...before].filter((id) => !after.has(id));
  if (assigneeIds !== undefined && (added.length || removed.length)) {
    ops.push(prisma.ticketAssignee.deleteMany({ where: { ticketId: t.id, userId: { in: removed } } }));
    ops.push(prisma.ticketAssignee.createMany({ data: added.map((userId) => ({ ticketId: t.id, userId })) }));
  }
  await prisma.$transaction(ops);
  const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id }, include: ticketInclude });
  const names = async (ids: string[]) => (await prisma.user.findMany({ where: { id: { in: ids } }, select: { name: true } })).map((u) => u.name).join(", ");
  const changes: string[] = [];
  if (d.title && d.title !== t.title) changes.push("renamed the ticket");
  if (d.priority && d.priority !== t.priority) changes.push(`set priority to ${d.priority.toLowerCase()}`);
  if (d.status && d.status !== t.status) changes.push(`moved to ${STATUS_LABEL[d.status]}`);
  if (added.length) { changes.push(`assigned ${await names(added)}`); void emailNewAssignees(t.id, added, actorOf(req)).catch(console.error); }
  if (removed.length) changes.push(`unassigned ${await names(removed)}`);
  for (const c of changes) await log(t.id, req.user!.id, c);
  const out = withKey(updated);
  if (changes.length) publish({ type: "ticket.updated", projectId: t.projectId, actor: actorOf(req), ticket: { id: t.id, key: out.key, title: updated.title }, changes });
  res.json(out);
}));

// Drag & drop: change status and place between two neighbours (fractional positions)
router.post("/tickets/:id/move", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (!canEditTicket(t, req.user!.id)) return res.status(403).json(NOT_ALLOWED);
  const { status, beforeId, afterId } = moveTicketSchema.parse(req.body);
  const [before, after] = await Promise.all([
    beforeId ? prisma.ticket.findFirst({ where: { id: beforeId, projectId: t.projectId }, select: { position: true } }) : null,
    afterId ? prisma.ticket.findFirst({ where: { id: afterId, projectId: t.projectId }, select: { position: true } }) : null,
  ]);
  let position: number;
  if (before && after) position = (before.position + after.position) / 2;
  else if (before) position = before.position - 1000;
  else if (after) position = after.position + 1000;
  else position = 1000;
  const updated = await prisma.ticket.update({ where: { id: t.id }, data: { status, position }, include: ticketInclude });
  if (status !== t.status) await log(t.id, req.user!.id, `moved from ${STATUS_LABEL[t.status]} to ${STATUS_LABEL[status]}`);
  const out = withKey(updated);
  publish({ type: "ticket.moved", projectId: t.projectId, actor: actorOf(req), from: t.status, ticket: { id: t.id, key: out.key, title: updated.title, status, position } });
  res.json(out);
}));

// Live drag presence: lets other members watch a card being dragged (nothing is saved).
router.post("/tickets/:id/drag", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (!canEditTicket(t, req.user!.id)) return res.status(403).json(NOT_ALLOWED);
  const d = z.object({ phase: z.enum(["start", "move", "end"]), col: z.enum(STATUSES).optional(), index: z.number().int().min(0).max(1000).optional() }).parse(req.body);
  publish({ type: "drag", projectId: t.projectId, actor: actorOf(req), ticketId: t.id, ...d });
  res.json({ ok: true });
}));

router.delete("/tickets/:id", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (t.reporterId !== req.user!.id) return res.status(403).json({ error: "Only the person who created this ticket can delete it" });
  const key = withKey(t).key;
  await prisma.ticket.delete({ where: { id: t.id } });
  publish({ type: "ticket.deleted", projectId: t.projectId, actor: actorOf(req), ticket: { id: t.id, key, title: t.title } });
  res.json({ ok: true });
}));

router.post("/tickets/:id/comments", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  const { body } = commentSchema.parse(req.body);
  const c = await prisma.comment.create({ data: { ticketId: t.id, authorId: req.user!.id, body }, include: { author: { select: userSelect } } });
  publish({ type: "comment.created", projectId: t.projectId, actor: actorOf(req), ticket: { id: t.id, key: withKey(t).key, title: t.title }, body: plainExcerpt(body) });
  res.status(201).json(c);
}));

void z;
