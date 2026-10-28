"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api } from "@/features/mindmap/api";
import { DECLINE_REASONS } from "@/modules/crm/decline";

/**
 * Asks why a person said no, right after they were moved to Declined in the table or on the board: one press on a reason saves it,
 * "Skip" leaves it unspecified. (In the person's card the same choice is a list under the stage.)
 */
export function useDeclineAsk() {
  const t = useTranslations("crm");
  const qc = useQueryClient();
  const [who, setWho] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (reason: string) => api.patch(`/api/v1/contacts/${who}`, { declineReason: reason }),
    onSettled: () => {
      setWho(null);
      for (const k of ["contacts", "people", "contact"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const dialog = (
    <Modal open={who !== null} onClose={() => setWho(null)} title={t("declineAsk")}>
      <div className="flex flex-col gap-1.5" data-testid="decline-ask">
        {DECLINE_REASONS.map((r) => (
          <Button key={r} variant="outline" className="justify-start" disabled={save.isPending} onClick={() => save.mutate(r)} data-testid={`decline-${r}`}>
            {t(`declineReason.${r}`)}
          </Button>
        ))}
        <Button variant="ghost" className="mt-1 justify-start text-muted-foreground" onClick={() => setWho(null)} data-testid="decline-skip">
          {t("declineSkip")}
        </Button>
      </div>
    </Modal>
  );
  return { ask: (contactId: string) => setWho(contactId), dialog };
}
