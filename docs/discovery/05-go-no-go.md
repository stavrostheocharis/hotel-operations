# 05 · Data reality check: go / reshape / stop scorecard

**When:** filled within 10 working days of receiving the full export (sample results within 3 working days). The result goes to the hotel in writing, with this scorecard attached.

**Why it exists:** the audit promises to show which defects came back after being marked fixed. That is only possible if the records say where things happened, what was done, and when. The scorecard measures exactly that, before anyone spends money on analysis that the data cannot support. It also protects the relationship: a "stop" delivered early with a records assessment is a better outcome than a weak report in January.

**Who fills it:** the SquareDev analyst running the check. Thresholds are our defaults for a first property. After the first audit they get recalibrated and the change is noted at the bottom.

---

## Property and export summary

| | |
|---|---|
| Group / property | |
| Season covered (first arrival – last departure) | |
| Rooms / buildings / villas | |
| Datasets received (tick) | ☐ work orders ☐ complaints ☐ TO forms ☐ compensation ☐ surveys ☐ reviews ☐ stay metadata ☐ occupancy ☐ room/asset list ☐ SOPs |
| Row counts | WO: · complaints: · surveys: · reviews: · stays: |
| Occupied room-nights in season | |
| Date received / date assessed | |
| Analyst | |

---

## Definitions used throughout

