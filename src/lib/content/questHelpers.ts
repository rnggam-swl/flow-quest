import type { CaseContent, CaseNode, QuestContent } from "@/lib/content/case";
import type { Question, QuizQuestion } from "@/lib/content/questions";
import type { NodeLibItem } from "@/lib/flowScoring";

/** Pure lookups over a case's content — safe anywhere (server, tests, scripts). */

export function questOf(content: CaseContent, order: number): QuestContent | undefined {
  return content.quests.find((q) => q.order === order);
}

export function lastQuestOrder(content: CaseContent): number {
  return Math.max(...content.quests.map((q) => q.order));
}

export function flowQuestionOf(quest: QuestContent): Extract<Question, { type: "flow" }> | undefined {
  return quest.questions.find((q): q is Extract<Question, { type: "flow" }> => q.type === "flow");
}

export function quizQuestionsOf(quest: QuestContent): QuizQuestion[] {
  return quest.questions.filter((q): q is QuizQuestion => q.type !== "flow");
}

/** The canvas sidebar for a flow question: its palette, in order, resolved against the case's node library. */
export function paletteOf(content: CaseContent, question: Extract<Question, { type: "flow" }>): NodeLibItem[] {
  return paletteItems(content.nodes, question.palette);
}

/** Canvas sidebar items for these library keys; keys the library doesn't have are skipped. */
export function paletteItems(nodes: CaseNode[], keys: string[]): NodeLibItem[] {
  const byKey = new Map<string, CaseNode>(nodes.map((n) => [n.key, n]));
  return keys.flatMap((key) => {
    const n = byKey.get(key);
    return n ? [{ kind: n.key, label: n.label, nodeType: n.nodeType, icon: n.icon, decision: n.nodeType === "DECISION" }] : [];
  });
}

/**
 * A session's timer for a quest: the admin's per-session override when set
 * (0 meaning "no timer"), else the content's.
 */
export function effectiveTimeLimit(quest: QuestContent, override: number | null | undefined): number | null {
  if (override === null || override === undefined) return quest.timeLimitMinutes;
  return override === 0 ? null : override;
}
