"use client";

import { useMemo, useState } from "react";
import { ListPlus, ListTree } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { reload } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { CreateTasksDialog } from "./CreateTasksDialog";

/**
 * Two buttons for every section of a project (map, board, list, calendar, timeline): make tasks with their subtasks from a typed list,
 * and make a new list. A list is an epic: a named group the tasks go into, so a project reads as "Design: …, Launch: …".
 */
export function ProjectCreateBar({ slug }: { slug: string }) {
  const t = useTranslations("views");
  const tc = useTranslations("common");
  const projectId = useMapStore((s) => s.projectId);
  const workspaceId = useMapStore((s) => s.workspaceId);
  const nodes = useMapStore((s) => s.nodes);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const project = projectId ? nodes[projectId] : undefined;
  const lists = useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.type === "EPIC" || n.type === "SPRINT")
        .sort((a, b) => a.position - b.position)
        .map((n) => ({ id: n.id, type: n.type, title: n.title, context: n.type === "SPRINT" && n.parentId ? nodes[n.parentId]?.title : undefined })),
    [nodes],
  );
  if (!projectId || !workspaceId || !project) return null;

  async function createList() {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ node: { id: string } }>("/api/v1/nodes", { parentId: projectId, type: "EPIC", title });
      await reload();
      setListOpen(false);
      setName("");
      setTarget(res.node.id); // the next thing people want is to fill it
      setTasksOpen(true);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5" data-testid="project-create-bar">
        <Button size="sm" onClick={() => (setTarget(null), setTasksOpen(true))} data-testid="project-create-tasks">
          <ListPlus className="size-4" />
          <span className="max-lg:sr-only">{t("createTasks")}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => (setError(null), setListOpen(true))} data-testid="project-new-list">
          <ListTree className="size-4" />
          <span className="max-lg:sr-only">{t("newList")}</span>
        </Button>
      </div>
      {made && (
        <span role="status" className="text-xs text-muted-foreground" data-testid="project-tasks-made">
          {made}
        </span>
      )}

      <CreateTasksDialog
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        workspaceId={workspaceId}
        slug={slug}
        project={{ id: project.id, title: project.title }}
        lists={lists}
        listId={target}
        onCreated={(n) => {
          setMade(t("tasksMade", { tasks: n.tasks, subtasks: n.subtasks }));
          setTimeout(() => setMade(null), 6000);
          void reload();
        }}
      />

      <Modal open={listOpen} onClose={() => setListOpen(false)} title={t("newListTitle")}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void createList();
          }}
        >
          <FormField label={t("listName")} hint={t("listHint")}>
            <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={t("listPlaceholder")} autoFocus required data-testid="new-list-name" />
          </FormField>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setListOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || busy}>
              {t("createList")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
