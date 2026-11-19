import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import {
  loginSchema, registerSchema, forgotSchema, resetSchema, verifySchema, createProjectSchema, updateProjectSchema, createTokenSchema, ticketRepoSchema, createTicketSchema, updateTicketSchema, moveTicketSchema,
  commentSchema, inviteSchema, acceptInviteSchema, memberRoleSchema, STATUS_LABEL, PRIORITY_LABEL, type Role, type Status,
} from "@bitcode/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { requireAuth, signToken } from "./auth";
import { rateLimit } from "./rateLimit";
import { BLOCKED_MSG, OVERDUE_LOCK_MSG, overdueBlocked } from "./lock";
import { sendAssignmentEmail, sendInviteEmail, sendMentionEmail, sendPasswordResetEmail, sendSubtaskReminderEmail, sendVerifyEmail } from "./mail";
import { grant, openStream, publish, revoke } from "./events";
import { notify, ticketAudience } from "./notifications";
import { currentVia, newToken } from "./tokens"; // (routes.ts already has the same sha256 hashToken helper)
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

/** @[Name](u:<userId>) tokens written by the editor's @-autocomplete. */
const mentionIds = (text: string) => [...new Set([...text.matchAll(/@\[[^\]]+\]\(u:([a-z0-9]{8,40})\)/g)].map((m) => m[1]))];
/** Mentions only count for people who are in the project (and never for yourself). */
async function validMentions(projectId: string, ids: string[], actorId: string) {
  const want = ids.filter((id) => id !== actorId);
  if (!want.length) return [] as { id: string; name: string; email: string }[];
  const rows = await prisma.projectMember.findMany({ where: { projectId, userId: { in: want } }, select: { user: { select: { id: true, name: true, email: true, active: true } } } });
  return rows.map((r) => r.user).filter((u) => u.active);
}
async function notifyMentions(o: { text: string; skip?: string[]; actor: { id: string; name: string }; projectId: string; ticketId: string; key: string; title: string }) {
  const people = (await validMentions(o.projectId, mentionIds(o.text), o.actor.id)).filter((u) => !o.skip?.includes(u.id));
  if (!people.length) return [] as string[];
  const excerpt = plainExcerpt(o.text);
  await notify({ userIds: people.map((u) => u.id), actor: o.actor, kind: "mention", text: `mentioned you in ${o.key}: “${excerpt}”`, projectId: o.projectId, ticketId: o.ticketId });
  const project = await prisma.project.findUnique({ where: { id: o.projectId }, select: { name: true } });
  for (const u of people) sendMentionEmail({ to: u.email, name: u.name, actor: o.actor.name, project: project?.name ?? "", ticket: { key: o.key, title: o.title }, excerpt, link: `${WEB_URL()}/?ticket=${o.ticketId}` }).catch(console.error);
  return people.map((u) => u.id);
}

/** One-line, markdown-free preview of a comment for notifications. */
const plainExcerpt = (md: string) => {
  const t = md.replace(/@\[([^\]]+)\]\(u:[^)]*\)/g, "@$1").replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_>#]|^\s*(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, "").replace(/\s+/g, " ").trim();
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
type UserRow = { id: string; name: string; email: string; title: string | null; active: boolean; emailVerifiedAt: Date | null; tourSeenAt?: Date | null };
const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, title: u.title, active: u.active, emailVerified: !!u.emailVerifiedAt, tourSeen: u.tourSeenAt === undefined ? true : !!u.tourSeenAt });

/** Creates a one-time emailed link (only its hash is stored). A new password-reset link replaces earlier ones; confirmation links
 *  do not: if two confirmation emails go out (e.g. "Resend"), whichever one is opened first must still work. */
