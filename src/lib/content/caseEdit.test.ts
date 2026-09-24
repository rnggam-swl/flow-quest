import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { caseContentSchema, findCaseProblems, moduleWidgetSchema, type CaseContent } from "./case";
import {
  PLAN_WIDGET_TYPES,
  WIDGET_TYPE_LABELS,
  addQuest,
  blankCase,
  duplicateModule,
  duplicateQuest,
  insertModule,
  insertQuest,
  libraryNodesFor,
  mergeLibraryNodes,
  moduleNodeKeys,
  moveQuest,
  newModule,
  newWidget,
  nodeKeyUsage,
  questNodeKeys,
  removeQuest,
  renameNodeKey,
  slugifyCaseKey,
  type WidgetType,
} from "./caseEdit";
import { findDraftProblems } from "./draftProblems";
import { envelope, readTransfer } from "./transfer";
import { scoreFlow } from "./rubric";

const root = path.resolve(import.meta.dirname, "../../..");
const raw = JSON.parse(readFileSync(path.join(root, "prisma/cases/klub-fotografi.json"), "utf8"));
const klub = caseContentSchema.parse(raw);
const clone = (): CaseContent => structuredClone(klub);
const titles = (c: CaseContent) => c.quests.map((q) => `${q.order}:${q.title}`);

