import type { CaseNode } from "@/lib/content/case";
import type { FlowRubric } from "@/lib/content/rubric";
import { QUESTION_ID, type Question, type QuestionType } from "@/lib/content/questions";

/**
 * Starting points for the builder: a fresh question of each type, changing a
 * question's type, and duplicating one. Defaults are deliberately filled in
 * (options, items, a first answer key) so a new question is one or two edits
 * from valid — only the prompt is left empty, which the problem list flags.
 */

export const QUESTION_TYPE_ICONS: Record<QuestionType, string> = {
  singlechoice: "◉",
  multiselect: "☑",
  boolean: "⊘",
  number: "#",
  range: "⇔",
  matching: "⇌",
  grouping: "▦",
  wordblank: "▢",
  sequencing: "⇅",
  oddoneout: "◈",
  hotspot: "⊕",
  branching: "⎇",
  flow: "⤳",
};

/** The builder's "Add question" menu, grouped as in the prototype. */
export const QUESTION_TYPE_GROUPS: { label: string; types: QuestionType[] }[] = [
  { label: "Jawaban", types: ["singlechoice", "multiselect", "boolean", "number", "range"] },
  { label: "Interaksi", types: ["matching", "grouping", "wordblank", "sequencing", "oddoneout", "hotspot", "branching"] },
  { label: "Flow", types: ["flow"] },
];

/** The smallest "soal-N" id not taken in the quest. */
export function nextQuestionId(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`soal-${n}`)) return `soal-${n}`;
}

/** An empty rubric: nothing scores until the author draws a key and asks for a suggestion (or writes one). */
export function emptyRubric(): FlowRubric {
  return {
    checks: {},
    scores: {},
    tiers: [],
    otherwise: { tier: "needs-work", message: "Rubrik belum dibuat." },
    notes: [],
  };
}

type Base = { id: string; prompt: string; help?: string; media?: Question["media"] };
/** Omit over each member of a union, so the per-type fields stay checked. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function fields(type: QuestionType, nodes: CaseNode[]): DistOmit<Question, keyof Base> {
  switch (type) {
    case "singlechoice":
      return { type, options: [{ text: "Opsi 1", correct: true }, { text: "Opsi 2" }, { text: "Opsi 3" }] };
    case "multiselect":
      return { type, options: [{ text: "Opsi 1", correct: true }, { text: "Opsi 2", correct: true }, { text: "Opsi 3" }] };
    case "boolean":
      return { type, answer: true };
    case "number":
      return { type, answer: 0, tolerance: 0 };
    case "range":
      return { type, min: 0, max: 100, step: 1, answer: 50, tolerance: 0 };
    case "matching":
      return {
        type,
        items: [
          { label: "Item 1", pairs: [{ text: "Pasangan 1" }] },
          { label: "Item 2", pairs: [{ text: "Pasangan 2" }] },
        ],
      };
    case "grouping":
      return {
        type,
        groups: ["Kelompok A", "Kelompok B"],
        items: [
          { text: "Item 1", group: 0 },
          { text: "Item 2", group: 1 },
        ],
      };
    case "wordblank":
      return { type, answerText: "Jawaban", blankMode: "letter", blanks: [1, 3] };
    case "sequencing":
      return { type, items: [{ text: "Langkah 1" }, { text: "Langkah 2" }, { text: "Langkah 3" }] };
    case "oddoneout":
      return { type, items: [{ text: "Item 1" }, { text: "Item 2" }, { text: "Item 3" }, { text: "Beda sendiri" }], odd: 3 };
    case "hotspot":
      return { type, image: { kind: "image", url: "" }, spots: [] };
    case "branching":
      return {
        type,
        start: "awal",
        nodes: [
          {
            id: "awal",
            text: "Awal cerita.",
            x: 24,
            y: 24,
            choices: [
              { text: "Pilihan yang tepat", target: "akhir-baik", correct: true },
              { text: "Pilihan yang kurang tepat", target: "akhir-buruk" },
            ],
          },
          { id: "akhir-baik", text: "Akhir yang baik.", x: 340, y: 24, ending: true, endingLabel: "Ending Baik", choices: [] },
          { id: "akhir-buruk", text: "Akhir yang kurang baik.", x: 340, y: 240, ending: true, endingLabel: "Ending Kurang Baik", choices: [] },
        ],
      };
    case "flow":
      return { type, palette: nodes.map((n) => n.key), rubric: emptyRubric() };
  }
}

export function newQuestion(type: QuestionType, takenIds: Iterable<string>, nodes: CaseNode[]): Question {
  return { id: nextQuestionId(takenIds), prompt: "", ...fields(type, nodes) } as Question;
}

/** Keeps what every question has (id, prompt, help, media); the answer fields start over for the new type. */
export function changeQuestionType(q: Question, type: QuestionType, nodes: CaseNode[]): Question {
  if (q.type === type) return q;
  const base: Base = { id: q.id, prompt: q.prompt, help: q.help, media: q.media };
  return { ...base, ...fields(type, nodes) } as Question;
}

export function duplicateQuestion(q: Question, takenIds: Iterable<string>): Question {
  const copy = structuredClone(q);
  const taken = new Set(takenIds);
  const stem = QUESTION_ID.test(`${q.id}-salinan`) ? `${q.id}-salinan` : "salinan";
  let id = stem;
  for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
  return { ...copy, id };
}
