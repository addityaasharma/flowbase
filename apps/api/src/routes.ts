import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import {
  loginSchema, registerSchema, createProjectSchema, createTicketSchema, updateTicketSchema, moveTicketSchema,
  commentSchema, inviteSchema, acceptInviteSchema, memberRoleSchema, STATUS_LABEL, type Role, type Status,
} from "@bitcode/shared";
import { prisma } from "./db";
import { requireAuth, signToken } from "./auth";
import { rateLimit } from "./rateLimit";
import { sendInviteEmail } from "./mail";
import { flattenMembers, ticketInclude, userSelect, withKey } from "./serialize";

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const router = Router();

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const WEB_URL = () => (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
const memberOf = (userId: string, projectId: string) =>
  prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });

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
  res.status(201).json({ token: signToken(user.id), user: { id: user.id, name: user.name, email: user.email, title: user.title, active: user.active } });
}));

// ================= everything below needs a signed-in user =================
router.use(requireAuth);

router.get("/auth/me", wrap(async (req, res) => {
  res.json(await prisma.user.findUnique({ where: { id: req.user!.id }, select: userSelect }));
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
  await prisma.project.delete({ where: { id: req.params.id } });
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
    prisma.ticket.updateMany({ where: { projectId: req.params.id, assigneeId: req.params.userId }, data: { assigneeId: null } }),
    prisma.projectMember.delete({ where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } } }),
  ]);
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

async function assigneeOk(res: Response, projectId: string, assigneeId?: string | null) {
  if (!assigneeId) return true;
  if (await memberOf(assigneeId, projectId)) return true;
  res.status(400).json({ error: "Assignee must be a member of this project" });
  return false;
}

router.get("/tickets", wrap(async (req, res) => {
  const { projectId, assigneeId, status, q } = req.query as Record<string, string | undefined>;
  const tickets = await prisma.ticket.findMany({
    where: {
      project: { members: { some: { userId: req.user!.id } } },
      ...(projectId ? { projectId } : {}),
      ...(assigneeId === "unassigned" ? { assigneeId: null } : assigneeId ? { assigneeId } : {}),
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
  if (!(await assigneeOk(res, d.projectId, d.assigneeId))) return;
  const last = await prisma.ticket.findFirst({ where: { projectId: d.projectId, status: d.status }, orderBy: { position: "desc" }, select: { position: true } });
  const t = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: d.projectId }, data: { ticketSeq: { increment: 1 } } });
    return tx.ticket.create({
      data: {
        projectId: d.projectId, number: p.ticketSeq, title: d.title, description: d.description,
        type: d.type, priority: d.priority, status: d.status, labels: d.labels,
        assigneeId: d.assigneeId ?? null, reporterId: req.user!.id,
        dueDate: d.dueDate ? new Date(d.dueDate) : null, position: (last?.position ?? 0) + 1000,
      },
      include: ticketInclude,
    });
  });
  await log(t.id, req.user!.id, "created this ticket");
  res.status(201).json(withKey(t));
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
  const d = updateTicketSchema.parse(req.body);
  if (!(await assigneeOk(res, t.projectId, d.assigneeId))) return;
  const { dueDate, ...rest } = d;
  const updated = await prisma.ticket.update({
    where: { id: t.id },
    data: { ...rest, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) },
    include: ticketInclude,
  });
  const changes: string[] = [];
  if (d.title && d.title !== t.title) changes.push("renamed the ticket");
  if (d.priority && d.priority !== t.priority) changes.push(`set priority to ${d.priority.toLowerCase()}`);
  if (d.status && d.status !== t.status) changes.push(`moved to ${STATUS_LABEL[d.status]}`);
  if (d.assigneeId !== undefined && d.assigneeId !== t.assigneeId)
    changes.push(updated.assignee ? `assigned to ${updated.assignee.name}` : "unassigned the ticket");
  for (const c of changes) await log(t.id, req.user!.id, c);
  res.json(withKey(updated));
}));

// Drag & drop: change status and place between two neighbours (fractional positions)
router.post("/tickets/:id/move", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
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
  res.json(withKey(updated));
}));

router.delete("/tickets/:id", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (t.reporterId !== req.user!.id) return res.status(403).json({ error: "Only the person who created this ticket can delete it" });
  await prisma.ticket.delete({ where: { id: t.id } });
  res.json({ ok: true });
}));

router.post("/tickets/:id/comments", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  const { body } = commentSchema.parse(req.body);
  const c = await prisma.comment.create({ data: { ticketId: t.id, authorId: req.user!.id, body }, include: { author: { select: userSelect } } });
  res.status(201).json(c);
}));

void z;
