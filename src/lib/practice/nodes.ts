import type { CaseNode } from "@/lib/content/case";

/**
 * How Modul Latihan widgets name and classify node keys — built from the
 * case's node library, so fixers and diagrams in any case use its own nodes.
 */
export interface NodeDictionary {
  label(key: string): string;
  /** Lower-case node type (screen/system/decision/outcome/error), as the diagram styles and rules expect. */
  type(key: string): PracticeNodeType | undefined;
}

export type PracticeNodeType = "screen" | "system" | "decision" | "outcome" | "error";

const TYPE: Record<CaseNode["nodeType"], PracticeNodeType> = {
  START: "screen",
  ACTION: "screen",
  SCREEN: "screen",
  SYSTEM: "system",
  DECISION: "decision",
  OUTCOME: "outcome",
  ERROR: "error",
};

export function nodeDictionary(nodes: CaseNode[]): NodeDictionary {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return {
    label: (key) => byKey.get(key)?.label ?? key,
    type: (key) => {
      const n = byKey.get(key);
      return n ? TYPE[n.nodeType] : undefined;
    },
  };
}
