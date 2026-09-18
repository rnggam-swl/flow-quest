import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getManagedSession } from "@/lib/managedSession";
import { getRecentActivity } from "@/lib/adminData";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.appRole !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getManagedSession();
  if (!session) return NextResponse.json([]);

  const items = await getRecentActivity(session.id, 30);
  return NextResponse.json(items);
}
