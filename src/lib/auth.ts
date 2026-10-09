import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE, signSession, type SessionUser } from "@/lib/auth-token";
import { prisma } from "@/lib/prisma";

const WEEK = 60 * 60 * 24 * 7;

/** Resolve cookie session to a real User row (ids change after reseed). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  try {
    const byId = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true },
    });
    if (byId) return byId;

    const byEmail = await prisma.user.findUnique({
      where: { email: session.email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!byEmail) return null;

    // Refresh cookie when allowed (Route Handlers / Server Actions). Ignore in RSC render.
    try {
      await setSession(byEmail);
    } catch {
      /* cookie write not permitted in this context */
    }
    return byEmail;
  } catch {
    // Local Prisma DB can drop sockets; treat as signed-out instead of crashing RSC.
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function setSession(user: SessionUser) {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WEEK,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
