import { z } from "zod";
import type { NodeType } from "@prisma/client";

export const nodeTypeSchema = z.enum(["PROJECT", "EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"]);
export const statusSchema = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]);
export const healthSchema = z.enum(["GREEN", "YELLOW", "RED"]);

const doc = z.object({ type: z.literal("doc") }).passthrough();

/** `data` payload per node type. Unknown keys are stripped. */
export const projectData = z.object({
  estimationUnit: z.enum(["HOURS", "STORY_POINTS"]).default("HOURS"),
  templateId: z.string().optional(),
});
export const documentData = z.object({
  kind: z.enum(["note", "spec", "pdf"]).default("note"),
  content: doc.optional(),
  fileUrl: z.string().url().optional(),
});
export const eventData = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  attendeeIds: z.array(z.string()).max(100).default([]),
  agenda: z.string().max(5000).default(""),
  meetingUrl: z.string().url().optional(),
  /** Ask Google Calendar to attach a Meet link when the event is synced. */
  addMeet: z.boolean().optional(),
  location: z.string().max(300).optional(),
});
export const emptyData = z.object({}).strip();

export function dataSchemaFor(type: NodeType): z.ZodTypeAny {
  switch (type) {
    case "PROJECT":
      return projectData;
    case "DOCUMENT":
      return documentData;
    case "EVENT":
      return eventData;
    default:
      return emptyData;
  }
}

const date = z.string().datetime().nullable();

export const createNodeSchema = z.object({
  parentId: z.string().nullable(),
  type: nodeTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).nullable().optional(),
  status: statusSchema.optional(),
  startDate: date.optional(),
  dueDate: date.optional(),
  estimation: z.number().min(0).max(100_000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
});

export const patchNodeSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).nullable(),
    status: statusSchema,
    progress: z.number().int().min(0).max(100),
    progressMode: z.enum(["MANUAL", "AUTO"]),
    startDate: date,
    dueDate: date,
    estimation: z.number().min(0).max(100_000).nullable(),
    estimationUnit: z.enum(["HOURS", "STORY_POINTS"]).nullable(),
    assigneeId: z.string().nullable(),
    collapsed: z.boolean(),
    visibleToClient: z.boolean(),
    data: z.record(z.unknown()),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const moveNodeSchema = z.object({
  parentId: z.string().nullable(),
  afterId: z.string().nullable().optional(),
  beforeId: z.string().nullable().optional(),
});

export const healthOverrideSchema = z.object({
  health: healthSchema,
  note: z.string().trim().min(3, "A comment is required").max(1000),
});

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type PatchNodeInput = z.infer<typeof patchNodeSchema>;
export type MoveNodeInput = z.infer<typeof moveNodeSchema>;
