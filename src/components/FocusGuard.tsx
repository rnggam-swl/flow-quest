"use client";

import { useEffect, useState } from "react";

/**
 * Blurs its children the moment the tab/window loses focus (switching to
 * another app or tab — e.g. to paste a screenshot into an AI chat) and keeps
 * them hidden until the user deliberately clicks back in. This doesn't stop
 * a screenshot from being taken in the first place, or a second device
 * photographing the screen — nothing on the web can. It targets the much
 * more common "alt-tab to ask an AI, then tab back" pattern: content stays
 * hidden for as long as they're away, and any quest timer keeps running
 * underneath, so time spent looking elsewhere is still spent.
 */
export function FocusGuard({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function handleBlur() {
      setHidden(true);
    }
    function handleVisibility() {
      if (document.hidden) setHidden(true);
    }
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <div className="relative">
      {children}
      {hidden && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setHidden(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setHidden(false);
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
