"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";
import type { Block, Distance, StepStatus } from "@/modules/onboarding/steps";

export interface StartStep {
  id: string;
  block: Block;
  optional: boolean;
  path: string;
  status: StepStatus;
  progress: { value: number; goal: number } | null;
}
export interface GoalDto {
  dream: string;
  why: string;
  targetDate: string | null;
  targetClients: number | null;
  targetPartners: number | null;
}
export interface OnboardingData {
  crm: boolean;
  today: string;
  hidden: boolean;
  steps: StartStep[];
  required: number;
  done: number;
  percent: number;
  next: string | null;
  goal: GoalDto;
  distance: Distance;
}

export function useOnboarding(workspaceId: string) {
  return useQuery({ queryKey: ["onboarding", workspaceId], staleTime: 30_000, queryFn: () => api.get<OnboardingData>(`/api/v1/workspaces/${workspaceId}/onboarding`) });
}
