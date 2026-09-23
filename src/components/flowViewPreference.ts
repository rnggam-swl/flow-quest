"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FlowGraphViewMode } from "@/lib/flowGraph";

const STORAGE_PREFIX = "admin-flow-view-mode:";

/**
 * Per-diagram orientation preference for the read-only flow diagrams on the
 * admin pages. Each diagram keeps its own choice (a grader may want the Quest
 * 3 decision flow vertical while reading the rest horizontally) and remembers
 * it across visits under its own localStorage key.
 *
 * A key with no entry resolves to `null`, which is what both the server render
 * and the first client render see — the diagram then falls back to the
 * orientation the participant themselves built in. The saved value is only
 * read in an effect, after hydration, so a remembered preference can never
 * cause a server/client markup mismatch.
 */
const chosen = new Map<string, FlowGraphViewMode>();
/** Keys already looked up in localStorage, so a diagram left on its default doesn't re-read on every render. */
const loaded = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAdminFlowViewMode(key: string, mode: FlowGraphViewMode) {
  if (chosen.get(key) === mode) return;
  chosen.set(key, mode);
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, mode);
  } catch {
    // Best-effort — the preference just won't survive a reload.
  }
  emit();
}

/** Resolves to this diagram's chosen orientation, or `fallback` (the participant's own) until one is picked. */
export function useAdminFlowViewMode(key: string, fallback: FlowGraphViewMode): FlowGraphViewMode {
  const mode = useSyncExternalStore(
    subscribe,
    () => chosen.get(key),
    () => undefined
  );

  useEffect(() => {
    if (loaded.has(key)) return;
    loaded.add(key);
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (saved === "VERTICAL" || saved === "HORIZONTAL") {
        chosen.set(key, saved);
        emit();
      }
    } catch {
      // No stored preference available — stay on the participant's own orientation.
    }
  }, [key]);

  return mode ?? fallback;
}
