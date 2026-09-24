import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");

  return (
    <>
      <TopBar user={user} />
      <div className="mx-auto max-w-[1080px] px-6 pt-4">
        <nav className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] text-muted">
          <Link href="/admin" className="hover:text-text">
            Dashboard
          </Link>
          <Link href="/admin/session" className="hover:text-text">
            Pengaturan Session
          </Link>
          <Link href="/admin/participants" className="hover:text-text">
            Kelola Peserta
          </Link>
          <Link href="/admin/latihan" className="hover:text-text">
            Modul Latihan
          </Link>
          <Link href="/admin/konten" className="hover:text-text">
            Konten
          </Link>
        </nav>
      </div>
      {children}
    </>
  );
}