describe("quest management", () => {
  it("keeps orders 1..n through add, duplicate, move and remove", () => {
    let c = addQuest(clone());
    expect(c.quests.map((q) => q.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(c.quests[5].questions).toHaveLength(1);

    c = duplicateQuest(clone(), 2);
    expect(titles(c).slice(1, 3)).toEqual([`2:${klub.quests[1].title}`, `3:${klub.quests[1].title} (salinan)`]);
    expect(c.quests).toHaveLength(6);

    c = moveQuest(clone(), 5, 1);
    expect(c.quests[0].title).toBe(klub.quests[4].title);
    expect(c.quests.map((q) => q.order)).toEqual([1, 2, 3, 4, 5]);
    expect(findCaseProblems(c)).toEqual([]);

    c = removeQuest(clone(), 3);
    expect(c.quests.map((q) => q.order)).toEqual([1, 2, 3, 4]);
    expect(c.quests[2].title).toBe(klub.quests[3].title);
  });

  it("never removes the last quest", () => {
    const one = { ...clone(), quests: [clone().quests[0]] };
    expect(removeQuest(one, 1).quests).toHaveLength(1);
  });

  it("inserts an imported quest at the end or in place of one", () => {
    const q = structuredClone(klub.quests[0]);
    expect(insertQuest(clone(), q).quests.map((x) => x.order)).toEqual([1, 2, 3, 4, 5, 6]);
    const replaced = insertQuest(clone(), { ...q, title: "Baru" }, 4);
    expect(replaced.quests).toHaveLength(5);
    expect(replaced.quests[3]).toMatchObject({ order: 4, title: "Baru" });
  });
});

describe("a new case", () => {
  it("starts as a draft that only lacks what the author must write", () => {
    const c = blankCase("kasus-baru", "Kasus Baru");
    const messages = findDraftProblems(c).problems.map((p) => p.message);
    expect(messages).toEqual([
      "cerita kasus tidak boleh kosong",
      "quest 1: tujuan quest tidak boleh kosong",
      'quest 1, soal "soal-1": pertanyaan tidak boleh kosong',
    ]);
    expect(messages.join("\n")).toMatch(/quest 1, soal "soal-1": pertanyaan tidak boleh kosong/);
  });

  it("suggests a case key from a title", () => {
    expect(slugifyCaseKey("Pendaftaran Klub Fotografi!")).toBe("pendaftaran-klub-fotografi");
    expect(slugifyCaseKey("  Éxàmple  2 ")).toBe("example-2");
  });
});

describe("node library edits", () => {
  it("lists where a node is used, and nothing for an unused one", () => {
    const uses = nodeKeyUsage(klub, "verif");
    expect(uses).toContain("Quest 5 · palet soal flow");
    expect(uses).toContain("Quest 5 · rubrik");
    expect(uses.some((u) => u.startsWith("Modul"))).toBe(true);
    expect(nodeKeyUsage({ ...clone(), nodes: [...klub.nodes, { key: "baru", label: "Baru", nodeType: "SCREEN", icon: "□" }] }, "baru")).toEqual([]);
  });

  it("renames a key everywhere, so the case stays valid and scores the same", () => {
    const renamed = renameNodeKey(clone(), "verif", "ceknis");
    expect(findCaseProblems(renamed)).toEqual([]);
    expect(nodeKeyUsage(renamed, "verif")).toEqual([]);
    expect(nodeKeyUsage(renamed, "ceknis")).toEqual(nodeKeyUsage(klub, "verif"));
    expect(JSON.stringify(renamed)).not.toMatch(/"verif"|verif>|>verif|:verif\b/);

    // The same flow, named with the new key, gets the same score from the renamed rubric.
    const flowQ = (c: CaseContent) => c.quests[4].questions.find((q) => q.type === "flow")!;
    const graph = (k: string) => ({
      nodes: ["home", "clublist", "clubdetail", "regform", k, "success", "error"].map((key, i) => ({ id: `n${i}`, key, type: undefined })),
      edges: [
        { from: "n0", to: "n1", kind: "DEFAULT" as const },
        { from: "n1", to: "n2", kind: "DEFAULT" as const },
        { from: "n2", to: "n3", kind: "DEFAULT" as const },
        { from: "n3", to: "n4", kind: "DEFAULT" as const },
        { from: "n4", to: "n5", kind: "YES" as const },
        { from: "n4", to: "n6", kind: "NO" as const },
      ],
    });
    const before = flowQ(klub);
    const after = flowQ(renamed);
    if (before.type !== "flow" || after.type !== "flow") throw new Error("expected flow");
    expect(scoreFlow(after.rubric, graph("ceknis"))).toEqual(scoreFlow(before.rubric, graph("verif")));
  });
});

describe("modules and widgets", () => {
  it.each(Object.keys(WIDGET_TYPE_LABELS) as WidgetType[])("a new %s widget has the right shape", (type) => {
    expect(moduleWidgetSchema.safeParse(newWidget(type, klub.nodes)).success).toBe(true);
  });

  it("offers every widget but markdown text for a participant's main exercise", () => {
    expect(PLAN_WIDGET_TYPES).toHaveLength(11);
    expect(PLAN_WIDGET_TYPES).not.toContain("text");
  });

  it("a new module is flagged only for the questions left to write", () => {
    const c = clone();
    const m = newModule(c);
    expect(m.key).toBe("G");
    const problems = findCaseProblems({ ...c, modules: [...c.modules, m] });
    expect(problems).toEqual(["modul G, coba 1: pertanyaan belum diisi", "modul G, latihan 1: pertanyaan belum diisi"]);
    expect(findDraftProblems({ ...c, modules: [...c.modules, m] }).problems.every((p) => p.module === "G")).toBe(true);
  });

  it("a new fixer's example solution satisfies its rule and its start state doesn't", () => {
    const c = clone();
    const m = { ...newModule(c), coba: [], latihan: [newWidget("fixer", c.nodes)] };
    expect(findCaseProblems({ ...c, modules: [m] })).toEqual([]);
  });

  it("flags fixer rules that name nodes the fixer doesn't show", () => {
    const c = clone();
    const fixer = { ...newWidget("fixer", c.nodes), rules: ["reach:success"] };
    expect(findCaseProblems({ ...c, modules: [{ ...newModule(c), coba: [], latihan: [fixer] }] }).join("\n")).toMatch(/aturan memakai node yang tidak ada di daftar node latihan: success/);
  });

  it("duplicates a module under a fresh key, and imports one without clobbering unless asked", () => {
    const d = duplicateModule(clone(), "B");
    expect(d.modules.map((m) => m.key)).toEqual(["A", "B", "G", "C", "D", "E", "F"]);
    const imported = { ...klub.modules[0], title: "Impor" };
    expect(insertModule(clone(), imported, false).modules.map((m) => m.key)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(insertModule(clone(), imported, true).modules[0].title).toBe("Impor");
  });
});

describe("JSON transfer", () => {
  it("round-trips a quest and a module through an export envelope", () => {
    const quest = readTransfer(JSON.stringify(envelope("quest", klub.quests[1])), "quest");
    expect(quest).toEqual({ ok: true, data: klub.quests[1], nodes: [] });
    const mod = readTransfer(JSON.stringify(envelope("module", klub.modules[2])), "module");
    expect(mod).toEqual({ ok: true, data: klub.modules[2], nodes: [] });
  });

  it("reads a bare case file, and says so when a file holds something else", () => {
    const c = readTransfer(JSON.stringify(raw), "case");
    expect(c.ok && c.data.key).toBe("klub-fotografi");
    const wrong = readTransfer(JSON.stringify(envelope("module", klub.modules[0])), "quest");
    expect(wrong).toEqual({ ok: false, error: "File ini berisi modul, bukan quest." });
    const bareWrong = readTransfer(JSON.stringify(klub.modules[0]), "case");
    expect(bareWrong.ok).toBe(false);
    expect(readTransfer("{nope", "case")).toEqual({ ok: false, error: "File ini bukan JSON yang valid." });
  });

  it("accepts an unfinished draft export, and drops a plan file's participant name", () => {
    const draft = blankCase("baru", "Baru");
    expect(readTransfer(JSON.stringify(envelope("case", draft)), "case").ok).toBe(true);
    const plan = readTransfer(JSON.stringify({ participant: "Peserta Demo", email: "x@y", intro: "Halo", modules: ["A"] }), "plan");
    expect(plan).toEqual({ ok: true, data: { intro: "Halo", modules: ["A"], strengths: [] }, nodes: [] });
  });
});

describe("moving a quest or module to another case", () => {
  it("ships the library nodes it uses, and adds them to a case that lacks them", () => {
    const q5 = klub.quests[4];
    const keys = questNodeKeys(q5);
    expect(keys).toEqual(expect.arrayContaining(["home", "verif", "success", "error"]));
    expect(moduleNodeKeys(klub.modules[0])).toEqual([]);
    expect(moduleNodeKeys(klub.modules[1]).length).toBeGreaterThan(0);

    const shipped = readTransfer(JSON.stringify(envelope("quest", q5, undefined, libraryNodesFor(klub, keys))), "quest");
    if (!shipped.ok) throw new Error(shipped.error);
    const target = insertQuest(blankCase("lain", "Lain"), shipped.data);
    expect(findCaseProblems(target).join("\n")).toMatch(/palet memakai node yang tidak ada/);
    const merged = mergeLibraryNodes(target, shipped.nodes);
    expect(merged.clashes).toEqual([]);
    expect(findCaseProblems(merged.content)).toEqual([]);
  });

  it("never overwrites a node whose key or label is already taken", () => {
    const c = blankCase("lain", "Lain");
    const r = mergeLibraryNodes(c, [
      { key: "mulai", label: "Halaman Awal", nodeType: "START", icon: "🏠" },
      { key: "mulai", label: "Beranda", nodeType: "START", icon: "🏠" },
      { key: "beranda", label: "Berhasil", nodeType: "SCREEN", icon: "□" },
      { key: "baru", label: "Baru", nodeType: "SCREEN", icon: "□" },
    ]);
    expect(r.added.map((n) => n.key)).toEqual(["baru"]);
    expect(r.clashes.map((n) => n.label)).toEqual(["Beranda", "Berhasil"]);
  });
});
