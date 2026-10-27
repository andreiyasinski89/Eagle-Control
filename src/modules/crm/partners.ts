import { descendantIds, type FlatGroup } from "./groups";

/** The sponsor tree reuses the group tree's helpers: a node is a person, its parent is the sponsor. */
export type SponsorNode = FlatGroup;

/** Would making `sponsorId` the sponsor of `id` close a loop (a person above themselves)? */
export function sponsorWouldLoop(nodes: SponsorNode[], id: string, sponsorId: string | null): boolean {
  if (!sponsorId) return false;
  if (sponsorId === id) return true;
  return descendantIds(nodes, id).includes(sponsorId);
}

/** For every person: how many people stand below them in the sponsor tree (not counting themselves). */
export function teamSizes(nodes: SponsorNode[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of nodes) out.set(n.id, descendantIds(nodes, n.id).length - 1);
  return out;
}

export interface HandoffCard {
  name: string;
  stage: string;
  temperature: string | null;
  phones: string[];
  emails: string[];
  telegram: string | null;
  whatsapp: string | null;
  instagram: string | null;
  country: string | null;
  source: string | null;
  interests: string[];
  nextStep: string | null;
  nextStepAt: string | null;
  group: string | null;
  notes: { at: string; text: string }[];
}

export interface HandoffLabels {
  stage: string;
  warmth: string;
  phone: string;
  email: string;
  country: string;
  source: string;
  interests: string;
  nextStep: string;
  group: string;
  notes: string;
}

/**
 * The message a partner without an account receives: who the person is, how to reach them, where they stand and what was said so far,
 * short enough to paste into a messenger.
 */
export function handoffText(c: HandoffCard, l: HandoffLabels, stageLabel: string, warmthLabel: string | null): string {
  const lines: string[] = [c.name];
  const add = (label: string, value: string | null | undefined) => value && lines.push(`${label}: ${value}`);
  add(l.stage, stageLabel);
  add(l.warmth, warmthLabel);
  add(l.phone, c.phones.join(", "));
  add("Telegram", c.telegram);
  add("WhatsApp", c.whatsapp);
  add("Instagram", c.instagram);
  add(l.email, c.emails.join(", "));
  add(l.country, c.country);
  add(l.source, c.source);
  add(l.interests, c.interests.join(", "));
  add(l.group, c.group);
  add(l.nextStep, [c.nextStep, c.nextStepAt?.slice(0, 10)].filter(Boolean).join(", "));
  if (c.notes.length) {
    lines.push("", `${l.notes}:`);
    for (const n of c.notes) lines.push(`• ${n.at.slice(0, 10)} ${n.text.replace(/\s+/g, " ").trim().slice(0, 300)}`);
  }
  return lines.join("\n");
}
