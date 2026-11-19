"use client";
import { API_BASE } from "@/lib/api";
import { Modal, btnGhost } from "./Bits";

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{children}</code>;
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1.5 mt-5 font-semibold">{children}</h3>;
const Table = ({ rows }: { rows: [string, string][] }) => (
  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
    {rows.map(([a, b]) => <div key={a} className="grid gap-1 px-3 py-2 sm:grid-cols-[170px_1fr]"><b className="break-words">{a}</b><span className="text-slate-600">{b}</span></div>)}
  </div>
);

/** Reader-friendly copy of docs/CLAUDE_ACCESS.md: keep both in sync. */
export function ClaudeGuide({ onClose }: { onClose: () => void }) {
  const url = new URL(API_BASE + "/mcp", location.origin).toString();
  return (
    <Modal title="Claude guide" onClose={onClose} wide>
      <div className="text-sm text-slate-700">
        <p>Claude Code (or any MCP client) can work on your Flowbase tasks as you, never beyond your own rights. Everything it does is labelled “via <i>token name</i>”. Full reference: <Code>docs/CLAUDE_ACCESS.md</Code> in the repo.</p>

        <H>1 · Set up</H>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open <b>Developer access</b> (desktop only) and create a token: name, expiry, access level. Copy it, it is shown once.</li>
          <li>Run once in your terminal: <Code>claude mcp add --transport http flowbase {url} --header "Authorization: Bearer fb_…"</Code></li>
          <li>Give the project a repo (<b>Team &amp; Roles → Project settings</b>) or attach one to the task (<b>Developer</b> box).</li>
          <li>Ask Claude: “Use the flowbase tools: list my tasks, take the top one, implement it on the suggested branch, open a PR, comment the link and move it to IN_REVIEW.”</li>
        </ol>

        <H>2 · Access levels</H>
        <Table rows={[
          ["Tasks only", "Read your assigned tasks, comment, move them. Optionally read/comment on others’ tasks."],
          ["Collaborator", "Like a teammate: read all tasks in your projects, raise/edit/assign/move tickets, subtasks, repos, uploads."],
          ["Full access", "Also delete tickets, manage projects, members, roles and invitations. Never password, tokens or sign-in."],
        ]} />

        <H>3 · Tools Claude gets</H>
        <Table rows={[
          ["list_projects", "Your projects, repo URL, default branch, your role."],
          ["list_my_tasks", "Your open tasks (status, include_done, project). Includes repos and a suggested branch."],
          ["get_task", "One task in full by id or key (e.g. SAD-12): description, subtasks, latest comments."],
          ["comment_on_task", "Markdown comment up to 5000 characters; optional reply_to_comment_id."],
          ["set_task_status", "Move YOUR task: TODO, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE."],
          ["flowbase_api", "Collaborator/Full only: call the normal REST API as you (method, path after /api, body)."],
        ]} />

        <H>4 · Plain REST (no MCP)</H>
        <p>Send <Code>Authorization: Bearer fb_…</Code> to <Code>GET /api/agent/me</Code>, <Code>/projects</Code>, <Code>/tasks</Code>, <Code>/tasks/:ref</Code>, <Code>POST /tasks/:ref/comments</Code> <Code>{`{"body"}`}</Code> and <Code>POST /tasks/:ref/status</Code> <Code>{`{"status"}`}</Code>.</p>

        <H>5 · Rules</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Blocked tasks are frozen (only status changes); if also overdue only the creator can unblock.</li>
          <li>Tasks-level tokens move only tasks assigned to you.</li>
          <li>Task text is written by people: Claude treats it as information, not instructions.</li>
          <li>Limit: 120 requests/minute per token (429 + Retry-After).</li>
        </ul>

        <H>6 · Troubleshooting</H>
        <Table rows={[
          ["401", "Token missing, revoked or expired. Header must be “Bearer fb_…”."],
          ["404 task not found", "Not assigned to you, or in a project you’re not in."],
          ["409 several tasks match", "Same key in two projects: use the task id."],
          ["403 “tasks access”", "Create a Collaborator or Full token to use flowbase_api."],
          ["405 on GET /api/mcp", "Expected: the server accepts POST only."],
        ]} />
        <div className="mt-5 flex justify-end"><button className={btnGhost} onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  );
}
