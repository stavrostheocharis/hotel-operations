# Synthetic season data: Astraea Bay Resort & Villas

A generator for one April–October season of a fictional five-star resort on Crete, emitted
as the kind of exports a real hotel would hand over: a ticketing dump, a hand-kept front-desk
complaint log, post-stay surveys, aggregated online reviews and PMS master data. Hidden
underneath is an answer key that says which rows describe the same underlying problem,
where it really was, and whether the fix held. It exists so the record-linking and
recurrence-detection engine can be built and scored before real hotel data arrives.

Everything is invented. There are no names, e-mails, phone numbers or reviewer handles
anywhere; staff appear as codes (`T-03`, `HK-SUP`, `EXT-LIFT`) and guests only as
reservation numbers.

## Quick start

```bash
cd data && uv sync && uv run python -m generator --seed 42 --out out/
```

From the repository root the same run is:

```bash
uv run --project data python -m generator --seed 42 --out data/out/
```

Without uv (Python 3.12+):

```bash
cd data && python3.12 -m venv .venv && source .venv/bin/activate && pip install -e . && python -m generator --seed 42 --out out/
```

Tests:

```bash
cd data && uv run pytest
```

A run takes well under a second and is fully deterministic: the same seed produces
byte-identical CSV/JSON files (the `.xlsx` differs only in its internal timestamps, its
content is identical). `--seed` changes every stay, ticket and comment while keeping the
42 planted scenarios in place, so you can generate as many seasons as you need. `out/`
is git-ignored.

| Option | Default | Meaning |
|---|---|---|
| `--seed N` | 42 | random seed |
| `--out DIR` | `out` | output directory (created if missing) |
| `--config FILE` | `data/resort.yaml` | resort definition |
| `--quiet` | off | no summary on stdout |

## The resort (`resort.yaml`)

| Building | Code | Floors | Rooms | Numbering |
|---|---|---|---|---|
| Main Building | A | 1–3 | 90 | `101`–`130`, `201`–`230`, `301`–`330` |
| Garden Wing | B | 1–3 | 90 | `131`–`160`, `231`–`260`, `331`–`360` |
| Sea Wing | C | 1–3 | 60 | `161`–`180`, `261`–`280`, `361`–`380` |
| Cliff Wing | D | 1–2 | 38 | `181`–`199`, `281`–`299` |
| Astraea Villas | V | – | 20 | `V01`–`V20`, each with a private pool |

Room numbers are unique across the property (first digit = floor), so `312` resolves to
one room, but the building is only knowable through `rooms.csv`. Facilities: two pools
(main lagoon pool, adults-only infinity pool), the Thalassa Spa (hammam, sauna), gym, three
restaurants (Orizontas breakfast/buffet, Ammos beach taverna, Elia fine dining on the Sea
Wing roof), the Kyma beach bar, lobby, kids club and parking. Shared equipment per wing:
boiler, chiller, booster pump set, lift (two in A), plus pool plant, pool heat pump, spa
steam generator, beach-bar refrigeration and sound system, Elia split units, Ammos grease
trap and the door-lock server. Everything is listed in `facilities.csv` and `equipment.csv`.

The YAML also holds the occupancy curve (34 % in April, 57 % May, 79 % June, 93 % July,
97 % August, 84 % September, 47 % October, with a weekly charter ripple), the stay-length
mix, the guest-language mix (English 33 %, German 24 %, French 12 %, Italian 10 %, Greek
9 %, Russian 6 %, Hebrew 6 %, shifted by month: Italians and Greeks in August, Germans in
the shoulder months), the nationality mix per language, the background-noise rates and the
messiness knobs. All of it can be edited; the planted scenarios reference specific rooms
and equipment ids, so keep the numbering scheme if you change the building sizes.

## Output files

All files are UTF-8. Dates are the mess real systems produce: four different conventions
across the exports (see the messiness section).

### `work_orders.csv` — ticketing export (hotelkit / Flexkeeping style)

Semicolon-separated, UTF-8 **with BOM**, CRLF line endings, as a Greek-locale Excel export.
One row per ticket, sorted by creation time.

