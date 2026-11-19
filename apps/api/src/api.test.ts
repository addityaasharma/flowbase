import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app";
import { prisma } from "./db";
import { hashToken } from "./tokens";
import { setPushSender } from "./push";
import { diskStorage, layered, r2Storage, setStorage, storage as realStorage } from "./uploads";
import { Readable } from "node:stream";

/**
 * Integration tests against a real database. They create their own users/projects (unique per run) and delete them afterwards.
 * Focus: the rules that protect people's data and the limits on what agents (tokens) may do.
 */
const tag = Math.random().toString(36).slice(2, 8);
const created = { users: [] as string[], projects: [] as string[] };
const api = () => request(app);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function signUp(name: string, verified = true) {
  const email = `${name.toLowerCase()}.${tag}@test.invalid`;
  const r = await api().post("/api/auth/register").send({ name, email, password: "password123" });
  expect(r.status).toBe(201);
  created.users.push(r.body.user.id);
  if (verified) await prisma.user.update({ where: { id: r.body.user.id }, data: { emailVerifiedAt: new Date() } });
  return { id: r.body.user.id as string, token: r.body.token as string, email };
}

let alice: Awaited<ReturnType<typeof signUp>>, bob: typeof alice, cara: typeof alice, dan: typeof alice;
let projectId: string, mine: any, bobs: any;

beforeAll(async () => {
  [alice, bob, cara, dan] = [await signUp("Alice"), await signUp("Bob"), await signUp("Cara"), await signUp("Dan")];
  const p = await api().post("/api/projects").set(auth(alice.token)).send({ name: "Test Co", key: "TC" });
  projectId = p.body.id; created.projects.push(projectId);
  for (const u of [bob, cara]) {
    const inv = await api().post("/api/invitations").set(auth(alice.token)).send({ email: u.email, projectId });
    await api().post("/api/invitations/accept").send({ token: inv.body.link.split("/").pop(), password: "password123" }).expect(201);
  }
  mine = (await api().post("/api/tickets").set(auth(alice.token)).send({ projectId, title: "Alice task", assigneeIds: [alice.id] })).body;
  bobs = (await api().post("/api/tickets").set(auth(alice.token)).send({ projectId, title: "Bob task", assigneeIds: [bob.id] })).body;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

describe("accounts", () => {
  it("rejects wrong passwords and weak signups, accepts the right one", async () => {
    expect((await api().post("/api/auth/login").send({ email: alice.email, password: "nope-nope" })).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: alice.email, password: "password123" })).status).toBe(200);
    expect((await api().post("/api/auth/register").send({ name: "x", email: `w.${tag}@test.invalid`, password: "123" })).status).toBe(400);
  });
  it("requires login for everything private", async () => {
    for (const p of ["/api/projects", "/api/tickets", "/api/notifications", "/api/tokens", "/api/auth/me"]) expect((await api().get(p)).status).toBe(401);
  });
  it("unverified accounts cannot create projects, invite or make tokens", async () => {
    const u = await signUp("Newbie", false);
    const r = await api().post("/api/projects").set(auth(u.token)).send({ name: "X", key: "XX" });
    expect(r.status).toBe(403); expect(r.body.code).toBe("EMAIL_UNVERIFIED");
    expect((await api().post("/api/tokens").set(auth(u.token)).send({ name: "t" })).status).toBe(403);
  });
  it("forgot-password answers the same for unknown and known emails", async () => {
    const a = await api().post("/api/auth/forgot").send({ email: "nobody@test.invalid" }), b = await api().post("/api/auth/forgot").send({ email: alice.email });
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(a.body).toEqual(b.body);
  });
  it("changing the password signs out every other session", async () => {
    const u = await signUp("Pw"); const other = (await api().post("/api/auth/login").send({ email: u.email, password: "password123" })).body.token;
    const r = await api().post("/api/auth/password").set(auth(u.token)).send({ currentPassword: "password123", newPassword: "another-pass-9" });
    expect(r.status).toBe(200);
    expect((await api().get("/api/auth/me").set(auth(other))).status).toBe(401);
    expect((await api().get("/api/auth/me").set(auth(u.token))).status).toBe(401); // the old token too...
    expect((await api().get("/api/auth/me").set(auth(r.body.token))).status).toBe(200); // ...but the fresh one works
  });
});

