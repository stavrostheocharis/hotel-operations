import { Badge } from "@/components/ui/badge";
import { STATUS_VARIANT } from "@/console/format";
import { label } from "@/i18n";

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "default"}>{label("status", status)}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {label("source", source)}
    </Badge>
  );
}
