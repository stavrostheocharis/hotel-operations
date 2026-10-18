# Sign-in, sessions and roles

The console is behind a sign-in. Email and password, sessions in the
database, roles from the `users` and `memberships` tables that have been in
the schema since the data model. No third-party auth library: the whole
thing is ~250 lines we own, and every request stays on the app role.

## Demo users

`pnpm db:seed` creates one user per role on the demo property when
`DEMO_PASSWORD` is set in `.env` (never in docs or code):

| Email | Role | Department |
|---|---|---|
| admin@demo.hotel | group_admin (sees every property of the group) | management |
| gm@demo.hotel | gm | management |
| engineering@demo.hotel | dept_head | engineering |
| housekeeping@demo.hotel | dept_head | housekeeping |
| supervisor@demo.hotel | supervisor | front office |
| staff@demo.hotel | staff | engineering |
| readonly@demo.hotel | readonly | – |

Re-running the seed resets their names, roles and password.

## How a request is authenticated

1. `src/proxy.ts` (Next 16's middleware) only checks that the `oem_session`
   cookie exists; without it, `/sign-in?next=…`. It never validates the
   cookie and never redirects away from `/sign-in`, so a stale cookie cannot
   loop.
2. Inside the page, `requireViewer()` (`src/auth/viewer.ts`) reads the cookie
   and calls `auth_resolve_session(sha256(token))`. The function is
   `SECURITY DEFINER` (migration `0006_auth.sql`): the app role cannot read
   `sessions`, `user_credentials`, `users` or `memberships` before a tenant
   context exists, so the function does the lookup as its owner and returns
   the user, the role, the department, every property id the user may see
   (all of the group's for a `group_admin`, else the memberships) and the
   per-property role overrides. Expiry slides by 30 days when a session is
   seen again after fifteen minutes.
3. The result is the **viewer**: `tenant` (every permitted property, what
   entity pages read with so a shared link opens), `scoped` (the selected
   property, what lists read with), `property`, `roleAt()`, `can()`.
   `getCurrentTenant()` in `src/console/tenant.ts` is a thin wrapper kept
   for the read models written before sign-in existed.
4. The selected property is the `oem_property` cookie when it names a
   property the viewer may see, else the first; routes stay flat
   (`/today`, `/exceptions`, …). The switcher in the sidebar renders only
   when the viewer has several properties.

Both tables have row-level security forced with no policy, so only bypass
roles (the migrator, the compose superuser) can touch them directly; the
app role reaches them only through `auth_credentials`,
`auth_create_session`, `auth_resolve_session`, `auth_delete_session` and
`auth_set_password`. Passwords are scrypt (`src/auth/password.ts`,
parameters stored with the hash); the cookie holds a random token and the
database its sha256. `auth_set_password` ends every session of that user.

Every page that reads the session does so inside a `<Suspense>` boundary,
as Cache Components require; the shell (`src/components/app/`) is static
and only its three islands (property, navigation, user menu) wait on the
session.

## Permissions

`src/auth/permissions.ts` is the one matrix. Effective role at a property =
membership override, else the user's role.

| Capability | group_admin | gm | dept_head | supervisor | staff | readonly |
|---|---|---|---|---|---|---|
| see every screen, reports, exports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| issue.assign | ✓ | ✓ | own dept / unassigned | own dept / unassigned | – | – |
| issue.status | ✓ | ✓ | own dept | own dept | own issues | – |
| issue.note | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| issue.verify, verification.complete | ✓ | ✓ | ✓ | ✓ | own tasks | – |
| verification.schedule, signals.review, links.decide | ✓ | ✓ | ✓ | ✓ | – | – |
| imports.run, jobs.run, settings.property | ✓ | ✓ | – | – | – | – |
| settings.locations | ✓ | ✓ | engineering | – | – | – |
| settings.users | ✓ | not group_admins | – | – | – | – |

Every server action starts with `requireViewer()` and `assertCan()`; the UI
hides what `viewer.can()` denies, but the action is the real check. The
navigation (`src/components/app/nav.ts`) hides sections by role the same
way.

## Files

```
src/auth/
  password.ts     hashPassword(), verifyPassword(), passwordProblem()
  tokens.ts       newSessionToken(), hashToken()
  session.ts      getSession(), resolveSession(), cookie names and options
  viewer.ts       getViewer(), requireViewer(): the Viewer every page and action uses
  permissions.ts  the capability matrix, can(), assertCan()
  actions.ts      signIn, signOut, switchProperty (server actions)
src/proxy.ts      cookie-presence redirect
src/app/(auth)/sign-in/   the page and its client form (useActionState)
drizzle/0006_auth.sql     tables, RLS lockdown, the five functions
src/db/scripts/seed.ts    DEMO_USERS, seedUsers()
src/auth/__tests__/       password and permissions unit tests
src/db/__tests__/auth.test.ts   the functions through the app role
```

Not yet: SSO (Microsoft / Google), password self-service, two-factor. All
three fit behind the same `sessions` table.

## No property to show

A person who is signed in but holds no membership at any property (their
access was removed, or none was given) lands on `/no-access`, a page that
says so and offers Sign out, instead of looping between `/sign-in` and
`/today`. `requireViewer()` sends them there when a session exists but
`getViewer()` is null; the sign-in page does the same for a valid session
with no properties; the proxy never redirects away from it.

`?next=` is honoured only for a path on this site (`safeReturnPath()` in
`src/auth/return-path.ts`): one leading slash, then neither a slash nor a
backslash, no scheme, no control characters.