async function issueAuthToken(userId: string, kind: "reset" | "verify", ttlMs: number) {
  const token = crypto.randomBytes(32).toString("hex");
  if (kind === "reset") await prisma.authToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({ data: { userId, kind, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}
const findAuthToken = (token: string, kind: "reset" | "verify") =>
  prisma.authToken.findFirst({ where: { tokenHash: hashToken(token), kind, usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
const sendVerification = async (u: { id: string; name: string; email: string }) => {
  const token = await issueAuthToken(u.id, "verify", 3 * 864e5);
  const r = await sendVerifyEmail({ to: u.email, name: u.name, link: `${WEB_URL()}/verify/${token}` });
  if (!r.sent) console.warn(`[mail] verification email to ${u.email} not sent: ${r.error}`);
};

router.post("/auth/register", rateLimit("register", 10, 60 * 60_000), wrap(async (req, res) => {
  const d = registerSchema.parse(req.body);
  const email = d.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists" });
  const u = await prisma.user.create({ data: { name: d.name, email, passwordHash: await bcrypt.hash(d.password, 10) } });
  void sendVerification(u).catch(console.error);
  res.status(201).json({ token: signToken(u.id, u.tokenVersion), user: publicUser(u) });
}));

router.post("/auth/login", rateLimit("login", 20, 15 * 60_000), wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
  res.json({ token: signToken(u.id, u.tokenVersion), user: publicUser(u) });
}));

// Always answers the same way, so nobody can use this to find out which emails have accounts.
router.post("/auth/forgot", rateLimit("forgot", 5, 60 * 60_000), wrap(async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (u && u.active) {
    const recent = await prisma.authToken.count({ where: { userId: u.id, kind: "reset", createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
    if (recent < 2) { // at most two reset emails per 10 minutes per account
      const token = await issueAuthToken(u.id, "reset", 60 * 60_000);
      void sendPasswordResetEmail({ to: u.email, name: u.name, link: `${WEB_URL()}/reset/${token}` }).catch(console.error);
    }
  }
  res.json({ ok: true });
}));

router.get("/auth/reset/:token", wrap(async (req, res) => {
  const t = await findAuthToken(req.params.token, "reset");
  if (!t) return res.status(404).json({ error: "This reset link is invalid or has expired" });
  res.json({ ok: true });
}));

router.post("/auth/reset", rateLimit("reset", 10, 15 * 60_000), wrap(async (req, res) => {
  const { token, password } = resetSchema.parse(req.body);
  const t = await findAuthToken(token, "reset");
  if (!t) return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
  const u = await prisma.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    // new version = every other device is signed out; being able to read the email also proves the address
    return tx.user.update({ where: { id: t.userId }, data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 }, emailVerifiedAt: t.user.emailVerifiedAt ?? new Date() } });
  });
  res.json({ token: signToken(u.id, u.tokenVersion), user: publicUser(u) });
}));

router.post("/auth/verify", rateLimit("verify", 20, 15 * 60_000), wrap(async (req, res) => {
  const { token } = verifySchema.parse(req.body);
  const t = await prisma.authToken.findFirst({ where: { tokenHash: hashToken(token), kind: "verify", expiresAt: { gt: new Date() } }, include: { user: true } });
  if (!t || !t.user.active) return res.status(400).json({ error: "This confirmation link is invalid or has expired" });
  // opened again (a second tab, a mail scanner, a double request): the address is already confirmed, which is not an error. No session is handed out twice.
  if (t.usedAt) return t.user.emailVerifiedAt ? res.json({ ok: true, alreadyVerified: true }) : res.status(400).json({ error: "This confirmation link is invalid or has expired" });
  const claimed = await prisma.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } }); // atomic: only one request wins
  if (!claimed.count) return res.json({ ok: true, alreadyVerified: true });
  const now = new Date();
  const [u] = await prisma.$transaction([
    prisma.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: t.user.emailVerifiedAt ?? now } }),
    prisma.authToken.updateMany({ where: { userId: t.userId, kind: "verify", usedAt: null }, data: { usedAt: now } }), // the other emailed links are spent too
  ]);
  // Opening the emailed link proves the mailbox is theirs (same trust as a password-reset link), so it also signs that account in,
  // replacing whoever else was signed in on this browser.
  res.json({ ok: true, token: signToken(u.id, u.tokenVersion), user: publicUser(u) });
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
    user = await prisma.user.create({ data: { name, email: inv.email, passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() } });
  }
  if (inv.projectId) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: inv.projectId, userId: user.id } },
      update: {}, create: { projectId: inv.projectId, userId: user.id, role: inv.role },
    });
  }
  if (!user.emailVerifiedAt) user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }); // opened the emailed link
  await prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  if (inv.projectId) {
    const pid = inv.projectId;
    grant(user.id, pid); publish({ type: "member.joined", projectId: pid, actor: { id: user.id, name: user.name } });
    void prisma.projectMember.findMany({ where: { projectId: pid, role: { in: ["ADMIN", "MANAGER"] } }, select: { userId: true } })
      .then((a) => notify({ userIds: a.map((x) => x.userId), actor: { id: user.id, name: user.name }, kind: "member", text: `joined ${inv.project?.name ?? "the project"}`, projectId: pid }))
      .catch(console.error);
  }
  res.status(201).json({ token: signToken(user.id, user.tokenVersion), user: publicUser(user) });
}));