describe("privacy between projects", () => {
  it("a stranger sees nothing and cannot act", async () => {
    expect((await api().get("/api/projects").set(auth(dan.token))).body).toEqual([]);
    expect((await api().get("/api/tickets").set(auth(dan.token))).body).toEqual([]);
    expect((await api().get(`/api/tickets/${mine.id}`).set(auth(dan.token))).status).toBe(404);
    expect((await api().post("/api/tickets").set(auth(dan.token)).send({ projectId, title: "x" })).status).toBe(404);
    expect((await api().post("/api/invitations").set(auth(dan.token)).send({ email: "a@b.co", projectId })).status).toBe(404);
  });
  it("only a project admin can invite, rename or delete", async () => {
    expect((await api().post("/api/invitations").set(auth(bob.token)).send({ email: "a@b.co", projectId })).status).toBe(403);
    expect((await api().patch(`/api/projects/${projectId}`).set(auth(bob.token)).send({ name: "Hacked" })).status).toBe(403);
    expect((await api().delete(`/api/projects/${projectId}`).set(auth(bob.token))).status).toBe(403);
    expect((await api().patch(`/api/projects/${projectId}`).set(auth(alice.token)).send({ name: "Test Co", repoUrl: "https://github.com/acme/app.git/" })).body.repoUrl).toBe("https://github.com/acme/app");
    expect((await api().patch(`/api/projects/${projectId}`).set(auth(alice.token)).send({ repoUrl: "https://evil.example/x/y" })).status).toBe(400);
  });
  it("the last admin cannot be demoted or leave", async () => {
    expect((await api().patch(`/api/projects/${projectId}/members/${alice.id}`).set(auth(alice.token)).send({ role: "MEMBER" })).status).toBe(400);
    expect((await api().delete(`/api/projects/${projectId}/members/${alice.id}`).set(auth(alice.token))).status).toBe(400);
  });
});

