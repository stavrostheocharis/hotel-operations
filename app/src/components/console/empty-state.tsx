import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

/** Calm, never alarming: an icon, a title, one sentence, at most one secondary action. */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        {icon ? <span className="mb-1 text-muted-foreground [&>svg]:size-6">{icon}</span> : null}
        <p className="text-title-sm text-foreground">{title}</p>
        {body ? <p className="max-w-md text-body text-muted-foreground">{body}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
