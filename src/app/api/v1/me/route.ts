import { z } from "zod";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { parseBody, route } from "@/server/http/handler";

const select = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  image: true,
  timezone: true,
  locale: true,
  skills: true,
};

export const GET = route({}, async ({ userId }) => {
  const user = await db.user.findUnique({ where: { id: userId ?? "" }, select });
  if (!user) throw notFound("user");
  return user;
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatar: z.string().url().max(500).nullable().optional(),
  timezone: z.string().max(64).optional(),
  locale: z.enum(["en", "ru", "pl"]).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});

export const PATCH = route({}, async ({ req, userId }) => {
  const data = await parseBody(req, patchSchema);
  return db.user.update({ where: { id: userId ?? "" }, data, select });
});