// Images are fetched by <img> tags (no auth header), so the file URL itself is the secret: 128 random bits, never listed anywhere.
router.get("/uploads/:name", serveUpload);

// ================= everything below needs a signed-in user =================
router.use(requireAuth);

router.get("/auth/me", wrap(async (req, res) => {
  res.json(publicUser((await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } }))));
}));

// the welcome tour was finished or skipped: remember it once, for good (all devices)
router.post("/auth/tour-seen", wrap(async (req, res) => {
  await prisma.user.updateMany({ where: { id: req.user!.id, tourSeenAt: null }, data: { tourSeenAt: new Date() } });
  res.json({ ok: true });
}));

router.post("/auth/resend-verification", rateLimit("resendverify", 3, 60 * 60_000), wrap(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (u.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
  // one was sent a moment ago (sign-up, or a double click): don't send a second one on top of it
  if (await prisma.authToken.findFirst({ where: { userId: u.id, kind: "verify", createdAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } })) return res.json({ ok: true, throttled: true });
  await sendVerification(u);
  res.json({ ok: true });
}));

/** Unverified accounts can browse and work, but can't create projects or invite people (spam/abuse protection). */
const requireVerified = async (req: Request, res: Response) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { emailVerifiedAt: true } });
  if (u?.emailVerifiedAt) return true;
  res.status(403).json({ error: "Please confirm your email address first. We sent you a link; use “Resend” if you can't find it.", code: "EMAIL_UNVERIFIED" });
  return false;
};

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
  const nu = await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } } });
  res.json({ ok: true, token: signToken(nu.id, nu.tokenVersion) }); // this device stays signed in; all others are signed out
}));

