import type { ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { LocationTree as Tree, TreeNode } from "@/console/locations";
import { LocationTree, type TreeItem } from "./location-tree";

const toItem = (n: TreeNode): TreeItem => ({ id: n.id, code: n.code, name: n.name, kind: n.kind, aliases: n.aliases, open: n.counts.open, openBelow: n.below.open, children: n.children.map(toItem) });

/** The two-column frame of the locations section: the tree, then whatever place is selected. */
export function LocationBrowser({ tree, selectedCode, children }: { tree: Tree; selectedCode: string | null; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <ScrollArea className="max-h-[70vh] rounded-card bg-card p-3 lg:sticky lg:top-20">
        <LocationTree buildings={tree.buildings.map(toItem)} facilities={tree.facilities.map(toItem)} equipment={tree.equipment.map(toItem)} selectedCode={selectedCode} />
      </ScrollArea>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