| Column | Content |
|---|---|
| `Ticket No` | integer, mostly consecutive, with gaps (deleted tickets) |
| `Created` / `Closed` | `DD/MM/YYYY HH:MM`; `Closed` empty for open tickets |
| `Location` | free text as technicians type it: `312`, `Rm 312`, `#312`, `A-312`, `312 - bath`, `Δωμ. 312`, `Villa 12`, `V-12`, `vila 12`, `Bldg C boiler room`, `Λεβητοστάσιο C`, `Kyma bar`, `Main pool plant room` … |
| `Category` | drop-down: HVAC, Plumbing, Electrical, Carpentry & Furniture, Housekeeping, IT / TV, Pool & Spa, Kitchen Equipment, Lift, Grounds & Pest, Safety, Other. Wrong in ~22 % of rows and `Other` in ~14 % |
| `Description` | free text in English (~55 %), Greek (~28 %) or Greeklish (~17 %), e.g. `klimatistiko den kryonei rm 312 parapono pelati` |
| `Closure Note` | free text; ~18 % empty, ~14 % just `done` / `ok` / `έγινε` |
| `Technician` | staff code (`T-01`…`T-09`, `IT-01`, `HK-SUP`) or contractor (`EXT-LIFT`, `EXT-POOL`, `EXT-PEST`, `EXT-REFRIG`) |
| `Status` | inconsistent casing and vocabulary: `Closed`, `closed`, `CLOSED`, `Completed`, `Done`, `Open`, `New`, `In Progress`, `Assigned`, `On Hold`, `On hold - parts`, `Waiting parts` |
| `Priority` | mixed `Low`/`low`/`3`, `Medium`/`Normal`/`2`, `High`/`Urgent`/`1` |
| `Reported By` | department: Front Office, Housekeeping, Guest, Engineering, F&B, Spa |
| `Reopened` | `Y`, `N` or empty (~45 % missing) |

Includes preventive-maintenance tickets (`PM: chiller A condenser coil wash`, legionella
flushes, lift inspections, mosquito fogging) and ~3 % duplicates where two departments
logged the same problem.

### `front_desk_log.xlsx` — complaint & request log

A workbook with **one sheet per month** (`April` … `October`). Each sheet has a title in
row 1, an empty row 2 and the header in row 3 (`pandas.read_excel(..., sheet_name=None,
header=2)`). Columns:

| Column | Content |
|---|---|
| `#` | running number across the season (unique, used by the answer key) |
| `Date` | real Excel date |
| `Time` | text `HH:MM` |
| `Room` | integer for rooms, text for villas (`Villa 12`, `V12`, `V 12`), occasionally a text cell with trailing space, empty in ~6 % of facility complaints |
| `Guest comment (original)` | what the guest said or wrote, in the guest's language |
| `Agent note` | English paraphrase by the agent in ~55 % of rows (`Guest reports no hot water. Maint. informed.`) |
| `Dept` | drop-down: Maintenance, Housekeeping, F&B, Front Office, Spa, IT, Security, Guest Relations; wrong ~12 % of the time |
| `Resolution` | free text, ~30 % empty (`Fixed same day`, `Guest moved to 318`, `Comp. dinner offered`, `Pending maintenance`) |
| `Shift` | AM / PM / Night |

About a third of the rows are requests rather than complaints (extra pillows, late
check-out, lost sunglasses). A guest who reports the same thing twice sometimes says so
("Second time we report it").

### `surveys.csv` — post-stay surveys

Comma-separated, LF. One row per response, ~31 % of stays respond. **No room number**:
the link to the room goes through `reservation_no` → `stays.csv`.

| Column | Content |
|---|---|
| `response_id` | 8 hex characters |
| `reservation_no` | PMS reservation number (= `stays.csv`) |
| `checkout_date` | ISO date |
| `language` | guest language of the comment; empty when there is no comment |
| `overall`, `room`, `cleanliness`, `bathroom`, `food_beverage`, `staff`, `pool_beach`, `spa`, `value_for_money` | 1–10; `spa` empty when not used |
| `nps` | 0–10 |
| `comment` | free text in the guest's language, ~45 % empty; complaints are embedded in otherwise positive comments |
| `would_recommend` | Yes / No / empty |

Scores are correlated with what the guest experienced: a hot-water problem pulls
`bathroom` and `overall` down.

### `reviews.json` — review-aggregator export

`{"property", "source", "count", "reviews": [...]}`. Three platforms with three different
shapes:

