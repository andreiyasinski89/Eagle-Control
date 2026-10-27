import { zodToJsonSchema } from "zod-to-json-schema";
import { endpoints } from "@/server/public-api/endpoints";

type Args = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  /** Tools that change nothing stay visible to read-only tokens. */
  readOnly: boolean;
  destructive: boolean;
  inputSchema: Record<string, unknown>;
  /** What the public API is asked: the same endpoint, token, scope, rate limit and audit as the REST API. */
  request(args: Args): { method: string; path: string; search: URLSearchParams; body?: unknown };
}

interface Spec {
  name: string;
  title: string;
  description: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  destructive?: boolean;
  /** Arguments that replace the endpoint's own schema, together with the body they are turned into. */
  custom?: { properties: Record<string, unknown>; required: string[]; body: (rest: Args) => unknown };
}

const PAGING = {
  limit: { type: "integer", minimum: 1, maximum: 100, description: "Items per page (default 25)" },
  cursor: { type: "string", description: "`nextCursor` of the previous page to get the next one" },
};

const text = (description: string) => ({ type: "string", description });

function schemaOf(spec: Spec): Record<string, unknown> {
  const e = endpoints.find((x) => x.method === spec.method && x.path === spec.path);
  if (!e) throw new Error(`MCP tool ${spec.name} points at an unknown endpoint ${spec.method} ${spec.path}`);
  const own = spec.custom ? null : e.method === "GET" ? e.query : e.body;
  const base = own ? (zodToJsonSchema(own, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>) : { type: "object" };
  delete base.$schema;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const id of spec.path.match(/\{(\w+)\}/g) ?? []) {
    const name = id.slice(1, -1);
    properties[name] = text(name === "id" ? "The id of the item (from a list or search result)" : name);
    required.push(name);
  }
  Object.assign(properties, (base.properties as Record<string, unknown> | undefined) ?? {}, spec.custom?.properties ?? {});
  if (e.paged) Object.assign(properties, PAGING);
  required.push(...[...((base.required as string[] | undefined) ?? []), ...(spec.custom?.required ?? [])].filter((r) => !required.includes(r)));
  return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

function build(spec: Spec): Tool {
  const e = endpoints.find((x) => x.method === spec.method && x.path === spec.path);
  if (!e) throw new Error(`MCP tool ${spec.name} points at an unknown endpoint ${spec.method} ${spec.path}`);
  const names = (spec.path.match(/\{(\w+)\}/g) ?? []).map((n) => n.slice(1, -1));
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    readOnly: spec.method === "GET",
    destructive: spec.destructive ?? false,
    inputSchema: schemaOf(spec),
    request(args) {
      const rest: Args = { ...args };
      let path = spec.path;
      for (const n of names) {
        const v = rest[n];
        if (typeof v !== "string" || !v) throw new Error(`\`${n}\` is required`);
        path = path.replace(`{${n}}`, encodeURIComponent(v));
        delete rest[n];
      }
      const search = new URLSearchParams();
      for (const k of ["limit", "cursor"]) {
        if (rest[k] !== undefined && e.paged) search.set(k, String(rest[k]));
        if (e.paged) delete rest[k];
      }
      if (spec.method === "GET") {
        for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) search.set(k, String(v));
        return { method: "GET", path, search };
      }
      return { method: spec.method, path, search, body: spec.custom ? spec.custom.body(rest) : rest };
    },
  };
}

const paragraphs = (t: string) => ({
  type: "doc",
  content: t
    .split(/\n{1,}/)
    .filter((p) => p.trim())
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
});