describe("who can change a ticket", () => {
  it("only assignees and the creator can move or edit; everyone in the project can comment", async () => {
    expect((await api().post(`/api/tickets/${bobs.id}/move`).set(auth(cara.token)).send({ status: "DONE" })).status).toBe(403);
    expect((await api().patch(`/api/tickets/${bobs.id}`).set(auth(cara.token)).send({ title: "x" })).status).toBe(403);
    expect((await api().post(`/api/tickets/${bobs.id}/comments`).set(auth(cara.token)).send({ body: "nice" })).status).toBe(201);
    expect((await api().post(`/api/tickets/${bobs.id}/move`).set(auth(bob.token)).send({ status: "IN_PROGRESS" })).status).toBe(200);
    expect((await api().patch(`/api/tickets/${bobs.id}`).set(auth(alice.token)).send({ priority: "HIGH" })).status).toBe(200); // creator
  });
  it("only the creator can delete", async () => {
    expect((await api().delete(`/api/tickets/${bobs.id}`).set(auth(bob.token))).status).toBe(403);
    const t = (await api().post("/api/tickets").set(auth(alice.token)).send({ projectId, title: "temp" })).body;
    expect((await api().delete(`/api/tickets/${t.id}`).set(auth(alice.token))).status).toBe(200);
  });
  it("assignees must be project members", async () => {
    expect((await api().post("/api/tickets").set(auth(alice.token)).send({ projectId, title: "x", assigneeIds: [dan.id] })).status).toBe(400);
  });
  it("replies stay one level deep and must belong to the same ticket", async () => {
    const c1 = (await api().post(`/api/tickets/${mine.id}/comments`).set(auth(bob.token)).send({ body: "top" })).body;
    const r1 = (await api().post(`/api/tickets/${mine.id}/comments`).set(auth(alice.token)).send({ body: "reply", parentId: c1.id })).body;
    const r2 = (await api().post(`/api/tickets/${mine.id}/comments`).set(auth(bob.token)).send({ body: "reply to reply", parentId: r1.id })).body;
    expect(r2.parentId).toBe(c1.id);
    expect((await api().post(`/api/tickets/${bobs.id}/comments`).set(auth(alice.token)).send({ body: "x", parentId: c1.id })).status).toBe(400);
  });
  it("email confirmation links: both emails work, opening one signs that account in, reopening is harmless", async () => {
    const fay = await signUp("Fay", false);
    const other = await signUp("Gus"); // someone else, already signed in on the same browser
    const mk = async (raw: string) => prisma.authToken.create({ data: { userId: fay.id, kind: "verify", tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 864e5) } });
    await prisma.authToken.deleteMany({ where: { userId: fay.id } }); // drop the one sign-up emailed
    await mk(`first-${tag}-aaaaaaaaaaaa`); await mk(`second-${tag}-bbbbbbbbbbbb`); // two emails went out; the later one must not kill the earlier
    const r1 = await api().post("/api/auth/verify").set(auth(other.token)).send({ token: `first-${tag}-aaaaaaaaaaaa` });
    expect(r1.status).toBe(200);
    expect(r1.body.user.id).toBe(fay.id);          // the link's account, not the one that happened to be signed in
    expect(r1.body.user.emailVerified).toBe(true);
    expect((await api().get("/api/auth/me").set(auth(r1.body.token))).body.id).toBe(fay.id);
    const r2 = await api().post("/api/auth/verify").send({ token: `second-${tag}-bbbbbbbbbbbb` }); // the other email, opened afterwards
    expect(r2.status).toBe(200); expect(r2.body.alreadyVerified).toBe(true); expect(r2.body.token).toBeUndefined(); // fine, but no second session
    const r3 = await api().post("/api/auth/verify").send({ token: `first-${tag}-aaaaaaaaaaaa` }); // same link again
    expect(r3.status).toBe(200); expect(r3.body.token).toBeUndefined();
    expect((await api().post("/api/auth/verify").send({ token: `nonsense-${tag}-cccccccccc` })).status).toBe(400);
  });
  it("resend confirmation is not sent twice in a row", async () => {
    const hal = await signUp("Hal", false);
    for (let i = 0; i < 40 && !(await prisma.authToken.count({ where: { userId: hal.id, kind: "verify" } })); i++) await new Promise((r) => setTimeout(r, 50)); // sign-up emails in the background
    const before = await prisma.authToken.count({ where: { userId: hal.id, kind: "verify" } });
    const r = await api().post("/api/auth/resend-verification").set(auth(hal.token));
    expect(r.status).toBe(200); expect(r.body.throttled).toBe(true); // sign-up just sent one
    expect(await prisma.authToken.count({ where: { userId: hal.id, kind: "verify" } })).toBe(before);
  });
  it("push notifications: a device subscribes, gets notified about others' actions, and is forgotten when it is gone", async () => {
    const calls: { endpoint: string; url: string }[] = [];
    let gone = false;
    setPushSender(async (sub, payload) => { if (gone) throw Object.assign(new Error("gone"), { statusCode: 410 }); calls.push({ endpoint: sub.endpoint, url: payload.url }); });
    const endpoint = `https://push.test/${tag}/bob-phone`;
    try {
      expect((await api().post("/api/push/subscribe").send({ endpoint, keys: { p256dh: "x".repeat(20), auth: "y".repeat(12) } })).status).toBe(401);
      expect((await api().post("/api/push/subscribe").set(auth(bob.token)).send({ endpoint: "http://insecure.test/x", keys: { p256dh: "x".repeat(20), auth: "y".repeat(12) } })).status).toBe(400);
      expect((await api().post("/api/push/subscribe").set(auth(bob.token)).send({ endpoint, keys: { p256dh: "x".repeat(20), auth: "y".repeat(12) } })).status).toBe(201);
      const wait = async (n: number) => { for (let i = 0; i < 40 && calls.length < n; i++) await new Promise((r) => setTimeout(r, 50)); };
      await api().post(`/api/tickets/${bobs.id}/comments`).set(auth(alice.token)).send({ body: "ping bob" }); // someone else acts on bob's task
      await wait(1);
      expect(calls.some((c) => c.endpoint === endpoint && c.url === `/?ticket=${bobs.id}`)).toBe(true);
      const n = calls.length;
      await api().post(`/api/tickets/${bobs.id}/comments`).set(auth(bob.token)).send({ body: "my own comment" }); // his own action never notifies him
      await new Promise((r) => setTimeout(r, 300));
      expect(calls.length).toBe(n);
      gone = true; // the device was uninstalled: the push service answers 410 and we forget it
      await api().post(`/api/tickets/${bobs.id}/comments`).set(auth(alice.token)).send({ body: "again" });
      for (let i = 0; i < 40 && (await prisma.pushSubscription.count({ where: { endpoint } })); i++) await new Promise((r) => setTimeout(r, 50));
      expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
      // moving a device to another account, and signing out of it
      const ep2 = `https://push.test/${tag}/shared`;
      const keys = { p256dh: "x".repeat(20), auth: "y".repeat(12) };
      await api().post("/api/push/subscribe").set(auth(bob.token)).send({ endpoint: ep2, keys });
      await api().post("/api/push/subscribe").set(auth(cara.token)).send({ endpoint: ep2, keys });
      expect((await prisma.pushSubscription.findUnique({ where: { endpoint: ep2 } }))?.userId).toBe(cara.id);
      await api().post("/api/push/unsubscribe").set(auth(bob.token)).send({ endpoint: ep2 }); // someone else's device: untouched
      expect(await prisma.pushSubscription.count({ where: { endpoint: ep2 } })).toBe(1);
      await api().post("/api/push/unsubscribe").set(auth(cara.token)).send({ endpoint: ep2 });
      expect(await prisma.pushSubscription.count({ where: { endpoint: ep2 } })).toBe(0);
    } finally { setPushSender(null); }
  });
  it("the welcome tour is offered to new sign-ups once", async () => {
    const eve = await signUp("Eve");
    expect((await api().get("/api/auth/me").set(auth(eve.token))).body.tourSeen).toBe(false);
    expect((await api().post("/api/auth/tour-seen").set(auth(eve.token))).status).toBe(200);
    expect((await api().get("/api/auth/me").set(auth(eve.token))).body.tourSeen).toBe(true);
  });
  it("overdue + blocked: only the creator can unblock it or change the date", async () => {
    const t = (await api().post("/api/tickets").set(auth(alice.token)).send({ projectId, title: "Late", assigneeIds: [bob.id] })).body;
    expect((await api().patch(`/api/tickets/${t.id}`).set(auth(alice.token)).send({ status: "BLOCKED", dueDate: "2020-01-01" })).status).toBe(200);
    expect((await api().patch(`/api/tickets/${t.id}`).set(auth(bob.token)).send({ status: "IN_PROGRESS" })).status).toBe(403);
    expect((await api().patch(`/api/tickets/${t.id}`).set(auth(bob.token)).send({ dueDate: "2030-01-01" })).status).toBe(403);
    expect((await api().post(`/api/tickets/${t.id}/move`).set(auth(bob.token)).send({ status: "TODO" })).status).toBe(403);
    expect((await api().patch(`/api/tickets/${t.id}`).set(auth(bob.token)).send({ priority: "HIGH" })).status).toBe(409); // blocked = frozen until unblocked
    expect((await api().post(`/api/tickets/${t.id}/subtasks`).set(auth(bob.token)).send({ title: "x" })).status).toBe(409);
    expect((await api().post(`/api/tickets/${t.id}/comments`).set(auth(bob.token)).send({ body: "why blocked?" })).status).toBe(201); // discussing is still fine
    expect((await api().post(`/api/tickets/${t.id}/move`).set(auth(alice.token)).send({ status: "IN_PROGRESS" })).status).toBe(200);
    await api().post(`/api/tickets/${t.id}/move`).set(auth(alice.token)).send({ status: "DONE" }); // keep it out of later "open tasks" assertions
  });
  it("subtask assignees: only they can tick it, the bell works once", async () => {
    const mk = (b: object) => api().post(`/api/tickets/${bobs.id}/subtasks`).set(auth(alice.token)).send(b);
    expect((await mk({ title: "outsider", assigneeIds: [cara.id] })).status).toBe(400); // not on the ticket
    const st = (await mk({ title: "for bob", assigneeIds: [bob.id] })).body;
    expect(st.assigneeIds).toEqual([bob.id]);
    expect((await api().patch(`/api/subtasks/${st.id}`).set(auth(alice.token)).send({ done: true })).status).toBe(403);
    expect((await api().patch(`/api/subtasks/${st.id}`).set(auth(bob.token)).send({ done: true })).status).toBe(200);
    expect((await api().patch(`/api/subtasks/${st.id}`).set(auth(bob.token)).send({ status: "REVIEW" })).body).toMatchObject({ status: "REVIEW", done: false });
    expect((await api().patch(`/api/subtasks/${st.id}`).set(auth(alice.token)).send({ status: "DONE" })).status).toBe(403);
    const open = (await mk({ title: "open", assigneeIds: [bob.id] })).body;
    expect((await api().post(`/api/subtasks/${open.id}/remind`).set(auth(alice.token))).status).toBe(200);
    expect((await api().post(`/api/subtasks/${open.id}/remind`).set(auth(alice.token))).status).toBe(409);
    const nobody = (await mk({ title: "nobody" })).body;
    expect((await api().post(`/api/subtasks/${nobody.id}/remind`).set(auth(alice.token))).status).toBe(400);
  });
  it("subtasks and attached repos follow the same edit rule", async () => {
    expect((await api().post(`/api/tickets/${bobs.id}/subtasks`).set(auth(cara.token)).send({ title: "x" })).status).toBe(403);
    expect((await api().post(`/api/tickets/${bobs.id}/subtasks`).set(auth(bob.token)).send({ title: "do it" })).status).toBe(201);
    expect((await api().post(`/api/tickets/${bobs.id}/repos`).set(auth(cara.token)).send({ url: "https://github.com/c/x" })).status).toBe(403);
    expect((await api().post(`/api/tickets/${bobs.id}/repos`).set(auth(bob.token)).send({ url: "https://github.com/bob/fork.git" })).status).toBe(201);
    expect((await api().post(`/api/tickets/${bobs.id}/repos`).set(auth(bob.token)).send({ url: "https://gitlab.com/bob/fork" })).status).toBe(400);
  });
});

