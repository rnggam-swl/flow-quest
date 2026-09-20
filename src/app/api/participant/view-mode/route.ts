import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ viewMode: z.enum(["VERTICAL", "HORIZONTAL"]) });

/** Persists the participant's Flow Builder view preference (vertical vs. horizontal) to their account, so it carries across quests and sessions. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { flowViewMode: parsed.data.viewMode },
  });

  return NextResponse.json({ success: true });
}
