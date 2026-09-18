import type { CurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export function TopBar({ user }: { user: CurrentUser }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-[rgba(20,18,31,0.9)] px-6 py-3.5 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[15px]"
          style={{ background: "linear-gradient(135deg, var(--teal), var(--gold))" }}
        >
          🧭
        </div>
        <div className="hidden font-display text-[17px] font-semibold sm:block">User Flow Quest</div>
      </div>
      <div className="flex min-w-0 items-center gap-3.5 text-[13px] text-muted">
        <span className="min-w-0 truncate">
          {user.displayName}
          {user.appRole === "ADMIN" ? " · Admin" : ""}
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
