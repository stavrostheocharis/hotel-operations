"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import type { PasswordState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PasswordLabels = { title: string; lead: string; current: string; next: string; confirm: string; save: string; cancel: string };

/** Current password, new password twice, one toast. */
export function ChangePasswordDialog({ open, onOpenChange, action, labels }: { open: boolean; onOpenChange: (o: boolean) => void; action: (prev: PasswordState, fd: FormData) => Promise<PasswordState>; labels: PasswordLabels }) {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(action, null);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!state || seen.current === state.at) return;
    seen.current = state.at;
    if (state.ok) {
      toast.success(state.message);
      onOpenChange(false);
    } else toast.error(state.message, { duration: Infinity, closeButton: true });
  }, [state, onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.lead}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pw-current">{labels.current}</Label>
            <Input id="pw-current" name="current" type="password" autoComplete="current-password" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pw-next">{labels.next}</Label>
            <Input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pw-confirm">{labels.confirm}</Label>
            <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>{labels.cancel}</DialogClose>
            <Button type="submit" disabled={pending}>
              {labels.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
