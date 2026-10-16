# 01 · Discovery meeting guide (45 minutes)

**Audience:** General Manager, Director of Operations / Rooms Division, Chief Engineer. Guest Relations Manager and Executive Housekeeper are useful if they can join. For a group-level meeting, add the Group Operations or Quality lead and whoever owns IT for the properties.

**Goal of the meeting:** leave with (a) three concrete stories of a problem that came back after it was "fixed", (b) a map of the systems the records live in, (c) a named owner for the data exports in `02-data-request.md`, and (d) a date. Not a signed contract. Not a demo.

**Bring printed:** this guide, `04-audit-offer.md`. Nothing else. No laptop open on the table.

**When:** mid-October to mid-November, while the property is closing. The GM has time, the season is fresh in everyone's memory, and the winter works list is being written right now. After the works list is frozen (often December), the audit becomes a 2027 conversation.

---

## Timing

| Minutes | Block |
|---|---|
| 0–3 | Open: who we are in one sentence, what we will ask, what we will not do |
| 3–27 | The four operator questions, six minutes each, with probes |
| 27–37 | Map the stack |
| 37–42 | Hand over the audit offer, walk the one page |
| 42–45 | Close: names, dates, DPO introduction |

If the meeting is at the property, ask for ten extra minutes at the end to see the maintenance log and the complaint log in their physical or on-screen form. Two minutes looking at real records tells you more than the whole stack discussion.

---

## 0–3 · Open

Say, roughly:

> "We work with operations data. We are not here to sell you a platform. We want to understand what happens between a guest reporting a problem and that problem being gone for good. If what we hear matches what we have seen elsewhere, we will propose one piece of paid work for this winter: a look back over the 2026 season that shows which defects came back after being marked fixed, by room, building and equipment, in time for your winter works. If it does not match, we will say so."

Then:

> "We will ask four questions. They are the same four we ask every operator. There are no right answers."

Do not explain the company, the team, or the technology. If they ask, one sentence each, then back to the questions.

---

## 3–27 · The four operator questions

Ask them in this order. Each one has a purpose, a set of probes, and things to listen for. Write down stories, not opinions. A story has a room number, a date, a department, and an outcome.

### Question 1 · "What happens when a guest reports a problem that was fixed yesterday?"

**Purpose:** find out whether the property has any memory of a fix, and who carries it. The honest answer at most resorts is "the person on shift remembers, or nobody does".

**Probes**

- "Walk me through it. The guest in a villa calls reception at 22:00 and says the air conditioning is still not cooling. Who picks up, what do they look at, what do they see?"
- "Does the person who takes the call know that someone was in that room yesterday for the same thing? How?"
- "When a technician closes a job, what do they write? Can you show me three closed jobs from August?"
- "If the same room has the same complaint three times in a month, who notices? Is it a person or a report?"
- "What does the guest get? Apology, move, drink, discount, upgrade? Who decides and where is that written?"
- "What is different at 22:00 versus 10:00? On a Sunday in August with the Chief Engineer off?"
- "Which seasonal roles handle this first: reception night shift, guest relations, duty manager?"

**Listen for**

- "It depends who is on shift" → no system memory, person memory only. Strong fit.
- "The system shows the history for that room" → ask which system and whether housekeeping, engineering and guest relations all see the same history, or three different ones.
- "We re-open the ticket" versus "we open a new one" → tells you whether recurrence is visible in their data at all. Write it down; it decides a column in the data request.
- Compensation that is logged somewhere separate from the complaint → that log is a cost signal we want.
- A closure note culture of "done", "OK", "έγινε" → expect the closure-notes score in `05-go-no-go.md` to be low. Not fatal, but it reshapes the audit.

**Resort-specific angles**

- Villas and far buildings: the technician drives a buggy twenty minutes. Does the second visit to the same villa carry any information from the first?
- Shared plant: "When a chiller trips in August, how many 'AC not cold' calls do you get in the next hour? Do they get closed as forty separate jobs or one?" The answer tells you whether root causes are visible in the data.
- Hot water recirculation across buildings: the same complaint from rooms at the end of a loop every morning. Does anyone see the pattern as a loop problem, or as individual rooms?

### Question 2 · "How are negative reviews tied back to the operational cause?"

**Purpose:** find out whether reviews and surveys are treated as reputation work (reply, score, move on) or as operational evidence (which room, which week, which system).

**Probes**

- "A review from last week says the bathroom smelled of drains and the balcony door would not lock. Who reads it first? What do they do with it?"
- "Does anyone try to find out which room that guest was in? Can they, from your tools?"
- "Do your review scores by topic (cleanliness, facilities, noise) ever get compared with your maintenance or housekeeping tickets? By whom, how often?"
- "Tour operator reps: do they give you complaint forms or quality reports during the season? Where do those go?"
- "Post-stay survey comments: who reads the free text? Is it exported anywhere?"
- "When head office or the owner asks why facilities scores dropped in September, how do you answer? What do you look at?"

**Listen for**

