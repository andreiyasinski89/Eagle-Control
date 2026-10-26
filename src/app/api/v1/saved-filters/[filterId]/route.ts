import { route } from "@/server/http/handler";
import { deleteSavedFilter } from "@/server/services/saved-filters";

export const DELETE = route<{ filterId: string }>({}, async ({ params, userId }) => {
  await deleteSavedFilter(userId ?? "", params.filterId);
  return null;
});
