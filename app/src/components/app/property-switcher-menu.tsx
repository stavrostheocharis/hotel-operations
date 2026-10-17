"use client";

import { Building2Icon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useTransition } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type Property = { id: string; name: string; code: string };

export function PropertySwitcherMenu({
  properties,
  selectedId,
  switchProperty,
  label,
}: {
  properties: Property[];
  selectedId: string;
  switchProperty: (formData: FormData) => Promise<void>;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const selected = properties.find((p) => p.id === selectedId) ?? properties[0];
  const choose = (id: string) => {
    const fd = new FormData();
    fd.set("propertyId", id);
    startTransition(() => switchProperty(fd));
  };
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={selected.name} disabled={pending} />}>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Building2Icon className="size-4" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-body-strong text-foreground">{selected.name}</span>
              <span className="text-caption text-muted-foreground">{selected.code}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{label}</DropdownMenuLabel>
              {properties.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => choose(p.id)}>
                  <span className="flex-1">{p.name}</span>
                  {p.id === selected.id ? <CheckIcon className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
