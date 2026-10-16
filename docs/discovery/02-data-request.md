# 02 · Data request: one property, 2026 season

**Who this is for:** the person named in the discovery meeting as data owner (usually the IT manager, the Operations Manager, or the Front Office Manager who can run exports), copied to the DPO.

**What we are asking for:** exports of the operational records of **one property** for the **2026 season**, from the first arrival to the last departure (typically April to October / November), with guest and employee identities removed before the files leave the hotel. Nothing live. No system access. No integration.

**Why one property:** the audit is a look back, not a rollout. One property with good records proves the method. If the group wants a second property, the same list applies.

---

## Ground rules

1. **No names, no contact details, no documents with identity data.** We say which fields we do not want under every dataset. If an export cannot drop a column, tell us and we will agree a step to strip it before sending. See `03-data-protection.md`.
2. **Pseudonymise reservation and employee identifiers at export.** Replace the PMS reservation number with a surrogate key (a sequential number, or a keyed hash whose key stays at the hotel) and keep the mapping table at the hotel. Replace employee names with a role code (e.g. `ENG-TECH-03`, `HSK-ATT-11`). The same surrogate must be used consistently across all files so we can join them. If this is hard, say so: for most tools we can describe the exact export steps.
3. **Send a two-week sample first** (any two weeks in July or August, all datasets). We check it within three working days and confirm the full export format before you spend time on it.
4. **Delivery:** through the encrypted upload link we send you, or an SFTP folder. Not email attachments, not WhatsApp, not a USB stick.
5. **Formats:** CSV or XLSX, UTF-8, one row per record, a header row, dates as `YYYY-MM-DD HH:MM` with the property's local time zone, free text left as it is (Greek, English, mixed; do not translate, do not clean). Documents as PDF or DOCX. If the tool only exports PDF reports, send those; we will say whether they are workable.
6. **Full season, not a filtered view.** Include closed, cancelled, duplicate and rejected records. We need the noise to measure the noise.
7. **Tell us what is missing.** A dataset that does not exist is useful information. "We do not log compensation" is an answer.

---

## Dataset by dataset

Each block lists: what it is, preferred format, minimum fields, fields that help, fields we do not want, where it usually lives, who usually owns it.

### 1. Work orders (maintenance / engineering jobs)

The core dataset. Everything the engineering team was asked to do and what they did.

| | |
|---|---|
| **Format** | CSV / XLSX export from the maintenance or housekeeping tool, one row per job. If the tool keeps a comment thread per job, export the thread as a second file keyed by job id. |
| **Minimum fields** | job id · created at · created by (role code, not name) · reported via (guest, staff, inspection, BMS alarm) · location as recorded (room number / building / area / asset text) · category or trade (plumbing, HVAC, electrical, carpentry, pool, IT…) · short description · status · closed at · closure note (free text) · assigned to (role code) |
| **Fields that help** | priority · reopened flag or parent job id · linked reservation surrogate key · asset id · parts used · time spent · photos count · "guest in room" flag · SLA / due date · channel (phone, app, WhatsApp transcribed) |
| **Do not send** | guest names · guest contact details · employee names (role codes instead) · employee performance notes, ratings or evaluations · photos that show people · any free-text field that is a guest ID document |
| **Usual source** | hotelkit, Flexkeeping, Optii, HotSOS, Quore, Knowcross, ALICE, or a hotel-built Excel / paper logbook. If paper: we talk before you scan anything. |
| **Usual owner** | Chief Engineer for content; IT or the tool's property admin for the export. |

Note on recurrence: if the tool has a "reopen" action, include whether each job was reopened and when. If staff open a new job instead of reopening, that is fine; we detect recurrence by location, category and time. Just tell us which habit the team has.

### 2. Guest complaint log

Complaints as recorded by reception, guest relations or the duty manager, whether or not they became a work order.

| | |
|---|---|
| **Format** | CSV / XLSX. If complaints live inside the PMS as traces or guest-profile notes, export those traces with room and dates, not the profile. If the log is a paper book, photograph pages only after we agree how names will be covered. |
| **Minimum fields** | complaint id · date and time · stay surrogate key · room number (or building / area) · category · description (free text) · resolution (free text) · resolved at · department responsible · escalated to (role) |
| **Fields that help** | linked work order id · severity · channel (in person, phone, app, tour operator rep, email) · guest moved to room (number) · compensation given (see dataset 3) · repeat flag |
| **Do not send** | guest names · nationality at this level (it comes from dataset 6 at stay level) · email, phone, loyalty number · passport or ID number · medical details written by staff ("guest has asthma"): if these appear in free text, see the free-text rule in `03-data-protection.md` |
| **Usual source** | Guest relations module of the ticketing tool · PMS traces or alerts · a shared Excel · a paper complaint book · WhatsApp group of the duty managers |
| **Usual owner** | Guest Relations Manager / Front Office Manager. |

