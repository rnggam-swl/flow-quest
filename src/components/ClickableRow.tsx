"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function ClickableRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className="cursor-pointer hover:bg-surface2" onClick={() => router.push(href)}>
      {children}
    </tr>
  );
}
