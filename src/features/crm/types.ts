import type { Health } from "@prisma/client";

export type DealStatus = "open" | "won" | "lost";

export interface DealCardDto {
  id: string;
  title: string;
  amount: number;
  currency: string;
  probability: number;
  stageId: string;
  status: DealStatus;
  ownerId: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  nextStep: string | null;
  nextStepAt: string | null;
  expectedCloseDate: string | null;
  lastActivityAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  health: Health;
  daysInStage: number;
  position: number;
  createdAt: string;
}

export interface ColumnTotals {
  count: number;
  byCurrency: Record<string, { amount: number; weighted: number }>;
}

export interface BoardColumnDto {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  deals: DealCardDto[];
  totals: ColumnTotals;
  truncated: boolean;
}

export interface BoardDto {
  pipeline: { id: string; name: string; workspaceId: string };
  columns: BoardColumnDto[];
  serverTime: string;
}

export interface PipelineDto {
  id: string;
  name: string;
  isDefault: boolean;
  stages: { id: string; name: string; order: number; probability: number; isWon: boolean; isLost: boolean }[];
}

export interface Member {
  id: string;
  name: string | null;
  email: string;
}

export interface ActivityDto {
  id: string;
  type: "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK" | "MESSAGE";
  subject: string;
  body: string | null;
  dueAt: string | null;
  durationMin?: number | null;
  completedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string | null; email: string };
}

export interface LinkedProject {
  id: string;
  title: string;
  progress: number;
  health: Health;
  startDate: string | null;
  dueDate: string | null;
}

export interface DealDetailDto extends DealCardDto {
  pipelineId: string;
  source: string | null;
  manualProbability: number | null;
  stages: PipelineDto["stages"];
  lostReason: string | null;
  owner: Member | null;
  activities: ActivityDto[];
  projects: LinkedProject[];
  tags: { id: string; name: string; color: string }[];
}

export interface LostReasonDto {
  id: string;
  name: string;
}

export interface TemplateList {
  builtIn: { key: string; name: string; defaultDurationDays: number; empty: boolean }[];
  custom: { id: string; name: string; defaultDurationDays: number }[];
}

export interface CompanyListItem {
  id: string;
  legalName: string;
  website: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  lifecycleStage: "LEAD" | "PROSPECT" | "CUSTOMER" | "CHURNED";
  ownerId: string | null;
  contacts: number;
  openDeals: number;
  revenue: Record<string, number>;
  projectHealth: Health | null;
}

export interface ContactListItem {
  id: string;
  name: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  emails: string[];
  phones: string[];
  messengers: Record<string, string>;
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  lastContactedAt: string | null;
  consentGiven: boolean;
  stage?: "NEW" | "FIRST_CONTACT" | "WARMING" | "PRESENTATION" | "DECIDING" | "CLIENT" | "PARTNER" | "DECLINED" | "NO_REPLY";
  temperature?: "HOT" | "WARM" | "COLD" | null;
  nextStep?: string | null;
  nextStepAt?: string | null;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}
