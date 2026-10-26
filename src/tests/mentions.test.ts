import { describe, expect, it } from "vitest";
import { buildCommentDoc, mentionQuery } from "@/features/drawer/mentions";

describe("mentionQuery", () => {
  it("finds the word being typed after @", () => {
    expect(mentionQuery("hi @an", 6)).toEqual({ query: "an", start: 3 });
    expect(mentionQuery("@", 1)).toEqual({ query: "", start: 0 });
  });
  it("ignores emails and finished words", () => {
    expect(mentionQuery("mail a@b.c", 10)).toBeNull();
    expect(mentionQuery("hi @anna ok", 11)).toBeNull();
  });
  it("only looks before the caret", () => {
    expect(mentionQuery("@anna later", 3)).toEqual({ query: "an", start: 0 });
  });
});

describe("buildCommentDoc", () => {
  const anna = { id: "u1", label: "Anna Kowalska" };
  const bob = { id: "u2", label: "Bob" };

  it("turns picked @labels into mention nodes and reports their ids", () => {
    const { doc, mentions } = buildCommentDoc("Please check @Anna Kowalska and @Bob!", [anna, bob]);
    expect(mentions.sort()).toEqual(["u1", "u2"]);
    const kinds = doc.content?.[0]?.content?.map((c) => c.type);
    expect(kinds).toEqual(["text", "mention", "text", "mention", "text"]);
  });

  it("does not mention people who were typed but not picked", () => {
    const { mentions, doc } = buildCommentDoc("hello @Carol", [anna]);
    expect(mentions).toEqual([]);
    expect(doc.content?.[0]?.content).toEqual([{ type: "text", text: "hello @Carol" }]);
  });

  it("does not treat a longer word as a mention", () => {
    expect(buildCommentDoc("@Bobby", [bob]).mentions).toEqual([]);
  });

  it("splits paragraphs and survives empty input", () => {
    expect(buildCommentDoc("a\n\nb", []).doc.content).toHaveLength(2);
    expect(buildCommentDoc("", []).doc.content?.[0]?.content).toEqual([]);
  });
});
