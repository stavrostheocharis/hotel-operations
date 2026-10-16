import { Badge } from "@/components/ui/badge";
import { SOURCE, STATUS } from "@/console/format";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {SOURCE[source] ?? source}
    </Badge>
  );
}