- Reviews answered by a reputation tool or an agency, never seen by engineering → gap. Strong fit.
- "We know it was room 2314 because the guest told us in the review" → manual linking exists and is valued. Ask how often it happens.
- Separate silos for guest relations (complaints), engineering (work orders), front office (reviews) → the cross-system linking is exactly what we sell.
- A September dip explained by "students left, we were short-staffed" → the second half of season degradation is real at most resorts and is measurable from their data.

**Resort-specific angles**

- German, UK and Nordic guests review on different platforms and through tour operator questionnaires. Ask which platforms matter for their mix, and whether they get the tour operator quality data as a file or only as a score.
- Noise from the evening show, mosquitoes, beach, kids club: these appear in reviews but rarely as work orders. Ask what they do with complaints that are not a defect.

### Question 3 · "How does a new seasonal employee find the right procedure when no supervisor is around?"

**Purpose:** find out where the SOPs really live and whether they are used, because the later copilot work depends on it, and because the answer tells you about the handover between seasons.

**Probes**

- "You hire in April. How many of this year's front line were new to the property? New to hotels?"
- "A new night receptionist gets a complaint about a smell in a room at 01:00. What does the procedure say? Where is it? Is it in their language?"
- "Where are the SOPs: a binder, a shared drive, a system, a WhatsApp group, the head of department's head?"
- "When were they last updated? Who owns them?"
- "What happens to what this year's team learned when they leave in November? Is there a handover document?"
- "Do you train from the SOPs, or from shadowing?"

**Listen for**

- SOPs exist as PDFs on a drive that nobody opens → usable for the audit (we can map them to issue types) but not used operationally.
- SOPs inside the ticketing tool (checklists) → good, and tells you the vendor already has a foothold in "knowledge".
- "WhatsApp groups" as the real operating system → common, and a data risk: nothing is exportable or linkable. Note it in the stack map as the real tool.
- Multilingual front line with Greek-only SOPs → an obvious copilot use case for 2027. Do not pitch it now; write it down.

**Resort-specific angles**

- Seasonal turnover means every April the property re-learns its own quirks: which villas flood when it rains, which block loses water pressure at 20:00. Ask where that knowledge is kept. Usually nowhere.
- Ask whether the same seasonal staff return year to year. The answer bounds how much memory sits in people.

### Question 4 · "How do you know a recurring problem has actually stopped?"

**Purpose:** find out whether "fixed" means "closed" or "verified". This is the question that sets up the audit offer.

**Probes**

- "Pick one thing that kept coming back this season. What was it, where, how many times?"
- "What was done about it? Was that a repair, a replacement, a procedure change, or a note to winter works?"
- "After the fix, did anyone check whether it came back? How? For how long?"
- "If I asked you for the five problems that cost you the most guest goodwill this season, could you list them from a report, or from memory?"
- "What goes into the winter works list, and how is it prioritised? Is there a line between 'things that broke' and 'things that broke three times'?"
- "What is the budget argument you have to make to head office or the owner for winter works? What evidence do you bring?"

**Listen for**

- "It stopped because the complaints stopped" → they verify by silence, which fails when the guest stops complaining and starts reviewing. Strong fit.
- A named recurring problem with a number attached (a pump, a loop, a block) → that is the anchor story for the audit. Get the details.
- Winter works prioritised by the Chief Engineer's judgment and the owner's mood → an evidence-based list has a buyer.
- "We replaced it and it is fine now" with no measure → fits the "did the fix hold" deliverable. Do not argue, note it.

**Resort-specific angles**

- The winter refurbishment window is the only time most things can be properly fixed. Ask which recurring problems were pushed to winter, and whether the list is already written.
- Ask about equipment that serves many rooms: boilers, chillers, pumps, water treatment, generators, lifts, the WiFi backhaul to the villas. A recurrence there is expensive and usually invisible in a room-level ticket log.

### Handling the Chief Engineer

"Fixes that did not hold" sounds like an accusation. Say early, in these words or close to them:

> "When a fix does not hold, it is almost always a part, a root cause two buildings away, or a budget decision. We are not looking at who did the work. We are looking at what came back and why."

Also say that employee scoring is out of scope and will stay out of scope. Say it before they ask.

---

## 27–37 · Map the stack

Fill this table during the conversation. Do not read it out as a questionnaire; most of it will come out in the four questions. Use the last ten minutes to fill the gaps.

| Area | Tool at this property | Same across the group? | Since when / renewal | Admin owner | Can it export? |
|---|---|---|---|---|---|
| Maintenance work orders | | | | | |
| Housekeeping tasks / room status | | | | | |
| Guest requests & complaints log | | | | | |
| Compensation / goodwill log | | | | | |
| PMS (reservations, rooms, occupancy) | | | | | |
| Reputation / review management | | | | | |
| Post-stay or in-stay surveys | | | | | |
| Tour operator quality reports | | | | | |
| SOPs / knowledge base | | | | | |
| Staff communication (WhatsApp, radios, app) | | | | | |
| Building management / energy (BMS) | | | | | |
| Group reporting / BI | | | | | |

**Questions that fill it**

