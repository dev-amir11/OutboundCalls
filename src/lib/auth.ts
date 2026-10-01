import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE, signSession, type SessionUser } from "@/lib/auth-token";

const WEEK = 60 * 60 * 24 * 7;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
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