// ---------- personal access tokens (for Claude / agents) ----------
const activeToken = () => ({ revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });
router.get("/tokens", wrap(async (req, res) => {
  res.json(await prisma.apiToken.findMany({ where: { userId: req.user!.id, ...activeToken() }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, canCommentOthers: true, level: true, expiresAt: true, lastUsedAt: true, createdAt: true } }));
}));
router.post("/tokens", rateLimit("token", 10, 60 * 60_000), wrap(async (req, res) => {
  if (!(await requireVerified(req, res))) return;
  const d = createTokenSchema.parse(req.body);
  if ((await prisma.apiToken.count({ where: { userId: req.user!.id, ...activeToken() } })) >= 10) return res.status(400).json({ error: "You already have 10 active tokens. Revoke one first." });
  const token = newToken();
  const row = await prisma.apiToken.create({
    data: { userId: req.user!.id, name: d.name, prefix: token.slice(0, 11), tokenHash: hashToken(token), canCommentOthers: d.canCommentOthers, level: d.level, expiresAt: d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 864e5) : null },
    select: { id: true, name: true, prefix: true, canCommentOthers: true, level: true, expiresAt: true, createdAt: true },
  });
  res.status(201).json({ ...row, token }); // the only time the full token is ever shown
}));
router.delete("/tokens/:id", wrap(async (req, res) => {
  await prisma.apiToken.updateMany({ where: { id: req.params.id, userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
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
  if (!(await requireVerified(req, res))) return;
  const d = createProjectSchema.parse(req.body);
  const p = await prisma.project.create({
    data: { name: d.name, key: d.key, description: d.description, members: { create: { userId: req.user!.id, role: "ADMIN" } } }, // creator = admin
  });
  res.status(201).json(p);
}));

router.patch("/projects/:id", wrap(async (req, res) => {
  if (!(await projectAccess(req, res, req.params.id, ["ADMIN"]))) return;
  const d = updateProjectSchema.parse(req.body);
  const repoUrl = d.repoUrl === undefined ? undefined : d.repoUrl ? d.repoUrl.replace(/\/$/, "").replace(/\.git$/, "") : null;
  const p = await prisma.project.update({
    where: { id: req.params.id },
    data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.description !== undefined ? { description: d.description || null } : {}), ...(repoUrl !== undefined ? { repoUrl } : {}), ...(d.repoBranch !== undefined ? { repoBranch: d.repoBranch } : {}) },
    select: { id: true, name: true, description: true, repoUrl: true, repoBranch: true },
  });
  publish({ type: "project.updated", projectId: p.id, actor: actorOf(req), name: p.name });
  res.json(p);
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
  void prisma.project.findUnique({ where: { id: req.params.id }, select: { name: true } })
    .then((p) => notify({ userIds: [req.params.userId], actor: actorOf(req), kind: "member", text: `changed your role to ${role} in “${p?.name}”`, projectId: req.params.id }))
    .catch(console.error);
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
  if (req.params.userId !== req.user!.id)
    void prisma.project.findUnique({ where: { id: req.params.id }, select: { name: true } })
      .then((p) => notify({ userIds: [req.params.userId], actor: actorOf(req), kind: "member", text: `removed you from “${p?.name}”` }))
      .catch(console.error);
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
  if (!(await requireVerified(req, res))) return;
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
export const log = (ticketId: string, actorId: string, message: string, viaAgent?: string) => prisma.activity.create({ data: { ticketId, actorId, message, viaAgent: viaAgent ?? currentVia() ?? null } });

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
  if (d.dueDate && d.dueDate.slice(0, 10) < new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10)) return res.status(400).json({ error: "The due date can't be in the past" }); // (a day of slack for time zones)
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
  if (d.description) void notifyMentions({ text: d.description, actor: actorOf(req), projectId: d.projectId, ticketId: t.id, key: created.key, title: t.title }).catch(console.error);
  void notify({ userIds: d.assigneeIds ?? [], actor: actorOf(req), kind: "assigned", text: `assigned you ${created.key} “${t.title}”`, projectId: d.projectId, ticketId: t.id }).catch(console.error);
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
  const subtasks = await prisma.subtask.findMany({ where: { ticketId: t.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const repos = await prisma.ticketRepo.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: "asc" }, select: { id: true, url: true, branch: true, createdAt: true, addedBy: { select: { id: true, name: true } } } });
  res.json({ ...withKey(t), comments, activities, subtasks, repos });
}));

router.patch("/tickets/:id", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (!canEditTicket(t, req.user!.id)) return res.status(403).json(NOT_ALLOWED);
  const d = updateTicketSchema.parse(req.body);
  if (overdueBlocked(t) && t.reporterId !== req.user!.id && ((d.status !== undefined && d.status !== t.status) || d.dueDate !== undefined)) return res.status(403).json({ error: OVERDUE_LOCK_MSG });
  if (t.status === "BLOCKED") { // a blocked task is frozen: the only thing you can do is unblock it (the creator may also re-date an overdue one)
    const ok = Object.entries(d).every(([k, v]) => v === undefined || k === "status" || (k === "dueDate" && overdueBlocked(t) && t.reporterId === req.user!.id));
    if (!ok) return res.status(409).json({ error: BLOCKED_MSG });
  }
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
  const who = actorOf(req), base = { actor: who, projectId: t.projectId, ticketId: t.id };
  if (d.description) void notifyMentions({ text: d.description, skip: mentionIds(t.description ?? ""), actor: who, projectId: t.projectId, ticketId: t.id, key: out.key, title: updated.title }).catch(console.error);
  if (added.length) void notify({ ...base, userIds: added, kind: "assigned", text: `assigned you ${out.key} “${updated.title}”` }).catch(console.error);
  if (removed.length) void notify({ ...base, userIds: removed, kind: "assigned", text: `unassigned you from ${out.key} “${updated.title}”` }).catch(console.error);
  if (changes.length) void ticketAudience(t.id).then((aud) => notify({ ...base, userIds: aud.filter((id) => !added.includes(id)), kind: "updated", text: `${changes.join(", ")} on ${out.key}` })).catch(console.error);
  res.json(out);
}));

