"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { useMembers } from "@/features/crm/hooks";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { parseTaskOutline } from "@/modules/nodes/task-outline";
import { todayIn } from "@/modules/views/tz";
import { useTimeZone } from "./useTimeZone";

const NEW_EPIC = "__new__";
const LAST_PROJECT = "meetowl:lastTaskProject";

const remembered = (): string | null => {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
};

interface TreeNode {
  id: string;
  type: string;
  title: string;
  parentId?: string | null;
  /** Where a sprint sits ("Frontend"), so two sprints called "Sprint 1" can be told apart. */
  context?: string;
}

/**
 * Makes a list of tasks, each with its own subtasks, from lines of text: one line is one task, an indented line
 * (or a line starting with a dash under a plain one) is a subtask of the task above it. They are created together, in one go.
 *
 * On the page of a project the project is known: pass `project` and the project's `lists` (its epics and sprints) and the
 * dialog does not ask for the project; `listId` picks the list the tasks go to first.
 */
export function CreateTasksDialog({ open, onClose, workspaceId, slug, onCreated, project, lists, listId }: { open: boolean; onClose: () => void; workspaceId: string; slug: string; onCreated: (made: { tasks: number; subtasks: number }, due: string | null) => void; project?: { id: string; title: string }; lists?: TreeNode[]; listId?: string | null }) {
  const t = useTranslations("mytasks");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { userId, tz, loaded: zoneLoaded } = useTimeZone();
  const members = useMembers(workspaceId);
  const [projectId, setProjectId] = useState("");
  const [parentId, setParentId] = useState("");
  const [epicName, setEpicName] = useState("");
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState<string>("me");
  const [due, setDue] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After "create and add next": how many were just made, and the epic made on the way (so the next batch goes under it too). */
  const [notice, setNotice] = useState<string | null>(null);
  const [madeEpics, setMadeEpics] = useState<TreeNode[]>([]);
  const outlineRef = useRef<HTMLTextAreaElement>(null);

  const fixed = !!project;
  const projects = useQuery({ queryKey: ["projects", workspaceId], enabled: open && !fixed, queryFn: () => api.get<{ id: string; title: string }[]>(`/api/v1/workspaces/${workspaceId}/projects`) });
  const tree = useQuery({ queryKey: ["project-tree", projectId], enabled: open && !!projectId && !fixed, queryFn: () => api.get<{ nodes: TreeNode[] }>(`/api/v1/projects/${projectId}/tree`) });
  const parents = useMemo(() => {
    const base = fixed ? (lists ?? []) : (tree.data?.nodes ?? []);
    const all = [...base, ...madeEpics.filter((e) => !base.some((b) => b.id === e.id))];
    const byId = new Map(all.map((n) => [n.id, n]));
    return all.filter((n) => n.type === "EPIC" || n.type === "SPRINT").map((n) => ({ ...n, context: n.context ?? (n.type === "SPRINT" && n.parentId ? byId.get(n.parentId)?.title : undefined) }));
  }, [fixed, lists, tree.data, madeEpics]);
  const loaded = fixed || tree.isSuccess;
  const outline = useMemo(() => parseTaskOutline(text), [text]);

  // A fresh form for every opening.
  useEffect(() => {
    if (!open) return;
    setText("");
    setDue("");
    setDueTouched(false);
    setNotice(null);
    setMadeEpics([]);
    setAssignee("me");
    setEpicName("");
    setParentId(listId ?? "");
    setError(null);
    if (project) setProjectId(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh form per opening
  }, [open]);

  // The date for all starts as today (in the person's own time zone) until they choose another or clear it.
  useEffect(() => {
    if (open && zoneLoaded && !dueTouched) setDue(todayIn(tz));
  }, [open, zoneLoaded, dueTouched, tz]);

  useEffect(() => {
    const list = projects.data;
    if (!open || fixed || !list?.length) return;
    setProjectId((cur) => (list.some((p) => p.id === cur) ? cur : (list.find((p) => p.id === remembered()) ?? (list[0] as { id: string })).id));
  }, [open, fixed, projects.data]);

  // Under the first epic by default; a project with none gets a new one.
  useEffect(() => {
    if (!open || !projectId || !loaded) return;
    setParentId((cur) => (cur === NEW_EPIC || parents.some((p) => p.id === cur) ? cur : (parents[0]?.id ?? NEW_EPIC)));
  }, [open, projectId, loaded, parents]);

  const create = useMutation({
    // What was sent is remembered with the request: the person may already be typing the next list when it comes back.
    mutationFn: async (v: { keepOpen: boolean; text: string; made: { tasks: number; subtasks: number }; due: string }) => {
      let under = parentId;
      if (under === NEW_EPIC || !under) {
        const epic = await api.post<{ node: { id: string } }>("/api/v1/nodes", { parentId: projectId, type: "EPIC", title: epicName.trim() || t("defaultEpic") });
        under = epic.node.id;
        setMadeEpics((cur) => [...cur, { id: under, type: "EPIC", title: epicName.trim() || t("defaultEpic") }]);
        setParentId(under);
      }
      return api.post("/api/v1/nodes/task-tree", {
        parentId: under,
        tasks: parseTaskOutline(v.text).tasks,
        assigneeId: assignee === "me" ? userId : assignee || null,
        dueDate: v.due ? `${v.due}T00:00:00.000Z` : null,
      });
    },
    onSuccess: async (_r, v) => {
      try {
        localStorage.setItem(LAST_PROJECT, projectId);
      } catch {
        /* only a convenience */
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["my-tasks"] }), qc.invalidateQueries({ queryKey: ["my-day"] }), qc.invalidateQueries({ queryKey: ["project-tree", projectId] })]);
      onCreated(v.made, v.due || null);
      if (v.keepOpen) {
        // The next one: same project, list, assignee and date; only the text starts afresh (and stays if the person has already begun the next list).
        setNotice(t("madeNext", { n: v.made.tasks + v.made.subtasks }));
        setText((cur) => (cur === v.text ? "" : cur));
        setError(null);
        outlineRef.current?.focus();
        return;
      }
      onClose();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("createFailed")),
  });

  const send = (keepOpen: boolean) => create.mutate({ keepOpen, text, made: outline.count, due });

  const noProjects = !fixed && projects.isSuccess && projects.data.length === 0;

  return (
    <Modal open={open} onClose={onClose} title={t("createTitle")} wide>
      {noProjects ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>{t("needProject")}</p>
          <Button asChild size="sm" className="w-fit">
            <Link href={`/w/${slug}/projects`}>{t("openProjects")}</Link>
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (outline.count.tasks === 0) return setError(t("problemEmpty"));
            if (!projectId) return setError(t("problemProject"));
            send(false);
          }}
        >
          <div className={fixed ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
            {!fixed && (
              <FormField label={t("project")}>
                <select className={selectClass} value={projectId} disabled={!projects.isSuccess} onChange={(e) => (setProjectId(e.target.value), setParentId(""))}>
                  {(projects.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField label={fixed ? t("underList", { project: project?.title ?? "" }) : t("under")}>
              <select className={selectClass} value={parentId} disabled={!loaded} onChange={(e) => setParentId(e.target.value)} data-testid="task-parent">
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.type === "SPRINT" ? t("sprint") : t("epic")}: {p.title}
                    {p.context ? ` · ${p.context}` : ""}
                  </option>
                ))}
                <option value={NEW_EPIC}>{t("newEpic")}</option>
              </select>
            </FormField>
          </div>
          {parentId === NEW_EPIC && (
            <FormField label={t("epicName")}>
              <Input value={epicName} maxLength={200} placeholder={t("defaultEpic")} onChange={(e) => setEpicName(e.target.value)} />
            </FormField>
          )}

          <FormField label={t("list")} hint={t("listHint")}>
            <textarea
              ref={outlineRef}
              className={`${textareaClass} min-h-40 font-mono text-[13px]`}
              value={text}
              onChange={(e) => (setText(e.target.value), setNotice(null))}
              onKeyDown={(e) => {
                // Ctrl or Cmd + Enter saves and opens the next one.
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && outline.count.tasks > 0 && projectId && !create.isPending) {
                  e.preventDefault();
                  send(true);
                }
              }}
              placeholder={t("listPlaceholder")}
              autoFocus
              data-testid="task-outline"
            />
          </FormField>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm" data-testid="task-outline-preview">
            {outline.count.tasks === 0 ? (
              <p className="text-muted-foreground">{t("previewEmpty")}</p>
            ) : (
              <>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("preview", { tasks: outline.count.tasks, subtasks: outline.count.subtasks })}</p>
                <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
                  {outline.tasks.map((task, i) => (
                    <li key={i}>
                      <span className="font-medium">{task.title}</span>
                      {task.subtasks.length > 0 && (
                        <ul className="ml-4 mt-0.5 flex flex-col gap-0.5">
                          {task.subtasks.map((s, k) => (
                            <li key={k} className="flex items-center gap-1.5 text-muted-foreground">
                              <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {outline.truncated && <p className="mt-2 text-xs text-[var(--health-yellow)]">{t("truncated")}</p>}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("assignee")}>
              <select className={selectClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="me">{t("assignMe")}</option>
                <option value="">{t("unassigned")}</option>
                {(members.data ?? [])
                  .filter((m) => m.id !== userId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label={t("dueAll")} hint={t("dueAllHint")}>
              <Input type="date" value={due} onChange={(e) => (setDue(e.target.value), setDueTouched(true))} data-testid="task-due" />
            </FormField>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground" data-testid="task-next-notice">
              {notice}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {notice ? t("done") : tc("cancel")}
            </Button>
            <Button type="button" variant="outline" disabled={create.isPending || outline.count.tasks === 0 || !projectId} onClick={() => send(true)} data-testid="task-create-next" title={t("createNextHint")}>
              {t("createNext")}
            </Button>
            <Button type="submit" disabled={create.isPending || outline.count.tasks === 0}>
              {create.isPending ? t("creating") : t("create", { n: outline.count.tasks + outline.count.subtasks })}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
