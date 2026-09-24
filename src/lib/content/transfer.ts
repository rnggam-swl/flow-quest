import { z } from "zod";
import { caseContentSchema, libraryNodeSchema, moduleContentSchema, questContentSchema, type CaseContent, type CaseNode, type ModuleContent, type QuestContent } from "@/lib/content/case";
import { practicePlanContentSchema, type PracticePlanContent } from "@/lib/practice/schema";

/**
 * JSON export and import for content: a whole case, one quest, one module, or
 * a participant's plan. Exports are wrapped in a small envelope that says what
 * they hold, so importing a module file into the quest editor fails with a
 * clear message instead of a wall of schema errors. Bare content (e.g. a case
 * file from prisma/cases/) is accepted too.
 */

export type TransferKind = "case" | "quest" | "module" | "plan";

export const TRANSFER_FORMAT = "flow-quest";

export interface TransferEnvelope<T> {
  format: typeof TRANSFER_FORMAT;
  kind: TransferKind;
  exportedAt: string;
  /** Where it came from, for the author's reference; never used on import. */
  source?: Record<string, string | number | null>;
  data: T;
  /** For a quest or module: the library nodes it uses, so another case can take them in on import. */
  nodes?: CaseNode[];
}

export const TRANSFER_LABELS: Record<TransferKind, string> = { case: "kasus", quest: "quest", module: "modul", plan: "rencana peserta" };

export function envelope<T>(kind: TransferKind, data: T, source?: TransferEnvelope<T>["source"], nodes?: CaseNode[]): TransferEnvelope<T> {
  return { format: TRANSFER_FORMAT, kind, exportedAt: new Date().toISOString(), ...(source ? { source } : {}), data, ...(nodes?.length ? { nodes } : {}) };
}

/** A safe download file name, e.g. "klub-fotografi-quest-2.json". */
export function transferFileName(...parts: (string | number)[]): string {
  const stem = parts
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("-");
  return `${stem || "konten"}.json`;
}

const SCHEMAS = {
  case: caseContentSchema,
  quest: questContentSchema,
  module: moduleContentSchema,
  plan: practicePlanContentSchema,
} as const;

type DataOf<K extends TransferKind> = K extends "case" ? CaseContent : K extends "quest" ? QuestContent : K extends "module" ? ModuleContent : PracticePlanContent;

export type TransferResult<K extends TransferKind> = { ok: true; data: DataOf<K>; nodes: CaseNode[] } | { ok: false; error: string };

/** What an unwrapped object most likely is, so a wrong-file import can say so. */
function guessKind(raw: Record<string, unknown>): TransferKind | null {
  if ("quests" in raw && "nodes" in raw) return "case";
  if ("questions" in raw && "order" in raw) return "quest";
  if ("coba" in raw && "latihan" in raw) return "module";
  if ("intro" in raw && "modules" in raw) return "plan";
  return null;
}

/**
 * Reads text from an exported (or hand-written) file as the expected kind.
 * The content only has to have the right shape here — whether it's ready to
 * publish is the editor's problem list's job, same as for anything typed in.
 */
export function readTransfer<K extends TransferKind>(text: string, kind: K): TransferResult<K> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "File ini bukan JSON yang valid." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Isi file harus berupa objek JSON." };
  let data = raw as Record<string, unknown>;
  let nodes: CaseNode[] = [];
  if (data.format === TRANSFER_FORMAT) {
    const shipped = z.array(libraryNodeSchema).safeParse(data.nodes ?? []);
    if (shipped.success) nodes = shipped.data;
    if (data.kind !== kind) {
      const got = TRANSFER_LABELS[data.kind as TransferKind] ?? String(data.kind);
      return { ok: false, error: `File ini berisi ${got}, bukan ${TRANSFER_LABELS[kind]}.` };
    }
    data = (data.data ?? null) as Record<string, unknown>;
    if (!data || typeof data !== "object") return { ok: false, error: "File ekspor ini tidak punya isi." };
  } else {
    const guessed = guessKind(data);
    if (guessed && guessed !== kind) return { ok: false, error: `File ini sepertinya berisi ${TRANSFER_LABELS[guessed]}, bukan ${TRANSFER_LABELS[kind]}.` };
  }
  // Plan files from prisma/practice-plans/ carry the participant's name and email; they don't belong in the stored plan.
  if (kind === "plan") {
    const { participant: _p, email: _e, ...rest } = data;
    void _p;
    void _e;
    data = rest;
  }
  const parsed = (SCHEMAS[kind] as z.ZodType).safeParse(data);
  if (parsed.success) return { ok: true, data: parsed.data as DataOf<K>, nodes };
  // Empty text is only unfinished content (an export of a draft, say) — the problem list flags it after import.
  if (kind !== "plan" && parsed.error.issues.every((i) => i.code === "too_small" && i.origin === "string")) return { ok: true, data: data as unknown as DataOf<K>, nodes };
  return { ok: false, error: `Isi ${TRANSFER_LABELS[kind]} tidak sesuai format:\n${z.prettifyError(parsed.error)}` };
}
