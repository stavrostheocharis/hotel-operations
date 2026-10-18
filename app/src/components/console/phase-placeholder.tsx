import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { t, tList, type TKey } from "@/i18n";
import { PageHeader } from "./page-header";
import { RequestFeatureButton } from "./request-feature-button";

/**
 * A later phase of the product (staff copilot, guest QR): what it will do,
 * what the property must provide, and one button to say "we want this
 * early". No mock UI.
 */
export function PhasePlaceholder({ section }: { section: "copilot" | "guestQr" }) {
  const k = (leaf: string) => `${section}.${leaf}` as TKey;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t(k("title"))} badge={<Badge variant="secondary">{t(k("phase"))}</Badge>} description={t(k("lead"))} />
      <Card>
        <CardContent className="flex flex-col gap-5">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-foreground">
            {tList(k("bullets")).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="text-body text-muted-foreground">{t(k("needs"))}</p>
          <RequestFeatureButton feature={section} text={t(k("cta"))} />
        </CardContent>
      </Card>
    </div>
  );
}
