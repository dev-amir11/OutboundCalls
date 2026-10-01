import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "oc_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET must be set to at least 16 characters.");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function readSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") return null;
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}
