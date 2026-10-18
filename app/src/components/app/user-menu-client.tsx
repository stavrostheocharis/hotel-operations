"use client";

import { ChevronsUpDownIcon, KeyRoundIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";

import type { PasswordState } from "@/auth/actions";
import { ChangePasswordDialog, type PasswordLabels } from "./change-password-dialog";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function UserMenuClient({
  name,
  email,
  meta,
  labels,
  signOut,
  changePassword,
}: {
  name: string;
  email: string;
  meta: string;
  labels: { theme: string; light: string; dark: string; system: string; signOut: string; changePassword: string; password: PasswordLabels };
  signOut: () => Promise<void>;
  changePassword: (prev: PasswordState, fd: FormData) => Promise<PasswordState>;
}) {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [passwordOpen, setPasswordOpen] = useState(false);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={name} disabled={pending} />}>
            <Avatar>
              <AvatarFallback className="bg-secondary text-caption-strong text-foreground">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-body-strong text-foreground">{name}</span>
              <span className="truncate text-caption text-muted-foreground">{meta}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-body-strong text-foreground">{name}</span>
                <span className="text-caption font-normal text-muted-foreground">{email}</span>
                <span className="text-caption font-normal text-muted-foreground">{meta}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{labels.theme}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(String(v))}>
                <DropdownMenuRadioItem value="light">
                  <SunIcon className="size-4" /> {labels.light}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon className="size-4" /> {labels.dark}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon className="size-4" /> {labels.system}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
              <KeyRoundIcon className="size-4" /> {labels.changePassword}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startTransition(() => signOut())}>
              <LogOutIcon className="size-4" /> {labels.signOut}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} action={changePassword} labels={labels.password} />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
