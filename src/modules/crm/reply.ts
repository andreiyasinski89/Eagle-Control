type When = Date | string | null | undefined;
const ms = (d: When) => (d ? new Date(d).getTime() : null);

/** The person wrote back and no touch of ours came after it: the next move is ours. Same rule as the red flag in modules/crm/silence.ts. */
export function awaitsAnswer(repliedAt: When, lastContactedAt: When): boolean {
  const r = ms(repliedAt);
  if (r === null) return false;
  const l = ms(lastContactedAt);
  return l === null || l < r;
}
