import { LockIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { EmptyState } from "./empty-state";

/** A screen the signed-in role may not open: say so, offer Today. */
export function NotAllowed() {
  return <EmptyState icon={<LockIcon />} title={t("notAllowed.title")} body={t("notAllowed.body")} action={<Button variant="secondary" render={<Link href="/today" />}>{t("notAllowed.today")}</Button>} />;
}
