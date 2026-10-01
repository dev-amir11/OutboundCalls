"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, setSession } from "@/lib/auth";
import { actionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(1, "Enter a password."),
});

export async function loginAction(input: { email: string; password: string }) {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const matches = user ? await compare(parsed.data.password, user.passwordHash) : false;
    if (!user || !matches) return { error: "Invalid email or password." };
    await setSession({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    return { error: actionError(error) };
  }
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
