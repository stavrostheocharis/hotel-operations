import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOut } from "@/auth/actions";
import { getSession } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

export const metadata = { title: t("noAccess.title") };

/**
 * Signed in, but no property to see: the membership was removed, or none
 * was ever given. Says so and offers the way out, instead of looping
 * between sign-in and Today.
 */
export default function NoAccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4">
          <p className="text-caption-strong uppercase tracking-wide text-muted-foreground">{t("app.name")}</p>
          <h1 className="text-title-lg text-foreground">{t("noAccess.title")}</h1>
          <Suspense fallback={<Skeleton className="h-16 rounded-sm" />}>
            <Body />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function Body() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.propertyIds.length) redirect("/today");
  return (
    <>
      <p className="text-body text-muted-foreground">{t("noAccess.body", { email: session.user.email })}</p>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          {t("user.signOut")}
        </Button>
      </form>
    </>
  );
}