- "What do you use for maintenance jobs and housekeeping? Is it the same tool or two?" Candidates you may hear: hotelkit, Flexkeeping, Optii, HotSOS, Quore, Knowcross, ALICE, an Excel file, a paper logbook, a WhatsApp group. Write what they say, not what you expect.
- "Which PMS? Opera, Protel, Mews, something local?" Then: "Is it the same PMS in every property of the group?"
- "Reviews: do you use TrustYou, ReviewPro, Revinate, GuestRevu, something else, or do you read them on the platforms?"
- "Surveys: your own, through the reputation tool, through the tour operators?"
- "Do all properties in the group run the same tools, or does each property have its own history?" Ask it plainly. The answer decides the shape of the business.
- "Who owns these tools: the property, group IT, or the vendor's account manager?"
- "When does the maintenance tool contract renew?" Important if we are going to be compared with a vendor feature.
- "Does head office see cross-property issue data today? In what form?"

**Why this section matters: overlay or feature**

The vendors already cover single features: hotelkit ships a knowledge assistant, MARA turns reviews into tickets, ReviewPro and TrustYou do topic scoring. If every property in the group runs the same ticketing tool with an active vendor, we are at risk of being a feature that vendor ships next year. If the group runs a mix, or if reviews, complaints and work orders live in three tools that do not talk to each other, we are an overlay nobody else can build for them.

Decision rule, to apply after the meeting:

- Same ticketing tool across all properties, vendor actively shipping AI features, reviews already flowing into tickets → we lead with the audit only and with cross-property memory. Do not plan a live product pilot until the audit proves something their vendor cannot show.
- Mixed stack, or any property on paper / WhatsApp / Excel for work orders → overlay. The audit is the entry point and the 2027 pilot is the product.
- Group-level reporting is wanted and absent → the group is the buyer, not the property. Ask who at group level should see the audit.

---

## 37–42 · Hand over the audit offer

Put `04-audit-offer.md` on the table. Walk it top to bottom in three minutes. Say:

> "This is the one thing we propose for this winter. You send us the exports from one property by the end of November, we do a data reality check in the first ten working days and tell you honestly whether the records can support this, and if they can, you get the report in January, before your winter works are locked. If they cannot, you pay nothing beyond the reality check and you get a list of what to capture next season."

Then ask:

- "Which property would you pick? The one with the most complaints, or the one with the best records?" (You want the best records for a first audit.)
- "Who owns the exports? Who would we talk to about data protection?"
- "When does your winter works list close?" If it closes before January, say you will deliver the top-ten recurring failures early, as an interim.

If they ask for a price, give the range from the offer and say the fixed number comes after the reality check, because the price depends on how much manual coding the data needs.

---

## 42–45 · Close

Leave with:

1. One property named for the audit.
2. One person named as data owner (usually the IT or operations manager who can run exports from the maintenance tool and the PMS).
3. One person named for data protection (DPO or whoever acts as one).
4. A date for a thirty-minute call with those two people, within ten days.
5. Permission to send `02-data-request.md` and `03-data-protection.md` the same day.

Send both documents the same evening, with the three stories you heard written back to them in two lines each. That is the whole follow-up email.

---

## What not to say

- Do not say "AI platform", "digital transformation", "single source of truth", "end to end". Say: "show you which defects came back after being marked fixed".
- Do not pitch the guest-facing chat, the staff copilot, or the group control tower. They exist in our plan, not in this meeting. If asked, say: "later, and only if the audit shows the records support it".
- Do not say we replace their ticketing tool. We read from it.
- Do not say we will monitor staff performance, measure technicians, or rank housekeepers. Say the opposite, unprompted.
- Do not quote competitors' failures. Do not name their competitors' properties.
- Do not ask for guest names, emails, phone numbers, or any document with passport data. If they offer, decline in the room.
- Do not promise integrations. The audit runs on exports.
- Do not call it a pilot. The pilot is 2027. This winter is an audit.
- Do not say "we can do this for the whole group" in the first meeting. One property, one season.
- Do not fill silence. After each of the four questions, wait.

---

## The four questions in Greek

For meetings held in Greek, or to leave on the page with the GM.

1. **Τι γίνεται όταν ένας επισκέπτης αναφέρει ένα πρόβλημα που «φτιάχτηκε» χθες;**
2. **Πώς συνδέετε μια αρνητική κριτική με τη λειτουργική της αιτία;**
3. **Πώς βρίσκει ένας νέος εποχικός υπάλληλος τη σωστή διαδικασία όταν δεν υπάρχει προϊστάμενος κοντά;**
4. **Πώς ξέρετε ότι ένα επαναλαμβανόμενο πρόβλημα έχει πράγματι σταματήσει;**

---

## After the meeting: fill this in within the hour

- Three stories (room / building / equipment, date, what happened, what was done, did it come back):
  1.
  2.
  3.
- Stack map: attached / photo of the table.
- Overlay or feature? One line of reasoning.
- Named property for the audit:
- Data owner:
- DPO / data protection contact:
- Date of the follow-up call:
- Winter works list closes on:
- Anything they said that should change `02-data-request.md`:
