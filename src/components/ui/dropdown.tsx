"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;
export const DropdownLabel = ({ className, ...p }: React.ComponentProps<typeof Menu.Label>) => <Menu.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...p} />;
export const DropdownSeparator = ({ className, ...p }: React.ComponentProps<typeof Menu.Separator>) => <Menu.Separator className={cn("my-1 h-px bg-border", className)} {...p} />;

export function DropdownContent({ className, sideOffset = 6, ...p }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-56 rounded-xl border border-border bg-card p-1 text-sm text-foreground shadow-xl", className)}
        {...p}
      />
    </Menu.Portal>
  );
}

export function DropdownItem({ className, ...p }: React.ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 outline-none data-[highlighted]:bg-muted", className)} {...p} />;
}
