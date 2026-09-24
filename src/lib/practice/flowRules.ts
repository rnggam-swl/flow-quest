import type { NodeDictionary } from "@/lib/practice/nodes";

/**
 * Rule checker for the Modul Latihan flow fixer ("Flexible Answer Model"):
 * instead of matching one answer key, a flow passes when every rule in its
 * list holds, so any arrangement that satisfies them all counts as correct.
 *
 * Edges are written as "from>to" with an optional kind suffix — ":Y" (Ya
 * branch), ":N" (Tidak branch) or ":R" (recovery path). Recovery edges are
 * drawn but never count as forward progress, so they're ignored when
 * checking what's reachable.
 */

export type EdgeKind = "" | "Y" | "N" | "R";

export interface PracticeEdge {
  f: string;
  t: string;
  k: EdgeKind;
  key: string;
}

export const EDGE_PATTERN = /^[a-z0-9]+>[a-z0-9]+(?::[YNR])?$/;

export const RULE_NAMES = ["connected", "reach", "terminal", "before", "branch", "twoSides", "recovery", "not"] as const;

export function parseEdge(s: string): PracticeEdge {
  const [pair, k = ""] = s.split(":");
  const [f, t] = pair.split(">");
  return { f, t, k: k as EdgeKind, key: s };
}

export function edgeText(e: PracticeEdge, dict: NodeDictionary): string {
  if (e.k === "R") return `${dict.label(e.f)} ⟲ ${dict.label(e.t)}`;
  return `${dict.label(e.f)} → ${dict.label(e.t)}`;
}

/** Forward reachability (recovery edges ignored); `skip` is a node the path may not pass through. */
function reach(edges: PracticeEdge[], from: string, to: string, skip?: string): boolean {
  if (from === skip) return false;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) return true;
    for (const e of edges) {
      if (e.k === "R" || e.f !== cur || e.t === skip || seen.has(e.t)) continue;
      seen.add(e.t);
      queue.push(e.t);
    }
  }
  return false;
}

export interface RuleResult {
  label: string;
  pass: boolean;
}

export function isKnownRule(spec: string): boolean {
  const name = spec.split(":")[0];
  if (name === "not") return EDGE_PATTERN.test(spec.slice(4));
  return (RULE_NAMES as readonly string[]).includes(name);
}

export function checkRule(spec: string, nodes: string[], edges: PracticeEdge[], start: string, dict: NodeDictionary): RuleResult {
  const [name, a, b] = spec.split(":");
  const L = dict.label;
  switch (name) {
    case "connected":
      return { label: "Semua node tersambung", pass: nodes.every((n) => edges.some((e) => e.f === n || e.t === n)) };
    case "reach":
      return { label: `Ada jalan dari ${L(start)} sampai ${L(a)}`, pass: reach(edges, start, a) };
    case "terminal":
      return { label: `${L(a)} tidak punya panah keluar`, pass: !edges.some((e) => e.f === a) };
    case "before":
      return { label: `${L(a)} dilewati sebelum ${L(b)}`, pass: reach(edges, start, b) && !reach(edges, start, b, a) };
    case "branch": {
      const incoming = edges.filter((e) => e.t === a && e.k !== "R");
      const fromOutcome = incoming.some((e) => dict.type(e.f) === "outcome");
      return { label: `${L(a)} muncul sebagai cabang gagal, bukan setelah hasil akhir`, pass: incoming.length > 0 && !fromOutcome };
    }
    case "twoSides": {
      const outs = edges.filter((e) => e.f === a);
      return { label: `${L(a)} punya cabang Ya dan Tidak`, pass: outs.some((e) => e.k === "Y") && outs.some((e) => e.k === "N") };
    }
    case "recovery":
      return { label: `${L(a)} punya jalan kembali ke ${L(b)}`, pass: edges.some((e) => e.f === a && e.t === b && e.k === "R") };
    case "not": {
      const target = parseEdge(spec.slice(4));
      const label =
        target.k === "R"
          ? `${L(target.f)} tidak mengarahkan kembali ke ${L(target.t)}`
          : `Tidak ada sambungan ${L(target.f)} → ${L(target.t)}`;
      return { label, pass: !edges.some((e) => e.key === target.key) };
    }
    default:
      return { label: spec, pass: false };
  }
}

/** Checks every rule against the edges that are currently switched on. */
export function checkRules(rules: string[], nodes: string[], edgeKeys: string[], start: string, dict: NodeDictionary): RuleResult[] {
  const edges = edgeKeys.map(parseEdge);
  return rules.map((r) => checkRule(r, nodes, edges, start, dict));
}