// Drag & drop: change status and place between two neighbours (fractional positions)
router.post("/tickets/:id/move", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (!canEditTicket(t, req.user!.id)) return res.status(403).json(NOT_ALLOWED);
  const { status, beforeId, afterId } = moveTicketSchema.parse(req.body);
  if (overdueBlocked(t) && t.reporterId !== req.user!.id && status !== t.status) return res.status(403).json({ error: OVERDUE_LOCK_MSG });
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
  if (status !== t.status)
    void ticketAudience(t.id).then((aud) => notify({ userIds: aud, actor: actorOf(req), kind: "moved", text: `moved ${out.key} “${updated.title}” to ${STATUS_LABEL[status]}`, projectId: t.projectId, ticketId: t.id })).catch(console.error);
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

// ---------- subtasks (checklist inside a ticket) ----------
const subtaskTitle = z.string().trim().min(1).max(200);
async function subtaskTicket(req: Request, res: Response, ticketId: string) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
  if (!t || !(await memberOf(req.user!.id, t.projectId))) { res.status(404).json({ error: "Not found" }); return null; }
  if (!canEditTicket(t, req.user!.id)) { res.status(403).json(NOT_ALLOWED); return null; }
  if (t.status === "BLOCKED") { res.status(409).json({ error: BLOCKED_MSG }); return null; } // subtasks, reminders and repos wait until it is unblocked
  return t;
}
const SUBTASK_PEOPLE = "A subtask can only be assigned to people assigned to this ticket";
const subtaskPeopleOk = (t: { assignees: { userId: string }[] }, ids: string[]) => ids.every((id) => t.assignees.some((a) => a.userId === id));
const touched = (t: { id: string; projectId: string; title: string; number: number; project: { key: string } }, req: Request, what: string) => {
  const key = `${t.project.key}-${t.number}`;
  log(t.id, req.user!.id, what).catch(console.error); // (a Prisma query only runs once something awaits it)
  publish({ type: "ticket.updated", projectId: t.projectId, actor: actorOf(req), ticket: { id: t.id, key, title: t.title }, changes: [what] });
};
router.post("/tickets/:id/subtasks", wrap(async (req, res) => {
  const t = await subtaskTicket(req, res, req.params.id); if (!t) return;
  const title = subtaskTitle.parse(req.body?.title);
  const assigneeIds = [...new Set(z.array(z.string()).max(20).optional().parse(req.body?.assigneeIds) ?? [])];
  if (!subtaskPeopleOk(t, assigneeIds)) return res.status(400).json({ error: SUBTASK_PEOPLE });
  if ((await prisma.subtask.count({ where: { ticketId: t.id } })) >= 50) return res.status(400).json({ error: "A ticket can have up to 50 subtasks" });
  const last = await prisma.subtask.findFirst({ where: { ticketId: t.id }, orderBy: { position: "desc" }, select: { position: true } });
  const s = await prisma.subtask.create({ data: { ticketId: t.id, title, assigneeIds, position: (last?.position ?? 0) + 1000 } });
  touched(t, req, `added subtask “${title}”`);
  res.status(201).json(s);
}));
router.patch("/subtasks/:id", wrap(async (req, res) => {
  const cur = await prisma.subtask.findUnique({ where: { id: req.params.id } }); if (!cur) return res.status(404).json({ error: "Not found" });
  const t = await subtaskTicket(req, res, cur.ticketId); if (!t) return;
  const d = z.object({ title: subtaskTitle.optional(), done: z.boolean().optional(), status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]).optional(), assigneeIds: z.array(z.string()).max(20).optional() }).parse(req.body);
  if (d.assigneeIds && !subtaskPeopleOk(t, d.assigneeIds)) return res.status(400).json({ error: SUBTASK_PEOPLE });
  if (d.assigneeIds) d.assigneeIds = [...new Set(d.assigneeIds)];
  if (d.status) d.done = d.status === "DONE"; else if (d.done !== undefined) (d as any).status = d.done ? "DONE" : "TODO"; // keep the two in step
  if ((d.done !== undefined) && cur.assigneeIds.length && !cur.assigneeIds.includes(req.user!.id)) return res.status(403).json({ error: "Only the people this subtask is assigned to can check or uncheck it." });
  const s = await prisma.subtask.update({ where: { id: cur.id }, data: d });
  if (s.status !== cur.status) touched(t, req, s.status === "DONE" ? `completed subtask “${s.title}”` : cur.status === "DONE" ? `reopened subtask “${s.title}” as ${s.status.toLowerCase().replace("_", " ")}` : `moved subtask “${s.title}” to ${s.status.toLowerCase().replace("_", " ")}`);
  res.json(s);
}));
// the bell: one reminder email per subtask, to its assignees
router.post("/subtasks/:id/remind", wrap(async (req, res) => {
  const cur = await prisma.subtask.findUnique({ where: { id: req.params.id } }); if (!cur) return res.status(404).json({ error: "Not found" });
  const t = await subtaskTicket(req, res, cur.ticketId); if (!t) return;
  if (!cur.assigneeIds.length) return res.status(400).json({ error: "Assign this subtask to someone first" });
  if (cur.done) return res.status(400).json({ error: "This subtask is already done" });
  const claimed = await prisma.subtask.updateMany({ where: { id: cur.id, remindedAt: null }, data: { remindedAt: new Date() } }); // atomic: only one press wins
  if (!claimed.count) return res.status(409).json({ error: "A reminder was already sent for this subtask" });
  const users = await prisma.user.findMany({ where: { id: { in: cur.assigneeIds }, active: true }, select: { email: true, name: true } });
  const actor = actorOf(req); const key = `${t.project.key}-${t.number}`;
  for (const u of users) {
    sendSubtaskReminderEmail({ to: u.email, name: u.name, actor: actor.name, project: t.project.name, ticket: { key, title: t.title }, subtask: cur.title, link: `${WEB_URL()}/?ticket=${t.id}` })
      .then((r) => { if (!r.sent) console.warn(`[mail] subtask reminder to ${u.email} not sent: ${r.error}`); }).catch(console.error);
  }
  touched(t, req, `sent a reminder for subtask “${cur.title}”`);
  res.json({ ok: true, remindedAt: new Date().toISOString() });
}));
router.delete("/subtasks/:id", wrap(async (req, res) => {
  const cur = await prisma.subtask.findUnique({ where: { id: req.params.id } }); if (!cur) return res.status(404).json({ error: "Not found" });
  const t = await subtaskTicket(req, res, cur.ticketId); if (!t) return;
  await prisma.subtask.delete({ where: { id: cur.id } });
  touched(t, req, `removed subtask “${cur.title}”`);
  res.json({ ok: true });
}));

