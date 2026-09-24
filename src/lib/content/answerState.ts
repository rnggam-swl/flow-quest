import type { PublicAnswerOf, PublicQuestion } from "@/lib/content/publicQuestion";

/**
 * Browser-safe helpers for a quiz answer in progress — types only from the
 * content modules, so the answer keys and schemas never ship to the client.
 */

type Q<T extends PublicQuestion["type"]> = Extract<PublicQuestion, { type: T }>;

/** The starting value for a question the participant hasn't touched yet. */
export function emptyAnswer(q: PublicQuestion): unknown {
  switch (q.type) {
    case "singlechoice":
    case "oddoneout":
      return null;
    case "multiselect":
      return { selected: [] };
    case "boolean":
    case "number":
      return null;
    case "range": {
      const mid = q.min + Math.round((q.max - q.min) / 2 / q.step) * q.step;
      return { value: Math.min(q.max, Math.max(q.min, mid)) };
    }
    case "matching":
      return { links: [] };
    case "grouping":
      return { placement: q.items.map(() => null) };
    case "wordblank":
      return { values: {} };
    case "sequencing":
      return { order: q.items.map((_, i) => i) };
    case "hotspot":
      return { marks: [] };
    case "branching":
      return { choices: [] };
  }
}

/** Whether the answer is complete enough to check or submit. */
export function isAnswered(q: PublicQuestion, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  switch (q.type) {
    case "singlechoice":
    case "oddoneout":
      return typeof (value as PublicAnswerOf<"singlechoice">).selected === "number";
    case "multiselect":
      return (value as PublicAnswerOf<"multiselect">).selected.length > 0;
    case "boolean":
      return typeof (value as PublicAnswerOf<"boolean">).value === "boolean";
    case "number":
      return Number.isFinite((value as PublicAnswerOf<"number">).value);
    case "range":
    case "sequencing":
      return true;
    case "matching": {
      const links = (value as PublicAnswerOf<"matching">).links;
      return (q as Q<"matching">).items.every((_, i) => links.some((l) => l.item === i));
    }
    case "grouping":
      return (value as PublicAnswerOf<"grouping">).placement.every((p) => p !== null);
    case "wordblank": {
      const values = (value as PublicAnswerOf<"wordblank">).values;
      return (q as Q<"wordblank">).tokens.every((t, i) => t !== null || (values[String(i)] ?? "").trim() !== "");
    }
    case "hotspot":
      return (value as PublicAnswerOf<"hotspot">).marks.length === (q as Q<"hotspot">).spotCount;
    case "branching": {
      const bq = q as Q<"branching">;
      const byId = new Map(bq.nodes.map((n) => [n.id, n]));
      let node = byId.get(bq.start);
      for (const c of (value as PublicAnswerOf<"branching">).choices) node = node && byId.get(node.choices[c]?.target ?? "");
      return Boolean(node?.ending);
    }
  }
}
