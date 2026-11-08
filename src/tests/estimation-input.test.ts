import { describe, expect, it } from "vitest";
import { parseEstimation } from "@/modules/nodes/estimation";

describe("the task estimate as typed", () => {
  it("takes whole numbers and fractions with a comma or a dot; empty clears it", () => {
    expect(parseEstimation("3")).toBe(3);
    expect(parseEstimation("1,5")).toBe(1.5);
    expect(parseEstimation(" 2.5 ")).toBe(2.5);
    expect(parseEstimation("")).toBeNull();
  });
  it("does not save words, negatives or absurd numbers", () => {
    expect(parseEstimation("abc")).toBeUndefined();
    expect(parseEstimation("-1")).toBeUndefined();
    expect(parseEstimation("1000000")).toBeUndefined();
  });
});
