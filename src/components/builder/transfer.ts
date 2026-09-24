"use client";

import type { CaseContent, CaseNode } from "@/lib/content/case";
import { mergeLibraryNodes } from "@/lib/content/caseEdit";
import { envelope, readTransfer, transferFileName, type TransferKind, type TransferResult, type TransferEnvelope } from "@/lib/content/transfer";

/** Browser side of JSON export/import: save a file, and pick one to read. */

export function downloadJson(kind: TransferKind, data: unknown, nameParts: (string | number)[], source?: TransferEnvelope<unknown>["source"], nodes?: CaseNode[]) {
  const blob = new Blob([JSON.stringify(envelope(kind, data, source, nodes), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = transferFileName(...nameParts);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the file picker and reads the chosen JSON file as `kind`; null when the author cancels. */
export function pickJson<K extends TransferKind>(kind: K): Promise<TransferResult<K> | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 3_000_000) return resolve({ ok: false, error: "File terlalu besar (maks. 3 MB)." });
      resolve(readTransfer(await file.text(), kind));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * After importing a quest or module: offers to add the library nodes it came
 * with that this case doesn't have yet. Returns the (possibly) extended case.
 */
export function offerShippedNodes(content: CaseContent, shipped: CaseNode[], toast: (m: string, kind?: "ok" | "error") => void): CaseContent {
  const missing = shipped.filter((n) => !content.nodes.some((x) => x.key === n.key && x.label === n.label));
  if (!missing.length) return content;
  if (!window.confirm(`File ini membawa ${missing.length} node yang belum ada di kamus kasus ini (${missing.map((n) => n.label).join(", ")}). Tambahkan ke kamus?`)) return content;
  const r = mergeLibraryNodes(content, missing);
  if (r.clashes.length) toast(`${r.added.length} node ditambahkan. ${r.clashes.length} tidak ditambahkan karena kunci atau labelnya sudah dipakai: ${r.clashes.map((n) => n.key).join(", ")}.`, "error");
  else toast(`${r.added.length} node ditambahkan ke kamus kasus.`);
  return r.content;
}
