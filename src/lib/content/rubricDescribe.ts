import type { Condition, FlowRubric, RubricCategory } from "@/lib/content/rubric";

/** How the builder and reports name the six rubric categories. */
export const RUBRIC_CATEGORY_LABELS: Record<RubricCategory, string> = {
  goal: "Goal",
  flow: "Flow",
  logic: "Logic",
  constraint: "Constraint",
  edgeCase: "Edge Case",
  simplicity: "Simplicity",
};

export const RUBRIC_CATEGORY_HINTS: Record<RubricCategory, string> = {
  goal: "Titik awal dan tujuan ada di flow",
  flow: "Langkah jalur utama tersambung",
  logic: "Cabang keputusan ke tempat yang tepat",
  constraint: "Aturan urutan, mis. cek dulu sebelum lanjut",
  edgeCase: "Kegagalan punya cabang dan jalan kembali",
  simplicity: "Dikurangi 1 poin per node yang tidak tersambung",
};

/** A condition in plain Indonesian, naming nodes by their labels and checks by theirs. */
export function describeCondition(c: Condition, rubric: Pick<FlowRubric, "checks">, label: (key: string) => string): string {
  const d = (x: Condition) => describeCondition(x, rubric, label);
  if ("has" in c) return `ada ${label(c.has)}`;
  if ("reach" in c) {
    const extra = [c.reach.skipRecovery ? "tanpa jalur kembali" : "", c.reach.avoid ? `tanpa lewat ${label(c.reach.avoid)}` : ""].filter(Boolean).join(", ");
    return `${label(c.reach.from)} sampai ke ${label(c.reach.to)}${extra ? ` (${extra})` : ""}`;
  }
  if ("branch" in c) return `cabang ${c.branch.side === "YES" ? "Ya" : "Tidak"} dari ${label(c.branch.from)} sampai ke ${label(c.branch.reaches)}`;
  if ("edge" in c) {
    const kind = c.edge.kind ? { DEFAULT: "biasa", YES: "Ya", NO: "Tidak", RECOVERY: "jalan kembali" }[c.edge.kind] : "apa pun";
    return `panah ${c.edge.from ? label(c.edge.from) : "mana pun"} → ${c.edge.to ? label(c.edge.to) : "mana pun"} (${kind})`;
  }
  if ("terminal" in c) return `${label(c.terminal)} tidak punya panah keluar`;
  if ("twoSides" in c) return `${label(c.twoSides)} punya cabang Ya dan Tidak`;
  if ("failBranch" in c) return `ada cabang ke ${label(c.failBranch)}`;
  if ("connected" in c) return "semua node tersambung";
  if ("check" in c) return rubric.checks[c.check]?.label ?? c.check;
  if ("all" in c) return c.all.length === 1 ? d(c.all[0]) : `semua: ${c.all.map(d).join("; ")}`;
  if ("any" in c) return `salah satu: ${c.any.map(d).join("; ")}`;
  if ("not" in c) return `belum ${d(c.not)}`;
  return `minimal ${c.atLeast} dari: ${c.of.map(d).join("; ")}`;
}