describe("agent tokens (Claude / MCP)", () => {
  let tokenA: string, tokenLocked: string;
  beforeAll(async () => {
    tokenA = (await api().post("/api/tokens").set(auth(bob.token)).send({ name: "Claude", canCommentOthers: true })).body.token;
    tokenLocked = (await api().post("/api/tokens").set(auth(bob.token)).send({ name: "Locked", canCommentOthers: false })).body.token;
  });
  it("tokens are stored only as hashes and never listed in full", async () => {
    const list = (await api().get("/api/tokens").set(auth(bob.token))).body;
    expect(JSON.stringify(list)).not.toContain(tokenA);
    expect(await prisma.apiToken.count({ where: { tokenHash: tokenA } })).toBe(0);
  });
  it("a token works only on agent endpoints, and a login only on the normal ones", async () => {
    expect((await api().get("/api/tickets").set(auth(tokenA))).status).toBe(401);
    expect((await api().get("/api/agent/tasks").set(auth(bob.token))).status).toBe(401);
    expect((await api().get("/api/agent/tasks")).status).toBe(401);
  });
  it("lists only the owner's assigned tasks, with repos", async () => {
    const r = await api().get("/api/agent/tasks").set(auth(tokenA));
    expect(r.body.map((t: any) => t.key)).toEqual([bobs.key]);
    expect(r.body[0].repos[0].url).toBe("https://github.com/bob/fork");
  });
  it("can read and comment on others' tasks only if the token allows it, and never move them", async () => {
    expect((await api().get(`/api/agent/tasks/${mine.id}`).set(auth(tokenA))).body.yourAccess).toContain("not assigned");
    expect((await api().get(`/api/agent/tasks/${mine.id}`).set(auth(tokenLocked))).status).toBe(404);
    expect((await api().post(`/api/agent/tasks/${mine.id}/comments`).set(auth(tokenA)).send({ body: "FYI" })).status).toBe(201);
    expect((await api().post(`/api/agent/tasks/${mine.id}/comments`).set(auth(tokenLocked)).send({ body: "x" })).status).toBe(404);
    expect((await api().post(`/api/agent/tasks/${mine.id}/status`).set(auth(tokenA)).send({ status: "DONE" })).status).toBe(403);
    expect((await api().post(`/api/agent/tasks/${bobs.id}/status`).set(auth(tokenA)).send({ status: "IN_REVIEW" })).status).toBe(200);
  });
  it("marks what an agent wrote", async () => {
    const d = (await api().get(`/api/tickets/${mine.id}`).set(auth(alice.token))).body;
    expect(d.comments.find((c: any) => c.body === "FYI").viaAgent).toBe("Claude");
  });
  it("cannot edit or delete through the agent surface", async () => {
    expect((await api().patch(`/api/agent/tasks/${bobs.id}`).set(auth(tokenA)).send({ title: "x" })).status).toBe(404);
    expect((await api().delete(`/api/agent/tasks/${bobs.id}`).set(auth(tokenA))).status).toBe(404);
  });
  it("speaks MCP: initialize, list tools, call a tool, reject bad calls", async () => {
    const rpc = (body: object, tok: string | null = tokenA) => { const r = api().post("/api/mcp"); return (tok ? r.set(auth(tok)) : r).send(body); };
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).body.result.serverInfo.name).toBe("flowbase");
    expect((await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).body.result.tools.map((t: any) => t.name)).toEqual(["list_projects", "list_my_tasks", "get_task", "comment_on_task", "set_task_status"]);
    const call = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_my_tasks", arguments: {} } });
    expect(JSON.parse(call.body.result.content[0].text)[0].key).toBe(bobs.key);
    const bad = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "set_task_status", arguments: { task: mine.key, status: "DONE" } } });
    expect(bad.body.result.isError).toBe(true);
    expect((await rpc({ jsonrpc: "2.0", id: 5, method: "ping" }, null)).status).toBe(401);
    expect((await api().get("/api/mcp")).status).toBe(405);
  });
  it("revoked tokens stop working immediately", async () => {
    const id = (await api().get("/api/tokens").set(auth(bob.token))).body.find((t: any) => t.name === "Locked").id;
    expect((await api().delete(`/api/tokens/${id}`).set(auth(bob.token))).status).toBe(200);
    expect((await api().get("/api/agent/me").set(auth(tokenLocked))).status).toBe(401);
  });
});

