import { z } from "zod";
import { db } from "@/server/db";
import { displayName, normalizePhone, normalizeTelegram } from "@/modules/account/profile";
import { isValidTimeZone } from "@/modules/views/tz";
import { ApiError, notFound } from "@/server/http/errors";

export const profileSelect = { id: true, name: true, firstName: true, lastName: true, phone: true, telegram: true, email: true, avatar: true, image: true, timezone: true, locale: true, skills: true } as const;

const invalid = (code: string, message: string) => new ApiError(422, code, message);
/** Empty text clears the field. */
const optional = (max: number) => z.string().trim().max(max).optional();

export const patchProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  firstName: optional(60),
  lastName: optional(60),
  phone: optional(40),
  telegram: optional(100),
  avatar: z.string().url().max(500).nullable().optional(),
  timezone: z.string().max(64).refine(isValidTimeZone, "Unknown time zone").optional(),
  locale: z.enum(["en", "ru", "pl"]).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});

export async function getProfile(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!user) throw notFound("user");
  return user;
}

/**
 * Saves the person's own profile. The first and last name are what they type; the display name that the whole app shows is made from them.
 * A phone number and a Telegram name are checked and tidied; an empty value clears the field.
 */
export async function updateProfile(userId: string, input: z.infer<typeof patchProfileSchema>) {
  const { firstName, lastName, phone, telegram, ...rest } = input;
  const cur = await db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  if (!cur) throw notFound("user");
  const data: Record<string, unknown> = { ...rest };
  if (firstName !== undefined) data.firstName = firstName || null;
  if (lastName !== undefined) data.lastName = lastName || null;
  if (firstName !== undefined || lastName !== undefined) {
    const full = displayName(firstName !== undefined ? firstName : cur.firstName, lastName !== undefined ? lastName : cur.lastName);
    if (full) data.name = full;
  }
  if (phone !== undefined) {
    if (phone === "") data.phone = null;
    else {
      const p = normalizePhone(phone);
      if (!p) throw invalid("invalid_phone", "Enter a phone number with 6 to 15 digits, e.g. +48 600 100 200");
      data.phone = p;
    }
  }
  if (telegram !== undefined) {
    if (telegram === "") data.telegram = null;
    else {
      const t = normalizeTelegram(telegram);
      if (!t) throw invalid("invalid_telegram", "Enter a Telegram name like @name or a link like t.me/name");
      data.telegram = t;
    }
  }
  return db.user.update({ where: { id: userId }, data, select: profileSelect });
}
