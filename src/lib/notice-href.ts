/** Pages that live outside a workspace: a notification pointing there keeps its address as it is. */
const OUTSIDE = ["/portal/", "/account"];

/** Where a notification leads: its address inside the workspace, unless it names a page outside any workspace. */
export function noticeHref(slug: string, url: string): string {
  return OUTSIDE.some((p) => url === p || url.startsWith(p.endsWith("/") ? p : `${p}/`) || url.startsWith(`${p}?`)) ? url : `/w/${slug}${url}`;
}
