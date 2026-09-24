import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { caseContentSchema } from "./case";
import { QUESTION_TYPE_GROUPS, changeQuestionType, duplicateQuestion, newQuestion, nextQuestionId } from "./builderDefaults";
import { findDraftProblems } from "./draftProblems";
import { findQuestionProblems, questionSchema, type QuestionType } from "./questions";

const root = path.resolve(import.meta.dirname, "../../..");
const klub = caseContentSchema.parse(JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8")));
const keys = new Set(klub.nodes.map((n) => n.key));
const allTypes = QUESTION_TYPE_GROUPS.flatMap((g) => g.types);

describe("new questions", () => {
  it("offers every question type in the add menu", () => {
    expect(new Set(allTypes).size).toBe(13);
  });

  it.each(allTypes)("a new %s question is only missing what the author must supply", (type: QuestionType) => {
    const q = { ...newQuestion(type, [], klub.nodes), prompt: "Pertanyaan" };
    const parsed = questionSchema.safeParse(q);
    if (type === "hotspot") {
      // The picture and its spots have to come from the author.
      expect(parsed.success).toBe(false);
      return;
    }
    expect(parsed.success).toBe(true);
    const problems = findQuestionProblems(parsed.data!, "q", keys);
    expect(problems).toEqual(type === "flow" ? ["q: rubrik belum punya poin; gambar kunci jawaban lalu klik Usulkan rubrik"] : []);
  });

  it("numbers ids past the ones taken and keeps a duplicate's id unique", () => {
    expect(nextQuestionId(["soal-1", "soal-3"])).toBe("soal-2");
    const q = newQuestion("singlechoice", [], klub.nodes);
    expect(duplicateQuestion(q, [q.id]).id).toBe("soal-1-salinan");
    expect(duplicateQuestion(q, [q.id, "soal-1-salinan"]).id).toBe("soal-1-salinan-2");
  });

  it("keeps the prompt, help and media when the type changes", () => {
    const q = { ...newQuestion("singlechoice", [], klub.nodes), prompt: "P", help: "H", media: [{ kind: "image" as const, url: "/x.png" }] };
    const changed = changeQuestionType(q, "sequencing", klub.nodes);
    expect(changed).toMatchObject({ id: q.id, prompt: "P", help: "H", media: q.media, type: "sequencing" });
  });
});

describe("findDraftProblems", () => {
  it("finds nothing in a publishable case", () => {
    const r = findDraftProblems(klub);
    expect(r.problems).toEqual([]);
    expect(r.content).not.toBeNull();
  });

  it("points schema problems at their quest and question, in the author's words", () => {
    const draft = structuredClone(klub);
    draft.quests[0].questions[0].prompt = "";
    const q = draft.quests[0].questions[0];
    if (q.type === "singlechoice") q.options[1].text = "";
    const { problems, content } = findDraftProblems(draft);
    expect(content).toBeNull();
    expect(problems).toEqual([
      { quest: 1, question: "goal", message: 'quest 1, soal "goal": pertanyaan tidak boleh kosong' },
      { quest: 1, question: "goal", message: 'quest 1, soal "goal": opsi 2 › teks tidak boleh kosong' },
    ]);
  });

  it("points case-level checks at their quest and question too", () => {
    const draft = structuredClone(klub);
    const q = draft.quests[0].questions[0];
    if (q.type === "singlechoice") q.options.forEach((o) => (o.correct = undefined));
    expect(findDraftProblems(draft).problems).toEqual([{ quest: 1, question: "goal", message: 'quest 1, soal "goal": pilihan tunggal harus punya tepat satu opsi benar' }]);
  });
});
