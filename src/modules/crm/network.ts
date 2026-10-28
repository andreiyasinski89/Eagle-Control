/**
 * The network as a tree to draw: you in the middle, then the people below you, arranged one of three ways:
 *  - sponsors: partners under their sponsors, each partner's own people as leaves;
 *  - groups: the group tree, with the people in each group as leaves;
 *  - held: the partners side by side, each with the people they work with.
 * Pure: it only turns lists of people and groups into nodes; the labels and colours are the view's business.
 */
export type NetMode = "sponsors" | "groups" | "held";
export const NET_MODES: NetMode[] = ["sponsors", "groups", "held"];

export interface NetPerson {
  id: string;
  name: string;
  stage: string;
  temperature: string | null;
  sponsorId: string | null;
  heldById: string | null;
  groupId: string | null;
  influence: number | null;
  country: string | null;
  typeTag: string | null;
}
export interface NetGroup {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  position: number;
}

export type NetKind = "root" | "group" | "partner" | "person";

export interface NetNode {
  id: string;
  parentId: string | null;
  position: number;
  kind: NetKind;
  title: string;
  /** For a person or partner: the funnel stage and warmth, so the view can colour them. */
  stage?: string;
  temperature?: string | null;
  country?: string | null;
  typeTag?: string | null;
  color?: string | null;
  /** root, group and partner: how many people are directly below, and how many in the whole branch. */
  direct?: number;
  branch?: number;
  /** A made-up group node ("no group", "no sponsor", "held by nobody"): the view gives it a name. */
  synthetic?: "noGroup" | "noSponsor" | "nobody";
  /** With "split sides": which side of you the branch is drawn on. Only set below the root. */
  side?: "left" | "right";
}

export interface NetFilters {
  /** Leave out people with no sponsor who also have nobody under them: what remains is the structure that works. */
  hideNoSponsor: boolean;
  /** Only people (not partners) at this stage; null = every stage. */
  stage: string | null;
  /** Only people (not partners) with this warmth; null = any. */
  temperature: string | null;
}
export const NO_FILTERS: NetFilters = { hideNoSponsor: false, stage: null, temperature: null };

/** Narrows the list before the tree is built. Partners always stay: they are the skeleton of the structure. */
export function filterPeople(people: NetPerson[], f: NetFilters, selfId: string | null = null): NetPerson[] {
  let out = people;
  if (f.hideNoSponsor) {
    const ids = new Set(people.map((p) => p.id));
    const sponsors = new Set(people.map((p) => p.sponsorId).filter((x): x is string => !!x));
    out = out.filter((p) => (p.sponsorId && (ids.has(p.sponsorId) || p.sponsorId === selfId)) || sponsors.has(p.id));
  }
  if (f.stage) out = out.filter((p) => p.stage === "PARTNER" || p.stage === f.stage);
  if (f.temperature) out = out.filter((p) => p.stage === "PARTNER" || p.temperature === f.temperature);
  return out;
}

export const ROOT_ID = "net-root";
const SYN: Record<NonNullable<NetNode["synthetic"]>, string> = { noGroup: "net-no-group", noSponsor: "net-no-sponsor", nobody: "net-nobody" };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The nearest partner above `id` by sponsor links (not counting the person); null when there is none. Loops end the climb. */
function partnerAbove(id: string, by: Map<string, NetPerson>): string | null {
  const seen = new Set([id]);
  let cur = by.get(id)?.sponsorId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = by.get(cur);
    if (!p) return null;
    if (p.stage === "PARTNER") return p.id;
    cur = p.sponsorId;
  }
  return null;
}

