import type { Tier } from "@/lib/content/rubric";

/**
 * What's left of the original scoring module once flow rubrics became data
 * (src/lib/content/rubric.ts): shared flow types, the Rationale score for a
 * written reason, tier badges, and display ordering for admin views.
 */

export interface ScoringNode {
  id: string;
  label: string;
}

export type ConnectionKind = "DEFAULT" | "YES" | "NO" | "RECOVERY";

export interface ScoringConnection {
  sourceNodeId: string;
  targetNodeId: string;
  connectionType?: ConnectionKind;
}

export function computeRationaleScore(text: string) {
  const len = text.trim().length;
  if (len === 0) return 0;
  if (len < 20) return 5;
  if (len < 60) return 8;
  return 10;
}

export const TIER_LABELS: Record<Tier, { badge: string; label: string }> = {
  "needs-work": { badge: "🧭", label: "Perlu Dicoba Lagi" },
  almost: { badge: "🥉", label: "Path Finder" },
  good: { badge: "🥈", label: "Flow Builder" },
  great: { badge: "🥇", label: "Flow Master" },
};

/**
 * Best-effort topological ordering of nodes for read-only display (admin
 * submission viewer). Falls back to creation order for any nodes left over
 * after a cycle or a node with no path from a root.
 */
export function orderNodesForDisplay<T extends { id: string; createdAt: Date }>(
  nodes: T[],
  connections: ScoringConnection[]
): T[] {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adjacency = new Map<string, string[]>();
  connections.forEach((c) => {
    if (!inDegree.has(c.targetNodeId)) return;
    inDegree.set(c.targetNodeId, (inDegree.get(c.targetNodeId) ?? 0) + 1);
    const list = adjacency.get(c.sourceNodeId) ?? [];
    list.push(c.targetNodeId);
    adjacency.set(c.sourceNodeId, list);
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byCreatedAt = (a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime();

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0).sort(byCreatedAt);
  const ordered: T[] = [];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    ordered.push(current);
    const next = (adjacency.get(current.id) ?? [])
      .map((id) => byId.get(id))
      .filter((n): n is T => Boolean(n) && !visited.has(n!.id));
    queue.push(...next);
    queue.sort(byCreatedAt);
  }

  const leftover = nodes.filter((n) => !visited.has(n.id)).sort(byCreatedAt);
  return [...ordered, ...leftover];
}

export interface NodeLibItem {
  kind: string;
  label: string;
  nodeType: "START" | "ACTION" | "SCREEN" | "SYSTEM" | "DECISION" | "OUTCOME" | "ERROR";
  icon: string;
  /** Decision nodes render two output handles (Ya/Tidak) instead of one. */
  decision?: boolean;
}
