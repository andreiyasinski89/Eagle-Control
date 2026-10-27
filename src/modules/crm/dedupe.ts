import { normalizeCompanyName, normalizeDomain, normalizeEmail, normalizePhone, uniqueNonNull } from "./normalize";

export interface ContactLike {
  id: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  emails: string[];
  phones: string[];
  messengers: Record<string, string>;
  companyId: string | null;
  ownerId: string | null;
  birthday: Date | null;
  consentGiven: boolean;
  lastContactedAt: Date | null;
}

export interface CompanyLike {
  id: string;
  legalName: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  taxId: string | null;
  source: string | null;
  ownerId: string | null;
}

/**
 * Keys two records share when they are probably the same person. A contact with neither e-mail nor phone
 * (a list of names only) is matched by full name, so importing the same list twice does not double it.
 */
export function contactKeys(c: Pick<ContactLike, "emails" | "phones"> & { firstName?: string; lastName?: string | null }): string[] {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  if (name && c.emails.length === 0 && c.phones.length === 0) return [`n:${name}`];
  return [
    ...uniqueNonNull(c.emails.map(normalizeEmail)).map((e) => `e:${e}`),
    ...uniqueNonNull(c.phones.map(normalizePhone)).map((p) => `p:${p}`),
  ];
}

export function companyKeys(c: Pick<CompanyLike, "legalName" | "website" | "taxId">): string[] {
  const keys: string[] = [];
  const domain = normalizeDomain(c.website);
  const name = normalizeCompanyName(c.legalName);
  const tax = (c.taxId ?? "").replace(/\W+/g, "").toLowerCase();
  if (domain) keys.push(`d:${domain}`);
  if (name) keys.push(`n:${name}`);
  if (tax.length >= 5) keys.push(`t:${tax}`);
  return keys;
}

/** Groups of ≥2 records connected through any shared key (a~b and b~c puts all three together). */
export function findDuplicateGroups<T extends { id: string }>(items: readonly T[], keysOf: (item: T) => string[]): T[][] {
  const parent = new Map<string, string>(items.map((i) => [i.id, i.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    parent.set(x, r);
    return r;
  };
  const owner = new Map<string, string>();
  for (const item of items) {
    for (const key of keysOf(item)) {
      const seen = owner.get(key);
      if (seen) parent.set(find(item.id), find(seen));
      else owner.set(key, item.id);
    }
  }
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const root = find(item.id);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

const firstFilled = <T>(...values: (T | null | undefined)[]): T | null => {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v;
  return null;
};

export interface ContactMergePlan {
  fields: Omit<ContactLike, "id">;
  /** Records whose relations must move to the primary one. */
  absorbedIds: string[];
}

/**
 * The primary record wins; its empty fields are filled from the others in order; e-mails, phones and
 * messengers are united. Consent is NOT merged: a duplicate's "yes" never becomes the primary's "yes".
 */
export function planContactMerge(primary: ContactLike, others: readonly ContactLike[]): ContactMergePlan {
  const all = [primary, ...others];
  const last = all.map((c) => c.lastContactedAt).filter((d): d is Date => d !== null);
  return {
    absorbedIds: others.map((o) => o.id),
    fields: {
      firstName: primary.firstName || (firstFilled(...others.map((o) => o.firstName)) ?? ""),
      lastName: firstFilled(...all.map((c) => c.lastName)),
      position: firstFilled(...all.map((c) => c.position)),
      emails: uniqueNonNull(all.flatMap((c) => c.emails.map((e) => normalizeEmail(e) ?? e.trim())).filter(Boolean)),
      phones: [...new Set(all.flatMap((c) => c.phones.map((p) => p.trim())).filter(Boolean))],
      messengers: Object.assign({}, ...[...others].reverse().map((o) => o.messengers), primary.messengers),
      companyId: firstFilled(...all.map((c) => c.companyId)),
      ownerId: firstFilled(...all.map((c) => c.ownerId)),
      birthday: firstFilled(...all.map((c) => c.birthday)),
      consentGiven: primary.consentGiven,
      lastContactedAt: last.length ? new Date(Math.max(...last.map((d) => d.getTime()))) : null,
    },
  };
}

export interface CompanyMergePlan {
  fields: Omit<CompanyLike, "id">;
  absorbedIds: string[];
}

export function planCompanyMerge(primary: CompanyLike, others: readonly CompanyLike[]): CompanyMergePlan {
  const all = [primary, ...others];
  return {
    absorbedIds: others.map((o) => o.id),
    fields: {
      legalName: primary.legalName,
      website: firstFilled(...all.map((c) => c.website)),
      industry: firstFilled(...all.map((c) => c.industry)),
      size: firstFilled(...all.map((c) => c.size)),
      country: firstFilled(...all.map((c) => c.country)),
      city: firstFilled(...all.map((c) => c.city)),
      address: firstFilled(...all.map((c) => c.address)),
      taxId: firstFilled(...all.map((c) => c.taxId)),
      source: firstFilled(...all.map((c) => c.source)),
      ownerId: firstFilled(...all.map((c) => c.ownerId)),
    },
  };
}