- **Signal:** any record of a problem: a work order, a complaint-log entry, a negative survey comment (score below the property's midpoint or a text comment flagged negative), a negative review mention (a sentence in a review assigned a defect topic).
- **Location:** a room number, villa, building, public area or asset that resolves to the master list in dataset 8. "Resolves" means exact match, or a match through a documented rule (e.g. "2314" → building 2, floor 3), or a unique text match ("north pool pump room"). Guesses by an analyst do not count.
- **Usable closure note:** a free-text closure that states an action and an object ("replaced FCU valve", "cleared siphon, flushed line", "άλλαξα θερμοστάτη"). Not usable: empty, "done", "OK", "fixed", "έγινε", "closed", a name only, or a copy of the request text.
- **Recurrence candidate:** two signals of the same category at the same location within 30 days where the first was closed before the second was opened.
- **Review topic overlap:** a review or survey topic that maps to at least one work-order category used at this property.

---

## Scorecard

Score each dimension Green / Amber / Red from the thresholds. Record the measured value, not only the colour.

### D1 · Signals linkable to a location

**How to measure:** for each dataset, share of records with a location that resolves to the master list. Measure work orders and complaints separately; they drive the audit. Reviews are expected to be low and are not scored here.

| Dataset | Measured | Green | Amber | Red |
|---|---|---|---|---|
| Work orders with a resolvable location | % | ≥ 80% | 50–79% | < 50% |
| Complaints with a resolvable location | % | ≥ 60% | 35–59% | < 35% |
| Work orders linkable to an asset (for plant-level jobs) | % | ≥ 50% of plant jobs | 25–49% | < 25% |

**Common reasons for Amber/Red:** free-text location ("the bungalow near the beach bar"), room numbers that changed after a renumbering, public areas with five different names, jobs logged against the building instead of the room, jobs logged against a person ("for Giannis").

**Typical reshape:** build a location-alias table with the Chief Engineer (half a day) and re-measure. Often lifts work orders by 15–20 points.

### D2 · Work orders with a usable closure note

**How to measure:** draw a random sample of 200 closed work orders, spread across months and categories. Two people code each note independently: 0 = empty or placeholder, 1 = action stated, 2 = action and cause or part stated. Usable = score ≥ 1. Report the share usable and the share at 2. Report by month: closure quality usually falls from August.

| Measure | Measured | Green | Amber | Red |
|---|---|---|---|---|
| Share of closed WOs with usable closure note | % | ≥ 50% | 25–49% | < 25% |
| Share with cause or part stated | % | ≥ 25% | 10–24% | < 10% |
| Share of closed WOs with a closure timestamp | % | ≥ 95% | 80–94% | < 80% |

**Why it matters:** "fixes that did not hold" needs to know what the fix was. With poor notes the audit can still show *recurrence* (the problem came back) but not *fix quality* (what was tried and failed). That is a reshape, not a stop.

**Typical reshape:** report recurrence by location and category without the fix-type analysis; add a closure-note standard to the records assessment and make it the first change for 2027.

### D3 · Recurrence is visible in the data

**How to measure:** does the tool record reopen events or parent-child links, or do staff open new jobs? Compute the recurrence candidate rate: share of closed work orders followed by a same-category signal at the same location within 30 days. Check that the rate is neither implausibly low (< 2%, usually a sign that locations or categories are too coarse) nor implausibly high (> 40%, usually duplicates or a catch-all category).

| Measure | Measured | Green | Amber | Red |
|---|---|---|---|---|
| Recurrence candidate rate, 30 days | % | 4–25% and categories are specific | 2–4% or 25–40% | < 2% or > 40% |
| Category taxonomy | # categories, share in the largest | ≥ 12 categories, largest < 30% | 6–11, or largest 30–50% | < 6, or one category > 50% ("general") |
| Duplicate rate (same location, same category, within 2 hours) | % | < 10% | 10–20% | > 20% and not explainable by a plant event |

**Typical reshape:** re-categorise from description text with a model pass, validated on a 200-record sample against the Chief Engineer's reading.

### D4 · Overlap between guest feedback and operational records

**How to measure:** assign a defect topic to every negative review mention and negative survey comment (a 30-topic taxonomy: HVAC, hot water, water pressure, drains and smell, noise, cleanliness, pests, WiFi, TV, safe, minibar, balcony and doors, pool, beach, F&B quality, F&B wait, staff attitude, check-in, buggy transport, lighting, mould and humidity…). Then:

- **Topic overlap:** share of negative review and survey mentions whose topic maps to at least one work-order category at this property.
- **Corroboration:** of mentions with a topic that maps, and with a room or building and a date (survey with stay key; review with stated stay dates), share with a matching signal (work order or complaint) at that location within ±7 days.
- **Uncaptured topics:** list of topics with ≥ 10 mentions and no work-order category (often noise, pests, F&B, transport). These become an audit finding on their own.

| Measure | Measured | Green | Amber | Red |
|---|---|---|---|---|
| Topic overlap | % | ≥ 50% | 30–49% | < 30% |
| Corroboration (where location and date exist) | % | ≥ 30% | 15–29% | < 15% |
| Survey responses linkable to a stay or room + departure date | % | ≥ 60% | 30–59% | < 30% |

**Note:** reviews rarely carry a room. Low corroboration from reviews alone is expected; score mainly on surveys and tour operator forms. If neither surveys nor reviews are available, D4 is "not assessable" and deliverable 4 of the offer is dropped, with a price reduction.

### D5 · Coverage and volume

**How to measure:** does the export span the season without gaps, and is there enough of it?

| Measure | Measured | Green | Amber | Red |
|---|---|---|---|---|
| Season coverage (weeks with work orders / weeks open) | % | ≥ 95% | 85–94% | < 85% or a gap > 2 weeks in peak |
| Work orders per occupied room-night | ratio | ≥ 0.05 | 0.02–0.05 | < 0.02 (logging is partial) |
| Work orders, absolute | count | ≥ 1,500 | 600–1,499 | < 600 |
| Stay metadata covers the season | % of occupancy explained by stays | ≥ 95% | 85–94% | < 85% |
| Occupancy by day present | yes / partial / no | yes | partial | no |
| Room and asset list complete (rooms in WOs that exist in the list) | % | ≥ 95% | 85–94% | < 85% |

For a 300-room resort over a six-month season, 0.05 work orders per occupied room-night is roughly 2,500 jobs. A property logging far below that is logging only what the guest complained about, or only engineering and not housekeeping.

### D6 · Personal data hygiene

**How to measure:** from the scrub log (section 6 of `03-data-protection.md`).

| Measure | Measured | Green | Amber | Red |
|---|---|---|---|---|
| Identity columns in any file on receipt | count | 0 | 1–2, deleted on arrival and reported | names or ID numbers in structured columns across files |
| Free-text records with a placeholder inserted | % | < 5% | 5–15% | > 15% (the hotel should run pre-export redaction and resend) |
| Special-category fragments quarantined | count | reported, any count | | |
| Surrogate key consistent across files | yes / no | yes | partial | no (files cannot be joined) |

Red on identity columns is not a stop for the audit, but it is a stop on processing until the file is replaced. Tell the DPO the same day.

### D7 · Commercial reality (filled by the account lead, not the analyst)

| Question | Answer |
|---|---|
| A sponsor at GM or group level has confirmed in writing that they want the report before the winter works close | yes / no |
| The DPO has engaged (checklist returned, or a call held) | yes / no |
| Winter-works list closing date is known | date |
| The reality check fee is paid or invoiced | yes / no |
| The property is representative of the group (same ticketing tool as at least half the group's properties, or the group has said this property is the model) | yes / no / unknown |

Two or more "no" here means the audit may be technically possible and commercially pointless. Raise it before January, not after.

---

## Decision rules

Apply in order.

1. **Stop** if any of these hold:
   - D1 work orders Red **and** no alias table can lift it above 50% within a day's work.
   - D5 work orders absolute count < 600, or season coverage Red (the data does not describe the season).
   - D3 recurrence rate < 2% after re-categorisation (recurrence cannot be seen).
   - D6 surrogate key "no" and the hotel cannot re-export (nothing joins).
   - D7 sponsor "no" and DPO "no".
2. **Reshape** if no stop condition holds and any dimension is Red, or three or more are Amber.
3. **Go** otherwise: all Green, or Amber on at most two dimensions with none Red.

"Stop" still delivers the records assessment (deliverable 7 of the offer) and a list of what to capture in 2027. "Stop" at one property is not "stop" with the group: propose a different property if the group has one with better records.

---

## Reshape menu

Pick the smallest change that makes the audit honest.

| Weak dimension | Reshape |
|---|---|
| D1 work orders Amber | Alias table with the Chief Engineer; re-measure; proceed. Price unchanged. |
| D1 complaints Red, work orders Green | Engineering-only audit. Complaints used only where linkable. Deliverables 1, 2, 3, 5, 6 kept; deliverable 4 reduced to reviews and surveys. Price reduced. |
| D2 Red | Recurrence audit without fix-type analysis. Deliverable 2 becomes "problems that returned after closure" without saying what the fix was. Closure-note standard becomes the headline of deliverable 7. Price reduced. |
| D3 category taxonomy Red | Model-based re-categorisation from descriptions, validated on 200 records with the Chief Engineer. Adds 3–5 days. Price up or scope down. |
| D4 not assessable | Drop deliverable 4. Offer to collect public reviews ourselves for text and date only, within platform terms. **[Legal review]** on collecting public reviews directly rather than through the hotel's reputation tool. |
| D5 work orders Amber (partial logging) | Audit what is logged and say so. Add "what is not logged" as a finding, using complaints and reviews as the shadow signal. |
| D6 Amber | Hotel runs pre-export redaction and resends the text columns. One-week delay. |
| Work orders live on paper or in WhatsApp | Not an audit. Propose a 2027 pilot that starts with capture (a ticket channel the team will actually use), with the 2027 season as the baseline instead of 2026. Say this plainly. |

---

## Data gaps log

List every gap, who said what about it, and whether it is fixable before January.

| # | Gap | Dataset | Impact on deliverable | Hotel can fix? (how, by when) | Decision |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## Result

| | |
|---|---|
| D1 Location linkage | Green / Amber / Red · value: |
| D2 Closure notes | Green / Amber / Red · value: |
| D3 Recurrence visibility | Green / Amber / Red · value: |
| D4 Feedback overlap | Green / Amber / Red / not assessable · value: |
| D5 Coverage and volume | Green / Amber / Red · value: |
| D6 Personal data hygiene | Green / Amber / Red · value: |
| D7 Commercial reality | number of "no": |
| **Decision** | **Go / Reshape / Stop** |
| Reshape chosen (if any) | |
| Fixed audit price after check | € |
| Sent to hotel on | |

---

## Threshold change log

| Date | Dimension | Old | New | Reason |
|---|---|---|---|---|
| 2026-10-16 | all | – | first version | defaults before any property has been assessed |
