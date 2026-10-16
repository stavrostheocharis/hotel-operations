import type { CandidatePair } from "./types";

/** Union-find over accepted pairs. Returns clusters of signal ids, singletons included. */
export function clusterPairs(ids: string[], accepted: CandidatePair[]): string[][] {
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const p of accepted) {
    if (!parent.has(p.a) || !parent.has(p.b)) continue;
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    const g = groups.get(r);
    if (g) g.push(id);
    else groups.set(r, [id]);
  }
  return [...groups.values()];
}
