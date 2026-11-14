import { describe, expect, it } from "vitest";
import { recognitionProblem } from "@/modules/crm/voice";

describe("speech recognition errors", () => {
  it("a blocked or busy microphone and a lost connection are told; a pause in speech is not a problem", () => {
    expect(recognitionProblem("not-allowed")).toBe("mic");
    expect(recognitionProblem("audio-capture")).toBe("mic");
    expect(recognitionProblem("network")).toBe("network");
    expect(recognitionProblem("no-speech")).toBeNull();
    expect(recognitionProblem("aborted")).toBeNull();
    expect(recognitionProblem(undefined)).toBeNull();
  });
});