export function buildNetwork(mode: NetMode, input: { rootName: string; people: NetPerson[]; groups: NetGroup[]; selfId?: string | null }, opts: { showPeople: boolean; split?: boolean; maxDepth?: number | null }): NetNode[] {
  const { groups } = input;
  // The person's own card is the root, not a node: whoever it sponsors or works with hangs from the root.
  const selfId = input.selfId ?? null;
  const people = selfId ? input.people.filter((p) => p.id !== selfId) : input.people;
  const isSelf = (id: string | null) => !!selfId && id === selfId;
  const by = new Map(people.map((p) => [p.id, p]));
  const out: NetNode[] = [{ id: ROOT_ID, parentId: null, position: 0, kind: "root", title: input.rootName }];
  const personNode = (p: NetPerson, parentId: string, position: number): NetNode => ({ id: p.id, parentId, position, kind: p.stage === "PARTNER" ? "partner" : "person", title: p.name, stage: p.stage, temperature: p.temperature, country: p.country, typeTag: p.typeTag });
  const synthetic = (kind: NonNullable<NetNode["synthetic"]>, position: number): NetNode => ({ id: SYN[kind], parentId: ROOT_ID, position, kind: "group", title: "", synthetic: kind });
  const sorted = (xs: NetPerson[]) => xs.slice().sort(byName);

  if (mode === "sponsors") {
    const partners = sorted(people.filter((p) => p.stage === "PARTNER"));
    partners.forEach((p, i) => out.push(personNode(p, partnerAbove(p.id, by) ?? ROOT_ID, i)));
    // Sponsor links should never loop, but data comes from imports too: a partner that cannot climb to the top is moved under you.
    const parentOf = new Map(out.map((n) => [n.id, n.parentId]));
    for (const n of out) {
      const seen = new Set<string>();
      for (let cur: string | null | undefined = n.id; cur && cur !== ROOT_ID; cur = parentOf.get(cur)) {
        if (seen.has(cur)) {
          n.parentId = ROOT_ID;
          parentOf.set(n.id, ROOT_ID);
          break;
        }
        seen.add(cur);
      }
    }
    if (opts.showPeople) {
      const others = sorted(people.filter((p) => p.stage !== "PARTNER"));
      const lone = others.filter((p) => (!p.sponsorId || !by.get(p.sponsorId)) && !isSelf(p.sponsorId));
      if (lone.length) out.push(synthetic("noSponsor", partners.length));
      others.forEach((p, i) => {
        const sp = p.sponsorId ? by.get(p.sponsorId) : undefined;
        out.push(personNode(p, sp ? sp.id : isSelf(p.sponsorId) ? ROOT_ID : SYN.noSponsor, i));
      });
    }
  } else if (mode === "groups") {
    const ids = new Set(groups.map((g) => g.id));
    for (const g of groups.slice().sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) out.push({ id: g.id, parentId: g.parentId && ids.has(g.parentId) ? g.parentId : ROOT_ID, position: g.position, kind: "group", title: g.name, color: g.color });
    if (opts.showPeople) {
      const loose = people.filter((p) => !p.groupId || !ids.has(p.groupId));
      if (loose.length) out.push(synthetic("noGroup", groups.length));
      sorted(people).forEach((p, i) => out.push(personNode(p, p.groupId && ids.has(p.groupId) ? p.groupId : SYN.noGroup, i)));
    }
  } else {
    const partners = sorted(people.filter((p) => p.stage === "PARTNER"));
    partners.forEach((p, i) => out.push(personNode(p, ROOT_ID, i)));
    if (opts.showPeople) {
      const isPartner = new Set(partners.map((p) => p.id));
      const others = sorted(people.filter((p) => p.stage !== "PARTNER"));
      if (others.some((p) => (!p.heldById || !isPartner.has(p.heldById)) && !isSelf(p.heldById))) out.push(synthetic("nobody", partners.length));
      others.forEach((p, i) => out.push(personNode(p, p.heldById && isPartner.has(p.heldById) ? p.heldById : isSelf(p.heldById) ? ROOT_ID : SYN.nobody, i)));
    }
  }

  // Counts for the branches: direct children that are people, and everyone below.
  const kids = new Map<string, NetNode[]>();
  for (const n of out) if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const count = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return (kids.get(id) ?? []).reduce((s, c) => s + (c.kind === "person" || c.kind === "partner" ? 1 : 0) + count(c.id, seen), 0);
  };
  for (const n of out) {
    if (n.kind === "person") continue;
    n.direct = (kids.get(n.id) ?? []).filter((c) => c.kind === "person" || c.kind === "partner").length;
    n.branch = count(n.id, new Set());
  }

  // Show only the first levels: the cut-off cards keep their real counts, so it is clear there is more below.
  if (opts.maxDepth) {
    const parentOf = new Map(out.map((n) => [n.id, n.parentId]));
    const depth = (id: string): number => {
      let d = 0;
      for (let cur = parentOf.get(id); cur; cur = parentOf.get(cur)) d++;
      return d;
    };
    const keep = out.filter((n) => depth(n.id) <= (opts.maxDepth as number));
    out.length = 0;
    out.push(...keep);
  }

  // Sides: the working structure to the left of you, the people without a sponsor (and partners with nobody under them) to the right.
  if (opts.split && mode === "sponsors") {
    const sideOf = new Map<string, "left" | "right">();
    for (const n of out) {
      if (n.parentId !== ROOT_ID) continue;
      const alone = n.synthetic === "noSponsor" || (n.kind === "partner" && !(n.branch ?? 0) && !by.get(n.id)?.sponsorId);
      sideOf.set(n.id, alone ? "right" : "left");
    }
    const parentOf = new Map(out.map((n) => [n.id, n.parentId]));
    for (const n of out) {
      if (n.id === ROOT_ID) continue;
      let cur: string = n.id;
      while (!sideOf.has(cur) && parentOf.get(cur) && parentOf.get(cur) !== ROOT_ID) cur = parentOf.get(cur) as string;
      n.side = sideOf.get(cur) ?? "right";
    }
  }
  return out;
}

/** Funnel stage colours (CSS colours): cool for the beginning, warm in the middle, green for a client, violet for a partner, grey for the lost. */
export const STAGE_COLOR: Record<string, string> = {
  NEW: "#94a3b8",
  FIRST_CONTACT: "#60a5fa",
  WARMING: "#fbbf24",
  PRESENTATION: "#fb923c",
  DECIDING: "#a78bfa",
  CLIENT: "#22c55e",
  PARTNER: "#7c3aed",
  DECLINED: "#cbd5e1",
  NO_REPLY: "#cbd5e1",
};
