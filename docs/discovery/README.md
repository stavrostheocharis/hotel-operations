# Discovery kit: first meetings with hotel groups

Everything needed to walk into a General Manager's office in October or November 2026, understand how the property handles problems that come back, and leave with a yes to a data export for the **2026 Season Recurring-Failure Audit**.

Written for SquareDev's own use. Files 02, 03 and 04 are also sent to the hotel.

## The files

| File | What it is | Who reads it | When |
|---|---|---|---|
| [01-meeting-guide.md](01-meeting-guide.md) | 45-minute discovery script: the four operator questions with probes, the stack map, what not to say, the Greek version of the four questions | Us | Before and during the meeting. Print it. |
| [02-data-request.md](02-data-request.md) | The exact export list for one property's 2026 season: nine datasets, each with format, minimum fields, fields we refuse, usual source and owner | The hotel's data owner, copied to the DPO | Sent the evening after the meeting |
| [03-data-protection.md](03-data-protection.md) | Plain-language data-minimisation and processing checklist: lawful basis, DPA outline, pseudonymisation, free-text handling, sub-processors including EU-region model endpoints, EU AI Act points. Not legal advice; legal-review points marked | The hotel's DPO | Sent with 02 |
| [04-audit-offer.md](04-audit-offer.md) | One-page offer for the audit: deliverables, what we need, timeline, path to the 2027 pilot, price placeholders | The GM | On the table in the last ten minutes of the meeting. Print it. |
| [05-go-no-go.md](05-go-no-go.md) | The data reality check scorecard we fill after the export arrives: location linkage, closure-note quality, recurrence visibility, feedback overlap, coverage, personal-data hygiene, commercial reality; thresholds for go / reshape / stop | Us; the result is sent to the hotel | Within 10 working days of the full export |

## How to use it

**Before the meeting**

1. Read 01 once end to end. Then read only the four questions and the "what not to say" list again on the day.
2. Fill in the price placeholders in 04 (`[PRICE A]` to `[PRICE D]`) and the contact line. Put the group's name in the header. Print 01 and 04.
3. Check what is publicly known about the group's properties (number of rooms, buildings, villas, whether it is a campus or a single block) so the resort-specific probes land. Do not research their software stack; ask them.

**In the meeting**

4. Follow the timing in 01. Four questions, then the stack map, then 04 on the table, then names and dates.
5. Leave with a property, a data owner, a DPO contact and a date. Nothing else is needed.

**Same evening**

6. Send 02 and 03 to the data owner and DPO, with the three stories you heard written back in two lines each.
7. Fill the "after the meeting" block at the end of 01 and decide: overlay or feature.

**After the sample export (within 3 working days)**

8. Run the D1, D5 and D6 checks from 05 on the sample. Confirm the format or ask for changes.

**After the full export (within 10 working days)**

9. Fill 05 completely. Send the hotel the result in writing with a fixed price for the audit, or a reshape, or a stop with the records assessment.

## Sequence and dates

| Step | Date |
|---|---|
| Discovery meetings | mid-October to mid-November 2026 |
| Sample export | within two weeks of the meeting |
| Full export | by 30 November 2026 |
| Data reality check sent | by 12 December 2026 |
| Interim top-ten (if the winter-works list closes early) | mid-December 2026 |
| Audit report | January 2027 |
| Live pilot decision | February 2027, for the April–May 2027 reopening |

## Rules the whole kit follows

- **One property, one season.** Not the group, not a platform, not a pilot. The pilot is a separate 2027 decision.
- **Sell the finding, not the technology.** "Show you which defects came back after being marked fixed." Never "AI platform".
- **No identities.** No guest names, contacts or ID data; no employee names, evaluations or per-person metrics. Employee scoring is out of scope by design and by contract.
- **Ask, do not assume.** Nothing in this kit asserts which tools Mitsis, Grecotel, Costa Navarino or any other group runs. Every stack fact is a question in 01.
- **Greek resort reality.** Seasonal staff who arrive in April and leave from September, multi-building campuses and villas, shared boilers and chillers that turn one fault into forty tickets, a winter refurbishment window that is the only time to fix things properly. The probes and the datasets are built around that.
- **Say stop early.** The reality check exists so that a weak dataset ends in a records assessment in December, not a weak report in January.

## Maintaining the kit

- Thresholds in 05 are first-version defaults. After the first property, update them and log the change in the table at the end of 05.
- When a group tells us their stack, record it in the meeting notes, not in these files. The files stay generic.
- The four Greek questions in 01 are the only Greek text in the kit. If a group wants the data request or the DPO checklist in Greek, translate 02 and 03 as separate files; do not mix languages in one document.
- The data-protection checklist describes intended processing as of October 2026 and is not legal advice. Re-check the **[Legal review]** points before each DPA signature.
