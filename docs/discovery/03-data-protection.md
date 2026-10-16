# 03 · Data protection: minimisation and processing checklist

**Who this is for:** the hotel group's Data Protection Officer (DPO) or whoever acts as one, and the data owner running the exports.

**What this is:** a plain-language description of what data we ask for, why, what we do with it, what we do not do, and the safeguards we commit to. It is written so a DPO can say yes quickly, or say exactly what needs to change.

**What this is not:** legal advice. SquareDev is not a law firm. Points that need a lawyer's eye on either side are marked **[Legal review]**. We expect the Data Processing Agreement (DPA) itself to be reviewed by both parties' counsel before signature.

---

## 1. The processing in one paragraph

The hotel sends SquareDev exports of one property's 2026 season operational records: maintenance work orders, complaint log, surveys, online reviews, stay metadata without guest identities, daily occupancy, the room and asset list, and procedure documents. SquareDev links these records by room, building, equipment and time to find defects that recurred after being marked fixed, and reports them back at the level of rooms, buildings, equipment and departments. The hotel decides what to repair over the winter. No decision about any individual guest or employee is made or supported by this work.

---

## 2. What we do not do

Stated first because it answers most DPO questions.

- We do **not** receive guest names, emails, phone numbers, addresses, dates of birth, passport or ID numbers, loyalty numbers or payment data.
- We do **not** receive employee names, evaluations, ratings, disciplinary records, contracts or pay. Employees appear only as role codes (e.g. `ENG-TECH-03`).
- We do **not** score, rank, profile or evaluate any employee, and the deliverables contain no per-person metrics. This is a design constraint, not only a contractual one, and it keeps the work outside the employment-related use cases of the EU AI Act (see section 10).
- We do **not** make or support decisions about individual guests (no pricing, no blacklisting, no marketing).
- We do **not** use the hotel's data to train any model, and we require the same from every sub-processor.
- We do **not** access the hotel's systems. We receive files once, through an encrypted channel.
- We do **not** keep the data after the engagement (section 7).

---

## 3. Data categories and minimisation

| Dataset | Contains personal data? | Minimisation applied before it leaves the hotel | Residual risk |
|---|---|---|---|
| Work orders | Possibly, in free text (a guest name typed into a note; an employee name) | Employee columns replaced by role codes; guest columns removed | Names inside free text. Handled under section 6 |
| Complaint log | Yes, pseudonymised | Names, contacts removed; reservation number replaced by surrogate key; the mapping stays at the hotel | Free text may describe a person or a health condition. Section 6 |
| Compensation log | Pseudonymised | As above; no payment data | Low |
| Surveys | Yes, pseudonymised | Respondent identity and contact fields removed | Free text. Section 6 |
| Online reviews | Yes: reviews are public but the reviewer is still a data subject | Reviewer name, handle, profile link removed; only text, date, platform, ratings | Free text may name staff ("Maria at the bar was great"). Section 6 |
| PMS stay metadata | Yes, pseudonymised | Only room, dates, party size, country code, segment; surrogate key; no profile fields | Re-identification by the hotel is possible (that is the point of the surrogate key); by SquareDev it is not, because the mapping is not shared. Small-group reporting rule in 3.1 |
| Occupancy by day | No (aggregate) | None needed | None |
| Room / building / asset list | No | None needed | None |
| SOPs and checklists | Normally no; HR material excluded | HR and employee documents excluded by the request | Author names in document metadata. Stripped on receipt |

Pseudonymised data is still personal data under GDPR (Art. 4(5), Recital 26), because the hotel can reverse it. We treat every dataset above as personal data except the aggregate and inventory ones.

### 3.1 Reporting rules that protect individuals

- Nationality, party composition and market segment appear in the report only for groups of **20 or more stays**. Smaller groups are merged into "other".
- No deliverable contains a stay-level or person-level row. The most granular unit in the report is a room, an asset, a building, a department, a week.
- Quotations from free text in the report are limited to the defect description and are checked for names before use.
- Role codes appear in internal working files only; the report speaks of departments and shifts, never of a role code.

---

## 4. Roles and lawful basis

**Roles.** The hotel (or the group company that operates the property) is the **controller**. SquareDev is the **processor**, acting on the hotel's documented instructions under a DPA (GDPR Art. 28). **[Legal review]**: confirm which group entity is the controller for the chosen property, and whether group-level reporting makes a second entity a joint controller.

