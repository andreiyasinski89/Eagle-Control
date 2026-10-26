import { describe, expect, it } from "vitest";
import { History, HISTORY_LIMIT } from "@/features/mindmap/history";

const cmd = (n: number) => ({ label: `c${n}`, undo: [`u${n}`], redo: [`r${n}`] });

describe("History", () => {
  it("undoes and redoes in order", async () => {
    const h = new History<string>();
    h.push(cmd(1));
    h.push(cmd(2));
    const applied: string[][] = [];
    const apply = async (ops: string[]) => void applied.push(ops);
    await h.undo(apply);
    await h.undo(apply);
    expect(await h.undo(apply)).toBe(false);
    await h.redo(apply);
    expect(applied).toEqual([["u2"], ["u1"], ["r1"]]);
    expect(h.canUndo && h.canRedo).toBe(true);
  });

  it("drops the redo branch when a new action is pushed", async () => {
    const h = new History<string>();
    h.push(cmd(1));
    h.push(cmd(2));
    await h.undo(async () => {});
    h.push(cmd(3));
    expect(h.canRedo).toBe(false);
    expect(h.size).toBe(2);
  });

  it("keeps at least 50 steps and forgets older ones", () => {
    const h = new History<string>();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h.push(cmd(i));
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50);
    expect(h.size).toBe(HISTORY_LIMIT);
  });

  it("leaves the cursor alone when applying fails", async () => {
    const h = new History<string>();
    h.push(cmd(1));
    await expect(h.undo(async () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });
});