Also ask for the **tour operator complaint forms or quality reports** for the season if the property receives them (rep logs, in-resort complaint forms, weekly quality summaries). Same rules: strip names, keep room, date, topic, text.

### 3. Compensation / goodwill log

Discounts, refunds, upgrades, free dinners and room moves granted because something went wrong. Optional but valuable: it prices the failures.

| | |
|---|---|
| **Format** | CSV / XLSX |
| **Minimum fields** | date · stay surrogate key · room · reason (free text or category) · type (refund, discount, upgrade, F&B, other) · value in EUR · approved by (role) |
| **Do not send** | guest names · card or payment details · folio numbers if they contain the guest name · approver names |
| **Usual source** | PMS adjustments / rebate report · guest relations log · Finance spreadsheet |
| **Usual owner** | Front Office Manager, Finance / Controller. |

### 4. Surveys (post-stay and in-stay)

| | |
|---|---|
| **Format** | CSV / XLSX export from the survey or reputation tool, one row per response, question scores as columns, free-text comments as columns. |
| **Minimum fields** | response id · submission date · stay surrogate key or at least room number and departure date · overall score · per-topic scores as provided (room, cleanliness, maintenance, F&B, staff, pool, noise…) · free-text comments |
| **Fields that help** | room type · building · language of response · market / tour operator · "would recommend" |
| **Do not send** | respondent name · email · phone · any contact-permission fields · raw IP addresses |
| **Usual source** | TrustYou, ReviewPro (Shiji), Revinate, GuestRevu, Medallia, Qualtrics, the tour operator's own questionnaire, or an in-house form (Google Forms, Typeform). |
| **Usual owner** | Guest Relations, Quality Manager, Sales & Marketing. Tour operator questionnaires: the Contracting or Sales manager who receives them. |

If survey responses cannot be linked to a stay, send them anyway. Room number plus departure date is enough to link most of them.

### 5. Online reviews

| | |
|---|---|
| **Format** | CSV / XLSX export from the reputation tool, one row per review. If there is no tool, tell us which platforms matter for your mix; do not copy-paste reviews by hand. |
| **Minimum fields** | review id · platform (Booking, Google, TripAdvisor, HolidayCheck, tour operator…) · review date · stay dates if shown · overall rating · sub-ratings as provided · review text · language · management response text (optional) |
| **Fields that help** | room type or building if the guest mentions it · traveller type (couple, family) · tool-generated topics and sentiment, if the tool exports them |
| **Do not send** | reviewer name or handle · profile links · reviewer location at city level · photos |
| **Usual source** | TrustYou, ReviewPro, Revinate, GuestRevu, or the platforms directly. |
| **Usual owner** | Marketing / Reputation Manager, sometimes an outside agency that answers reviews. |

### 6. PMS stay metadata (no guest identities)

One row per stay, so we can count complaints per occupied room-night and see who was where. **This is the dataset the DPO will look at hardest.** It is designed to carry no identity.

| | |
|---|---|
| **Format** | CSV / XLSX export from the PMS, filtered to arrivals between season start and season end. |
| **Minimum fields** | stay surrogate key (replaces reservation number) · room number · arrival date · departure date · adults · children · nationality as ISO country code · market segment / channel (tour operator, OTA, direct) |
| **Fields that help** | room type code · room moves during stay (from room, to room, date) · repeat-guest flag (yes/no only) · board basis · rate code family · booking lead time |
| **Do not send** | guest names · email · phone · address · date of birth · passport or ID number · loyalty number · company name · payment data · special-request notes that identify the guest (medical, religious, dietary at individual level) · the guest profile table in any form |
| **Usual source** | Opera (Oracle), Protel, Mews, Cloudbeds, Guestline, or a Greek PMS. Most PMS have a "reservation list" or "in-house report" that can be exported with selected columns. |
| **Usual owner** | Front Office Manager, Revenue Manager, or IT. The DPO should sign off the column list before export. |

Nationality is used only to check whether complaints differ by market and is reported in groups of twenty or more stays. Children are a count, not ages.

### 7. Occupancy by day

| | |
|---|---|
| **Format** | CSV / XLSX, one row per day (or per day and building if the PMS can do it). |
| **Minimum fields** | date · rooms available · rooms occupied · arrivals · departures · guests in house |
| **Fields that help** | by building or room type · out-of-order rooms count and reason · staff on duty by department (headcount, no names) |
| **Do not send** | anything at guest level; this is aggregate only |
| **Usual source** | PMS manager's report / daily flash report |
| **Usual owner** | Front Office Manager, Revenue Manager. |