**Lawful basis for the hotel's processing.** This is the hotel's determination, not ours. The basis we see most often for using operational records to improve service quality, safety and maintenance is **legitimate interests** (Art. 6(1)(f)), on the reasoning that guests and employees reasonably expect a hotel to analyse its own maintenance and complaint records to stop problems recurring, the data is minimised and pseudonymised, and no decision about an individual follows. The hotel should be able to point to its existing privacy notice, which typically already covers "improving our services" and "handling complaints". **[Legal review]**: the hotel's DPO documents the legitimate interests assessment (purpose, necessity, balancing) and checks that the privacy notice for guests and the information given to employees cover analytical use of these records. If the hotel relies on a different basis, tell us; nothing in the method depends on it.

**Special categories (Art. 9).** We do not ask for any. They can appear uninvited in free text (a guest's illness, a disability, a religious dietary request, an allergy). Section 6 describes how we find and remove them. **[Legal review]**: confirm that incidental special-category content in free text, removed on receipt and never analysed, does not require a separate Art. 9 condition under the hotel's assessment; if it does, the alternative is that the hotel runs the scrub step before export, which we can supply as a script.

**Employees.** Employee data is limited to role codes and timestamps of actions in the work order system. This is normal operational data, already processed by the hotel in the ticketing tool. We add no monitoring and derive no individual metrics. **[Legal review]**: confirm that the information given to employees about the ticketing tool covers aggregate analysis of its records, and whether works-council or employee-representative consultation is customary for the group, even though no monitoring is introduced.

**Automated decision-making (Art. 22).** Not applicable. There is no decision about an individual, automated or otherwise.

**Data Protection Impact Assessment (Art. 35).** On our reading, the processing is not likely to result in a high risk: pseudonymised data, no profiling, no decisions about individuals, no new technology applied to individuals, no systematic monitoring. We nonetheless provide a one-page DPIA screening with the DPA so the hotel's file is complete. **[Legal review]**: the DPO confirms the screening conclusion against the Hellenic DPA's list of processing operations requiring a DPIA.

---

## 5. Data Processing Agreement: outline

We provide a draft DPA. Its substance follows Art. 28(3). The outline, so the DPO can check it before reading the draft:

| Clause | What it says |
|---|---|
| Parties and roles | Hotel entity as controller; SquareDev as processor. |
| Subject matter and duration | Analysis of one property's 2026 season operational records; from signature until deletion confirmation, expected to be within 60 days of the final report being accepted. |
| Nature and purpose | Linking and statistical analysis of maintenance, complaint, survey, review and stay records to identify recurring defects and the effectiveness of repairs, for the controller's maintenance planning and service improvement. **No other purpose.** |
| Types of personal data | As in section 3. Explicitly excluded: identity, contact, payment, identification documents, employee evaluation data, special categories. |
| Data subjects | Guests of the property (pseudonymised), employees of the property (role codes), public reviewers (text only). |
| Processor obligations | Process only on documented instructions; confidentiality of staff; security measures (section 8); engage sub-processors only with prior written authorisation (section 9); assist with data subject requests and with Art. 32–36 obligations; delete or return at the end; make available information for audits; notify the controller of a personal data breach without undue delay and in any case within 48 hours of becoming aware. |
| Purpose limitation | Data is used only for the audit and, if the hotel later commissions it, the 2027 pilot under a new instruction. No training of models. No reuse for other clients. Aggregated, non-personal findings (e.g. "chiller trips cause X% of August HVAC complaints at Greek resorts") may be used by SquareDev only with the hotel's written agreement and never with the property named. **[Legal review]**: both sides' counsel to settle the wording on aggregated learnings. |
| Retention | Raw exports and working files: deleted within 60 days of acceptance of the final report, or at the controller's instruction at any time. The final report (which contains no personal data) is retained by both parties. If a 2027 pilot is commissioned, the controller may instruct retention of the linked dataset for the pilot's baseline, under the pilot's DPA. |
| Deletion | Cryptographic deletion of storage, deletion from backups within the backup cycle (max 30 days), written confirmation of deletion listing each file received. |
| Sub-processors | Listed in section 9, with region. Changes notified in advance with the right to object. |
| International transfers | None intended. All storage and processing in the EU. See section 9 for the cloud-provider point. |
| Liability, audit, termination | Standard terms; **[Legal review]** on both sides. |

---

## 6. Free text that may contain personal data

Work order notes, complaint descriptions, survey comments and reviews are free text written by staff and guests. They can contain names ("Mr Papadopoulos in 214 says…"), phone numbers, and occasionally health information ("guest is diabetic, needs fridge"). This is where most residual risk lives, and this is how we handle it.

**Before export (at the hotel), if feasible:** we supply a small script that redacts names, email addresses, phone numbers and ID-like numbers in the chosen text columns, and replaces them with placeholders (`[NAME]`, `[PHONE]`). It runs on the hotel's machine. The hotel keeps the original. This is the preferred option because then unredacted text never leaves the hotel.

**On receipt (at SquareDev), always:**

1. **Automatic scrub.** Every text field passes through pattern matching (emails, phones, ID and passport-like numbers, card-like numbers) and a named-entity recognition pass for person names in Greek and English. Matches are replaced with placeholders. The scrub runs before any analyst reads the data and before any text reaches a language model.
2. **Special-category screen.** A keyword and classifier pass flags text that may describe health, religion, sexual orientation, ethnicity, political opinion or trade-union membership. Flagged records are quarantined: the flagged sentence is removed, the rest of the record stays. Quarantined fragments are not analysed and are deleted.
3. **Manual spot check.** An analyst reviews a random sample of 200 scrubbed records and all quarantined records. Misses are added to the patterns and the scrub is re-run.
4. **Scrub log.** We give the DPO a count by dataset: records received, placeholders inserted by type, records quarantined. Not the content.
5. **Staff names in reviews.** Guests often praise or blame staff by first name. These are replaced with `[STAFF]`. The audit does not need them.

**What the language model sees.** Only scrubbed text, only for the purpose of assigning a defect topic and location to each record, and only through an endpoint that does not retain inputs or train on them (section 9). The model's output is a category label and a location guess, not a rewrite of the text.

**[Legal review]**: whether the hotel wishes to require pre-export redaction as a condition, and whether residual placeholders (`[NAME]`) in working files are acceptable, which on our reading they are since they carry no identity.

---

## 7. Retention and deletion

- Sample export: deleted within 10 working days of the full export arriving, or immediately if the engagement does not proceed.
- Full export and all working files: deleted within 60 days of the hotel accepting the final report.
- If the data reality check ends in "stop": all files deleted within 10 working days of that decision and confirmed in writing.
- Deletion confirmation lists each file received, with hashes, and the date deleted.
- Nothing is stored on laptops, portable media or personal cloud accounts. Analysts work in the EU-hosted environment described in section 8.

---

## 8. Security measures (Art. 32)

- Transfer: encrypted upload link or SFTP with per-engagement credentials. No email, no messaging apps.
- Storage: EU-region cloud storage, encrypted at rest, one isolated project per client, no shared buckets.
- Access: named analysts only (we tell the hotel who, by role; typically two people), multi-factor authentication, access logged, revoked at the end of the engagement.
- Processing: EU-region compute only. No data copied to local machines.
- Pseudonymisation and scrubbing as in sections 3 and 6.
- Breach: notification to the hotel within 48 hours of awareness, with what we know and what we are doing. The hotel decides on supervisory authority (Hellenic DPA) and data subject notification; we support with facts.
- Staff: confidentiality agreements; data protection training; no subcontracted analysts without written authorisation.

**[Legal review]**: the hotel's information security policy may require specific controls or certifications from processors; tell us which, and we will say what we meet and what we do not.

---

## 9. Sub-processors, including language model endpoints

We list every third party that touches the data, with region and role. The list below is the shape; the DPA names the providers.

| Role | Provider type | Region | Terms we require |
|---|---|---|---|
| Cloud storage and compute | Major cloud provider | EU (e.g. Frankfurt, Paris, Stockholm) | Data residency in region; encryption; provider acts as processor under its standard DPA |
| Language model endpoint (topic and location extraction from scrubbed text) | Model served from an EU-region endpoint of a cloud provider, or an EU-based model provider | EU | No training on inputs; zero or minimal retention (abuse-monitoring retention disclosed if any); provider DPA with sub-processor list; data residency |
| Secure file transfer | Managed SFTP or upload service | EU | Encryption in transit and at rest; EU hosting |

Points the DPO should look at:

- **US-headquartered cloud providers.** Even with EU-region hosting, a US parent may be subject to US law. Our position is that EU-region hosting plus the provider's EU-US Data Privacy Framework certification or standard contractual clauses, plus the fact that the data is pseudonymised and contains no identity, keeps the residual risk low. **[Legal review]**: the hotel's counsel should confirm their view of the current transfer framework status and whether a transfer impact assessment is wanted. If the hotel prefers an EU-headquartered model provider, we can use one; the cost and quality trade-off is ours to manage.
- **Model provider retention.** Some providers retain prompts for a short period for abuse monitoring even with "no training" terms. We disclose the exact retention period of the endpoint we use and prefer zero-retention configurations where offered.
- **No consumer AI tools.** Analysts do not paste hotel data into consumer chat tools. This is a written rule in our staff policy and is covered by the DPA's "documented instructions" clause.

---

## 10. EU AI Act: where it touches this work

**The audit itself.** A statistical analysis producing a report for maintenance planning. It makes no decisions about individuals, involves no biometric, emotion-recognition or employment-related use, and does not interact with natural persons. On our reading it is not a high-risk AI system under Annex III and carries no specific AI Act obligations beyond general ones. **[Legal review]**: confirm the classification; note the important boundary below.

**The boundary that matters: employee evaluation.** Annex III lists AI used for decisions affecting work-related relationships, including evaluating performance. This is the main reason employee scoring is **out of scope by design** and not merely "not delivered this time". The deliverables contain no per-person metrics, the role codes never appear in the report, and the DPA's purpose clause forbids this use. If the hotel ever asked for technician-level analysis, that would be a different engagement with different obligations, and we would say so.

**Later guest-facing chat (not part of this audit; included so the DPO sees the whole road).** If, in 2027, a guest can report a problem through a QR code to an assistant that answers in natural language, then:

- **Transparency (Art. 50).** The guest must be told clearly, at the start, that they are interacting with an AI system, in their language, and how to reach a person. We design this in: first message states it, and "talk to a person" is always one tap away. Transparency obligations under Art. 50 were scheduled to apply from 2 August 2026, so we treat them as in force for any 2027 pilot. **[Legal review]**: confirm the application date given the ongoing amendments to the AI Act's timeline, the wording of the disclosure, and the Greek-law consumer information points for guest-facing services.
- **No emotion recognition, no biometrics.** The assistant reads text. It does not analyse voice, images of people or sentiment about the individual.
- **Scope.** The assistant handles operational reports (something is broken, something is missing) and hands off everything else. It does not negotiate compensation.
- **Logging and human oversight.** Every conversation creates a ticket that a person handles. The assistant does not close issues.
- **Guest data.** Minimised in the same way: room and stay key, not name; conversation retained only as long as the issue is open plus a short period, then reduced to the ticket.
- **Privacy notice.** The guest-facing flow needs its own notice text, and the lawful basis may differ from the audit's (contract performance for handling a guest's request is the usual candidate). **[Legal review]**.

