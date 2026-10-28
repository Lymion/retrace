// Orders files so each one comes after everything it depends on: the order
// you would have to write them in for the project to work at every step.
// Import cycles (a imports b, b imports a) are grouped and kept together.

export interface Edge {
  from: string;
  to: string;
}

/** Tarjan's algorithm: groups of files that all depend on each other. */
function stronglyConnected(nodes: string[], deps: Map<string, string[]>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];

  // Iterative version, so a long import chain cannot overflow the call stack.
  for (const start of nodes) {
    if (indices.has(start)) continue;
    const work: { node: string; next: number }[] = [{ node: start, next: 0 }];
    indices.set(start, index);
    lowlink.set(start, index);
    index++;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const neighbours = deps.get(frame.node) ?? [];
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next++]!;
        if (!indices.has(next)) {
          indices.set(next, index);
          lowlink.set(next, index);
          index++;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, next: 0 });
        } else if (onStack.has(next)) {
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node)!, indices.get(next)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent)
        lowlink.set(parent.node, Math.min(lowlink.get(parent.node)!, lowlink.get(frame.node)!));
      if (lowlink.get(frame.node) === indices.get(frame.node)) {
        const group: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          group.push(member);
        } while (member !== frame.node);
        groups.push(group);
      }
    }
  }
  return groups;
}

/**
 * Dependency order with a tie-break: when several files are ready at once,
 * the one with the lowest rank (e.g. config before backend before frontend)
 * goes first, then alphabetical, so the result is the same every time.
 */
export function buildOrder(
  paths: string[],
  edges: Edge[],
  rank: (path: string) => number,
): string[] {
  const known = new Set(paths);
  const deps = new Map<string, string[]>(paths.map((p) => [p, []]));
  for (const edge of edges) {
    if (known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to)
      deps.get(edge.from)!.push(edge.to);
  }

  const sorted = [...paths].sort();
  const groups = stronglyConnected(sorted, deps);
  const groupOf = new Map<string, number>();
  groups.forEach((group, i) => group.forEach((member) => groupOf.set(member, i)));

  // Condensed graph: group A waits for group B if any member of A imports a member of B.
  const waitingOn = groups.map(() => new Set<number>());
  const unblocks = groups.map(() => new Set<number>());
  for (const [from, targets] of deps) {
    for (const to of targets) {
      const a = groupOf.get(from)!;
      const b = groupOf.get(to)!;
      if (a !== b) {
        waitingOn[a]!.add(b);
        unblocks[b]!.add(a);
      }
    }
  }

  const groupRank = groups.map((group) => Math.min(...group.map(rank)));
  const groupKey = groups.map((group) => [...group].sort()[0] ?? "");
  const compare = (a: number, b: number) =>
    groupRank[a]! - groupRank[b]! || groupKey[a]!.localeCompare(groupKey[b]!);

  const ready = groups.map((_, i) => i).filter((i) => waitingOn[i]!.size === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort(compare);
    const next = ready.shift()!;
    order.push(...[...groups[next]!].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)));
    for (const dependent of unblocks[next]!) {
      const waits = waitingOn[dependent]!;
      waits.delete(next);
      if (waits.size === 0) ready.push(dependent);
    }
  }
  return order;
}