| Platform | Fields |
|---|---|
| `google` | `review_id`, `date` (ISO datetime, `Z`), `rating` 1–5, `language`, `text`, `owner_reply` |
| `booking` | `review_id`, `date` (ISO date), `score` 1–10, `title`, `positive`, `negative` (separate boxes, no single text), `language`, `traveler_type`, `room_type_stayed` (often empty), `nights`, `stay_month` |
| `tripadvisor` | `review_id`, `published` (ISO date), `date_of_stay` (month only, e.g. `July 2026`), `rating` 1–5, `title`, `text`, `language`, `trip_type` |

Reviews mention the wing (`Sea Wing`, `Garden Wing`) or room type in ~35 % of cases and
the room number in ~3 %. About 7.5 % of stays leave a review, 2–25 days after check-out.

### `rooms.csv`, `facilities.csv`, `equipment.csv` — location hierarchy

Clean master data. `rooms.csv`: `room_code, building, building_name, floor, room_type,
view, is_villa`. `facilities.csv`: `facility_code, name, type, area, notes`.
`equipment.csv`: `equipment_id, name, type, building, location, serves, installed_year`
(`serves` says which rooms/facilities an asset feeds, e.g. `all rooms in C, Elia kitchen`).

### `stays.csv` — PMS metadata

`reservation_no, room, check_in, check_out, nights, adults, children, nationality,
market_segment, board, booked_on`. ISO dates, no names. Reservation numbers follow booking
order, not arrival order.

### `occupancy_daily.csv`

`date, building, rooms_available, rooms_occupied, occupancy_pct, arrivals, departures`,
one row per day per building (A, B, C, D, V).

### `answer_key.json` — hidden ground truth

Keep this away from the engine. Structure:

```
generator_version, seed, resort, season {open, close}
how_to_read   { … one paragraph per field … }
stats         { issues, signals_total, by_role, by_source, planted_by_source, scenarios }
issues[]      issue_id, scenario, title, category, topic, severity,
              root_cause {type, location, description}, affected_locations,
              first_signal, last_signal, recurred, fix_held, resolved_by_season_end,
              status_at_season_end, signal_ids[], work_order_ids[], signal_count, notes
signals[]     signal_id, source_file, record_id, issue_id, role, true_location,
              true_location_type, true_category, topic, stay_id, timestamp, language,
              duplicate_of, distractor_for, note
```

* `signal_id` is `<prefix>-<record_id>`: `WO-4412` (work_orders.csv `Ticket No`), `FD-231`
  (front-desk `#`), `SV-3cc597d8` (`response_id`), `RV-b-746325098` (`review_id`). Every
  row of the four signal exports has exactly one entry here.
* `issue_id` is `null` for background noise. `role` distinguishes `planted` (part of an
  issue), `noise`, `distractor` (noise deliberately placed to look like an issue: same topic,
  same week, another building or the room next door; `distractor_for` names the issue) and
  `duplicate` (second ticket for the same noise problem; `duplicate_of` points to the first).