// ---------- GitHub repos attached to a task (anyone who can edit the task: its assignees and creator) ----------
router.post("/tickets/:id/repos", wrap(async (req, res) => {
  const t = await subtaskTicket(req, res, req.params.id); if (!t) return;
  const d = ticketRepoSchema.parse(req.body);
  const url = d.url.replace(/\/$/, "").replace(/\.git$/, "");
  if ((await prisma.ticketRepo.count({ where: { ticketId: t.id } })) >= 5) return res.status(400).json({ error: "A task can have up to 5 repositories" });
  if (await prisma.ticketRepo.findUnique({ where: { ticketId_url: { ticketId: t.id, url } } })) return res.status(409).json({ error: "That repository is already attached to this task" });
  const r = await prisma.ticketRepo.create({ data: { ticketId: t.id, url, branch: d.branch ?? null, addedById: req.user!.id } });
  touched(t, req, `attached repository ${url.replace("https://github.com/", "")}`);
  res.status(201).json(r);
}));
router.delete("/ticket-repos/:id", wrap(async (req, res) => {
  const cur = await prisma.ticketRepo.findUnique({ where: { id: req.params.id } }); if (!cur) return res.status(404).json({ error: "Not found" });
  const t = await subtaskTicket(req, res, cur.ticketId); if (!t) return;
  await prisma.ticketRepo.delete({ where: { id: cur.id } });
  touched(t, req, `removed repository ${cur.url.replace("https://github.com/", "")}`);
  res.json({ ok: true });
}));

