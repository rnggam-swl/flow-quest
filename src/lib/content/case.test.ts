import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { caseContentSchema, findCaseProblems, parseCase, type CaseContent } from "./case";
import { looksLikeHtml, markdownToHtml, markdownToText, parseMarkdown } from "./markdown";
import { findQuestionProblems, questionSchema, scoreQuestion, type QuizQuestion } from "./questions";

const root = path.resolve(import.meta.dirname, "../../..");
const raw = JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8"));
const klub = caseContentSchema.parse(raw);
const clone = (): CaseContent => structuredClone(klub);

describe("Klub Fotografi case file", () => {
  it("parses and has no problems", () => {
    expect(findCaseProblems(klub)).toEqual([]);
    expect(parseCase(raw).ok).toBe(true);
  });

  it("has a Quest 1 goal question with exactly one right answer and feedback for both outcomes", () => {
    const question = klub.quests.find((q) => q.order === 1)!.questions[0];
    if (question.type !== "singlechoice") throw new Error("expected singlechoice");
    expect(question.options.filter((o) => o.correct)).toHaveLength(1);
    expect(question.feedback?.correct && question.feedback.incorrect).toBeTruthy();
  });

  it("has six Modul Latihan modules whose prose is markdown", () => {
    expect(klub.modules.map((m) => m.key)).toEqual(["A", "B", "C", "D", "E", "F"]);
    const texts = klub.modules.flatMap((m) => [...m.coba, ...m.penjelasan, ...m.latihan]).filter((w) => w.type === "text");
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) if (t.type === "text") expect(looksLikeHtml(t.md)).toBe(false);
  });
});

describe("findCaseProblems", () => {
  it("rejects duplicate node labels, gaps in quest order, and two flow questions in a quest", () => {
    const c = clone();
    c.nodes.push({ ...c.nodes[0], key: "home2" });
    c.quests[4].order = 7;
    c.quests[1].questions.push({ ...c.quests[1].questions[0], id: "flow2" });
    const problems = findCaseProblems(c).join("\n");
    expect(problems).toMatch(/label node "Home" terduplikasi/);
    expect(problems).toMatch(/urutan quest harus 1 sampai 5/);
    expect(problems).toMatch(/maksimal satu soal flow/);
  });

  it("rejects a flow palette or module fixer that uses nodes the case doesn't define", () => {
    const c = clone();
    c.nodes = c.nodes.filter((n) => n.key !== "kuota");
    const flow = c.quests[1].questions[0];
    if (flow.type === "flow") flow.palette.push("ghost");
    const problems = findCaseProblems(c).join("\n");
    expect(problems).toMatch(/palet memakai node yang tidak ada di kamus kasus: ghost/);
    // No core module uses "kuota", so removing it is fine there — it only matters to plans.
    expect(problems).not.toMatch(/modul/);
    c.modules[0].latihan.push({ type: "fixer", nodes: ["regform", "ghost"], start: "regform", initial: ["regform>ghost"], rules: ["terminal:ghost"], solution: [] });
    expect(findCaseProblems(c).join("\n")).toMatch(/modul A, latihan 2: node tidak ada di kamus kasus: ghost/);
  });

  it("rejects HTML left in authored text", () => {
    const c = clone();
    c.modules[0].penjelasan[0] = { type: "text", md: "<p>lama</p>" };
    c.quests[0].intro = "<b>Skenario</b>";
    const problems = findCaseProblems(c).join("\n");
    expect(problems).toMatch(/modul A, penjelasan 1: teks memakai tag HTML/);
    expect(problems).toMatch(/quest 1: intro memakai tag HTML/);
  });
});

const q = (raw: unknown) => questionSchema.parse(raw) as QuizQuestion;

