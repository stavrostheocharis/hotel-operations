import type { Facts } from "./analyze";
import { DATASET_LABELS, DATASETS } from "./catalogue";
import type { Ask, Colour, DatasetKey, Decision, Dimension, DimensionResult, Gap, Measure, ScoreRow } from "./types";

/**
 * The go / reshape / stop scorecard of docs/discovery/05-go-no-go.md as
 * code: one rule per measure with its thresholds, the dimension it belongs
 * to and the reshape it calls for. Pure function over the facts, so the
 * thresholds live in one place and can be argued about; the structure
 * follows src/audit/records.ts.
 */

type Value = { count: number; total: number | null; share: number | null };

type Rule = {
  key: string;
  label: string;
  dimension: Dimension | null;
  /** null when the export does not allow the measure. */
  value: (f: Facts) => Value | null;
  /** "high": a high share is good. "low": a low share is good. "count": the count is judged. "band": inside the band is good. "info": not judged. */
  direction: "high" | "low" | "count" | "count-low" | "band" | "info";
  /** For high/low/count: the green and the amber boundaries. For band: [redLow, amberLow, amberHigh, redHigh]. */
  good: number;
  weak: number;
  band?: [number, number, number, number];
  thresholds: string;
  format?: (v: Value) => string;
  note: string | ((f: Facts, v: Value) => string);
  /** The reshape ask when the measure is amber or red. */
  ask?: string | ((f: Facts, v: Value, colour: Colour) => string);
  /** The ask when the measure cannot be taken at all. */
  missing?: string | ((f: Facts) => string | undefined);
  /** Datasets whose absence makes the measure "not assessable" rather than missing data. */
  needs: DatasetKey[];
};

