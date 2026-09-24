"use client";

import { createContext, useContext } from "react";
import type { NodeDictionary } from "@/lib/practice/nodes";

/** The case's node dictionary, for every Modul Latihan diagram and fixer on the page. */
const PracticeNodesContext = createContext<NodeDictionary | null>(null);

export const PracticeNodesProvider = PracticeNodesContext.Provider;

export function usePracticeNodes(): NodeDictionary {
  const dict = useContext(PracticeNodesContext);
  if (!dict) throw new Error("Modul Latihan widgets must render inside a PracticeNodesProvider");
  return dict;
}