const SPECS: Spec[] = [
  { name: "list_projects", title: "List projects", description: "Projects of the connected workspace with progress and health. Start here to find a project id.", method: "GET", path: "/projects" },
  { name: "get_project", title: "Get a project", description: "A project with all its nodes (epics, sprints, tasks, subtasks, documents, events) as a flat list with parent ids, plus progress and health.", method: "GET", path: "/projects/{id}" },
  { name: "list_nodes", title: "List nodes of a project", description: "Nodes of one project, oldest change first. Filter by type, or pass `updatedSince` to see what changed.", method: "GET", path: "/nodes" },
  { name: "get_node", title: "Get a node", description: "One node (task, epic, sprint, document, event…) with tags, links, attachments and breadcrumb.", method: "GET", path: "/nodes/{id}" },
  { name: "search", title: "Search nodes", description: "Search nodes by title across the workspace, or inside one project.", method: "GET", path: "/search" },
  { name: "create_node", title: "Create a task, epic, sprint, document or event", description: "Create a node under a parent. `parentId` is a project id (for epics, documents, events) or the id of an epic/sprint/task (for tasks and subtasks). Dates are ISO 8601 in UTC. For an event put startsAt/endsAt (and optionally attendeeIds, location, meetingUrl, agenda) inside `data`.", method: "POST", path: "/nodes" },
  { name: "create_tasks", title: "Create tasks with subtasks", description: "Create several tasks at once, each with its own list of subtasks, under one epic or sprint (`parentId`). Optionally give them all an assignee (`assigneeId`) and a deadline (`dueDate`, ISO 8601). Use this instead of many create_node calls when making a task list.", method: "POST", path: "/nodes/task-tree" },
  { name: "update_node", title: "Update a node", description: "Change only the fields you send: title, description, status, dates, assignee, estimation, progress, `data`.", method: "PATCH", path: "/nodes/{id}" },
  { name: "archive_node", title: "Archive a node", description: "Archive a node and everything under it. It can be restored in the app.", method: "DELETE", path: "/nodes/{id}", destructive: true },
  {
    name: "add_comment",
    title: "Comment on a node",
    description: "Add a plain-text comment to a node. Blank lines start a new paragraph.",
    method: "POST",
    path: "/nodes/{id}/comments",
    custom: { properties: { text: text("The comment") }, required: ["text"], body: (rest) => ({ body: paragraphs(String(rest.text ?? "")), mentions: [], parentCommentId: null }) },
  },
  { name: "list_comments", title: "List comments of a node", description: "Comments of a node, oldest first.", method: "GET", path: "/nodes/{id}/comments" },
  { name: "log_time", title: "Log time on a task", description: "Log time on a task as the connected person.", method: "POST", path: "/nodes/{id}/time" },
  { name: "get_calendar", title: "Calendar", description: "Everything dated in a window of up to two months: task deadlines, events, CRM follow-ups and deal dates. Times are UTC. `mine=1` limits it to the connected person.", method: "GET", path: "/calendar" },
  { name: "my_day", title: "My day", description: "The connected person's day: what is due, meetings, follow-ups and what needs attention.", method: "GET", path: "/my-day" },
  { name: "list_contacts", title: "List contacts", description: "CRM contacts; `q` searches names, e-mails and phones.", method: "GET", path: "/contacts" },
  { name: "get_contact", title: "Get a contact", description: "One CRM contact.", method: "GET", path: "/contacts/{id}" },
  { name: "create_contact", title: "Create a contact", description: "Create a CRM contact. A duplicate by e-mail or phone is refused unless allowDuplicate is true.", method: "POST", path: "/contacts" },
  { name: "update_contact", title: "Update a contact", description: "Change only the fields you send.", method: "PATCH", path: "/contacts/{id}" },
  { name: "list_companies", title: "List companies", description: "CRM companies; `q` searches by name.", method: "GET", path: "/companies" },
  { name: "get_company", title: "Get a company", description: "One CRM company.", method: "GET", path: "/companies/{id}" },
  { name: "create_company", title: "Create a company", description: "Create a CRM company.", method: "POST", path: "/companies" },
  { name: "update_company", title: "Update a company", description: "Change only the fields you send.", method: "PATCH", path: "/companies/{id}" },
  { name: "list_deals", title: "List deals", description: "CRM deals, optionally by pipeline, stage or owner.", method: "GET", path: "/deals" },
  { name: "get_deal", title: "Get a deal", description: "One CRM deal with its stage, value and next step.", method: "GET", path: "/deals/{id}" },
  { name: "create_deal", title: "Create a deal", description: "Create a CRM deal in a pipeline stage (the default pipeline and first stage when not given).", method: "POST", path: "/deals" },
  { name: "update_deal", title: "Update a deal", description: "Change only the fields you send.", method: "PATCH", path: "/deals/{id}" },
  { name: "move_deal", title: "Move a deal to a stage", description: "Move a deal to another stage of its pipeline. Moving to a lost stage needs `lostReasonId`.", method: "POST", path: "/deals/{id}/move" },
  { name: "list_activities", title: "List CRM activities", description: "Calls, meetings, e-mails, notes and follow-ups logged in the CRM.", method: "GET", path: "/activities" },
  { name: "log_activity", title: "Log a CRM activity", description: "Log a call, meeting, e-mail, note or follow-up on a contact, company or deal.", method: "POST", path: "/activities" },
];

export const TOOLS: Tool[] = SPECS.map(build);
export const toolByName = new Map(TOOLS.map((t) => [t.name, t]));
