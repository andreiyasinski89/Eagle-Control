"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";
import type { LostReasonDto, Member, Paged, PipelineDto, TemplateList, CompanyListItem } from "./types";

interface MemberRow {
  userId: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["members", workspaceId],
    staleTime: 60_000,
    queryFn: async (): Promise<Member[]> => (await api.get<MemberRow[]>(`/api/v1/workspaces/${workspaceId}/members`)).filter((m) => m.role !== "CLIENT").map((m) => m.user),
  });
}

export const usePipelines = (workspaceId: string) =>
  useQuery({ queryKey: ["pipelines", workspaceId], staleTime: 30_000, queryFn: () => api.get<PipelineDto[]>(`/api/v1/workspaces/${workspaceId}/pipelines`) });

export const useLostReasons = (workspaceId: string) =>
  useQuery({ queryKey: ["lost-reasons", workspaceId], staleTime: 60_000, queryFn: () => api.get<LostReasonDto[]>(`/api/v1/workspaces/${workspaceId}/lost-reasons`) });

export const useTemplates = (workspaceId: string) =>
  useQuery({ queryKey: ["templates", workspaceId], staleTime: 30_000, queryFn: () => api.get<TemplateList>(`/api/v1/workspaces/${workspaceId}/project-templates`) });

/** Company picker data: the first 200 by name is plenty for a select; larger books use the search box. */
export const useCompanyOptions = (workspaceId: string, q = "") =>
  useQuery({
    queryKey: ["company-options", workspaceId, q],
    staleTime: 30_000,
    queryFn: () => api.get<Paged<CompanyListItem>>(`/api/v1/workspaces/${workspaceId}/companies?pageSize=200&sort=legalName${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });

export const useContactOptions = (workspaceId: string, companyId?: string | null) =>
  useQuery({
    queryKey: ["contact-options", workspaceId, companyId ?? ""],
    staleTime: 30_000,
    queryFn: () =>
      api.get<Paged<{ id: string; name: string; companyId: string | null }>>(`/api/v1/workspaces/${workspaceId}/contacts?pageSize=200${companyId ? `&companyId=${companyId}` : ""}`),
  });

export function memberName(members: Member[] | undefined, id: string | null): string {
  const m = members?.find((x) => x.id === id);
  return m ? (m.name ?? m.email) : "";
}
