import { describe, expect, it } from "vitest";
import {
  applyStageMove,
  columnTotals,
  dealHealth,
  DealRuleError,
  effectiveProbability,
  lifecycleAfterDeal,
  validateStages,
  type StageInfo,
} from "@/modules/crm/deal-rules";
import { normalizeCompanyName, normalizeDomain, normalizeEmail, normalizePhone } from "@/modules/crm/normalize";
import {
  companyKeys,
  contactKeys,
  findDuplicateGroups,
  planCompanyMerge,
  planContactMerge,
  type CompanyLike,
  type ContactLike,
} from "@/modules/crm/dedupe";
import {
  classifyRows,
  csvCell,
  decodeCsv,
  mapCompanyRow,
  mapContactRow,
  parseCsv,
  splitFullName,
  summarize,
  suggestMapping,
  toCsv,
  CONTACT_FIELDS,
  COMPANY_FIELDS,
  MAX_CSV_ROWS,
} from "@/modules/crm/csv";
import { LeadRejected, leadNote, parseLead } from "@/modules/crm/lead-intake";
import { BUILT_IN_TEMPLATES, flattenTemplate, scheduleNode, templateNodeSchema } from "@/modules/nodes/templates";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("normalisers", () => {
  it("e-mail: trims, lower-cases, rejects junk", () => {
    expect(normalizeEmail("  Anna@Example.COM ")).toBe("anna@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
  it("phone: same number written differently gets the same key", () => {
    const keys = ["+48 600 123 456", "600-123-456", "0048600123456", "(600) 123 456"].map(normalizePhone);
    expect(new Set(keys).size).toBe(1);
    expect(normalizePhone("12345")).toBeNull();
  });
  it("domain: strips scheme, www, path, port and mailbox", () => {
    for (const v of ["https://www.Acme.com/about?x=1", "acme.com", "WWW.ACME.COM:8080", "sales@acme.com"]) {
      expect(normalizeDomain(v)).toBe("acme.com");
    }
    expect(normalizeDomain("localhost")).toBeNull();
  });
  it("company name: ignores case, punctuation, diacritics and legal form", () => {
    const a = normalizeCompanyName("Zażółć Sp. z o.o.");
    expect(a).toBe(normalizeCompanyName("ZAZOLC"));
    expect(normalizeCompanyName("Acme, LLC")).toBe(normalizeCompanyName("acme"));
    expect(normalizeCompanyName("ООО Ромашка")).toBe(normalizeCompanyName("ромашка"));
    expect(normalizeCompanyName("a")).toBeNull();
  });
});

describe("deal rules", () => {
  const stage = (over: Partial<StageInfo>): StageInfo => ({ id: "s", name: "S", order: 0, probability: 30, isWon: false, isLost: false, ...over });
  const prev = { stageId: "s1", wonAt: null, lostAt: null, lostReasonId: null, stageEnteredAt: d("2026-10-01") };
  const now = d("2026-10-20");

  it("requires a reason to lose a deal", () => {
    expect(() => applyStageMove(prev, stage({ id: "lost", isLost: true }), {}, now)).toThrowError(DealRuleError);
    const next = applyStageMove(prev, stage({ id: "lost", isLost: true }), { lostReasonId: "r1" }, now);
    expect(next).toMatchObject({ stageId: "lost", lostAt: now, lostReasonId: "r1", wonAt: null });
  });
  it("won sets wonAt; reopening clears every closing field", () => {
    const won = applyStageMove(prev, stage({ id: "won", isWon: true }), {}, now);
    expect(won.wonAt).toEqual(now);
    const reopened = applyStageMove(won, stage({ id: "s2" }), {}, d("2026-10-25"));
    expect(reopened).toMatchObject({ wonAt: null, lostAt: null, lostReasonId: null, stageId: "s2" });
  });
  it("resets the stage clock only when the stage changes", () => {
    expect(applyStageMove(prev, stage({ id: "s1" }), {}, now).stageEnteredAt).toEqual(prev.stageEnteredAt);
    expect(applyStageMove(prev, stage({ id: "s2" }), {}, now).stageEnteredAt).toEqual(now);
  });
  it("probability: won 100, lost 0, otherwise manual beats the stage default", () => {
    expect(effectiveProbability(stage({ isWon: true }), 20)).toBe(100);
    expect(effectiveProbability(stage({ isLost: true }), 50)).toBe(0);
    expect(effectiveProbability(stage({}), 70)).toBe(70);
    expect(effectiveProbability(stage({}), null)).toBe(30);
  });
  it("validates stage sets", () => {
    const open = { isWon: false, isLost: false, probability: 10 };
    expect(() => validateStages([open, { ...open, isWon: true }, { ...open, isLost: true }])).not.toThrow();
    expect(() => validateStages([open, open, { ...open, isLost: true }])).toThrow(/won and one lost/);
    expect(() => validateStages([{ ...open, isWon: true }, { ...open, isLost: true }])).toThrow(/open stage/);
    expect(() => validateStages([{ ...open, probability: 120 }, { ...open, isWon: true }, { ...open, isLost: true }])).toThrow();
  });
  it("column totals never mix currencies", () => {
    const t = columnTotals([
      { amount: 1000, currency: "EUR", probability: 50 },
      { amount: 500.5, currency: "EUR", probability: 20 },
      { amount: 200, currency: "USD", probability: 100 },
    ]);
    expect(t.count).toBe(3);
    expect(t.byCurrency.EUR).toEqual({ amount: 1500.5, weighted: 600.1 });
    expect(t.byCurrency.USD).toEqual({ amount: 200, weighted: 200 });
  });

  describe("dealHealth", () => {
    const today = d("2026-10-20");
    const base = { status: "open" as const, lastActivityAt: d("2026-10-18"), stageEnteredAt: d("2026-10-10"), nextStep: "Send quote", nextStepAt: d("2026-10-22"), expectedCloseDate: d("2026-11-15") };
    it("is green for a fresh, planned deal", () => expect(dealHealth(base, today)).toBe("GREEN"));
    it("turns yellow without a next step, or when it is overdue", () => {
      expect(dealHealth({ ...base, nextStep: "  " }, today)).toBe("YELLOW");
      expect(dealHealth({ ...base, nextStep: null }, today)).toBe("YELLOW");
      expect(dealHealth({ ...base, nextStepAt: d("2026-10-19") }, today)).toBe("YELLOW");
    });
    it("goes yellow at half the stale window, red beyond it", () => {
      expect(dealHealth({ ...base, lastActivityAt: d("2026-10-12") }, today)).toBe("YELLOW"); // 8 days > 7
      expect(dealHealth({ ...base, lastActivityAt: d("2026-10-13") }, today)).toBe("GREEN"); // 7 days
      expect(dealHealth({ ...base, lastActivityAt: d("2026-10-06") }, today)).toBe("YELLOW"); // exactly 14 days: not yet red
      expect(dealHealth({ ...base, lastActivityAt: d("2026-10-05") }, today)).toBe("RED"); // 15 days
    });
    it("is red when stale, stuck in a stage, or past the close date", () => {
      expect(dealHealth({ ...base, lastActivityAt: d("2026-10-05") }, today)).toBe("RED");
      expect(dealHealth({ ...base, stageEnteredAt: d("2026-09-10") }, today)).toBe("RED");
      expect(dealHealth({ ...base, expectedCloseDate: d("2026-10-19") }, today)).toBe("RED");
    });
    it("uses the stage entry as last touch for an untouched deal, and ignores closed deals", () => {
      expect(dealHealth({ ...base, lastActivityAt: null, stageEnteredAt: d("2026-09-25") }, today)).toBe("RED");
      expect(dealHealth({ ...base, status: "won", lastActivityAt: d("2025-01-01") }, today)).toBe("GREEN");
    });
    it("thresholds are configurable", () => {
      expect(dealHealth({ ...base, lastActivityAt: d("2026-10-15") }, today, { staleDays: 4 })).toBe("RED");
    });
  });

  it("lifecycle: lead → prospect on progress, customer on win, churned reawakens", () => {
    expect(lifecycleAfterDeal("LEAD", "advanced")).toBe("PROSPECT");
    expect(lifecycleAfterDeal("PROSPECT", "advanced")).toBe("PROSPECT");
    expect(lifecycleAfterDeal("PROSPECT", "won")).toBe("CUSTOMER");
    expect(lifecycleAfterDeal("CHURNED", "created")).toBe("PROSPECT");
    expect(lifecycleAfterDeal("CUSTOMER", "advanced")).toBe("CUSTOMER");
  });
});

describe("duplicates", () => {
  const contact = (id: string, over: Partial<ContactLike> = {}): ContactLike => ({
    id, firstName: id, lastName: null, position: null, emails: [], phones: [], messengers: {}, companyId: null, ownerId: null,
    birthday: null, consentGiven: false, lastContactedAt: null, ...over,
  });

  it("groups transitively through shared e-mail or phone", () => {
    const groups = findDuplicateGroups(
      [
        contact("a", { emails: ["x@acme.com"] }),
        contact("b", { emails: ["X@ACME.com"], phones: ["+48 600 123 456"] }),
        contact("c", { phones: ["600123456"] }),
        contact("d", { emails: ["other@acme.com"] }),
      ],
      contactKeys,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("matches companies by domain, name or tax id", () => {
    const co = (id: string, legalName: string, website: string | null = null, taxId: string | null = null) => ({ id, legalName, website, taxId });
    const groups = findDuplicateGroups(
      [co("1", "Acme Inc", "https://acme.com"), co("2", "ACME Corporation", "www.acme.com"), co("3", "Beta LLC", null, "PL 123-456-78"), co("4", "Gamma", null, "pl12345678"), co("5", "Unrelated")],
      companyKeys,
    );
    expect(groups.map((g) => g.map((x) => x.id).sort())).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("merges contacts: primary wins, gaps filled, lists united, consent never inherited", () => {
    const primary = contact("p", { firstName: "Anna", emails: ["a@x.io"], messengers: { telegram: "@anna" }, consentGiven: false, lastContactedAt: d("2026-01-01") });
    const dupe = contact("q", { firstName: "Ann", lastName: "Kowalska", position: "CTO", emails: ["a@x.io", "anna@y.io"], phones: ["600123456"], messengers: { telegram: "@other", whatsapp: "+48" }, consentGiven: true, lastContactedAt: d("2026-06-01"), ownerId: "u1" });
    const plan = planContactMerge(primary, [dupe]);
    expect(plan.absorbedIds).toEqual(["q"]);
    expect(plan.fields).toMatchObject({ firstName: "Anna", lastName: "Kowalska", position: "CTO", ownerId: "u1", consentGiven: false });
    expect(plan.fields.emails).toEqual(["a@x.io", "anna@y.io"]);
    expect(plan.fields.messengers).toEqual({ telegram: "@anna", whatsapp: "+48" });
    expect(plan.fields.lastContactedAt).toEqual(d("2026-06-01"));
  });

  it("merges companies keeping the primary name", () => {
    const a: CompanyLike = { id: "a", legalName: "Acme", website: null, industry: null, size: null, country: "PL", city: null, address: null, taxId: null, source: null, ownerId: null };
    const b: CompanyLike = { ...a, id: "b", legalName: "Acme Inc", website: "acme.com", city: "Warsaw" };
    expect(planCompanyMerge(a, [b]).fields).toMatchObject({ legalName: "Acme", website: "acme.com", city: "Warsaw", country: "PL" });
  });
});

describe("csv", () => {
  it("decodes UTF-8 with a BOM and falls back to Windows-1251 for legacy Cyrillic", () => {
    const utf = new TextEncoder().encode("﻿имя,email\nАнна,a@x.io");
    expect(decodeCsv(utf)).toMatchObject({ encoding: "utf-8", guessed: false });
    expect(decodeCsv(utf).text.startsWith("имя")).toBe(true);
    // "Анна" in cp1251
    const legacy = Uint8Array.from([0xc0, 0xed, 0xed, 0xe0, 0x2c, 0xc8, 0xe2, 0xe0, 0xed, 0x0a, 0xc0, 0xed, 0xed, 0xe0, 0x2c, 0xc8, 0xe2, 0xe0, 0xed]);
    const r = decodeCsv(legacy);
    expect(r).toMatchObject({ encoding: "windows-1251", guessed: true });
    expect(r.text.startsWith("Анна")).toBe(true);
  });

  it("detects delimiters and keeps quoted commas and line breaks", () => {
    const semi = parseCsv("Name;Email\nAnna;a@x.io\n");
    expect(semi.delimiter).toBe(";");
    expect(semi.rows[0]).toEqual({ Name: "Anna", Email: "a@x.io" });
    const quoted = parseCsv('Name,Note\n"Kowalski, Jan","line1\nline2"\n');
    expect(quoted.rows[0]).toEqual({ Name: "Kowalski, Jan", Note: "line1\nline2" });
    expect(parseCsv("a,b\n\n\n1,2\n").rows).toHaveLength(1);
  });

  it("caps the number of rows", () => {
    const big = "a\n" + Array.from({ length: MAX_CSV_ROWS + 5 }, (_, i) => String(i)).join("\n");
    const p = parseCsv(big);
    expect(p.rows).toHaveLength(MAX_CSV_ROWS);
    expect(p.truncated).toBe(true);
  });

  it("suggests mappings from English, Russian and Polish headers, using each column once", () => {
    expect(suggestMapping(["Imię i nazwisko", "E-mail", "Telefon", "Firma", "Stanowisko"], CONTACT_FIELDS)).toMatchObject({
      fullName: "Imię i nazwisko", email: "E-mail", phone: "Telefon", company: "Firma", position: "Stanowisko",
    });
    expect(suggestMapping(["Имя", "Фамилия", "Почта", "Телефон", "Компания"], CONTACT_FIELDS)).toMatchObject({
      firstName: "Имя", lastName: "Фамилия", email: "Почта", phone: "Телефон", company: "Компания",
    });
    const m = suggestMapping(["Company", "Website", "NIP"], COMPANY_FIELDS);
    expect(m).toMatchObject({ legalName: "Company", website: "Website", taxId: "NIP" });
  });

  it("maps contact rows: splits full names, validates e-mails, needs some way to identify the person", () => {
    const mapping = { fullName: "Name", email: "Email", phone: "Phone" };
    const ok = mapContactRow({ Name: "Jan van Dijk", Email: "JAN@X.io; second@x.io", Phone: "" }, mapping);
    expect(ok).toMatchObject({ ok: true, record: { firstName: "Jan", lastName: "van Dijk", email: ["jan@x.io", "second@x.io"] } });
    expect(mapContactRow({ Name: "A", Email: "nope", Phone: "" }, mapping)).toMatchObject({ ok: false });
    expect(mapContactRow({ Name: "", Email: "", Phone: "" }, mapping)).toMatchObject({ ok: false });
    expect(splitFullName("Madonna")).toEqual({ firstName: "Madonna", lastName: null });
  });

  it("maps company rows and rejects nameless ones", () => {
    expect(mapCompanyRow({ N: "Acme" }, { legalName: "N" })).toMatchObject({ ok: true });
    expect(mapCompanyRow({ N: " " }, { legalName: "N" })).toMatchObject({ ok: false });
  });

  describe("duplicate policy", () => {
    const rows = [
      { ok: true as const, record: { k: "e:a" } },
      { ok: true as const, record: { k: "e:b" } },
      { ok: true as const, record: { k: "e:a" } }, // repeats row 1
      { ok: false as const, error: "bad" },
      { ok: true as const, record: { k: "e:new" } },
    ];
    const keys = (r: { k: string }) => [r.k];
    const existing = new Map([["e:b", "ID-B"]]);

    it("skip: existing and in-file duplicates are skipped, errors reported with sheet row numbers", () => {
      const acts = classifyRows(rows, keys, existing, "skip");
      expect(acts.map((a) => a.kind)).toEqual(["create", "skip", "skip", "error", "create"]);
      expect(summarize(acts)).toEqual({ created: 2, updated: 0, skipped: 2, errors: [{ row: 5, message: "bad" }] });
    });
    it("update: existing records are updated, in-file repeats still skipped", () => {
      const acts = classifyRows(rows, keys, existing, "update");
      expect(acts[1]).toEqual({ kind: "update", existingId: "ID-B" });
      expect(acts[2]).toMatchObject({ kind: "skip", reason: "duplicate_in_file" });
    });
    it("create: everything valid is created", () => {
      expect(classifyRows(rows, keys, existing, "create").map((a) => a.kind)).toEqual(["create", "create", "create", "error", "create"]);
    });
  });

  it("export neutralises spreadsheet formulas and quotes properly", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(csvCell("+48 600")).toBe("+48 600"); // phone numbers stay readable
    expect(csvCell("@jan_k")).toBe("@jan_k");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-1-1")).toBe("'-1-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("normal")).toBe("normal");
    const out = toCsv(["Name", "Note"], [["Kowalski, Jan", "say \"hi\""]]);
    expect(out).toBe('Name,Note\r\n"Kowalski, Jan","say ""hi"""');
    expect(parseCsv(out).rows[0]).toEqual({ Name: "Kowalski, Jan", Note: 'say "hi"' });
  });
});

describe("lead intake", () => {
  it("understands a plain form payload", () => {
    const lead = parseLead({ name: "Anna Nowak", email: " Anna@Acme.com ", phone: "+48 600 123 456", company: "Acme", message: "Need a website", consent: "on", budget: "5 000,50" });
    expect(lead).toMatchObject({ firstName: "Anna", lastName: "Nowak", email: "anna@acme.com", company: "Acme", message: "Need a website", consent: true, amount: 5000.5 });
  });
  it("understands Tilda-style and Russian field names, keeps unknown fields as extras", () => {
    const lead = parseLead({ Name: "Иван Петров", Email: "ivan@x.ru", Phone: "+7 900 000 00 00", Comment: "Хочу сайт", utm_source: "ads" });
    expect(lead).toMatchObject({ firstName: "Иван", lastName: "Петров", message: "Хочу сайт", consent: false });
    expect(lead.extra).toEqual({ utm_source: "ads" });
    expect(leadNote(lead)).toBe("Хочу сайт\nutm_source: ads");
  });
  it("rejects spam and unusable leads", () => {
    expect(() => parseLead({ email: "a@b.co", website_url: "http://spam" })).toThrowError(LeadRejected);
    expect(() => parseLead({ name: "No contact" })).toThrow(/no_contact_method/);
    expect(() => parseLead({ email: "nope" })).toThrow(/invalid_email/);
    expect(() => parseLead({ email: "a@b.co", message: "x".repeat(25_000) })).toThrowError(expect.objectContaining({ code: "too_large" }));
  });
  it("accepts a phone-only lead and falls back for the name", () => {
    expect(parseLead({ phone: "600 123 456" })).toMatchObject({ firstName: "600 123 456", email: null });
  });
});

describe("template scheduling", () => {
  it("gives every built-in node with an offset a consistent window inside its parent", () => {
    for (const [key, def] of Object.entries(BUILT_IN_TEMPLATES)) {
      if (!def.structure) continue;
      const flat = flattenTemplate(def.structure);
      for (const n of flat) {
        if (n.offsetDays === null) continue;
        const parent = flat.find((p) => p.key === n.parentKey);
        if (parent?.offsetDays !== null && parent?.offsetDays !== undefined && parent.durationDays !== null) {
          expect(n.offsetDays, key).toBeGreaterThanOrEqual(parent.offsetDays);
          expect((n.offsetDays ?? 0) + (n.durationDays ?? 0), key).toBeLessThanOrEqual(parent.offsetDays + parent.durationDays);
        }
      }
    }
  });
  it("schedules from the project start and skips undated nodes", () => {
    const s = scheduleNode({ offsetDays: 7, durationDays: 14 }, new Date("2026-10-01T15:00:00Z"));
    expect(s?.start.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(s?.due.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(scheduleNode({ offsetDays: null, durationDays: null }, new Date())).toBeNull();
  });
  it("validates workspace-defined templates", () => {
    expect(templateNodeSchema.safeParse({ type: "PROJECT", title: "", children: [{ type: "EPIC", title: "E", offsetDays: 0, durationDays: 5 }] }).success).toBe(true);
    expect(templateNodeSchema.safeParse({ type: "DEAL", title: "x" }).success).toBe(false);
    expect(templateNodeSchema.safeParse({ type: "EPIC", title: "x", durationDays: 0 }).success).toBe(false);
  });
});
