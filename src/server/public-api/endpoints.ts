import { z, type ZodTypeAny } from "zod";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { createNodeSchema, nodeTypeSchema, patchNodeSchema } from "@/modules/nodes/schemas";
import { createComment, createCommentSchema, listComments } from "@/server/services/comments";
import { activitySchema, createActivity, listActivities, listActivitiesSchema } from "@/server/services/crm/activities";
import { companyFieldsSchema, createCompany, createCompanySchema, getCompany, listCompanies, listCompaniesSchema, patchCompanySchema, updateCompany } from "@/server/services/crm/companies";
import { createContact, createContactSchema, getContact, listContacts, listContactsSchema, patchContactSchema, updateContact } from "@/server/services/crm/contacts";
import { createDeal, createDealSchema, getDeal, listDeals, listDealsSchema, moveDeal, moveDealSchema, patchDealSchema, updateDeal } from "@/server/services/crm/deals";
import { loadNode } from "@/server/services/nodes/access";
import { nodeDto } from "@/server/services/nodes/batch";
import { archiveNode, createNode, patchNode, transact } from "@/server/services/nodes/ops";
import { getNodeDetail, getTree, listProjects } from "@/server/services/nodes/queries";
import { addEntry, entrySchema, listEntries } from "@/server/services/time";
import type { TokenContext } from "./tokens";

void companyFieldsSchema; // exported for the OpenAPI document of the company body

export interface Page {
  page: number;
  pageSize: number;
}

export interface Ctx {
  t: TokenContext;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  page: Page;
}

export type Result = { status?: number; data: unknown } | { items: unknown[]; total?: number };

export interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  tag: string;
  /** Needs a token with the `write` scope. */
  write: boolean;
  paged: boolean;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  run(c: Ctx): Promise<Result>;
}

function ep<Q extends ZodTypeAny = ZodTypeAny, B extends ZodTypeAny = ZodTypeAny>(
  def: Omit<Endpoint, "run" | "write" | "paged" | "query" | "body"> & { write?: boolean; paged?: boolean; query?: Q; body?: B; run(c: Omit<Ctx, "query" | "body"> & { query: z.infer<Q>; body: z.infer<B> }): Promise<Result> },
): Endpoint {
  return { write: def.method !== "GET", paged: false, ...def, run: def.run as unknown as Endpoint["run"] } as Endpoint;
}

/** A token is bound to one workspace: whatever it names must live there, or it does not exist for it. */
async function inWorkspace(t: TokenContext, nodeId: string): Promise<void> {
  const n = await db.node.findUnique({ where: { id: nodeId }, select: { workspaceId: true } });
  if (!n || n.workspaceId !== t.workspaceId) throw notFound("resource");
}

const slice = <T>(all: T[], p: Page): Result => ({ items: all.slice((p.page - 1) * p.pageSize, p.page * p.pageSize), total: all.length });
const one = (data: unknown, status = 200): Result => ({ data, status });

const upd = z.object({ updatedSince: z.string().datetime().optional(), projectId: z.string(), type: nodeTypeSchema.optional(), includeArchived: z.coerce.boolean().default(false) });
// The list schemas of the CRM services carry their own page/pageSize; the public API paginates with limit/cursor instead.
const noPaging = <T extends z.ZodRawShape>(s: z.ZodObject<T>) => s.omit({ page: true, pageSize: true } as never) as unknown as ZodTypeAny;