router.delete("/tickets/:id", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  if (t.reporterId !== req.user!.id) return res.status(403).json({ error: "Only the person who created this ticket can delete it" });
  const key = withKey(t).key;
  const audience = await ticketAudience(t.id);
  await prisma.ticket.delete({ where: { id: t.id } });
  void notify({ userIds: audience, actor: actorOf(req), kind: "deleted", text: `deleted ${key} “${t.title}”`, projectId: t.projectId }).catch(console.error);
  publish({ type: "ticket.deleted", projectId: t.projectId, actor: actorOf(req), ticket: { id: t.id, key, title: t.title } });
  res.json({ ok: true });
}));

/** Posts a comment (shared by the web app and by agents). Handles replies, mentions, live events and inbox notifications. */
export async function postComment(o: { ticket: { id: string; projectId: string; title: string; number: number; project: { key: string } }; user: { id: string; name: string }; body: string; parentId?: string; viaAgent?: string }) {
  const t = o.ticket;
  let rootId: string | null = null, replyTo: { authorId: string } | null = null;
  if (o.parentId) { // replies are one level deep: replying to a reply attaches to the original comment
    const p = await prisma.comment.findFirst({ where: { id: o.parentId, ticketId: t.id }, select: { id: true, parentId: true, authorId: true } });
    if (!p) return { ok: false as const, status: 400, error: "The comment you're replying to no longer exists" };
    rootId = p.parentId ?? p.id; replyTo = p;
  }
  const via0 = o.viaAgent ?? currentVia();
  const c = await prisma.comment.create({ data: { ticketId: t.id, authorId: o.user.id, body: o.body, parentId: rootId, viaAgent: via0 ?? null }, include: { author: { select: userSelect } } });
  const key = `${t.project.key}-${t.number}`, who = o.user, via = via0 ? ` (via ${via0})` : "", excerpt = plainExcerpt(o.body);
  publish({ type: "comment.created", projectId: t.projectId, actor: who, ticket: { id: t.id, key, title: t.title }, body: excerpt + via, reply: !!rootId });
  const base = { actor: who, projectId: t.projectId, ticketId: t.id, kind: "comment" };
  const mentioned = await notifyMentions({ text: o.body, actor: who, projectId: t.projectId, ticketId: t.id, key, title: t.title }).catch((e) => { console.error(e); return [] as string[]; });
  if (replyTo && replyTo.authorId !== who.id && !mentioned.includes(replyTo.authorId)) void notify({ ...base, userIds: [replyTo.authorId], text: `replied to your comment on ${key}: “${excerpt}”${via}` }).catch(console.error);
  void ticketAudience(t.id).then((aud) => notify({ ...base, userIds: aud.filter((id) => id !== replyTo?.authorId && !mentioned.includes(id)), text: `${rootId ? "replied" : "commented"} on ${key}: “${excerpt}”${via}` })).catch(console.error);
  return { ok: true as const, comment: c };
}

router.post("/tickets/:id/comments", wrap(async (req, res) => {
  const t = await loadTicket(req, res); if (!t) return;
  const { body, parentId } = commentSchema.parse(req.body);
  const r = await postComment({ ticket: t, user: actorOf(req), body, parentId });
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.status(201).json(r.comment);
}));

// ---------- notifications (the bell) ----------
router.get("/notifications", wrap(async (req, res) => {
  const me = req.user!.id, limit = Math.min(Number(req.query.limit) || 40, 100);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: me, ...(req.query.unread === "1" ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId: me, readAt: null } }),
  ]);
  res.json({ items, unread });
}));
router.post("/notifications/read-all", wrap(async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true, marked: r.count });
}));
router.post("/notifications/:id/read", wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

void z;
