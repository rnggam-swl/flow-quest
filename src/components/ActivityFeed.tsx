"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface ActivityItem {
  id: string;
  event: string;
  displayName: string;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  SESSION_JOINED: "bergabung ke session",
  QUEST_STARTED: "memulai quest",
  QUEST_COMPLETED: "menyelesaikan quest",
  NODE_CREATED: "menambah node flow",
  NODE_DELETED: "menghapus node flow",
  NODE_CONNECTED: "menyambungkan node",
  FLOW_SUBMITTED: "mengirim flow",
  REFLECTION_SUBMITTED: "mengirim alasan/refleksi",
};

export function ActivityFeed({ initialItems }: { initialItems: ActivityItem[] }) {
  const [items, setItems] = useState(initialItems);
  const seenIds = useRef(new Set(initialItems.map((i) => i.id)));

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    function addItem(item: ActivityItem) {
      if (seenIds.current.has(item.id)) return;
      seenIds.current.add(item.id);
      setItems((prev) => [item, ...prev].slice(0, 30));
    }

    if (url && anonKey) {
      const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
      const channel = supabase
        .channel("admin-activity")
        .on("broadcast", { event: "activity" }, (payload) => {
          const p = payload.payload as { id: string; event: string; createdAt: string; displayName?: string };
          addItem({ id: p.id, event: p.event, displayName: p.displayName ?? "—", createdAt: p.createdAt });
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }

    // Polling fallback when realtime credentials aren't configured yet.
    const interval = setInterval(async () => {
      const res = await fetch("/api/admin/activity");
      if (!res.ok) return;
      const data: ActivityItem[] = await res.json();
      [...data].reverse().forEach(addItem);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-[13px] font-semibold text-muted">Aktivitas Terbaru</div>
      <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
        {items.length === 0 && <div className="text-[13px] text-muted2">Belum ada aktivitas.</div>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-[13px]">
            <span>
              <b className="text-text">{item.displayName}</b>{" "}
              <span className="text-muted">{EVENT_LABELS[item.event] ?? item.event}</span>
            </span>
            <span className="whitespace-nowrap text-[11.5px] text-muted2">
              {new Date(item.createdAt).toLocaleTimeString("id-ID")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
