import type { Metadata } from "next"
import {
  BellIcon,
  CircleCheckIcon,
  ClockIcon,
  EllipsisIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UserRoundIcon,
  WrenchIcon,
} from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import {
  brandTokens,
  chartTokens,
  coreTokens,
  sampleExceptions,
  shadowTokens,
  statusTokens,
  typeTokens,
  type ColorToken,
  type StatusToken,
} from "./tokens"

export const metadata: Metadata = {
  title: "Design system",
  description: "Live reference for the tokens and components defined in DESIGN.md.",
}

const sections = [
  ["colors", "Colors"],
  ["type", "Type"],
  ["elevation", "Elevation"],
  ["buttons", "Buttons"],
  ["badges", "Badges"],
  ["inputs", "Inputs & tabs"],
  ["table", "Table"],
  ["card", "Card"],
  ["overlays", "Overlays"],
  ["exceptions", "Exceptions list"],
] as const

const statusIcon: Record<StatusToken["name"], React.ComponentType<{ className?: string }>> = {
  critical: RotateCcwIcon,
  warning: ClockIcon,
  success: CircleCheckIcon,
  info: UserRoundIcon,
}

export default function DesignPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background shadow-compact">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-title-sm truncate text-foreground">Design system</span>
            <span className="text-caption text-muted-foreground">
              Source of truth: DESIGN.md · theme in src/app/globals.css
            </span>
          </div>
          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Sections">
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-sm px-2.5 py-1.5 text-body whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                {label}
              </a>
            ))}
          </nav>
          <ThemeToggle className="ml-auto lg:ml-2" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-6 py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-display text-foreground">Operations Exception Manager</h1>
          <p className="text-body-lg max-w-2xl text-muted-foreground">
            Airbnb-derived language for a data-dense operations console: ink does the
            work, blue is punctuation, status colors carry meaning. Toggle the theme
            in the header to check both modes.
          </p>
        </div>

        {/* ------------------------------------------------------------ Colors */}
        <Section
          id="colors"
          title="Color tokens"
          description="Each swatch is painted from its live CSS variable; the printed hex values are the light and dark values from DESIGN.md."
        >
          <SwatchGroup title="Core" tokens={coreTokens} />
          <SwatchGroup title="Brand · deep Aegean blue" tokens={brandTokens} />
          <div className="flex flex-col gap-4">
            <h3 className="text-title-sm text-foreground">Status</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {statusTokens.map((token) => (
                <StatusSwatch key={token.name} token={token} />
              ))}
            </div>
            <p className="text-caption text-muted-foreground">
              Status always pairs color with a text label. Info is violet so it is never
              mistaken for a brand element.
            </p>
          </div>
          <SwatchGroup title="Chart ramp (categorical, never status colors)" tokens={chartTokens} />
        </Section>

        {/* -------------------------------------------------------------- Type */}
        <Section
          id="type"
          title="Type ladder"
          description="DM Sans with Noto Sans for Greek glyphs. Nothing above 26px; hierarchy comes from weight and ink-vs-grey, not size."
        >
          <div className="flex flex-col divide-y divide-border">
            {typeTokens.map((token) => (
              <div
                key={token.name}
                className="grid gap-2 py-4 md:grid-cols-[10rem_1fr_14rem] md:items-baseline md:gap-6"
              >
                <div className="flex flex-col">
                  <span className="text-body-strong text-foreground">{token.name}</span>
                  <span className="text-caption text-muted-foreground">{token.spec}</span>
                </div>
                <p className={`${token.className} text-foreground`}>
                  Reopened: AC noise in Suite 412 · Σουίτα 412
                </p>
                <span className="text-caption text-muted-foreground">{token.use}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* --------------------------------------------------------- Elevation */}
        <Section
          id="elevation"
          title="Shape & elevation"
          description="Shadows only on floating things; cards stay flat. Nothing darker than 0.12 alpha, no blur, no gradients."
        >
          <div className="grid gap-6 rounded-card bg-muted p-6 sm:grid-cols-2 lg:grid-cols-5">
            {shadowTokens.map((token) => (
              <div key={token.name} className="flex flex-col gap-3">
                <div
                  className={`${token.className} flex h-24 items-center justify-center rounded-card bg-background text-caption text-muted-foreground`}
                >
                  20px
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-body-strong text-foreground">{token.name}</span>
                  <span className="text-caption text-muted-foreground">{token.use}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-10 items-center rounded-full bg-secondary px-5 text-body-strong text-foreground">
              pill · buttons
            </div>
            <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground">
              <BellIcon className="size-4" />
            </div>
            <div className="flex h-10 items-center rounded-lg border border-border px-3 text-body text-muted-foreground">
              12px · inputs
            </div>
            <div className="flex h-8 items-center rounded-sm bg-secondary px-2.5 text-body text-foreground">
              8px · chips, tabs, menu items
            </div>
          </div>
        </Section>

        {/* ----------------------------------------------------------- Buttons */}
        <Section
          id="buttons"
          title="Buttons"
          description="Pill shape. One blue primary action per view; everything else secondary or ghost. Press Tab to see the double focus ring."
        >
          <Row label="Variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </Row>
          <Row label="Sizes">
            <Button size="lg">Large · 48</Button>
            <Button>Default · 40</Button>
            <Button size="sm">Small · 32</Button>
            <Button size="xs">Extra small · 28</Button>
          </Row>
          <Row label="With icons">
            <Button>
              <PlusIcon data-icon="inline-start" />
              New exception
            </Button>
            <Button variant="secondary">
              <WrenchIcon data-icon="inline-start" />
              Create work order
            </Button>
            <Button variant="ghost">
              <SparklesIcon data-icon="inline-start" />
              Ask copilot
            </Button>
          </Row>
          <Row label="Icon buttons">
            <Button variant="secondary" size="icon-lg" aria-label="Notifications">
              <BellIcon />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Search">
              <SearchIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="More">
              <EllipsisIcon />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Add">
              <PlusIcon />
            </Button>
            <Button variant="secondary" size="icon-xs" aria-label="Add">
              <PlusIcon />
            </Button>
          </Row>
          <Row label="Disabled">
            <Button disabled>Primary</Button>
            <Button variant="secondary" disabled>
              Secondary
            </Button>
            <Button variant="outline" disabled>
              Outline
            </Button>
            <Button variant="ghost" disabled>
              Ghost
            </Button>
          </Row>
        </Section>

        {/* ------------------------------------------------------------ Badges */}
        <Section
          id="badges"
          title="Badges"
          description="11px / 600 pills. The four status variants are the only place status colors appear; default is the neutral chip for detected / new."
        >
          <Row label="Status">
            <Badge variant="critical">
              <RotateCcwIcon />
              Reopened
            </Badge>
            <Badge variant="warning">
              <ClockIcon />
              Awaiting verification
            </Badge>
            <Badge variant="success">
              <CircleCheckIcon />
              Verified fixed
            </Badge>
            <Badge variant="info">
              <UserRoundIcon />
              In progress
            </Badge>
            <Badge>Detected</Badge>
          </Row>
          <Row label="Other">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="ghost">Ghost</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="link">Link</Badge>
            <Badge variant="destructive">Destructive (alias)</Badge>
          </Row>
        </Section>

        {/* ------------------------------------------------------------ Inputs */}
        <Section
          id="inputs"
          title="Inputs & tabs"
          description="Inputs are 12px / 40px with a hairline border. Tabs are 8px; inactive tabs sit in body-muted."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Search">
              <Input placeholder="Search exceptions, rooms, guests…" />
            </Field>
            <Field label="Room">
              <Input defaultValue="Suite 412" />
            </Field>
            <Field label="Disabled">
              <Input placeholder="Not editable" disabled />
            </Field>
            <Field label="Invalid" hint="Time limit must be in the future.">
              <Input defaultValue="Yesterday 18:00" aria-invalid />
            </Field>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <Tabs defaultValue="queue">
              <TabsList>
                <TabsTrigger value="queue">Queue</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>
              <TabsContent value="queue" className="text-muted-foreground">
                Default variant: segmented control on surface-soft, no shadow on the active tab.
              </TabsContent>
              <TabsContent value="timeline" className="text-muted-foreground">
                Timeline of every touch on this issue.
              </TabsContent>
              <TabsContent value="evidence" className="text-muted-foreground">
                Photos, work orders and SOP references.
              </TabsContent>
            </Tabs>
            <Tabs defaultValue="open">
              <TabsList variant="line">
                <TabsTrigger value="open">Open · 12</TabsTrigger>
                <TabsTrigger value="verify">To verify · 4</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
              <TabsContent value="open" className="text-muted-foreground">
                Line variant: ink underline, no fill.
              </TabsContent>
              <TabsContent value="verify" className="text-muted-foreground">
                Resolved, awaiting a manager&apos;s verification.
              </TabsContent>
              <TabsContent value="closed" className="text-muted-foreground">
                Verified fixed in the last 30 days.
              </TabsContent>
            </Tabs>
          </div>
        </Section>

        {/* ------------------------------------------------------------- Table */}
        <Section
          id="table"
          title="Table"
          description="Hairline row dividers, body text, body-strong headers in body-muted. The selected row sits on primary-soft."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleExceptions.map((row) => (
                <TableRow key={row.id} data-state={row.selected ? "selected" : undefined}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-body-strong text-foreground">{row.title}</span>
                      <span className="text-caption text-muted-foreground">{row.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">Santorini Grand</TableCell>
                  <TableCell>
                    <Badge variant={row.status}>{row.label}</Badge>
                  </TableCell>
                  <TableCell>Maria K.</TableCell>
                  <TableCell className="text-right text-muted-foreground">Today 18:00</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        {/* -------------------------------------------------------------- Card */}
        <Section
          id="card"
          title="Card"
          description="Flat 20px panel: no border, no shadow. Shown here on surface-footer so the shape is visible; on the canvas it is separated by space alone."
        >
          <div className="rounded-card bg-muted p-6">
            <Card className="max-w-xl">
              <CardHeader>
                <CardTitle>Repeat failures · Suite 412</CardTitle>
                <CardDescription>
                  Three guest complaints about the same air-conditioning unit this season.
                </CardDescription>
                <CardAction>
                  <Badge variant="critical">Cluster</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-body text-foreground">
                  The unit was &ldquo;fixed&rdquo; twice without a verification step. The SOP
                  for HVAC complaints requires an engineer sign-off within 24 hours.
                </p>
                <div className="flex gap-6">
                  <Kpi value="3" label="Complaints" />
                  <Kpi value="2" label="Work orders" />
                  <Kpi value="0" label="Verified" />
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button variant="secondary">Open history</Button>
                <Button>Escalate</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------------- Overlays */}
        <Section
          id="overlays"
          title="Popover, dialog & other floating surfaces"
          description="Popover, dropdown, tooltip and sheet carry shadow-float; the command bar carries shadow-search with a hairline."
        >
          <Row label="Triggers">
            <Popover>
              <PopoverTrigger render={<Button variant="secondary" />}>Popover</PopoverTrigger>
              <PopoverContent>
                <PopoverHeader>
                  <PopoverTitle>Time limit</PopoverTitle>
                  <PopoverDescription>
                    Critical issues must be acknowledged within 15 minutes and verified within 24 hours.
                  </PopoverDescription>
                </PopoverHeader>
                <Field label="Verify by">
                  <Input defaultValue="Tomorrow 14:00" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                  <Button size="sm">Save</Button>
                </div>
              </PopoverContent>
            </Popover>

            <Dialog>
              <DialogTrigger render={<Button variant="secondary" />}>Dialog</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign exception</DialogTitle>
                  <DialogDescription>
                    Choose who verifies the fix. They will be notified in the staff app.
                  </DialogDescription>
                </DialogHeader>
                <Field label="Assignee">
                  <Input defaultValue="Maria K. · Engineering" />
                </Field>
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
                  <Button>Assign</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="secondary" />}>
                Dropdown menu
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>EX-2291</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <UserRoundIcon />
                    Assign
                    <DropdownMenuShortcut>A</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <WrenchIcon />
                    Create work order
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CircleCheckIcon />
                    Mark verified
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <TriangleAlertIcon />
                  Escalate as safety issue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger render={<Button variant="secondary" />}>Tooltip</TooltipTrigger>
              <TooltipContent>Reopened twice in 30 days</TooltipContent>
            </Tooltip>

            <Sheet>
              <SheetTrigger render={<Button variant="secondary" />}>Sheet</SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Issue history · Suite 412</SheetTitle>
                  <SheetDescription>
                    Every complaint, work order, review and SOP reference linked to this room.
                  </SheetDescription>
                </SheetHeader>
                <ul className="flex flex-col divide-y divide-border px-5">
                  {sampleExceptions.map((row) => (
                    <li key={row.id} className="flex flex-col gap-0.5 py-3">
                      <span className="text-body-strong text-foreground">{row.title}</span>
                      <span className="text-caption text-muted-foreground">{row.meta}</span>
                    </li>
                  ))}
                </ul>
                <SheetFooter className="flex-row justify-end">
                  <SheetClose render={<Button variant="secondary" />}>Close</SheetClose>
                  <Button>Assign</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </Row>

          <div className="flex flex-col gap-3">
            <span className="text-body-strong text-foreground">Command bar</span>
            <Command className="max-w-xl">
              <CommandInput placeholder="Search rooms, issues, SOPs…" />
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup heading="Exceptions">
                  <CommandItem>
                    <RotateCcwIcon />
                    Reopened: AC noise in Suite 412
                    <CommandShortcut>EX-2291</CommandShortcut>
                  </CommandItem>
                  <CommandItem>
                    <ClockIcon />
                    Pool towel shortage at the beach club
                    <CommandShortcut>EX-2287</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="SOPs">
                  <CommandItem>
                    <WrenchIcon />
                    HVAC complaint · engineer sign-off within 24h
                  </CommandItem>
                  <CommandItem>
                    <SparklesIcon />
                    Ask the copilot
                    <CommandShortcut>⌘K</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </Section>

        {/* -------------------------------------------------------- Exceptions */}
        <Section
          id="exceptions"
          title="Exceptions list"
          description="Row anatomy: title 14/500 in ink, meta 12/400 in body-muted, a status badge, and one blue primary action for the whole view."
        >
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-3 pb-4">
              <div className="flex flex-col">
                <span className="text-title-sm text-foreground">Open exceptions</span>
                <span className="text-caption text-muted-foreground">
                  Santorini Grand · 4 open · 1 selected
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary">View evidence</Button>
                <Button>Assign</Button>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {sampleExceptions.map((row) => {
                const Icon = statusIcon[row.status]
                return (
                  <li
                    key={row.id}
                    data-selected={row.selected ? "true" : undefined}
                    className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted data-[selected=true]:bg-primary-soft"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-body-strong text-foreground">
                        {row.title}
                      </span>
                      <span className="truncate text-caption text-muted-foreground">{row.meta}</span>
                    </div>
                    <Badge variant={row.status} className="shrink-0">
                      <Icon />
                      {row.label}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </div>
        </Section>
      </main>
    </div>
  )
}

/* ---------------------------------------------------------------- helpers */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-title-lg text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-body text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption-strong text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-strong text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-caption text-critical">{hint}</span> : null}
    </label>
  )
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[2rem] leading-none font-medium text-foreground">{value}</span>
      <span className="text-caption text-muted-foreground">{label}</span>
    </div>
  )
}

function SwatchGroup({ title, tokens }: { title: string; tokens: ColorToken[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-title-sm text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tokens.map((token) => (
          <Swatch key={token.cssVar} token={token} />
        ))}
      </div>
    </div>
  )
}

function Swatch({ token }: { token: ColorToken }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-16 rounded-lg border border-border"
        style={{ background: `var(${token.cssVar})` }}
        aria-hidden
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-body-strong text-foreground">{token.name}</span>
        <span className="font-mono text-caption text-muted-foreground">
          {token.light}
          {token.dark !== token.light ? ` · dark ${token.dark}` : ""}
        </span>
        <span className="text-caption text-muted-foreground">{token.use}</span>
      </div>
    </div>
  )
}

function StatusSwatch({ token }: { token: StatusToken }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-16 items-center justify-center rounded-lg border text-body-strong"
        style={{
          background: `var(--${token.name}-bg)`,
          borderColor: `var(--${token.name}-border)`,
          color: `var(--${token.name})`,
        }}
      >
        {token.label}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-body-strong text-foreground">{token.name}</span>
        <span className="font-mono text-caption text-muted-foreground">
          text {token.text[0]} · bg {token.bg[0]} · border {token.border[0]}
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          dark {token.text[1]} · {token.bg[1]} · {token.border[1]}
        </span>
        <span className="text-caption text-muted-foreground">{token.states}</span>
      </div>
    </div>
  )
}