describe("token access levels (collaborator / full)", () => {
  let collab: string, full: string, aliceFull: string;
  beforeAll(async () => {
    collab = (await api().post("/api/tokens").set(auth(bob.token)).send({ name: "Collab", level: "collaborator" })).body.token;
    full = (await api().post("/api/tokens").set(auth(bob.token)).send({ name: "FullBob", level: "full" })).body.token;
    aliceFull = (await api().post("/api/tokens").set(auth(alice.token)).send({ name: "FullAlice", level: "full" })).body.token;
  });
  it("collaborator reads everything the owner can and raises + assigns tickets to several people", async () => {
    expect((await api().get("/api/projects").set(auth(collab))).status).toBe(200);
    const t = await api().post("/api/tickets").set(auth(collab)).send({ projectId, title: "From Claude", assigneeIds: [alice.id, bob.id] });
    expect(t.status).toBe(201);
    expect(t.body.assignees.length).toBe(2);
    const d = (await api().get(`/api/tickets/${t.body.id}`).set(auth(alice.token))).body;
    await new Promise((r) => setTimeout(r, 150)); const d2 = (await api().get(`/api/tickets/${t.body.id}`).set(auth(alice.token))).body; expect(d2.activities.some((x: any) => x.viaAgent === "Collab")).toBe(true); // marked "via Collab"
  });
  it("still bound by the owner's rights: bob's token can't edit a ticket bob can't edit", async () => {
    expect((await api().patch(`/api/tickets/${mine.id}`).set(auth(collab)).send({ title: "nope" })).status).toBe(403);
  });
  it("collaborator cannot delete or manage projects/members; full can only as far as the owner could", async () => {
    expect((await api().delete(`/api/tickets/${bobs.id}`).set(auth(collab))).status).toBe(403); // level
    expect((await api().delete(`/api/projects/${projectId}`).set(auth(full))).status).toBe(403); // bob isn't admin
    const t = (await api().post("/api/tickets").set(auth(aliceFull)).send({ projectId, title: "temp2" })).body;
    expect((await api().delete(`/api/tickets/${t.id}`).set(auth(aliceFull))).status).toBe(200); // alice is creator
  });
  it("no token can touch account security or mint tokens", async () => {
    for (const tok of [collab, full]) {
      expect((await api().post("/api/auth/password").set(auth(tok)).send({ currentPassword: "password123", newPassword: "hacked12345" })).status).toBe(403);
      expect((await api().post("/api/tokens").set(auth(tok)).send({ name: "backdoor", level: "full" })).status).toBe(403);
      expect((await api().get("/api/tokens").set(auth(tok))).status).toBe(403);
    }
    expect((await api().get("/api/auth/me").set(auth(collab))).status).toBe(200);
  });
  it("tasks-level tokens still can't use the normal API", async () => {
    const tasksTok = (await api().post("/api/tokens").set(auth(bob.token)).send({ name: "TasksOnly" })).body.token;
    expect((await api().get("/api/tickets").set(auth(tasksTok))).status).toBe(401);
  });
});