**Staff-facing copilot (also later).** An assistant that helps a seasonal employee find the right SOP is a productivity tool, not an employment decision tool, as long as it is not used to assess the employee. We keep the same design rule: no per-person usage metrics in any report. **[Legal review]** at the time, with the works-council point from section 4.

---

## 11. Data subject rights

- Guests and employees exercise their rights with the hotel as controller. We assist within 5 working days of a request from the hotel.
- Because we hold no identities and no mapping table, we usually cannot identify an individual from a request alone (Art. 11). The hotel identifies the surrogate key from its mapping and tells us which key to locate, correct or delete.
- A deletion request for one stay can be honoured without affecting the audit; one row less in a season of thousands changes nothing.

---

## 12. Quick checklist for the DPO

Tick, or tell us what to change.

- [ ] Controller entity identified for the chosen property
- [ ] Lawful basis documented by the hotel (legitimate interests assessment, or other)
- [ ] Privacy notice for guests and information to employees cover analytical use of operational records
- [ ] Column list for the PMS export (dataset 6 in `02-data-request.md`) approved; no identity fields
- [ ] Surrogate key method agreed; mapping stays at the hotel
- [ ] Employee names replaced with role codes before export
- [ ] Pre-export free-text redaction: wanted / not wanted
- [ ] DPA draft received; sub-processor list with regions reviewed
- [ ] Retention (60 days after acceptance) and deletion confirmation format accepted
- [ ] DPIA screening received and conclusion accepted
- [ ] Transfer position on EU-region hosting of a US-headquartered provider accepted, or EU-headquartered provider requested
- [ ] Breach notification window (48 hours) accepted
- [ ] Confirmation that employee scoring and any per-person analysis are out of scope and prohibited by the DPA purpose clause
- [ ] Secure transfer channel set up; data owner has the credentials

---

*This document describes SquareDev's intended processing and safeguards as of October 2026. It is not legal advice. Points marked **[Legal review]** are to be confirmed by the parties' legal advisers before the DPA is signed.*
