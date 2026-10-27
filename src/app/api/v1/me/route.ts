import { parseBody, route } from "@/server/http/handler";
import { getProfile, patchProfileSchema, updateProfile } from "@/server/services/profile";

export const GET = route({}, async ({ userId }) => getProfile(userId ?? ""));

export const PATCH = route({}, async ({ req, userId }) => updateProfile(userId ?? "", await parseBody(req, patchProfileSchema)));
