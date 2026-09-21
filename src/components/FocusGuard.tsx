"use client";

import { useEffect, useRef, useState } from "react";

/** Away trips shorter than this aren't worth reporting — avoids noise from rapid alt-tab flicker or an accidental click outside the window. */
const MIN_REPORTABLE_AWAY_SECONDS = 2;

/**
 * Blurs its children the moment the tab/window loses focus (switching to
 * another app or tab — e.g. to paste a screenshot into an AI chat) and keeps
 * them hidden until the user deliberately clicks back in. This doesn't stop
 * a screenshot from being taken in the first place, or a second device
 * photographing the screen — nothing on the web can. It targets the much
 * more common "alt-tab to ask an AI, then tab back" pattern: content stays
 * hidden for as long as they're away, and any quest timer keeps running
 * underneath, so time spent looking elsewhere is still spent.
 *
 * Also reports each away trip to the admin activity feed (best-effort, via
 * /api/activity/focus-loss) so a mentor can see when and for how long a
 * participant left the quest, instead of only the participant noticing.
 */
export function FocusGuard({ questOrder, children }: { questOrder: number; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    function handleBlur() {
      if (hiddenAtRef.current === null) hiddenAtRef.current = Date.now();
      setHidden(true);
    }
    function handleVisibility() {
      if (document.hidden) handleBlur();
    }
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  function handleReturn() {
    setHidden(false);
    const hiddenAt = hiddenAtRef.current;
    hiddenAtRef.current = null;
    if (hiddenAt === null) return;
    const awaySeconds = Math.round((Date.now() - hiddenAt) / 1000);
    if (awaySeconds < MIN_REPORTABLE_AWAY_SECONDS) return;
    void fetch("/api/activity/focus-loss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: questOrder, awaySeconds }),
    }).catch(() => {});
  }

  return (
    <div className="relative">
      {children}
      {hidden && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleReturn}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleReturn();
          }}
          className="absolute inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center gap-2 bg-[rgba(10,9,16,0.88)] text-center backdrop-blur-2xl"
        >
          <span className="text-[26px]">🙈</span>
          <div className="text-[15px] font-semibold text-text">Konten disembunyikan</div>
          <div className="max-w-[300px] text-[13px] leading-[1.6] text-muted2">
            Kamu berpindah dari halaman ini. Klik di mana saja untuk kembali fokus dan melanjutkan
            — waktu tetap berjalan selama kamu pergi.
          </div>
        </div>
      )}
    </div>
  );
}