describe("scoreQuestion", () => {
  it("single choice, boolean, number and odd one out are all-or-nothing", () => {
    const sc = q({ type: "singlechoice", id: "a", prompt: "?", options: [{ text: "x" }, { text: "y", correct: true }] });
    expect(scoreQuestion(sc, { selected: 1 })).toEqual({ correct: 1, total: 1 });
    expect(scoreQuestion(sc, { selected: 0 })).toEqual({ correct: 0, total: 1 });
    expect(scoreQuestion(q({ type: "boolean", id: "b", prompt: "?", answer: false }), { value: false }).correct).toBe(1);
    const num = q({ type: "number", id: "c", prompt: "?", answer: 10, tolerance: 0.5 });
    expect(scoreQuestion(num, { value: 10.4 }).correct).toBe(1);
    expect(scoreQuestion(num, { value: 10.6 }).correct).toBe(0);
    const odd = q({ type: "oddoneout", id: "d", prompt: "?", items: [{ text: "Figma" }, { text: "Sketch" }, { text: "Excel" }], odd: 2 });
    expect(scoreQuestion(odd, { selected: 2 })).toEqual({ correct: 1, total: 1 });
  });

  it("multi-select subtracts wrong picks so selecting everything isn't free", () => {
    const ms = q({ type: "multiselect", id: "a", prompt: "?", options: [{ text: "a", correct: true }, { text: "b", correct: true }, { text: "c" }, { text: "d" }] });
    expect(scoreQuestion(ms, { selected: [0, 1] })).toEqual({ correct: 2, total: 2 });
    expect(scoreQuestion(ms, { selected: [0, 1, 2, 3] })).toEqual({ correct: 0, total: 2 });
    expect(scoreQuestion(ms, { selected: [0, 2] })).toEqual({ correct: 0, total: 2 });
  });

  it("matching counts a pair only when linked to its own item alone", () => {
    const m = q({
      type: "matching",
      id: "a",
      prompt: "?",
      items: [
        { label: "Kucing", pairs: [{ text: "Mamalia" }] },
        { label: "Ikan", pairs: [{ text: "Insang" }, { text: "Sirip" }] },
      ],
    });
    expect(scoreQuestion(m, { links: [{ item: 0, pair: "0_0" }, { item: 1, pair: "1_0" }, { item: 1, pair: "1_1" }] })).toEqual({ correct: 3, total: 3 });
    // Linking a pair to every item doesn't earn it.
    expect(scoreQuestion(m, { links: [{ item: 0, pair: "1_0" }, { item: 1, pair: "1_0" }] })).toEqual({ correct: 0, total: 3 });
  });

  it("grouping, sequencing and word blanks give partial credit", () => {
    const g = q({ type: "grouping", id: "a", prompt: "?", groups: ["V", "I"], items: [{ text: "Ikan", group: 0 }, { text: "Cacing", group: 1 }] });
    expect(scoreQuestion(g, { placement: [0, 0] })).toEqual({ correct: 1, total: 2 });
    const s = q({ type: "sequencing", id: "b", prompt: "?", items: [{ text: "Empathize" }, { text: "Define" }, { text: "Ideate" }] });
    expect(scoreQuestion(s, { order: [0, 2, 1] })).toEqual({ correct: 1, total: 3 });
    const w = q({ type: "wordblank", id: "c", prompt: "?", answerText: "Adaptability", blankMode: "letter", blanks: [0, 1, 4] });
    expect(scoreQuestion(w, { values: { "0": "a", "1": " D ", "4": "x" } })).toEqual({ correct: 2, total: 3 });
  });

  it("hotspot lets each mark find at most one spot", () => {
    const h = q({ type: "hotspot", id: "a", prompt: "?", image: { kind: "image", url: "x.png" }, spots: [{ x: 10, y: 10, radius: 5 }, { x: 12, y: 12, radius: 5 }] });
    expect(scoreQuestion(h, { marks: [{ x: 11, y: 11 }] })).toEqual({ correct: 1, total: 2 });
    expect(scoreQuestion(h, { marks: [{ x: 11, y: 11 }, { x: 12, y: 12 }] })).toEqual({ correct: 2, total: 2 });
  });

  it("branching scores the choices made on the way to an ending", () => {
    const b = q({
      type: "branching",
      id: "a",
      prompt: "?",
      start: "s",
      nodes: [
        { id: "s", text: "Mulai", choices: [{ text: "baik", target: "m", correct: true }, { text: "buruk", target: "bad" }] },
        { id: "m", text: "Tengah", choices: [{ text: "baik", target: "good", correct: true }, { text: "buruk", target: "bad" }] },
        { id: "good", text: "Akhir baik", ending: true },
        { id: "bad", text: "Akhir buruk", ending: true },
      ],
    });
    expect(scoreQuestion(b, { choices: [0, 0] })).toEqual({ correct: 2, total: 2 });
    expect(scoreQuestion(b, { choices: [0, 1] })).toEqual({ correct: 1, total: 2 });
    expect(scoreQuestion(b, { choices: [1, 0] })).toEqual({ correct: 0, total: 1 });
  });
});

describe("findQuestionProblems", () => {
  const none = new Set<string>();
  it("catches missing or ambiguous answer keys", () => {
    expect(findQuestionProblems(q({ type: "singlechoice", id: "a", prompt: "?", options: [{ text: "x", correct: true }, { text: "y", correct: true }] }), "s", none)[0]).toMatch(/tepat satu opsi benar/);
    expect(findQuestionProblems(q({ type: "multiselect", id: "a", prompt: "?", options: [{ text: "x" }, { text: "y" }] }), "s", none)[0]).toMatch(/belum ada opsi/);
    expect(findQuestionProblems(q({ type: "wordblank", id: "a", prompt: "?", answerText: "a b", blankMode: "letter", blanks: [1] }), "s", none)[0]).toMatch(/spasi/);
  });

  it("catches branching stories that dead-end, dangle, or can't be reached", () => {
    const problems = findQuestionProblems(
      q({
        type: "branching",
        id: "a",
        prompt: "?",
        start: "s",
        nodes: [
          { id: "s", text: "Mulai", choices: [{ text: "ke x", target: "x" }] },
          { id: "stuck", text: "Buntu" },
        ],
      }),
      "s",
      none
    ).join("\n");
    expect(problems).toMatch(/belum ada node ending/);
    expect(problems).toMatch(/node "stuck" jalan buntu/);
    expect(problems).toMatch(/menunjuk node yang tidak ada/);
    expect(problems).toMatch(/tidak terjangkau dari node awal: stuck/);
  });
});

describe("markdown", () => {
  it("parses paragraphs, lists, bold and italic", () => {
    expect(parseMarkdown("Halo **tebal** dan *miring*\n\n- satu\n- dua\n\n1. a\n2. b")).toEqual([
      { t: "p", c: [{ t: "text", v: "Halo " }, { t: "b", v: "tebal" }, { t: "text", v: " dan " }, { t: "i", v: "miring" }] },
      { t: "ul", items: [[{ t: "text", v: "satu" }], [{ t: "text", v: "dua" }]] },
      { t: "ol", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] },
    ]);
    expect(markdownToText("**Tepat!** Bagus")).toBe("Tepat! Bagus");
  });

  it("never lets authored HTML through", () => {
    expect(markdownToHtml('<script>alert(1)</script> **<img src=x onerror="y">**')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; <b>&lt;img src=x onerror="y"&gt;</b></p>'
    );
    expect(looksLikeHtml("<b>x</b>")).toBe(true);
    expect(looksLikeHtml("jika a < b")).toBe(false);
  });
});
