"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";

export interface PartnerDto {
  id: string;
  name: string;
  parentId: string | null;
  country: string | null;
  linkedUserId: string | null;
  linkedUserName: string | null;
  held: number;
  direct: number;
  team: number;
  partnersBelow: number;
  since: string;
}

export function usePartners(workspaceId: string) {
  return useQuery({ queryKey: ["partners", workspaceId], staleTime: 15_000, queryFn: async () => (await api.get<{ items: PartnerDto[] }>(`/api/v1/workspaces/${workspaceId}/partners`)).items });
}