Out-of-order rooms with reason are a direct signal of failures that took a room off sale. Include them if you can.

### 8. Room, building, facility and asset list

The map that everything else is linked to. Without it, "2314" is a string; with it, it is building 2, floor 3, sea side, served by chiller C2 and the north hot-water loop.

| | |
|---|---|
| **Format** | XLSX, or whatever exists: a room matrix, an engineering drawing legend, a BMS points list, a spreadsheet. A PDF site plan with building names is also useful. |
| **Minimum fields** | every room: room number · building / block / villa name · floor · room type · view / orientation · bungalow or main building · last refurbished year if known. Every public area and outlet: name · building · type (pool, restaurant, bar, spa, kids club, beach, lobby, gym, meeting room). |
| **Fields that help** | the dependency map: which boiler, chiller, air-handling unit, pump station, water tank, electrical panel, lift, WiFi node serves which rooms or buildings · asset list with asset id, type, make, install year, last major service · the 2025–2026 winter works list (what was done where) · the draft 2026–2027 winter works list if it exists |
| **Do not send** | nothing here is personal; send everything |
| **Usual source** | Chief Engineer's files, the maintenance tool's location tree, the PMS room table, the BMS, the architect's plans. |
| **Usual owner** | Chief Engineer. The PMS room table from Front Office. |

If the room numbering has a logic (first digit is the building, second is the floor), one sentence explaining it saves a day.

### 9. SOP documents and checklists

| | |
|---|---|
| **Format** | PDF / DOCX / XLSX, as they are. Folder structure as it is. A list of which ones are actually in use is more useful than a tidy export. |
| **What to include** | engineering preventive maintenance plans and checklists · housekeeping room inspection checklists · guest complaint handling procedure · duty manager procedures · night shift procedures · room move and compensation policy · opening and closing checklists (season start, season end) · brand standards if the property has them · training materials for seasonal staff · the pre-opening snag list from April 2026 |
| **Do not send** | HR policies, disciplinary procedures, employee evaluation forms, salary or contract templates, anything with employee names |
| **Usual source** | Shared drive (SharePoint, Google Drive), the ticketing tool's checklists, printed binders, the Quality Manager's laptop. |
| **Usual owner** | Quality Manager, Director of Operations, department heads. Training materials: HR / Training Manager. |

---

## Summary table

| # | Dataset | Format | Key for joining | Usual owner | Priority |
|---|---|---|---|---|---|
| 1 | Work orders | CSV/XLSX | job id, room/location, dates | Chief Engineer / IT | Must have |
| 2 | Complaint log (+ tour operator forms) | CSV/XLSX | stay key, room, dates | Guest Relations | Must have |
| 3 | Compensation log | CSV/XLSX | stay key, room, date | Front Office / Finance | Nice to have |
| 4 | Surveys | CSV/XLSX | stay key or room + departure date | Guest Relations / Quality | Should have |
| 5 | Online reviews | CSV/XLSX | review date, platform | Marketing / Reputation | Should have |
| 6 | PMS stay metadata | CSV/XLSX | stay key, room, dates | Front Office / IT, DPO sign-off | Must have |
| 7 | Occupancy by day | CSV/XLSX | date | Front Office / Revenue | Must have |
| 8 | Room / building / asset list | XLSX / PDF | room number, building, asset id | Chief Engineer | Must have |
| 9 | SOPs and checklists | PDF/DOCX | n/a | Quality / Ops | Should have |

"Must have" means the audit cannot answer its questions without it. "Should have" means a deliverable is weaker without it. "Nice to have" sharpens the cost picture.

---

## What we send back on receipt

Within three working days of the sample and ten working days of the full export:

- a receipt listing each file, row counts, date range covered, and any column we deleted on arrival because it should not have been sent;
- the data reality check result (`05-go-no-go.md`): what links, what does not, what is missing;
- a go / reshape / stop recommendation and, if reshape, what we propose instead.

---

## Checklist for the data owner

- [ ] Two-week sample of datasets 1, 2, 6, 7 and 8 uploaded
- [ ] Sample confirmed by SquareDev
- [ ] DPO has approved the column list for dataset 6 and the pseudonymisation step
- [ ] Surrogate keys generated; mapping table stored at the hotel, not sent
- [ ] Employee names replaced with role codes in datasets 1, 2 and 3
- [ ] Full season export of all "must have" datasets uploaded
- [ ] "Should have" and "nice to have" datasets uploaded or confirmed as not existing
- [ ] Room numbering logic and building names explained in one paragraph
- [ ] Draft winter works list shared, if one exists
- [ ] Deadline: **30 November 2026**
