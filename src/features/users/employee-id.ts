/** Pure helper: next `SM003` / `AD003` style id given existing ids (any case, optional dash). */
export function nextEmployeeId(prefix: string, existing: readonly (string | null)[]): string {
  const pattern = new RegExp(`^${prefix}-?(\\d+)$`, "i");
  let max = 0;
  let width = 3;
  for (const id of existing) {
    const match = id ? pattern.exec(id.trim()) : null;
    if (!match?.[1]) continue;
    max = Math.max(max, Number(match[1]));
    width = Math.max(width, match[1].length);
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}
