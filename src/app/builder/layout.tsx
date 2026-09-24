import { DM_Sans } from "next/font/google";
import { requireRole } from "@/lib/auth";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/** The builder is full-screen (no admin top bar) and admin-only. */
export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return <div className={dmSans.variable}>{children}</div>;
}