describe("image uploads", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  it("accepts real images, rejects other content (even with an image content-type) and requires login", async () => {
    expect((await api().post("/api/uploads").set("Content-Type", "image/png").send(png)).status).toBe(401);
    expect((await api().post("/api/uploads").set(auth(bob.token)).set("Content-Type", "image/png").send(Buffer.from("<script>alert(1)</script>"))).status).toBe(400);
    expect((await api().post("/api/uploads").set(auth(bob.token)).set("Content-Type", "image/svg+xml").send(Buffer.from("<svg onload=alert(1)/>"))).status).toBe(400);
    const ok = await api().post("/api/uploads").set(auth(bob.token)).set("Content-Type", "application/octet-stream").send(png);
    expect(ok.status).toBe(201);
    const got = await api().get(ok.body.url.replace("/api", "/api"));
    expect(got.status).toBe(200); expect(got.headers["x-content-type-options"]).toBe("nosniff"); expect(got.headers["content-type"]).toBe("image/png");
    await prisma.upload.deleteMany({ where: { name: ok.body.url.split("/").pop() } });
  });
  it("with R2: new images go to the bucket (not the disk), viewing redirects to R2, and old disk-only images are still served", async () => {
    // a tiny in-memory stand-in for the S3 client: understands put / get / delete by the command's input
    const bucket = new Map<string, { body: Buffer; type?: string }>();
    const fake = { async send(cmd: any) {
      const i = cmd.input, kind = cmd.constructor.name;
      if (kind === "PutObjectCommand") { bucket.set(i.Key, { body: i.Body, type: i.ContentType }); return {}; }
      if (kind === "DeleteObjectCommand") { bucket.delete(i.Key); return {}; }
      const o = bucket.get(i.Key); if (!o) throw Object.assign(new Error("nope"), { name: "NoSuchKey" });
      return { Body: Readable.from(o.body), ContentLength: o.body.length };
    } };
    const original = realStorage; // (an imported live binding: read it BEFORE swapping, or "restoring" would restore the fake)
    const withR2 = layered(r2Storage(fake, "test-bucket", async (n) => `https://r2.test/test-bucket/${n}?sig=abc`));
    setStorage(withR2);
    try {
      const up = await api().post("/api/uploads").set(auth(bob.token)).set("Content-Type", "image/png").send(png);
      expect(up.status).toBe(201);
      const name = up.body.url.split("/").pop() as string;
      expect(bucket.get(name)?.type).toBe("image/png");           // stored in the bucket...
      expect(await diskStorage.get(name)).toBeNull();               // ...and not on this server's disk
      // viewing it costs this server only a redirect: the browser fetches the bytes from R2 itself
      const got = await api().get(up.body.url).redirects(0);
      expect(got.status).toBe(302); expect(got.headers.location).toBe(`https://r2.test/test-bucket/${name}?sig=abc`);
      // an image that exists only on disk (uploaded before the move) is still served
      const old = "0123456789abcdef0123456789abcdef.png";
      await diskStorage.put(old, png, "image/png");
      expect((await api().get(`/api/uploads/${old}`)).status).toBe(200);
      await diskStorage.del(old);
      // deleting removes it from the bucket too
      await withR2.del(name);
      expect(bucket.has(name)).toBe(false);
      await prisma.upload.deleteMany({ where: { name } });
    } finally { setStorage(original); }
  });
  it("never serves anything outside the uploads folder", async () => {
    for (const p of ["/api/uploads/..%2f..%2fpackage.json", "/api/uploads/00000000000000000000000000000000.png", "/api/uploads/x.png"]) expect((await api().get(p)).status).toBe(404);
  });
});
