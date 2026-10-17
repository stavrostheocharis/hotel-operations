import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSession } from "@/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: t("signIn.title") };

/**
 * "Who are you?" One card. The form itself is static; the return target and
 * the "session ended" notice come from the URL, and a signed-in visitor is
 * sent on to Today, both inside Suspense.
 */
export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-caption-strong uppercase tracking-wide text-muted-foreground">{t("app.name")}</p>
          <h1 className="text-display text-foreground">{t("signIn.title")}</h1>
        </div>
        <Suspense fallback={<FormSkeleton />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const session = await getSession();
  if (session) redirect("/today");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const next = one(params.next);
  const notice = one(params.expired) ? t("signIn.expired") : null;
  return (
    <SignInForm
      next={next && next.startsWith("/") && !next.startsWith("//") ? next : null}
      notice={notice}
      labels={{ email: t("signIn.email"), password: t("signIn.password"), submit: t("signIn.submit"), submitting: t("signIn.submitting"), forgot: t("signIn.forgot") }}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-10 rounded-lg" />
      <Skeleton className="h-10 rounded-lg" />
      <Skeleton className="h-12 rounded-full" />
    </div>
  );
}
