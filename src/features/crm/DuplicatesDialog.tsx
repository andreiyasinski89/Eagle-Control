"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { SkeletonRows } from "@/components/ui/skeleton";

interface Item {
  id: string;
  name?: string;
  legalName?: string;
  emails?: string[];
  phones?: string[];
  website?: string | null;
}

/** Groups of probable duplicates with a one-click, explicit merge into the record you pick. */
export function DuplicatesDialog({ open, onClose, workspaceId, entity }: { open: boolean; onClose: () => void; workspaceId: string; entity: "contacts" | "companies" }) {
  const t = useTranslations("crm");
  const qc = useQueryClient();
  const [primary, setPrimary] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/workspaces/${workspaceId}/${entity}`;
  const groups = useQuery({ queryKey: ["duplicates", entity, workspaceId], enabled: open, queryFn: () => api.get<Item[][]>(`${base}/duplicates`) });

  const merge = useMutation({
    mutationFn: ({ primaryId, duplicateIds }: { primaryId: string; duplicateIds: string[] }) => api.post(`${base}/merge`, { primaryId, duplicateIds }),
    onSuccess: async () => {
      setError(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["duplicates", entity] }), qc.invalidateQueries({ queryKey: [entity] }), qc.invalidateQueries({ queryKey: ["company-options"] }), qc.invalidateQueries({ queryKey: ["contact-options"] })]);
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const label = (i: Item) => i.legalName ?? i.name ?? i.id;
  const detail = (i: Item) => [i.website, ...(i.emails ?? []), ...(i.phones ?? [])].filter(Boolean).join(" · ");

  return (
    <Modal open={open} onClose={onClose} title={entity === "contacts" ? t("duplicateContacts") : t("duplicateCompanies")} wide>
      <p className="text-sm text-muted-foreground">{t("mergeExplain")}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {groups.isLoading && <SkeletonRows rows={3} />}
      {groups.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("noDuplicates")}</p>}
      <div className="flex flex-col gap-3">
        {groups.data?.map((g, gi) => {
          const keep = primary[gi] ?? g[0]?.id ?? "";
          return (
            <fieldset key={g.map((x) => x.id).join()} className="rounded-lg border border-border p-3" data-testid="duplicate-group">
              <legend className="px-1 text-xs text-muted-foreground">{t("keepWhich")}</legend>
              <ul className="flex flex-col gap-1">
                {g.map((i) => (
                  <li key={i.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="radio" name={`g${gi}`} checked={keep === i.id} onChange={() => setPrimary({ ...primary, [gi]: i.id })} className="mt-1" />
                      <span>
                        <span className="font-medium">{label(i)}</span>
                        <span className="block text-xs text-muted-foreground">{detail(i)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end">
                <Button size="sm" disabled={merge.isPending} onClick={() => merge.mutate({ primaryId: keep, duplicateIds: g.filter((x) => x.id !== keep).map((x) => x.id) })}>
                  {t("merge", { count: g.length })}
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>
    </Modal>
  );
}
