/** Linear undo/redo over server-side operations (no UI or store dependencies, so it is unit-testable). */

export interface HistoryCommand<Op> {
  label: string;
  undo: Op[];
  redo: Op[];
}

export const HISTORY_LIMIT = 50;

export class History<Op> {
  private stack: HistoryCommand<Op>[] = [];
  /** Number of commands currently applied; stack[index] is the next redo. */
  private index = 0;

  constructor(private readonly limit = HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.index > 0;
  }
  get canRedo(): boolean {
    return this.index < this.stack.length;
  }
  get size(): number {
    return this.stack.length;
  }

  /** Records an already-applied action. Anything that could have been redone is dropped. */
  push(cmd: HistoryCommand<Op>): void {
    this.stack.splice(this.index);
    this.stack.push(cmd);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length;
  }

  /**
   * Runs the inverse of the latest command through `apply`. The cursor only moves when `apply`
   * succeeds, so a failed undo leaves history untouched.
   */
  async undo(apply: (ops: Op[]) => Promise<void>): Promise<boolean> {
    const cmd = this.stack[this.index - 1];
    if (!cmd) return false;
    await apply(cmd.undo);
    this.index -= 1;
    return true;
  }

  async redo(apply: (ops: Op[]) => Promise<void>): Promise<boolean> {
    const cmd = this.stack[this.index];
    if (!cmd) return false;
    await apply(cmd.redo);
    this.index += 1;
    return true;
  }

  clear(): void {
    this.stack = [];
    this.index = 0;
  }
}