* `true_location` is where the symptom was observed: a room code, a facility code, an
  equipment id (a lift complaint resolves to the lift, not to the guest's room), a building
  code (`B`) or a floor code (`B/3`). The *cause* lives in the issue's `root_cause.location`
  (the Sea Wing hot-water complaints are in rooms; the root cause is `C-BOILER`).
* `true_category` is a clean taxonomy (`hvac, plumbing, electrical, locks_doors, noise,
  housekeeping, pest, facilities, elevator, it_network, it_tv, fnb_service, furniture,
  safety, appliance, service, request, preventive`), independent of the drop-downs in the
  exports. `topic` is finer (`no_hot_water`, `keycard_fails`, …).
* `fix_held` is about the last recorded fix: `true`, `false`, or `null` when nothing was
  ever fixed (process issues, tickets still on hold).

## Deliberate messiness

* Four date conventions: `DD/MM/YYYY HH:MM` text in the ticketing export, real Excel dates
  plus `HH:MM` text in the log, ISO dates in surveys/PMS, ISO datetime with `Z` for Google,
  month-only `date_of_stay` on Tripadvisor.
* Four delimiters/encodings: `;` + BOM + CRLF (tickets), `,` + LF (surveys, PMS), xlsx with
  title rows and one sheet per month, nested JSON with a different shape per platform.
* Location strings in ~20 spellings per room, including Greek script and building-letter
  prefixes (`A-312`), villas as `Villa 12`/`V12`/`vila 12`, equipment by nickname
  (`C boiler`, `Λεβητοστάσιο C`, `Kyma bar`). About 2.5 % of noise tickets carry a digit swap
  in the room number (`Rm 132` for 312). Planted tickets never have typos.
* Ticket category wrong (~22 %) or `Other` (~14 %); closure note empty or trivial (~32 %);
  reopened flag missing (~45 %); status and priority vocabularies inconsistent; night-shift
  timestamps; duplicates logged by two departments; preventive tickets mixed in.
* Front-desk log: original-language guest text, optional English paraphrase, wrong
  department ~12 %, resolution empty ~30 %, room cell typed as number or text, facility
  complaints sometimes without a room.
* Surveys carry no room; reviews almost never do; Booking splits text into positive/negative;
  Tripadvisor only gives the month of stay.
* Languages: guest text in seven languages with hand-written variants per topic (Russian and
  Hebrew cover the common topics and fall back to English otherwise, as those guests often
  write in English anyway); staff text in English, Greek and Greeklish.
* Hard negatives: for each cluster a same-topic complaint in another wing the same week; for
  some same-room repeats a same-topic ticket in the room next door a day later.
* Noise is kept from accidentally forming recurrences: the generator never places two
  unrelated signals with the same topic at the same location within 45 days.

## Planted scenarios

Forty-two underlying issues, 243 signals in total for seed 42 (each issue 4–8 signals, every
issue visible in at least two different exports), on top of ~4,600 unrelated signals.
Scenario kinds:

* **same_room_repeat** – the same room fails again for the next guest, with increasingly
  real fixes (filters → regas → compressor).
* **shared_cause_cluster** – several rooms in one wing complain within days; one equipment
  ticket is the real fix. Some clusters come back weeks later because the first fix was
  cosmetic.
* **fix_not_held** – ticket closed `done` within hours, then the survey from the *same stay*
  says it never worked; the next guest reports it again.
* **long_unresolved** – a ticket on hold for parts or quotes for weeks or months, with guest
  complaints and reviews piling up; some still open at season end.
* **ops_recurring** – process problems with no maintenance ticket at all (breakfast staffing,
  sunbeds, beach-bar music, housekeeping misses): only guest-side signals.
* **cross_room_leak** – the symptom is in one room, the cause in the room above.
* **equipment_repeat** – the same asset (lift, steam generator, ice machine) fails repeatedly;
  guest complaints come from different rooms.

| Issue | Scenario | Where | Topic | Signals (seed 42) | Recurred | Fix held | What happened |
|---|---|---|---|---|---|---|---|
| ISS-01 | same_room_repeat | V12 | ac_not_cooling | 8 (3 FD, 1 RV, 1 SV, 3 WO) | yes | yes | Villa 12 AC fails three times across the summer |
| ISS-02 | same_room_repeat | V05 | jacuzzi_broken | 6 (3 FD, 1 RV, 2 WO) | yes | no | Villa 5 jacuzzi pump keeps failing |
| ISS-03 | same_room_repeat | V07 | no_hot_water | 7 (3 FD, 1 SV, 3 WO) | yes | yes | Villa 7 water heater: three visits before the element was replaced |
| ISS-04 | fix_not_held | V18 | mosquitoes | 6 (2 FD, 1 RV, 1 SV, 2 WO) | yes | yes | Villa 18 mosquitoes: spraying did not help, screens did |
| ISS-05 | long_unresolved | V02 | wifi_weak | 6 (3 FD, 2 RV, 1 WO) | yes | yes | Villa 2 Wi-Fi dead zone open for four months |
| ISS-06 | shared_cause_cluster | A-CHILLER | ac_not_cooling | 8 (5 FD, 1 RV, 2 WO) | no | yes | Main Building chiller trips in the late-July heatwave |
| ISS-07 | same_room_repeat | 118 | tv_broken | 6 (3 FD, 3 WO) | yes | yes | Room 118 set-top box rebooted twice, then replaced |
| ISS-08 | cross_room_leak | 314 | ceiling_leak | 6 (2 FD, 1 SV, 3 WO) | yes | yes | Leak from 314 into the bathroom ceiling of 214, twice |
| ISS-09 | equipment_repeat | A-LIFT-1 | elevator_stuck | 6 (2 FD, 1 RV, 3 WO) | yes | no | Main Building lobby lift keeps stopping between floors |
| ISS-10 | same_room_repeat | 327 | safe_stuck | 6 (3 FD, 3 WO) | yes | yes | Room 327 safe: batteries twice, then the safe |
| ISS-11 | fix_not_held | 305 | drain_blocked | 5 (2 FD, 1 SV, 2 WO) | yes | yes | Room 305 shower drain cleared 'done', still slow for the whole stay |
| ISS-12 | ops_recurring | REST-ORIZONTAS | breakfast_slow | 7 (2 FD, 2 RV, 3 SV) | yes | n/a | Breakfast understaffed through August |
| ISS-13 | long_unresolved | B/3 | wifi_weak | 6 (3 FD, 2 RV, 1 WO) | yes | yes | Garden Wing 3rd floor Wi-Fi dead zone |
| ISS-14 | long_unresolved | B-LIFT-1 | elevator_stuck | 4 (2 FD, 1 RV, 1 WO) | yes | yes | Garden Wing lift out of order ten days waiting for a controller board |
| ISS-15 | shared_cause_cluster | B-PUMP | low_pressure | 8 (5 FD, 1 SV, 2 WO) | yes | yes | Garden Wing booster pump: reset in July, replaced in August |
| ISS-16 | shared_cause_cluster | B | mosquitoes | 6 (3 FD, 1 RV, 1 SV, 1 WO) | yes | no | Mosquitoes in the Garden Wing ground-floor rooms |
| ISS-17 | same_room_repeat | 245 | ac_dripping | 5 (2 FD, 1 RV, 2 WO) | yes | yes | Room 245 fan coil drips twice |
| ISS-18 | fix_not_held | 158 | balcony_door_lock | 5 (2 FD, 1 SV, 2 WO) | yes | yes | Room 158 balcony door: tightened, then the cylinder replaced |
| ISS-19 | ops_recurring | B/2 | room_not_cleaned | 6 (3 FD, 1 RV, 2 SV) | yes | n/a | Garden Wing 2nd floor housekeeping misses in September |
| ISS-20 | shared_cause_cluster | C-BOILER | no_hot_water | 8 (5 FD, 3 WO) | yes | yes | Sea Wing hot water: boiler circulation pump fails in June and again in September |
| ISS-21 | long_unresolved | 362 | railing_loose | 4 (2 FD, 1 RV, 1 WO) | yes | yes | Room 362 loose balcony railing waits three months for a welder |
| ISS-22 | same_room_repeat | 266 | minibar_warm | 5 (2 FD, 1 SV, 2 WO) | yes | yes | Room 266 minibar reset, then replaced |
| ISS-23 | same_room_repeat | 375 | keycard_fails | 7 (3 FD, 1 RV, 3 WO) | yes | yes | Room 375 door lock fails for three guests in a row |
| ISS-24 | shared_cause_cluster | C | sewage_smell | 7 (5 FD, 2 WO) | yes | yes | Sewage smell on the Sea Wing ground floor: traps refilled in May, vent cleared in October |
| ISS-25 | same_room_repeat | 274 | bed_uncomfortable | 7 (3 FD, 1 RV, 1 SV, 2 WO) | yes | yes | Room 274 mattress complaints from three stays |
| ISS-26 | ops_recurring | BEACHBAR | noise_music | 6 (3 FD, 2 RV, 1 SV) | yes | yes | Beach bar music keeps Cliff Wing guests awake until the 23:00 curfew |
| ISS-27 | shared_cause_cluster | D-CHILLER | noise_equipment | 5 (3 FD, 1 RV, 1 WO) | no | yes | Cliff Wing chiller fan bearing hums at night |
| ISS-28 | fix_not_held | 192 | ac_dripping | 5 (2 FD, 1 SV, 2 WO) | yes | yes | Room 192 AC drip closed 'ok', drain line found blocked three weeks later |
| ISS-29 | long_unresolved | D-BOILER | no_hot_water | 7 (4 FD, 1 SV, 2 WO) | yes | no | Cliff Wing boiler cannot keep up at full occupancy |
| ISS-30 | long_unresolved | 185 | shower_door | 4 (2 FD, 1 SV, 1 WO) | yes | yes | Room 185 shower screen waits six weeks for a part |
| ISS-31 | shared_cause_cluster | POOLINF-HEATPUMP | pool_cold | 4 (2 FD, 1 RV, 1 WO) | no | yes | Infinity pool cold in early May: heat pump compressor |
| ISS-32 | ops_recurring | POOL-MAIN | sunbeds | 6 (1 FD, 3 RV, 2 SV) | yes | n/a | Sunbed shortage at the main pool in high season |
| ISS-33 | equipment_repeat | SPA-HEATER | hammam_cold | 8 (3 FD, 1 RV, 1 SV, 3 WO) | yes | yes | Hammam steam generator fails three times |
| ISS-34 | long_unresolved | GYM | gym_treadmill | 4 (2 FD, 1 RV, 1 WO) | yes | n/a | Gym treadmill out of order since May, never repaired |
| ISS-35 | ops_recurring | REST-AMMOS | food_cold | 6 (1 FD, 3 RV, 2 SV) | yes | n/a | Ammos taverna kitchen overwhelmed in August |
| ISS-36 | shared_cause_cluster | ELIA-AC | restaurant_hot | 4 (2 FD, 1 RV, 1 WO) | no | yes | Elia dining room AC fails during late-July service |
| ISS-37 | equipment_repeat | BEACHBAR-COLD | bar_warm_drinks | 5 (1 FD, 1 RV, 1 SV, 2 WO) | yes | yes | Beach bar ice machine: descaled, then the condenser fan |
| ISS-38 | shared_cause_cluster | POOLMAIN-FILTER | pool_cloudy | 5 (2 FD, 1 RV, 1 SV, 1 WO) | no | yes | Main pool cloudy in early July: filter sand |
| ISS-39 | equipment_repeat | SPA | spa_changing_smell | 4 (1 FD, 1 SV, 2 WO) | yes | no | Spa changing rooms damp smell returns after each clean |
| ISS-40 | shared_cause_cluster | LOCKS-CONTROLLER | keycard_fails | 6 (4 FD, 2 WO) | no | yes | Key cards fail across the Main Building after a lock-server update |
| ISS-41 | same_room_repeat | 341 | ac_noisy | 5 (2 FD, 1 SV, 2 WO) | yes | yes | Room 341 noisy fan coil |
| ISS-42 | cross_room_leak | 271 | ceiling_leak | 4 (1 FD, 1 SV, 2 WO) | no | yes | Leak from 271 into 171 in late September |

Signal types: FD = front-desk log, WO = work order, SV = survey, RV = review.

## Suggested scoring

* **Linking**: pairwise or cluster F1 over `issue_id` on the planted signals; count a
  distractor linked to its issue as a false positive, a duplicate linked to its original
  as neither.
* **Location resolution**: accuracy of the resolved location against `true_location`,
  separately for tickets (typed text), front-desk rows (room cell + text), surveys
  (reservation → room) and reviews (wing/room type only).
* **Category**: accuracy against `true_category`, which the export drop-downs get wrong on
  purpose.
* **Recurrence and outcome**: per issue, `recurred`, `fix_held` and `root_cause.location`
  (did the engine blame the boiler, or five showers?).

## Regenerating and customising

* Change `resort.yaml` for volumes, mixes and messiness rates; `noise_rates` and
  `messiness` are plain probabilities.
* The scenario catalogue is `generator/scenarios.py` (`plant_all`): one call per issue
  with explicit dates, rooms, closure notes and root causes. Builders exist for every
  scenario kind, so adding an issue is a few lines. Signals per issue are asserted to stay
  within 2–8.
* Text banks live in `generator/texts/` (`en.py`, `de.py`, `fr.py`, `it.py`, `el.py`,
  `ru.py`, `he.py` for guests, `staff.py` for tickets and agent notes). Add variants per
  topic key; the renderer picks them at random and falls back to English when a language
  lacks a topic.
* Topic → category / drop-down / department mapping is `generator/topics.py`.

## Limitations

* Stays are allocated day by day to hit the occupancy curve; there is no rate or revenue
  data, and no overbooking or out-of-order rooms.
* Guest texts are template variants, not an LLM; with ~3–5 variants per topic and language
  the same sentence does recur across the season, as it would across real reviews, but a
  linking engine that memorises strings will look better here than in production.
* The survey response rate and review rate are flat across the season; no platform-specific
  reviewer behaviour is modelled.
