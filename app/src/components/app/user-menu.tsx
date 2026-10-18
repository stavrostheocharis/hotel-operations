import { changePasswordAction, signOut } from "@/auth/actions";
import { getViewer } from "@/auth/viewer";
import { Skeleton } from "@/components/ui/skeleton";
import { label, t } from "@/i18n";
import { UserMenuClient } from "./user-menu-client";

/** Who is signed in, with theme and sign-out. Streams in behind the sidebar footer's Suspense. */
export async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) return <UserMenuSkeleton />;
  const role = viewer.roleAt();
  return (
    <UserMenuClient
      name={viewer.user.name}
      email={viewer.user.email}
      meta={[label("user.role", role), viewer.user.department ? label("user.department", viewer.user.department) : null].filter(Boolean).join(" · ")}
      labels={{
        theme: t("user.theme"),
        light: t("user.light"),
        dark: t("user.dark"),
        system: t("user.system"),
        signOut: t("user.signOut"),
        changePassword: t("user.changePassword"),
        password: { title: t("user.password.title"), lead: t("user.password.lead"), current: t("user.password.current"), next: t("user.password.next"), confirm: t("user.password.confirm"), save: t("user.password.save"), cancel: t("common.cancel") },
      }}
      signOut={signOut}
      changePassword={changePasswordAction}
    />
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2 px-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-28 rounded-sm" />
        <Skeleton className="h-3 w-20 rounded-sm" />
      </div>
    </div>
  );
}