export const endpoints: Endpoint[] = [
  // projects and nodes
  ep({ method: "GET", path: "/projects", summary: "List projects", tag: "Projects", paged: true, run: async ({ t, page }) => slice(await listProjects(t.userId, t.workspaceId), page) }),
  ep({ method: "GET", path: "/projects/{id}", summary: "A project with all its nodes (flat), progress and health for today", tag: "Projects", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await getTree(t.userId, params.id!))) }),
  ep({
    method: "GET",
    path: "/nodes",
    summary: "Nodes of a project, oldest change first; pass `updatedSince` to sync changes",
    tag: "Nodes",
    paged: true,
    query: upd,
    run: async ({ t, query, page }) => {
      await inWorkspace(t, query.projectId);
      await loadNode(db, t.userId, query.projectId);
      const where = { workspaceId: t.workspaceId, OR: [{ id: query.projectId }, { rootId: query.projectId }], ...(query.type ? { type: query.type } : {}), ...(query.includeArchived ? {} : { archivedAt: null }), ...(query.updatedSince ? { updatedAt: { gt: new Date(query.updatedSince) } } : {}) };
      const [total, rows] = await Promise.all([db.node.count({ where }), db.node.findMany({ where, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], skip: (page.page - 1) * page.pageSize, take: page.pageSize })]);
      return { total, items: rows.map(nodeDto) };
    },
  }),
  ep({ method: "GET", path: "/nodes/{id}", summary: "One node with tags, links, attachments and breadcrumb", tag: "Nodes", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await getNodeDetail(t.userId, params.id!))) }),
  ep({
    method: "POST",
    path: "/nodes",
    summary: "Create a node",
    tag: "Nodes",
    body: createNodeSchema,
    run: async ({ t, body }) => {
      if (!body.parentId) throw new ApiError(422, "parent_required", "Give the id of the parent node; projects are created in the app");
      await inWorkspace(t, body.parentId);
      const { result } = await transact(t.userId, (ctx) => createNode(ctx, body));
      return one(nodeDto(result), 201);
    },
  }),
  ep({
    method: "PATCH",
    path: "/nodes/{id}",
    summary: "Change fields of a node (only the fields you send)",
    tag: "Nodes",
    body: patchNodeSchema,
    run: async ({ t, params, body }) => {
      await inWorkspace(t, params.id!);
      const { result } = await transact(t.userId, (ctx) => patchNode(ctx, params.id!, body));
      return one(nodeDto(result));
    },
  }),
  ep({
    method: "DELETE",
    path: "/nodes/{id}",
    summary: "Archive a node and its subtree (restorable in the app)",
    tag: "Nodes",
    run: async ({ t, params }) => {
      await inWorkspace(t, params.id!);
      const { result } = await transact(t.userId, (ctx) => archiveNode(ctx, params.id!));
      return one({ ids: result.ids, archivedAt: result.archivedAt });
    },
  }),
  ep({ method: "GET", path: "/nodes/{id}/comments", summary: "Comments of a node", tag: "Comments", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await listComments(t.userId, params.id!))) }),
  ep({ method: "POST", path: "/nodes/{id}/comments", summary: "Add a comment (ProseMirror JSON body)", tag: "Comments", body: createCommentSchema, run: async ({ t, params, body }) => (await inWorkspace(t, params.id!), one(await createComment(t.userId, params.id!, body), 201)) }),
  ep({ method: "GET", path: "/nodes/{id}/time", summary: "Time entries of a task", tag: "Time", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await listEntries(t.userId, params.id!))) }),
  ep({ method: "POST", path: "/nodes/{id}/time", summary: "Log time on a task as the token's owner", tag: "Time", body: entrySchema, run: async ({ t, params, body }) => (await inWorkspace(t, params.id!), one(await addEntry(t.userId, params.id!, body), 201)) }),

  // CRM
  ep({ method: "GET", path: "/contacts", summary: "List contacts", tag: "CRM", paged: true, query: noPaging(listContactsSchema), run: async ({ t, query, page }) => ({ ...(await listContacts(t.userId, t.workspaceId, { ...(listContactsSchema.parse({ ...query, ...page })) })) }) }),
  ep({ method: "GET", path: "/contacts/{id}", summary: "One contact", tag: "CRM", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await getContact(t.userId, params.id!))) }),
  ep({ method: "POST", path: "/contacts", summary: "Create a contact (409 on a duplicate unless allowDuplicate)", tag: "CRM", body: createContactSchema, run: async ({ t, body }) => one(await createContact(t.userId, t.workspaceId, body), 201) }),
  ep({ method: "PATCH", path: "/contacts/{id}", summary: "Change a contact", tag: "CRM", body: patchContactSchema, run: async ({ t, params, body }) => (await inWorkspace(t, params.id!), one(await updateContact(t.userId, params.id!, body))) }),
  ep({ method: "GET", path: "/companies", summary: "List companies", tag: "CRM", paged: true, query: noPaging(listCompaniesSchema), run: async ({ t, query, page }) => ({ ...(await listCompanies(t.userId, t.workspaceId, listCompaniesSchema.parse({ ...query, ...page }))) }) }),
  ep({ method: "GET", path: "/companies/{id}", summary: "One company", tag: "CRM", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await getCompany(t.userId, params.id!))) }),
  ep({ method: "POST", path: "/companies", summary: "Create a company", tag: "CRM", body: createCompanySchema, run: async ({ t, body }) => one(await createCompany(t.userId, t.workspaceId, body), 201) }),
  ep({ method: "PATCH", path: "/companies/{id}", summary: "Change a company", tag: "CRM", body: patchCompanySchema, run: async ({ t, params, body }) => (await inWorkspace(t, params.id!), one(await updateCompany(t.userId, params.id!, body))) }),
  ep({ method: "GET", path: "/deals", summary: "List deals", tag: "CRM", paged: true, query: noPaging(listDealsSchema), run: async ({ t, query, page }) => ({ ...(await listDeals(t.userId, t.workspaceId, listDealsSchema.parse({ ...query, ...page }))) }) }),
  ep({ method: "GET", path: "/deals/{id}", summary: "One deal", tag: "CRM", run: async ({ t, params }) => (await inWorkspace(t, params.id!), one(await getDeal(t.userId, params.id!))) }),
  ep({ method: "POST", path: "/deals", summary: "Create a deal", tag: "CRM", body: createDealSchema, run: async ({ t, body }) => one(await createDeal(t.userId, t.workspaceId, body), 201) }),
  ep({ method: "PATCH", path: "/deals/{id}", summary: "Change a deal", tag: "CRM", body: patchDealSchema, run: async ({ t, params, body }) => (await inWorkspace(t, params.id!), one(await updateDeal(t.userId, params.id!, body))) }),
  ep({ method: "POST", path: "/deals/{id}/move", summary: "Move a deal to another stage of its pipeline", tag: "CRM", body: moveDealSchema, run: async ({ t, params, body }) => (await inWorkspace(t, params.id!), one(await moveDeal(t.userId, params.id!, body))) }),
  ep({ method: "GET", path: "/activities", summary: "List CRM activities", tag: "CRM", paged: true, query: noPaging(listActivitiesSchema), run: async ({ t, query, page }) => ({ ...(await listActivities(t.userId, t.workspaceId, listActivitiesSchema.parse({ ...query, ...page }))) }) }),
  ep({ method: "POST", path: "/activities", summary: "Log a CRM activity", tag: "CRM", body: activitySchema, run: async ({ t, body }) => one(await createActivity(t.userId, t.workspaceId, body), 201) }),
];

/** `/nodes/{id}/comments` → a matcher that returns the named segments. */
export function matcher(path: string): (p: string) => Record<string, string> | null {
  const names: string[] = [];
  const re = new RegExp(`^${path.replace(/\{(\w+)\}/g, (_m, n: string) => (names.push(n), "([^/]+)"))}$`);
  return (p) => {
    const m = re.exec(p);
    return m ? Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1] as string)])) : null;
  };
}