/** Lower-case the first letter of a label unless it starts an acronym ("SOPs"). */
const lower = (label: string) => label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 1000) / 10}%`);
const int = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n));
const ratio = (c: number, t: number | null): Value => ({ count: c, total: t, share: t ? c / t : null });
const num = (c: number): Value => ({ count: c, total: null, share: null });

const RULES: Rule[] = [
  // D1 · Signals linkable to a location
  {
    key: "wo_location",
    label: "Work orders with a location that resolves to the room / asset list",
    dimension: "D1",
    needs: ["work_orders", "rooms"],
    value: (f) => (f.wo && f.wo.hasLocationField && f.master.counts.rooms ? ratio(f.wo.locatedWithRules, f.wo.total) : null),
    direction: "high",
    good: 0.8,
    weak: 0.5,
    thresholds: "≥ 80% · 50–79% · < 50%",
    note: (f, v) => `${pct(f.wo && f.wo.total ? f.wo.locatedAsTyped / f.wo.total : null)} match the list as typed (exact or a known spelling); ${pct(v.share)} after the documented rules (room number in the text, building letter, villa, plant keywords). ${f.wo ? int(f.wo.total - f.wo.locationFilled) : 0} tickets have no location at all.`,
    ask: (f, v, colour) =>
      colour === "amber"
        ? `Build a location alias table with the Chief Engineer (half a day) and re-measure: ${pct(v.share)} of tickets resolve today. The spellings we could not place most often are listed in the memo.`
        : `Only ${pct(v.share)} of tickets name a place we can find in the list. Before anything else, sit with the Chief Engineer over the unresolved spellings in the memo and tell us whether an alias table can lift this above 50%; if it cannot, the audit stops here.`,
    missing: (f) =>
      !f.wo
        ? "Send the work-order export (dataset 1); nothing can be measured without it."
        : !f.wo.hasLocationField
          ? "We could not find a location column in the work-order export (room, area or asset as recorded). Tell us which column holds it; without it nothing can be placed and deliverables 1, 2 and 5 cannot be produced."
          : "Send the room, building and asset list (dataset 8): without it no ticket location can be checked.",
  },
  {
    key: "fd_location",
    label: "Desk complaints with a room or place that resolves to the list",
    dimension: "D1",
    needs: ["complaints", "rooms"],
    value: (f) => (f.fd && f.master.counts.rooms ? ratio(f.fd.located, f.fd.total) : null),
    direction: "high",
    good: 0.6,
    weak: 0.35,
    thresholds: "≥ 60% · 35–59% · < 35%",
    note: (f) => `${pct(f.fd && f.fd.total ? f.fd.roomFilled / f.fd.total : null)} of complaints carry a room or place at all. Facility complaints often leave the room empty; the place still matters.`,
    ask: (f, v, colour) =>
      colour === "red"
        ? `Only ${pct(v.share)} of desk complaints can be placed. Unless the log can be re-exported with the room column, the audit becomes engineering-only: complaints are used where they can be placed and deliverable 4 is reduced to reviews and surveys.`
        : `Log the room or the facility on every desk complaint, including the ones about the pool, the bar or the lift; today ${pct(v.share)} can be placed.`,
    missing: (f) => (f.fd ? "Send the room, building and asset list (dataset 8) so complaint rooms can be checked." : "Send the guest complaint log (dataset 2), or tell us in writing that complaints are not logged."),
  },
  {
    key: "wo_equipment",
    label: "Work orders that resolve to a piece of equipment",
    dimension: null,
    needs: ["work_orders", "equipment"],
    value: (f) => (f.wo && f.master.counts.equipment ? ratio(f.wo.locatedEquipment, f.wo.total) : null),
    direction: "info",
    good: 0,
    weak: 0,
    thresholds: "information",
    note: "Plant-level jobs (boiler, chiller, pump station, lift) are what shared-cause failures hang on; the scorecard asks for half of the plant jobs to reach an asset.",
  },

  // D2 · Work orders with a usable closure note
  {
    key: "wo_closure_notes",
    label: "Closed work orders with a usable closure note",
    dimension: "D2",
    needs: ["work_orders"],
    value: (f) => (f.wo && f.wo.closedWithNoteField ? ratio(f.wo.usableNotes, f.wo.closedWithNoteField) : null),
    direction: "high",
    good: 0.5,
    weak: 0.25,
    thresholds: "≥ 50% · 25–49% · < 25%",
    note: "Usable = states an action and an object. Not usable: empty, 'done', 'OK', 'fixed', 'έγινε', 'closed', or a copy of the request. The note is what tells the next technician whether the last visit was a repair or a reset.",
    ask: (_f, v, colour) =>
      colour === "red"
        ? `With ${pct(v.share)} usable closure notes the audit can show recurrence (the problem came back) but not fix quality (what was tried and failed). Deliverable 2 becomes “problems that returned after closure” without the fix type; the closure-note standard becomes the headline of the records assessment.`
        : `Require a closure note that says what was found and what was done or replaced; 'done' is not a note. ${pct(v.share)} of closed tickets have one today.`,
    missing: (f) => (f.wo ? "We could not find a closure-note column in the work-order export. Tell us which column holds what the technician wrote at closure, or add it; without it deliverable 2 drops the fix-type analysis." : undefined),
  },
  {
    key: "wo_part_or_cause",
    label: "Closed work orders whose note names a part or a cause",
    dimension: "D2",
    needs: ["work_orders"],
    value: (f) => (f.wo && f.wo.closedWithNoteField ? ratio(f.wo.partNotes, f.wo.closedWithNoteField) : null),
    direction: "high",
    good: 0.25,
    weak: 0.1,
    thresholds: "≥ 25% · 10–24% · < 10%",
    note: "'Replaced FCU valve', 'αλλαγή μπαταριών', 'descaled, new cartridge': notes that say what was changed. Counted by keyword, so this is a floor, not a ceiling.",
    ask: "Ask technicians to name the part or the cause in the closure note; a drop-down of common parts does it in one tap.",
  },
  {
    key: "wo_closure_time",
    label: "Closed work orders with a closure timestamp",
    dimension: "D2",
    needs: ["work_orders"],
    value: (f) => (f.wo && f.wo.closedByStatus ? ratio(f.wo.closedByStatus - f.wo.closedWithoutTime, f.wo.closedByStatus) : f.wo && f.wo.withClosedAt ? ratio(f.wo.withClosedAt, f.wo.withClosedAt) : null),
    direction: "high",
    good: 0.95,
    weak: 0.8,
    thresholds: "≥ 95% · 80–94% · < 80%",
    note: "Without a closure time the ticket cannot count towards time-to-resolve or towards 'held for 30 days'.",
    ask: "Closing a ticket must stamp the closure time; the held-for-30-days figure depends on it. Tell us whether the export can include the closure timestamp for the tickets that lack it.",
    missing: (f) => (f.wo ? "We could not find a closure-date column (or a status column) in the work-order export. Tell us which column says when a ticket was closed." : undefined),
  },

  // D3 · Recurrence is visible in the data
  {
    key: "wo_recurrence",
    label: "Recurrence candidate rate, 30 days",
    dimension: "D3",
    needs: ["work_orders", "rooms"],
    value: (f) => (f.wo && f.wo.closedComparable >= 20 ? ratio(f.wo.recurrence30, f.wo.closedComparable) : null),
    direction: "band",
    good: 0,
    weak: 0,
    band: [0.02, 0.04, 0.25, 0.4],
    thresholds: "4–25% · 2–4% or 25–40% · < 2% or > 40%",
    note: "Closed tickets followed by a same-category ticket at the same place within 30 days. Too low usually means locations or categories are too coarse; too high means duplicates or a catch-all category.",
    ask: (_f, v) =>
      v.share !== null && v.share < 0.04
        ? `A recurrence rate of ${pct(v.share)} is implausibly low: locations or categories are probably too coarse. We re-categorise from the description text with a model pass, validated on 200 tickets with the Chief Engineer, and re-measure; if it stays under 2%, recurrence cannot be seen and the audit stops.`
        : `A recurrence rate of ${pct(v.share)} is implausibly high: duplicates or a catch-all category. We de-duplicate and re-categorise before measuring; if a plant event explains it, nothing changes.`,
    missing: "Recurrence could not be measured: it needs tickets with a resolvable location, a category and a closure time (at least 20 of them).",
  },
  {
    key: "wo_taxonomy",
    label: "Category taxonomy (categories in use, share in the largest)",
    dimension: "D3",
    needs: ["work_orders"],
    value: (f) => (f.wo && f.wo.categories.length ? { count: f.wo.categories.length, total: null, share: f.wo.largestCategoryShare } : null),
    direction: "count",
    good: 0,
    weak: 0,
    thresholds: "≥ 12 categories and largest < 30% · 6–11 or largest 30–50% · < 6 or one category > 50%",
    format: (v) => `${v.count} categories, largest ${pct(v.share)}`,
    note: (f) => `'Other' or a general bucket holds ${pct(f.wo?.catchAllShare ?? null)} of tickets; every one of those has to be classified from its text.`,
    ask: (f, v, colour) =>
      colour === "red"
        ? `The ticket categories are too coarse (${v.count} values, the largest holds ${pct(v.share)}). We re-categorise from the description text with a model pass, validated on 200 records with the Chief Engineer: adds 3–5 days, price up or scope down.`
        : `Cut the category list to the ones the audit uses and make 'Other' ask for a word of explanation; ${pct(f.wo?.catchAllShare ?? null)} of tickets sit in a general bucket today.`,
    missing: (f) => (f.wo ? "We could not find a category or trade column in the work-order export. Tell us which column holds it, or we classify every ticket from its text (adds time)." : undefined),
  },
  {
    key: "wo_duplicates",
    label: "Duplicate rate (same place, same category, within 2 hours)",
    dimension: "D3",
    needs: ["work_orders", "rooms"],
    value: (f) => (f.wo && f.wo.comparable ? ratio(f.wo.duplicates2h, f.wo.comparable) : null),
    direction: "low",
    good: 0.1,
    weak: 0.2,
    thresholds: "< 10% · 10–20% · > 20%",
    note: "Two departments logging the same problem. Counted among tickets with a resolvable location, a category and a creation time.",
    ask: "Duplicates above the line: we de-duplicate before measuring recurrence and report the duplicate rate as a finding. If one plant event explains a burst, tell us which.",
  },

  // D4 · Overlap between guest feedback and operational records
  {
    key: "sv_linkable",
    label: "Survey responses linkable to a stay (reservation key, or room + departure date)",
    dimension: "D4",
    needs: ["surveys"],
    value: (f) => (f.sv ? ratio(f.sv.linkable, f.sv.total) : null),
    direction: "high",
    good: 0.6,
    weak: 0.3,
    thresholds: "≥ 60% · 30–59% · < 30%",
    note: (f) => `${pct(f.sv && f.sv.total ? f.sv.withStayKey / f.sv.total : null)} carry the reservation surrogate key; ${pct(f.sv && f.sv.total ? f.sv.withRoomAndDeparture / f.sv.total : null)} carry room and departure date. The key is what ties a comment to a room without any guest identity.`,
    ask: (f, v) => `Keep the reservation surrogate key on the survey export, or add room number and departure date; today ${pct(v.share)} of responses can be tied to a stay (${int(f.sv?.linkable ?? 0)} of ${int(f.sv?.total ?? 0)}). Without it, survey comments cannot be placed and deliverable 4 rests on reviews alone.`,
    missing: "No survey export was recognised. Send the survey responses (dataset 4) or confirm in writing that there are none; without surveys and reviews deliverable 4 is dropped and the price reduced.",
  },
  {
    key: "rv_stay_dates",
    label: "Reviews with a date of stay (or month of stay)",
    dimension: null,
    needs: ["reviews"],
    value: (f) => (f.rv ? ratio(f.rv.withStayDates, f.rv.total) : null),
    direction: "info",
    good: 0,
    weak: 0,
    thresholds: "information",
    note: (f) => `Platforms: ${f.rv?.platforms.map((p) => `${p.value || "unnamed"} ${int(p.count)}`).join(", ") || "none named"}. Reviews rarely carry a room; they attach to issues by topic and time, so the stay date is what makes them usable.`,
  },
  {
    key: "sv_comments",
    label: "Surveys with a free-text comment",
    dimension: null,
    needs: ["surveys"],
    value: (f) => (f.sv ? ratio(f.sv.withComment, f.sv.total) : null),
    direction: "info",
    good: 0,
    weak: 0,
    thresholds: "information",
    note: "Comments are where the complaints hide; scores alone rarely say what was wrong.",
  },

  // D5 · Coverage and volume
  {
    key: "wo_weeks",
    label: "Season coverage (weeks with work orders / weeks in season)",
    dimension: "D5",
    needs: ["work_orders"],
    value: (f) => (f.wo && f.wo.weeksInSeason ? ratio(f.wo.weeksWithTickets, f.wo.weeksInSeason) : null),
    direction: "high",
    good: 0.95,
    weak: 0.85,
    thresholds: "≥ 95% · 85–94% · < 85% or a gap > 2 weeks in peak",
    format: (v) => `${pct(v.share)} (${int(v.count)} of ${int(v.total ?? 0)} weeks)`,
    note: (f) => `Longest gap between two tickets: ${f.wo?.maxGapDays ?? "–"} days${f.wo?.gapInPeak ? ", and it falls in July–August" : ""}. Season taken from ${f.season?.basis ?? "the tickets themselves"}.`,
    ask: (f) => `The ticket export does not describe the whole season (${pct(f.wo && f.wo.weeksInSeason ? f.wo.weeksWithTickets / f.wo.weeksInSeason : null)} of the weeks have tickets, longest gap ${f.wo?.maxGapDays ?? "–"} days). Tell us whether tickets for the missing weeks exist in the tool or on paper; if they do not, the audit covers the logged period only and says so.`,
  },
  {
    key: "wo_per_room_night",
    label: "Work orders per occupied room-night",
    dimension: "D5",
    needs: ["work_orders", "occupancy"],
    value: (f) => (f.wo && f.oc && f.oc.roomNights ? { count: f.wo.total, total: f.oc.roomNights, share: f.wo.total / f.oc.roomNights } : null),
    direction: "high",
    good: 0.05,
    weak: 0.02,
    thresholds: "≥ 0.05 · 0.02–0.05 · < 0.02",
    format: (v) => `${(v.share ?? 0).toFixed(3)} (${int(v.count)} tickets over ${int(v.total ?? 0)} room-nights)`,
    note: "For a 300-room resort over a six-month season, 0.05 is roughly 2,500 jobs. Far below that, the tool holds only what guests complained about, or engineering but not housekeeping.",
    ask: (f, v, colour) =>
      colour === "red"
        ? `At ${(v.share ?? 0).toFixed(3)} tickets per occupied room-night the logging is partial. Tell us which departments log in the tool and which do not; the audit covers what is logged, says so, and uses complaints and reviews as the shadow signal for the rest.`
        : `At ${(v.share ?? 0).toFixed(3)} tickets per occupied room-night part of the work is not in the tool (housekeeping, F&B or preventive jobs, typically). The audit covers what is logged and lists what is not logged as a finding, using complaints and reviews as the shadow signal. Tell us which departments do not log.`,
    missing: (f) => (f.wo && !f.oc ? "Send the occupancy-by-day report (dataset 7); without it tickets cannot be set against occupied room-nights and the baseline cannot be computed." : undefined),
  },
  {
    key: "wo_count",
    label: "Work orders, absolute",
    dimension: "D5",
    needs: ["work_orders"],
    value: (f) => (f.wo ? num(f.wo.total) : null),
    direction: "count",
    good: 1500,
    weak: 600,
    thresholds: "≥ 1,500 · 600–1,499 · < 600",
    format: (v) => int(v.count),
    note: "Below 600 tickets the season cannot be described; between 600 and 1,500 the audit works but the fixes-held figures come with wide margins.",
    ask: (_f, v, colour) =>
      colour === "red"
        ? `${int(v.count)} work orders is too few to describe a season: the data does not support the audit as offered. If tickets live on paper or in WhatsApp, the honest proposal is a 2027 pilot that starts with capture, with 2027 as the baseline.`
        : `${int(v.count)} work orders is enough to run the audit, but the per-category and per-month figures will carry wide margins; the report will say so and report the fixes-held analysis on the categories with at least 30 closures.`,
    missing: "Send the work-order export (dataset 1); nothing can be measured without it.",
  },
  {
    key: "st_coverage",
    label: "Stay metadata covers the season (stay nights / occupied room-nights)",
    dimension: "D5",
    needs: ["stays", "occupancy"],
    value: (f) => (f.st && f.oc && f.oc.roomNights ? ratio(f.st.nights, f.oc.roomNights) : null),
    direction: "high",
    good: 0.95,
    weak: 0.85,
    thresholds: "≥ 95% · 85–94% · < 85%",
    note: (f) => `${int(f.st?.nights ?? 0)} nights in the stay list against ${int(f.oc?.roomNights ?? 0)} occupied room-nights in the occupancy report.`,
    ask: (f, v) => `The stay list explains ${pct(v.share)} of the occupied room-nights. Tell us what is missing (a filter on the export, a second PMS, long stays split): complaints per room-night and the nationality view need the full list.`,
    missing: (f) => (!f.st ? "Send the PMS stay list without identities (dataset 6): stay key, room, arrival, departure, adults, children, ISO country, segment. The DPO signs off the column list first." : !f.oc ? "Send the occupancy-by-day report (dataset 7) so the stay list can be checked against it." : undefined),
  },
  {
    key: "oc_present",
    label: "Occupancy by day present",
    dimension: "D5",
    needs: ["occupancy"],
    value: (f) => (f.oc ? ratio(f.oc.days, f.oc.spanDays) : null),
    direction: "high",
    good: 0.95,
    weak: 0.5,
    thresholds: "yes · partial · no",
    format: (v) => `${v.share !== null && v.share >= 0.95 ? "yes" : "partial"} (${int(v.count)} of ${int(v.total ?? 0)} days)`,
    note: (f) => `${int(f.oc?.roomNights ?? 0)} occupied room-nights from ${f.oc?.range?.from ?? "–"} to ${f.oc?.range?.to ?? "–"}.`,
    ask: (f) => `The occupancy report has gaps (${int(f.oc?.days ?? 0)} of ${int(f.oc?.spanDays ?? 0)} days present). Re-export it for every day of the season, by building if the PMS can.`,
    missing: "Send the occupancy-by-day report (dataset 7): date, rooms available, rooms occupied, arrivals, departures, guests in house. It is the denominator of every baseline figure.",
  },
  {
    key: "rooms_complete",
    label: "Room list complete (rooms named in work orders that exist in the list)",
    dimension: "D5",
    needs: ["work_orders", "rooms"],
    value: (f) => (f.wo && f.wo.hasLocationField && f.master.counts.rooms && f.wo.roomLike ? ratio(f.wo.roomLikeInList, f.wo.roomLike) : null),
    direction: "high",
    good: 0.95,
    weak: 0.85,
    thresholds: "≥ 95% · 85–94% · < 85%",
    note: (f) => `List received: ${int(f.master.counts.rooms)} rooms (${int(f.master.counts.villas)} villas) in ${int(f.master.counts.buildings)} buildings, ${int(f.master.counts.facilities)} public areas, ${int(f.master.counts.equipment)} assets (${int(f.master.counts.equipmentWithServes)} with a 'serves' entry). Room numbers technicians type that are not in the list are renumbered rooms or typos.`,
    ask: (f, v) => `${pct(v.share)} of the room numbers typed into tickets exist in the room list. Ask the Chief Engineer whether rooms were renumbered and send the old-to-new table; the rest are typos we can flag.`,
    missing: (f) => (f.wo && !f.master.counts.rooms ? "Send the room list (dataset 8) with room number, building, floor, room type and view; one sentence on the numbering logic saves a day." : undefined),
  },

  // D6 · Personal data hygiene
  {
    key: "identity_columns",
    label: "Identity columns in any file on receipt",
    dimension: "D6",
    needs: [],
    value: (f) => num(f.pii.identityColumns.length + (f.wo && f.wo.assigneesFilled && f.wo.assigneesLookLikeNames / f.wo.assigneesFilled > 0.2 ? 1 : 0)),
    direction: "count-low",
    good: 0,
    weak: 2,
    thresholds: "0 · 1–2, deleted on arrival and reported · names or ID numbers across files",
    format: (v) => int(v.count),
    note: (f) => {
      const cols = f.pii.identityColumns.map((c) => `${c.file}: “${c.column}”`);
      const names = f.wo && f.wo.assigneesFilled && f.wo.assigneesLookLikeNames / f.wo.assigneesFilled > 0.2 ? [`work orders: the assignee column holds what look like personal names (${pct(f.wo.assigneesLookLikeNames / f.wo.assigneesFilled)}), not role codes`] : [];
      const all = [...cols, ...names];
      return all.length ? `Columns counted by their header, never read: ${all.join("; ")}. They are deleted on arrival and the DPO is told the same day.` : "No column header names a guest or an employee. Staff appear as codes.";
    },
    ask: (f, v, colour) =>
      colour === "red"
        ? `${int(v.count)} columns carry identities (names, contacts or ID numbers). Processing stops until the files are replaced: the hotel re-exports without those columns, with employees as role codes. The DPO is told the same day.`
        : `${int(v.count)} column(s) carry an identity and were deleted on arrival (listed in the memo). Please re-export without them, with employees as role codes (e.g. ENG-TECH-03), so the next delivery is clean.`,
  },
  {
    key: "pii_in_text",
    label: "Free-text records with personal data found and replaced",
    dimension: "D6",
    needs: [],
    value: (f) => (f.pii.textRows ? ratio(f.pii.textRowsWithPii, f.pii.textRows) : null),
    direction: "low",
    good: 0.05,
    weak: 0.15,
    thresholds: "< 5% · 5–15% · > 15%",
    note: "E-mail addresses, phone numbers, IBANs and card numbers in descriptions, notes and comments, found by pattern and replaced with a placeholder. Names in free text are not counted here.",
    ask: (_f, v, colour) =>
      colour === "red"
        ? `${pct(v.share)} of free-text records contained contact or payment details. The hotel runs pre-export redaction on the text columns and resends; one-week delay.`
        : `${pct(v.share)} of free-text records contained contact or payment details; they were replaced on receipt. Ask agents and technicians not to write phone numbers or e-mails into notes, and consider pre-export redaction next time.`,
  },
  {
    key: "key_consistency",
    label: "Surrogate key consistent across files (survey keys found in the stay list)",
    dimension: "D6",
    needs: ["surveys", "stays"],
    value: (f) => (f.sv && f.sv.keysChecked ? ratio(f.sv.keysInStays ?? 0, f.sv.keysChecked) : null),
    direction: "high",
    good: 0.95,
    weak: 0.5,
    thresholds: "yes (≥ 95%) · partial · no (< 50%)",
    note: (f) => `${int(f.st?.distinctKeys ?? 0)} distinct keys in the stay list; a key that appears in one file and not the other means the pseudonymisation was run separately per export.`,
    ask: (_f, v, colour) =>
      colour === "red"
        ? `The surrogate keys do not join: only ${pct(v.share)} of survey keys exist in the stay list. Re-run the pseudonymisation once, with one mapping table, across all exports and resend; if that is not possible nothing joins and the audit stops.`
        : `Only ${pct(v.share)} of survey keys exist in the stay list. Check that the same mapping table was used for both exports and re-export the one that differs.`,
  },
];

const DIMENSION_TITLES: Record<Dimension, string> = {
  D1: "Signals linkable to a location",
  D2: "Work orders with a usable closure note",
  D3: "Recurrence is visible in the data",
  D4: "Overlap between guest feedback and operational records",
  D5: "Coverage and volume",
  D6: "Personal data hygiene",
};

const ORDER: Record<Colour, number> = { green: 0, na: 1, amber: 2, red: 3 };

function grade(rule: Rule, v: Value): Colour | "info" {
  switch (rule.direction) {
    case "info":
      return "info";
    case "high":
      if (v.share === null) return "na";
      return v.share >= rule.good ? "green" : v.share >= rule.weak ? "amber" : "red";
    case "low":
      if (v.share === null) return "na";
      return v.share <= rule.good ? "green" : v.share <= rule.weak ? "amber" : "red";
    case "count":
      if (rule.key === "wo_taxonomy") {
        const largest = v.share ?? 0;
        if (v.count < 6 || largest > 0.5) return "red";
        if (v.count < 12 || largest >= 0.3) return "amber";
        return "green";
      }
      return v.count >= rule.good ? "green" : v.count >= rule.weak ? "amber" : "red";
    case "count-low":
      return v.count <= rule.good ? "green" : v.count <= rule.weak ? "amber" : "red";
    case "band": {
      if (v.share === null || !rule.band) return "na";
      const [redLow, amberLow, amberHigh, redHigh] = rule.band;
      if (v.share < redLow || v.share > redHigh) return "red";
      if (v.share < amberLow || v.share > amberHigh) return "amber";
      return "green";
    }
  }
}

function formatValue(rule: Rule, v: Value): string {
  if (rule.format) return rule.format(v);
  if (v.share !== null) return `${pct(v.share)} (${int(v.count)} of ${int(v.total ?? 0)})`;
  return int(v.count);
}

type Judged = ScoreRow & { rule: Rule };

export type Scored = {
  measures: Measure[];
  scorecard: DimensionResult[];
  decision: { verdict: Decision; reasons: string[]; stopConditions: string[] };
  asks: Ask[];
  gaps: Gap[];
};

export function score(f: Facts): Scored {
  const measures: Measure[] = [];
  const rows: Judged[] = [];
  const asks: Ask[] = [];
  const gaps: Gap[] = [];
  const seenAsks = new Set<string>();
  const pushAsk = (ask: Ask) => {
    if (!ask.text || seenAsks.has(ask.text)) return;
    seenAsks.add(ask.text);
    asks.push(ask);
  };

  for (const rule of RULES) {
    const v = rule.value(f);
    const needsMissing = rule.needs.filter((d) => !f.present.has(d));
    if (!v) {
      const verdict: Colour | "info" = rule.direction === "info" ? "info" : "na";
      const missingText = typeof rule.missing === "function" ? rule.missing(f) : rule.missing;
      const because = needsMissing.length ? `not assessable: ${needsMissing.map((d) => lower(DATASET_LABELS[d])).join(" and ")} not received` : "not measurable from this export";
      measures.push({ key: rule.key, label: rule.label, count: 0, total: null, share: null, value: "–", verdict, dimension: rule.dimension, note: because });
      if (rule.dimension) {
        rows.push({ dimension: rule.dimension, measure: rule.label, value: "–", colour: "na", thresholds: rule.thresholds, rule });
        if (missingText) pushAsk({ dimension: rule.dimension, dataset: needsMissing[0] ?? rule.needs[0] ?? null, text: missingText });
      }
      continue;
    }
    const verdict = grade(rule, v);
    const value = formatValue(rule, v);
    const note = typeof rule.note === "function" ? rule.note(f, v) : rule.note;
    measures.push({ key: rule.key, label: rule.label, count: v.count, total: v.total, share: v.share === null ? null : Math.round(v.share * 1000) / 1000, value, verdict, dimension: rule.dimension, note });
    if (rule.dimension && verdict !== "info") {
      rows.push({ dimension: rule.dimension, measure: rule.label, value, colour: verdict, thresholds: rule.thresholds, rule });
      if ((verdict === "amber" || verdict === "red") && rule.ask) {
        pushAsk({ dimension: rule.dimension, dataset: rule.needs[0] ?? null, text: typeof rule.ask === "function" ? rule.ask(f, v, verdict) : rule.ask });
      }
    }
  }

  const scorecard: DimensionResult[] = (Object.keys(DIMENSION_TITLES) as Dimension[]).map((d) => {
    // Red beats Amber beats "not assessable" beats Green: a dimension whose
    // key measure could not be taken is not shown Green on the strength of the rest.
    const mine = rows.filter((r) => r.dimension === d);
    const colour: Colour = !mine.length ? "na" : mine.reduce<Colour>((worst, r) => (ORDER[r.colour] > ORDER[worst] ? r.colour : worst), "green");
    return { dimension: d, title: DIMENSION_TITLES[d], colour, rows: mine.map(({ dimension, measure, value, colour, thresholds }) => ({ dimension, measure, value, colour, thresholds })) };
  });

  // Fields of the data request a received file does not supply, and datasets not received.
  for (const m of f.missingFields) {
    const label = DATASET_LABELS[m.dataset];
    const names = m.fields.map((x) => x.label);
    pushAsk({ dimension: null, dataset: m.dataset, text: `${label} (${m.file}): we could not find ${names.length === 1 ? "the field" : "the fields"} ${names.map((n) => `“${n}”`).join(", ")}. Tell us which column holds ${names.length === 1 ? "it" : "each"}, or add ${names.length === 1 ? "it" : "them"} to the export. Columns we could not place are listed under the file in the memo.` });
    for (const field of m.fields) {
      gaps.push({ gap: `“${field.label}” not found`, dataset: label, impact: impactOfField(m.dataset, field.field), fix: `Name the column or add it to the export (${m.file})` });
    }
  }
  for (const d of DATASETS) {
    if (f.present.has(d.key)) continue;
    const label = d.label;
    const impact = d.priority === "must" ? "audit cannot answer its questions without it" : d.priority === "should" ? "a deliverable is weaker without it" : "sharpens the cost picture";
    gaps.push({ gap: `${label} not received`, dataset: label, impact, fix: d.priority === "nice" ? "Send if it exists; 'we do not log it' is an answer" : "Export per 02-data-request.md, or confirm in writing that it does not exist" });
    if (d.key === "compensation") pushAsk({ dimension: null, dataset: d.key, text: "No compensation / goodwill log was received. Send it if one exists (date, stay key, room, reason, type, value); 'we do not log compensation' is also an answer." });
    if (d.key === "reviews") pushAsk({ dimension: "D4", dataset: d.key, text: "No review export was recognised. Send the reputation-tool export (one row per review with platform, date, rating, text, language, stay dates if shown), or tell us which platforms matter." });
    if (d.key === "equipment") pushAsk({ dimension: "D1", dataset: d.key, text: "No asset list was received. Send the equipment list with the dependency map (which boiler, chiller, pump station or lift serves which rooms); shared-cause failures are found through it." });
    if (d.key === "facilities") pushAsk({ dimension: "D1", dataset: d.key, text: "No list of public areas and outlets was received (pools, restaurants, bars, spa, gym, lobby). Complaints about them cannot be placed without it." });
  }
  if (!f.present.has("sops")) gaps.push({ gap: "SOPs and checklists not received", dataset: DATASET_LABELS.sops, impact: "records assessment cannot compare practice with procedure", fix: "Send the folder as it is (PDF / DOCX / XLSX), with a note on which ones are in use" });
  for (const u of f.unread.filter((x) => x.format === "unsupported")) {
    pushAsk({ dimension: null, dataset: null, text: `${u.path}: ${u.reason}.` });
  }
  for (const file of f.files) {
    if (file.dataset === "unknown" && file.lowConfidence) {
      const lc = file.lowConfidence;
      pushAsk({ dimension: null, dataset: lc.dataset, text: `${file.path} (${int(file.rows)} rows) looked like ${lower(lc.label)} (${lc.matched.map((m) => `“${m}”`).join(", ")} matched) but was not taken for it: ${lc.why}. It is left out of every count. Tell us what it is, or leave it out of the next delivery.` });
    } else if (file.dataset === "unknown") {
      pushAsk({ dimension: null, dataset: null, text: `${file.path} (${int(file.rows)} rows, columns: ${file.unmappedColumns.slice(0, 8).map((c) => `“${c}”`).join(", ")}${file.unmappedColumns.length > 8 ? ", …" : ""}) was not recognised as one of the nine datasets. Tell us what it is, or leave it out of the next delivery.` });
    }
    if (/not UTF-8/.test(file.detection.encoding)) pushAsk({ dimension: null, dataset: file.dataset, text: `${file.path} is encoded as ${file.detection.encoding}. Re-export as UTF-8 so Greek text survives; we read it this time by guessing the code page.` });
    for (const d of file.dateFormats) {
      if (/assumed/.test(d.format)) pushAsk({ dimension: null, dataset: file.dataset, text: `${file.path}, column “${d.column}”: dates are written as day/month/year or month/day/year and nothing in the values settles which. Confirm the order, or export dates as YYYY-MM-DD HH:MM.` });
      if (/inconsistent/.test(d.format)) pushAsk({ dimension: null, dataset: file.dataset, text: `${file.path}, column “${d.column}”: the day/month order is inconsistent across rows (${d.format}). Re-export with one format, ideally YYYY-MM-DD HH:MM.` });
    }
  }

  const decision = decide(f, scorecard, rows);
  return { measures, scorecard, decision, asks, gaps };
}

function impactOfField(dataset: DatasetKey, field: string): string {
  const key = `${dataset}.${field}`;
  const map: Record<string, string> = {
    "work_orders.location": "deliverables 1, 2 and 5: nothing can be placed",
    "work_orders.closure_note": "deliverable 2: recurrence visible, fix type not",
    "work_orders.closed_at": "deliverables 2 and 3: time to resolve and 'held for 30 days'",
    "work_orders.category": "deliverables 1 and 3: recurrence needs a category",
    "work_orders.status": "closures have to be inferred from the closure time",
    "work_orders.created_at": "nothing can be placed in time",
    "work_orders.created_by": "reporting channel analysis (minor)",
    "work_orders.reported_via": "guest-reported vs staff-found split (minor)",
    "work_orders.assigned_to": "none for the report (never by technician)",
    "work_orders.description": "classification from text impossible",
    "work_orders.id": "duplicates and reopen links cannot be followed",
    "complaints.room": "deliverable 4: complaints cannot be placed",
    "complaints.stay_key": "complaints cannot be tied to a stay or a survey",
    "complaints.resolved_at": "time to resolve for complaints",
    "complaints.resolution": "records assessment: what the desk did",
    "complaints.escalated_to": "escalation analysis (minor)",
    "complaints.category": "classified from text instead (fine)",
    "surveys.stay_key": "deliverable 4: survey comments cannot be placed",
    "surveys.submitted_at": "surveys placed by departure date instead",
    "reviews.stay_dates": "reviews attach by review date only",
    "reviews.language": "detected from the text instead (fine)",
    "stays.nationality": "no view by market",
    "stays.segment": "no view by channel",
    "occupancy.guests_in_house": "minor",
    "occupancy.arrivals": "minor",
    "occupancy.departures": "minor",
    "rooms.view": "minor",
    "rooms.floor": "floor-level clusters invisible",
  };
  return map[key] ?? "minor";
}

function decide(f: Facts, scorecard: DimensionResult[], rows: Judged[]): Scored["decision"] {
  const stop: string[] = [];
  const reasons: string[] = [];
  const colourOf = (key: string) => rows.find((r) => r.rule.key === key)?.colour ?? "na";

  if (!f.present.has("work_orders")) stop.push("No work-order export was recognised: there is nothing to audit. If tickets live on paper or in WhatsApp, this is a 2027 capture pilot, not an audit.");
  if (colourOf("wo_location") === "red") stop.push(`D1 work orders Red: ${pct(f.wo && f.wo.total ? f.wo.locatedWithRules / f.wo.total : null)} of tickets resolve to the list even with the documented rules. Stop unless an alias table built with the Chief Engineer lifts it above 50% within a day's work.`);
  if (colourOf("wo_count") === "red") stop.push(`D5 Red: ${int(f.wo?.total ?? 0)} work orders in the season (< 600); the data does not describe the season.`);
  if (colourOf("wo_weeks") === "red") stop.push(`D5 Red: tickets cover ${pct(f.wo && f.wo.weeksInSeason ? f.wo.weeksWithTickets / f.wo.weeksInSeason : null)} of the season's weeks${f.wo?.gapInPeak ? " with a gap of more than two weeks in peak" : ""}; the data does not describe the season.`);

  for (const d of scorecard) {
    for (const r of d.rows) {
      if (r.colour === "amber" || r.colour === "red") reasons.push(`${d.dimension} ${r.colour === "red" ? "Red" : "Amber"}: ${r.measure.toLowerCase()} at ${r.value} (${r.thresholds}).`);
      if (r.colour === "na") reasons.push(`${d.dimension} not assessable: ${r.measure.toLowerCase()} could not be measured from this export.`);
    }
  }
  const musts = DATASETS.filter((d) => d.priority === "must" && !f.present.has(d.key));
  for (const d of musts) reasons.push(`Must-have dataset not received: ${lower(d.label)}.`);

  let verdict: Decision;
  if (stop.length) verdict = "stop";
  else {
    const red = scorecard.filter((d) => d.colour === "red").length;
    const amber = scorecard.filter((d) => d.colour === "amber").length;
    const notAssessable = scorecard.some((d) => d.rows.some((r) => r.colour === "na"));
    verdict = red > 0 || amber >= 3 || notAssessable || musts.length > 0 ? "reshape" : "go";
  }
  if (verdict === "go") reasons.unshift(`All dimensions Green, or Amber on at most two (${scorecard.filter((d) => d.colour === "amber").map((d) => d.dimension).join(", ") || "none"}), none Red, every must-have dataset received and every scorecard measure measurable.`);
  if (verdict === "reshape" && !stop.length) reasons.unshift("No stop condition holds, but a dimension is Red, three or more are Amber, a must-have dataset is missing, or a scorecard measure could not be taken from this export.");
  return { verdict, reasons, stopConditions: stop };
}
