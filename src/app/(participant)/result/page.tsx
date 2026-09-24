import { redirect } from "next/navigation";

/** The original Quest 2 result URL; every quest's result now lives at /result/[order]. */
export default function LegacyResultPage() {
  redirect("/result/2");
}
