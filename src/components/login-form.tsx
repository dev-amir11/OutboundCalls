"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(1, "Enter a password."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        const result = await loginAction(values);
        if (result?.error) setError(result.error);
      })}
    >
      <label className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
        {form.formState.errors.email ? <span className="text-sm text-rose-300">{form.formState.errors.email.message}</span> : null}
      </label>
      <label className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
        {form.formState.errors.password ? <span className="text-sm text-rose-300">{form.formState.errors.password.message}</span> : null}
      </label>
      {error ? <p className="rounded-md bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
