"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm({
  next,
  notice,
  labels,
}: {
  next: string | null;
  notice: string | null;
  labels: { email: string; password: string; submit: string; submitting: string; forgot: string };
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
  return (
    <form action={action} className="flex flex-col gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {notice && !state.error ? <p className="text-body text-muted-foreground">{notice}</p> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error ? (
        <p role="alert" className="text-body text-critical">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? labels.submitting : labels.submit}
      </Button>
      <p className="text-caption text-muted-foreground">{labels.forgot}</p>
    </form>
  );
}
