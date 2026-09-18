import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { User, AppRole } from "@/generated/prisma/client";

const SESSION_COOKIE = "ufq_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates an AuthSession row and sets the session cookie on the current response.
 * `enrolledSessionId` links the AuthSession to the workshop Session the user is
 * enrolled in, when known (used later to gate quest access by session status).
 */
export async function createAuthSession(userId: string, enrolledSessionId?: string | null) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.authSession.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      expiresAt,
      sessionId: enrolledSessionId ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.authSession.deleteMany({ where: { tokenHash } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export type CurrentUser = Pick<
  User,
  "id" | "email" | "displayName" | "appRole" | "avatarUrl" | "school" | "groupName"
>;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const authSession = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { User: true },
  });

  if (!authSession || authSession.expiresAt < new Date()) {
    if (authSession) {
      await prisma.authSession.delete({ where: { id: authSession.id } }).catch(() => {});
    }
    return null;
  }

  // Best-effort presence ping; don't block the request on it.
  void prisma.authSession
    .update({ where: { id: authSession.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  const { User: user } = authSession;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    appRole: user.appRole,
    avatarUrl: user.avatarUrl,
    school: user.school,
    groupName: user.groupName,
  };
}

/** Redirects to /login if not authenticated, or to the other portal if the role doesn't match. */
export async function requireRole(role: AppRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.appRole !== role) {
    redirect(user.appRole === "ADMIN" ? "/admin" : "/brief");
  }
  return user;
}
