import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n";

/** Outside the shell (no session, or a URL no route knows). */
export default function RootNotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4">
          <h1 className="text-title-lg text-foreground">{t("notFound.title")}</h1>
          <p className="text-body text-muted-foreground">{t("notFound.body")}</p>
          <div>
            <Button variant="secondary" render={<Link href="/today" />}>
              {t("errors.today")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
