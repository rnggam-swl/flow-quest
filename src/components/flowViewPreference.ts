"use client";

import { useEffect, useSyncExternalStore } from "react";

export type FlowGraphViewMode = "VERTICAL" | "HORIZONTAL";

const STORAGE_KEY = "admin-flow-view-mode";

/**
 * The admin's chosen orientation for read-only flow diagrams, shared by every
 * diagram on the page so one toggle flips all of them at once, and remembered
 * across visits in localStorage.
 *
 * `null` means "not chosen yet", which is what both the server render and the
 * first client render see — each diagram then falls back to the orientation
 * the participant themselves built in. The saved value is only read in an
 * effect, after hydration, so a remembered preference can never cause a
 * server/client markup mismatch.
 */
let current: FlowGraphViewMode | null = null;
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

function getSnapshot() {
  return current;
}

function getServerSnapshot(): FlowGraphViewMode | null {
  return null;
}

export function setAdminFlowViewMode(mode: FlowGraphViewMode) {
  if (current === mode) return;
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Best-effort — the preference just won't survive a reload.
  }
  emit();
}

/** Resolves to the admin's chosen orientation, or `fallback` (the participant's own) until they pick one. */
export function useAdminFlowViewMode(fallback: FlowGraphViewMode): FlowGraphViewMode {
  const chosen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (current !== null) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "VERTICAL" || saved === "HORIZONTAL") {
        current = saved;
        emit();
      }
    } catch {
      // No stored preference available — stay on the participant's own orientation.
    }
  }, []);

  return chosen ?? fallback;
}
