import type { z } from "zod";
import { caseContentSchema, findCaseProblems, type CaseContent } from "@/lib/content/case";

/**
 * Checks a case draft — possibly unfinished — and says what still stands in the
 * way of publishing it, in terms an author can act on: which quest, which
 * question, and what's wrong. Runs in the builder (live, on every edit) and on
 * the server (when saving and publishing), so both always agree.
 */

export interface DraftProblem {
  message: string;
  /** Quest order the problem is in, when it's in one. */
  quest?: number;
  /** Question id within that quest. */
  question?: string;
}

const FIELD_LABELS: Record<string, string> = {
  prompt: "pertanyaan",
  help: "teks bantuan",
  options: "opsi",
  text: "teks",
  label: "label",
  pairs: "pasangan",
  items: "item",
  groups: "bucket",
  group: "bucket",
  answer: "jawaban",
  answerText: "jawaban",
  blanks: "tile blank",
  image: "gambar",
  url: "URL",
  media: "media",
  spots: "titik",
  nodes: "node",
  choices: "pilihan",
  target: "tujuan pilihan",
  start: "node awal",
  palette: "palet",
  rubric: "rubrik",
  reflection: "refleksi",
  title: "judul",
  objective: "tujuan quest",
  id: "id",
  min: "min",
  max: "max",
  step: "step",
  odd: "item yang beda",
  questions: "soal",
  feedback: "feedback",
};

function describeField(path: PropertyKey[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (typeof seg === "number") continue;
    const label = FIELD_LABELS[String(seg)] ?? String(seg);
    const next = path[i + 1];
    parts.push(typeof next === "number" ? `${label} ${next + 1}` : label);
  }
  return parts.join(" › ");
}

function describeIssue(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string") return "tidak boleh kosong";
      if (issue.origin === "array") return `minimal ${issue.minimum} isian`;
      return `minimal ${issue.minimum}`;
    case "too_big":
      return `maksimal ${issue.maximum}`;
    case "invalid_type":
      return issue.input === undefined ? "belum diisi" : "isiannya tidak valid";
    default:
      return issue.message;
  }
}

const WHERE = /^quest (\d+)(?:, soal "([^"]+)")?: /;

export function findDraftProblems(raw: unknown): { problems: DraftProblem[]; content: CaseContent | null } {
  const parsed = caseContentSchema.safeParse(raw);
  if (!parsed.success) {
    const quests = (raw as { quests?: { order?: number; questions?: { id?: string }[] }[] } | null)?.quests;
    const problems = parsed.error.issues.map((issue): DraftProblem => {
      const path = issue.path;
      if (path[0] === "quests" && typeof path[1] === "number") {
        const quest = quests?.[path[1]];
        const order = quest?.order ?? path[1] + 1;
        if (path[2] === "questions" && typeof path[3] === "number") {
          const id = quest?.questions?.[path[3]]?.id;
          const field = describeField(path.slice(4));
          return { quest: order, question: id, message: `quest ${order}, soal ${id ? `"${id}"` : path[3] + 1}: ${field ? `${field} ` : ""}${describeIssue(issue)}` };
        }
        const field = describeField(path.slice(2));
        return { quest: order, message: `quest ${order}: ${field ? `${field} ` : ""}${describeIssue(issue)}` };
      }
      const field = describeField(path);
      return { message: `${field ? `${field} ` : ""}${describeIssue(issue)}` };
    });
    return { problems, content: null };
  }
  const problems = findCaseProblems(parsed.data).map((message): DraftProblem => {
    const m = WHERE.exec(message);
    return m ? { message, quest: Number(m[1]), question: m[2] } : { message };
  });
  return { problems, content: parsed.data };
}
