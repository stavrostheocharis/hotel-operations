import type { DatasetKey, Priority } from "./types";

/**
 * The target schema of the data request (docs/discovery/02-data-request.md),
 * dataset by dataset, with the header spellings hotels and their tools use
 * for each field. The reality check matches a client's columns against these
 * by name; nothing here assumes our synthetic layout.
 */

export type Content = "date" | "time" | "number" | "text" | "id" | "room" | "flag";

export type FieldSpec = {
  key: string;
  label: string;
  /** From the "minimum fields" row of the data request. */
  required: boolean;
  synonyms: string[];
  /** What the values should look like; a column that does not match is a weaker candidate. */
  content?: Content;
  /** Several columns may feed one field (review text split into positive / negative, question scores). */
  multi?: boolean;
};

export type DatasetSpec = {
  key: DatasetKey;
  label: string;
  priority: Priority;
  /** Clues in the file or sheet name. */
  nameHints: RegExp;
  /** At least one of these must match confidently before a file is taken for this dataset. */
  coreFields: string[];
  /**
   * The columns that identify a record of this dataset (when, which): at
   * least `minKeys` of them must match confidently, whatever the file name
   * says. A list that merely shares a category and a location column with
   * the tickets is not the ticket export.
   */
  keyFields: string[];
  minKeys: number;
  fields: FieldSpec[];
  /** Fields that carry the record's own date, in order of preference, for the date range. */
  dateFields: string[];
  /** Free-text fields, for the language mix and the personal-data scan. */
  textFields: string[];
};

const STAY_KEY = [
  "stay key", "stay surrogate key", "surrogate key", "surrogate", "stay id", "stay ref", "reservation",
  "reservation no", "reservation number", "reservation id", "res no", "res id", "resv", "booking",
  "booking id", "booking no", "booking ref", "booking reference", "confirmation", "confirmation no",
  "confirmation number", "conf no", "pms id", "folio", "κράτηση", "αριθμός κράτησης", "αρ κράτησης",
];

const ROOM = ["room", "room no", "room number", "room nr", "rm", "room code", "unit", "δωμάτιο", "δωμ", "αρ δωματίου", "zimmer", "chambre", "camera"];

export const DATASETS: DatasetSpec[] = [
  {
    key: "work_orders",
    label: "Work orders",
    priority: "must",
    nameHints: /work[_ -]?orders?|tickets?|maintenance|engineering|\bjobs?\b|\bwo\b|hotsos|flexkeeping|hotelkit|quore|knowcross|alice|tasks?|βλάβ|συντήρησ/i,
    coreFields: ["description", "location", "closure_note"],
    keyFields: ["id", "created_at", "closed_at", "status"],
    minKeys: 2,
    dateFields: ["created_at", "closed_at"],
    textFields: ["description", "closure_note"],
    fields: [
      { key: "id", label: "job id", required: true, content: "id", synonyms: ["job id", "job no", "job number", "ticket no", "ticket", "ticket id", "ticket number", "ticket nr", "wo", "wo id", "wo no", "work order", "work order id", "work order no", "work order number", "order id", "order no", "task id", "request id", "request no", "id", "no", "number", "nr", "ref", "reference", "αριθμός", "κωδικός", "α α"] },
      { key: "created_at", label: "created at", required: true, content: "date", synonyms: ["created at", "created", "created on", "creation date", "creation time", "date created", "opened", "opened at", "opened on", "open date", "date opened", "reported at", "reported on", "date reported", "logged", "logged at", "date logged", "date", "date time", "datetime", "timestamp", "start", "start date", "raised", "raised on", "ημερομηνία", "ημ νία", "ημερομηνία δημιουργίας", "δημιουργία", "έναρξη"] },
      { key: "created_by", label: "created by (role code)", required: true, content: "text", synonyms: ["created by", "reporter", "reported by", "requested by", "requester", "logged by", "opened by", "raised by", "author", "originator", "δημιουργός", "αναφέρθηκε από", "από"] },
      { key: "reported_via", label: "reported via", required: true, content: "text", synonyms: ["reported via", "via", "source", "channel", "origin", "request source", "reporting channel", "how reported", "πηγή", "κανάλι"] },
      { key: "location", label: "location as recorded", required: true, content: "text", synonyms: ["location", "location as recorded", "location text", "room", "room no", "room number", "room area", "room location", "area", "place", "where", "zone", "space", "site", "position", "asset location", "object", "χώρος", "δωμάτιο", "τοποθεσία", "θέση", "περιοχή", "ort", "lieu", "luogo"] },
      { key: "category", label: "category or trade", required: true, content: "text", synonyms: ["category", "trade", "type", "job type", "issue type", "fault type", "problem type", "discipline", "department", "dept", "service", "skill", "work type", "classification", "κατηγορία", "ειδικότητα", "τμήμα", "είδος"] },
      { key: "description", label: "short description", required: true, content: "text", synonyms: ["description", "short description", "summary", "subject", "title", "problem", "issue", "details", "request", "text", "comment", "task", "fault", "defect", "what", "περιγραφή", "σχόλιο", "θέμα", "πρόβλημα", "αίτημα", "beschreibung"] },
      { key: "status", label: "status", required: true, content: "text", synonyms: ["status", "state", "progress", "stage", "κατάσταση", "στάδιο"] },
      { key: "closed_at", label: "closed at", required: true, content: "date", synonyms: ["closed at", "closed", "closed on", "close date", "date closed", "closing date", "completed at", "completed", "completed on", "completion date", "date completed", "resolved at", "resolved", "resolved on", "date resolved", "finished", "finished at", "end", "end date", "done at", "done on", "ολοκλήρωση", "ολοκληρώθηκε", "κλείσιμο", "ημερομηνία ολοκλήρωσης", "ημερομηνία κλεισίματος", "λήξη"] },
      { key: "closure_note", label: "closure note", required: true, content: "text", synonyms: ["closure note", "closure notes", "closing note", "closing notes", "closure comment", "close note", "resolution", "resolution note", "resolution notes", "completion note", "completion notes", "completion comment", "work done", "work performed", "action taken", "actions taken", "action", "fix", "solution", "remarks", "notes", "note", "technician note", "technician notes", "technician comment", "engineer notes", "comments", "feedback", "σχόλια", "σημειώσεις", "ενέργειες", "επίλυση", "εργασία", "τι έγινε"] },
      { key: "assigned_to", label: "assigned to (role code)", required: true, content: "text", synonyms: ["assigned to", "assignee", "assigned", "technician", "tech", "engineer", "owner", "responsible", "worker", "staff", "handled by", "executed by", "performed by", "completed by", "resolved by", "τεχνικός", "ανάθεση", "υπεύθυνος", "ανατέθηκε"] },
      { key: "priority", label: "priority", required: false, content: "text", synonyms: ["priority", "urgency", "severity", "prio", "προτεραιότητα", "επείγον"] },
      { key: "reopened", label: "reopened flag or parent job", required: false, content: "text", synonyms: ["reopened", "reopen", "re opened", "reopened flag", "parent", "parent id", "parent job", "parent ticket", "linked ticket", "related ticket", "follow up of", "επανάνοιγμα", "επαναφορά"] },
      { key: "stay_key", label: "linked reservation surrogate key", required: false, content: "id", synonyms: STAY_KEY },
      { key: "asset_id", label: "asset id", required: false, content: "id", synonyms: ["asset", "asset id", "asset no", "asset tag", "equipment", "equipment id", "εξοπλισμός", "πάγιο"] },
      { key: "parts", label: "parts used", required: false, content: "text", synonyms: ["parts", "parts used", "materials", "material", "spares", "ανταλλακτικά", "υλικά"] },
      { key: "time_spent", label: "time spent", required: false, content: "number", synonyms: ["time spent", "duration", "hours", "labour", "labor", "work time", "minutes", "διάρκεια", "ώρες"] },
      { key: "due_at", label: "SLA / due date", required: false, content: "date", synonyms: ["due", "due date", "due at", "deadline", "sla", "target date", "scheduled", "scheduled date", "προθεσμία"] },
      { key: "guest_in_room", label: "guest in room flag", required: false, content: "flag", synonyms: ["guest in room", "occupied", "room occupied", "guest present"] },
    ],
  },
  {
    key: "complaints",
    label: "Guest complaint log",
    priority: "must",
    nameHints: /front[_ -]?desk|complaints?|guest[_ -]?(relations?|log)|\blog\b|traces?|duty[_ -]?manager|παράπον|ρεσεψιόν/i,
    coreFields: ["description", "resolution"],
    keyFields: ["id", "occurred_at", "description", "resolution"],
    minKeys: 2,
    dateFields: ["occurred_at", "resolved_at"],
    textFields: ["description", "resolution", "agent_note"],
    fields: [
      { key: "id", label: "complaint id", required: true, content: "id", synonyms: ["complaint id", "complaint no", "id", "no", "nr", "number", "ref", "reference", "entry", "entry no", "record", "case", "case id", "case no", "trace id", "αριθμός", "α α", "αα"] },
      { key: "occurred_at", label: "date and time", required: true, content: "date", synonyms: ["date", "date and time", "date time", "datetime", "timestamp", "created", "created at", "logged", "logged at", "reported", "reported at", "received", "received at", "when", "ημερομηνία", "ημ νία", "ημερομηνία ώρα"] },
      { key: "time", label: "time", required: false, content: "time", synonyms: ["time", "hour", "ώρα"] },
      { key: "stay_key", label: "stay surrogate key", required: true, content: "id", synonyms: STAY_KEY },
      { key: "room", label: "room number (or building / area)", required: true, content: "room", synonyms: [...ROOM, "location", "area", "building", "place", "χώρος", "κτίριο"] },
      { key: "category", label: "category", required: true, content: "text", synonyms: ["category", "type", "complaint type", "complaint category", "topic", "issue", "issue type", "subject", "theme", "κατηγορία", "θέμα", "είδος"] },
      { key: "description", label: "description (free text)", required: true, content: "text", synonyms: ["description", "complaint", "complaint text", "guest comment", "guest comment original", "guest comments", "guest said", "guest statement", "comment", "comments", "details", "text", "remarks", "what happened", "problem", "issue description", "σχόλιο", "σχόλια", "παράπονο", "περιγραφή", "τι είπε ο πελάτης"] },
      { key: "resolution", label: "resolution (free text)", required: true, content: "text", synonyms: ["resolution", "resolution note", "resolved", "action", "action taken", "actions taken", "follow up", "outcome", "response", "handling", "what was done", "solution", "closure", "επίλυση", "ενέργεια", "ενέργειες", "αποτέλεσμα"] },
      { key: "agent_note", label: "agent note", required: false, content: "text", synonyms: ["agent note", "agent notes", "staff note", "internal note", "notes", "note", "remarks", "σημείωση", "σημειώσεις"] },
      { key: "resolved_at", label: "resolved at", required: true, content: "date", synonyms: ["resolved at", "resolved on", "date resolved", "closed", "closed at", "closed on", "completed", "completed at", "completion date", "fixed at", "ολοκλήρωση", "επιλύθηκε", "κλείσιμο"] },
      { key: "department", label: "department responsible", required: true, content: "text", synonyms: ["department", "dept", "responsible department", "assigned department", "assigned to department", "team", "division", "τμήμα", "αρμόδιο τμήμα", "αρμόδιο"] },
      { key: "escalated_to", label: "escalated to (role)", required: true, content: "text", synonyms: ["escalated to", "escalation", "escalated", "manager", "duty manager", "handled by", "owner", "agent", "staff", "taken by", "logged by", "received by", "κλιμάκωση", "υπεύθυνος", "χειριστής"] },
      { key: "work_order_id", label: "linked work order id", required: false, content: "id", synonyms: ["work order", "work order id", "work order no", "ticket", "ticket no", "ticket id", "wo", "wo id", "job", "job id", "linked ticket", "maintenance ticket", "αριθμός βλάβης"] },
      { key: "severity", label: "severity", required: false, content: "text", synonyms: ["severity", "priority", "urgency", "level", "σοβαρότητα", "προτεραιότητα"] },
      { key: "channel", label: "channel", required: false, content: "text", synonyms: ["channel", "via", "source", "how reported", "reported via", "medium", "κανάλι", "πηγή"] },
      { key: "moved_to_room", label: "guest moved to room", required: false, content: "room", synonyms: ["moved to", "moved to room", "room move", "new room", "relocated to", "μετακίνηση", "νέο δωμάτιο"] },
      { key: "compensation", label: "compensation given", required: false, content: "text", synonyms: ["compensation", "comp", "goodwill", "gesture", "compensation given", "credit", "αποζημίωση"] },
      { key: "repeat_flag", label: "repeat flag", required: false, content: "flag", synonyms: ["repeat", "repeat flag", "repeated", "second time", "recurring", "again", "επανάληψη"] },
      { key: "shift", label: "shift", required: false, content: "text", synonyms: ["shift", "βάρδια"] },
    ],
  },
  {
    key: "compensation",
    label: "Compensation / goodwill log",
    priority: "nice",
    nameHints: /compensation|goodwill|rebates?|adjustments?|refunds?|gestures?|allowances?|αποζημ/i,
    coreFields: ["value", "reason"],
    keyFields: ["date", "stay_key", "value"],
    minKeys: 2,
    dateFields: ["date"],
    textFields: ["reason"],
    fields: [
      { key: "date", label: "date", required: true, content: "date", synonyms: ["date", "date time", "datetime", "posted", "posted on", "created", "ημερομηνία"] },
      { key: "stay_key", label: "stay surrogate key", required: true, content: "id", synonyms: STAY_KEY },
      { key: "room", label: "room", required: true, content: "room", synonyms: ROOM },
      { key: "reason", label: "reason", required: true, content: "text", synonyms: ["reason", "reason text", "description", "comment", "comments", "remarks", "why", "cause", "αιτία", "λόγος", "περιγραφή", "σχόλιο"] },
      { key: "type", label: "type", required: true, content: "text", synonyms: ["type", "kind", "category", "compensation type", "gesture type", "τύπος", "είδος"] },
      { key: "value", label: "value in EUR", required: true, content: "number", synonyms: ["value", "amount", "value eur", "amount eur", "eur", "cost", "total", "price", "sum", "ποσό", "αξία", "κόστος"] },
      { key: "approved_by", label: "approved by (role)", required: true, content: "text", synonyms: ["approved by", "approver", "authorised by", "authorized by", "approved", "manager", "εγκρίθηκε από", "έγκριση"] },
    ],
  },
  {
    key: "surveys",
    label: "Surveys",
    priority: "should",
    nameHints: /surveys?|questionnaires?|feedback|\bnps\b|trustyou|reviewpro|revinate|guestrevu|medallia|qualtrics|typeform|ερωτηματολ|ικανοποίησ/i,
    coreFields: ["overall", "comment", "topic_scores"],
    keyFields: ["id", "stay_key", "submitted_at", "departure_date", "overall"],
    minKeys: 2,
    dateFields: ["submitted_at", "departure_date"],
    textFields: ["comment"],
    fields: [
      { key: "id", label: "response id", required: true, content: "id", synonyms: ["response id", "response no", "survey id", "id", "response", "respondent id", "answer id", "submission id", "αριθμός", "κωδικός"] },
      { key: "submitted_at", label: "submission date", required: true, content: "date", synonyms: ["submission date", "submitted", "submitted at", "submitted on", "date submitted", "response date", "date", "completed", "completed at", "created", "created at", "timestamp", "answered", "answered at", "sent", "ημερομηνία", "ημερομηνία υποβολής"] },
      { key: "stay_key", label: "stay surrogate key", required: true, content: "id", synonyms: STAY_KEY },
      { key: "room", label: "room number", required: false, content: "room", synonyms: ROOM },
      { key: "departure_date", label: "departure date", required: false, content: "date", synonyms: ["departure", "departure date", "date of departure", "checkout", "check out", "check out date", "checkout date", "leaving", "leaving date", "stay end", "end of stay", "αναχώρηση", "ημερομηνία αναχώρησης"] },
      { key: "arrival_date", label: "arrival date", required: false, content: "date", synonyms: ["arrival", "arrival date", "check in", "check in date", "checkin date", "stay start", "άφιξη"] },
      { key: "overall", label: "overall score", required: true, content: "number", synonyms: ["overall", "overall score", "overall rating", "overall satisfaction", "overall experience", "rating", "score", "total", "total score", "satisfaction", "general", "γενική", "γενική βαθμολογία", "συνολική", "συνολικά"] },
      { key: "topic_scores", label: "per-topic scores", required: true, content: "number", multi: true, synonyms: ["room", "rooms", "cleanliness", "clean", "bathroom", "food", "food beverage", "food and beverage", "f b", "fb", "restaurant", "restaurants", "breakfast", "dinner", "bar", "staff", "service", "friendliness", "reception", "check in", "pool", "beach", "pool beach", "spa", "wellness", "gym", "value", "value for money", "maintenance", "comfort", "bed", "noise", "wifi", "internet", "location", "facilities", "entertainment", "kids club", "housekeeping", "καθαριότητα", "δωμάτιο", "φαγητό", "προσωπικό", "πισίνα", "αξία"] },
      { key: "comment", label: "free-text comments", required: true, content: "text", multi: true, synonyms: ["comment", "comments", "free text", "free text comment", "feedback", "remarks", "verbatim", "open text", "open comment", "suggestions", "what could we improve", "what did you like", "additional comments", "text", "review", "σχόλια", "σχόλιο", "παρατηρήσεις"] },
      { key: "language", label: "language of response", required: false, content: "text", synonyms: ["language", "lang", "locale", "γλώσσα"] },
      { key: "market", label: "market / tour operator", required: false, content: "text", synonyms: ["market", "tour operator", "operator", "segment", "market segment", "channel", "source", "agency", "αγορά", "tour operator"] },
      { key: "room_type", label: "room type", required: false, content: "text", synonyms: ["room type", "room category", "τύπος δωματίου"] },
      { key: "building", label: "building", required: false, content: "text", synonyms: ["building", "wing", "block", "κτίριο"] },
      { key: "nps", label: "NPS", required: false, content: "number", synonyms: ["nps", "net promoter", "net promoter score", "likely to recommend", "recommend score"] },
      { key: "would_recommend", label: "would recommend", required: false, content: "text", synonyms: ["would recommend", "recommend", "recommendation", "would you recommend", "θα συνιστούσατε"] },
    ],
  },
  {
    key: "reviews",
    label: "Online reviews",
    priority: "should",
    nameHints: /reviews?|tripadvisor|booking|google|holidaycheck|reputation|κριτικ/i,
    coreFields: ["text", "rating"],
    keyFields: ["id", "platform", "review_date", "rating"],
    minKeys: 2,
    dateFields: ["review_date"],
    textFields: ["text", "title"],
    fields: [
      { key: "id", label: "review id", required: true, content: "id", synonyms: ["review id", "review no", "id", "review", "κωδικός"] },
      { key: "platform", label: "platform", required: true, content: "text", synonyms: ["platform", "source", "site", "channel", "portal", "ota", "provider", "origin", "website", "πλατφόρμα", "πηγή"] },
      { key: "review_date", label: "review date", required: true, content: "date", multi: true, synonyms: ["review date", "date", "published", "published at", "published on", "publish date", "posted", "posted at", "posted on", "created", "created at", "submitted", "timestamp", "review time", "ημερομηνία"] },
      { key: "stay_dates", label: "stay dates", required: true, content: "date", multi: true, synonyms: ["stay dates", "date of stay", "stay date", "stayed", "stayed in", "stay month", "month of stay", "travel date", "date of visit", "visit date", "visited", "checkout", "check out", "arrival", "departure", "stay period", "period", "ημερομηνία διαμονής", "διαμονή"] },
      { key: "rating", label: "overall rating", required: true, content: "number", multi: true, synonyms: ["rating", "overall rating", "score", "overall score", "stars", "star rating", "overall", "rate", "review score", "βαθμολογία"] },
      { key: "sub_ratings", label: "sub-ratings", required: false, content: "number", multi: true, synonyms: ["cleanliness", "staff", "location", "facilities", "comfort", "value", "value for money", "wifi", "free wifi", "food", "service", "rooms", "sleep quality", "sleep"] },
      { key: "text", label: "review text", required: true, content: "text", multi: true, synonyms: ["text", "review text", "review", "content", "body", "comment", "comments", "positive", "negative", "pros", "cons", "liked", "disliked", "the good", "the bad", "description", "κείμενο", "σχόλιο"] },
      { key: "title", label: "title", required: false, content: "text", synonyms: ["title", "headline", "summary", "subject", "τίτλος"] },
      { key: "language", label: "language", required: true, content: "text", synonyms: ["language", "lang", "locale", "γλώσσα"] },
      { key: "management_response", label: "management response", required: false, content: "text", synonyms: ["management response", "management reply", "owner reply", "owner response", "reply", "response", "answer", "hotel response", "hotel reply", "manager response", "απάντηση"] },
      { key: "traveller_type", label: "traveller type", required: false, content: "text", synonyms: ["traveller type", "traveler type", "trip type", "travel type", "guest type", "party", "party type", "composition", "travel party", "τύπος ταξιδιού"] },
      { key: "room_type", label: "room type or building", required: false, content: "text", synonyms: ["room type", "room type stayed", "room category", "room", "building", "wing", "τύπος δωματίου"] },
      { key: "nights", label: "nights", required: false, content: "number", synonyms: ["nights", "length of stay", "stay length", "νύχτες", "διανυκτερεύσεις"] },
    ],
  },
  {
    key: "stays",
    label: "PMS stay metadata",
    priority: "must",
    nameHints: /\bstays?\b|reservations?|bookings?|\bpms\b|in[_ -]?house|arrivals|guest[_ -]?list|κρατήσ|διαμον/i,
    coreFields: ["arrival", "departure"],
    keyFields: ["stay_key", "arrival", "departure"],
    minKeys: 2,
    dateFields: ["arrival", "departure"],
    textFields: [],
    fields: [
      { key: "stay_key", label: "stay surrogate key", required: true, content: "id", synonyms: STAY_KEY },
      { key: "room", label: "room number", required: true, content: "room", synonyms: ROOM },
      { key: "arrival", label: "arrival date", required: true, content: "date", synonyms: ["arrival", "arrival date", "date of arrival", "arr", "arr date", "check in", "check in date", "checkin", "checkin date", "in", "from", "start", "start date", "άφιξη", "ημερομηνία άφιξης", "anreise", "arrivée", "arrivo"] },
      { key: "departure", label: "departure date", required: true, content: "date", synonyms: ["departure", "departure date", "date of departure", "dep", "dep date", "check out", "check out date", "checkout", "checkout date", "out", "to", "end", "end date", "αναχώρηση", "ημερομηνία αναχώρησης", "abreise", "départ", "partenza"] },
      { key: "adults", label: "adults", required: true, content: "number", synonyms: ["adults", "adult", "ad", "pax adults", "no of adults", "ενήλικες", "erwachsene", "adultes", "adulti"] },
      { key: "children", label: "children", required: true, content: "number", synonyms: ["children", "child", "kids", "chd", "ch", "no of children", "παιδιά", "kinder", "enfants", "bambini"] },
      { key: "nationality", label: "nationality (ISO country)", required: true, content: "text", synonyms: ["nationality", "country", "country code", "iso country", "iso", "nation", "guest country", "market country", "εθνικότητα", "χώρα", "υπηκοότητα"] },
      { key: "segment", label: "market segment / channel", required: true, content: "text", synonyms: ["market segment", "segment", "market", "channel", "booking channel", "distribution channel", "source", "source of business", "business source", "agency", "tour operator", "operator", "τμήμα αγοράς", "κανάλι", "πηγή κράτησης"] },
      { key: "room_type", label: "room type code", required: false, content: "text", synonyms: ["room type", "room category", "rate category", "type", "room class", "τύπος δωματίου"] },
      { key: "nights", label: "nights", required: false, content: "number", synonyms: ["nights", "los", "length of stay", "room nights", "νύχτες", "διανυκτερεύσεις"] },
      { key: "board", label: "board basis", required: false, content: "text", synonyms: ["board", "board basis", "meal plan", "meals", "διατροφή"] },
      { key: "rate_code", label: "rate code family", required: false, content: "text", synonyms: ["rate code", "rate", "rate plan", "tariff", "τιμοκατάλογος"] },
      { key: "booked_on", label: "booking date / lead time", required: false, content: "date", synonyms: ["booked on", "booking date", "reservation date", "created", "created on", "lead time", "ημερομηνία κράτησης"] },
      { key: "repeat_guest", label: "repeat-guest flag", required: false, content: "flag", synonyms: ["repeat", "repeat guest", "returning", "returning guest", "vip", "επαναλαμβανόμενος"] },
      { key: "room_moves", label: "room moves", required: false, content: "text", synonyms: ["room move", "room moves", "moved from", "moved to", "previous room", "μετακίνηση"] },
    ],
  },
  {
    key: "occupancy",
    label: "Occupancy by day",
    priority: "must",
    nameHints: /occupancy|\bocc\b|daily|flash|manager.?s?[_ -]?report|πληρότ/i,
    coreFields: ["rooms_occupied", "rooms_available"],
    keyFields: ["date", "rooms_occupied", "rooms_available"],
    minKeys: 2,
    dateFields: ["date"],
    textFields: [],
    fields: [
      { key: "date", label: "date", required: true, content: "date", synonyms: ["date", "day", "business date", "ημερομηνία", "ημέρα"] },
      { key: "rooms_available", label: "rooms available", required: true, content: "number", synonyms: ["rooms available", "available", "available rooms", "inventory", "total rooms", "rooms in inventory", "capacity", "rooms total", "διαθέσιμα", "διαθέσιμα δωμάτια"] },
      { key: "rooms_occupied", label: "rooms occupied", required: true, content: "number", synonyms: ["rooms occupied", "occupied", "occupied rooms", "rooms sold", "sold", "sold rooms", "room nights", "rooms", "κατειλημμένα", "κατειλημμένα δωμάτια"] },
      { key: "arrivals", label: "arrivals", required: true, content: "number", synonyms: ["arrivals", "arr", "check ins", "checkins", "αφίξεις"] },
      { key: "departures", label: "departures", required: true, content: "number", synonyms: ["departures", "dep", "check outs", "checkouts", "αναχωρήσεις"] },
      { key: "guests_in_house", label: "guests in house", required: true, content: "number", synonyms: ["guests in house", "in house", "guests", "pax", "persons", "people", "adults children", "άτομα", "διαμένοντες"] },
      { key: "building", label: "by building / room type", required: false, content: "text", synonyms: ["building", "block", "wing", "room type", "κτίριο", "πτέρυγα"] },
      { key: "occupancy_pct", label: "occupancy %", required: false, content: "number", synonyms: ["occupancy", "occupancy pct", "occupancy percent", "occ", "occ pct", "pct", "πληρότητα"] },
      { key: "out_of_order", label: "out-of-order rooms", required: false, content: "number", synonyms: ["out of order", "ooo", "ooo rooms", "out of service", "oos", "blocked", "εκτός λειτουργίας"] },
    ],
  },
  {
    key: "rooms",
    label: "Room list",
    priority: "must",
    nameHints: /rooms?|room[_ -]?(list|matrix|table)|units?|δωμάτι/i,
    coreFields: ["room_code"],
    keyFields: ["room_code", "building", "floor"],
    minKeys: 2,
    dateFields: [],
    textFields: [],
    fields: [
      { key: "room_code", label: "room number", required: true, content: "room", synonyms: ["room code", "room", "room no", "room number", "room nr", "number", "code", "unit", "δωμάτιο", "αριθμός", "κωδικός"] },
      { key: "building", label: "building / block / villa name", required: true, content: "text", synonyms: ["building", "building code", "block", "wing", "villa", "bldg", "complex", "κτίριο", "πτέρυγα", "συγκρότημα"] },
      { key: "building_name", label: "building name", required: false, content: "text", synonyms: ["building name", "wing name", "block name", "όνομα κτιρίου"] },
      { key: "floor", label: "floor", required: true, content: "text", synonyms: ["floor", "level", "storey", "όροφος"] },
      { key: "room_type", label: "room type", required: true, content: "text", synonyms: ["room type", "type", "category", "room category", "τύπος", "τύπος δωματίου"] },
      { key: "view", label: "view / orientation", required: true, content: "text", synonyms: ["view", "orientation", "aspect", "exposure", "side", "θέα", "προσανατολισμός"] },
      { key: "is_villa", label: "bungalow or main building", required: false, content: "flag", synonyms: ["is villa", "villa", "bungalow", "standalone", "detached", "main building"] },
      { key: "refurbished", label: "last refurbished year", required: false, content: "number", synonyms: ["refurbished", "renovated", "last refurbished", "last renovation", "renovation year", "year refurbished", "ανακαίνιση"] },
    ],
  },
  {
    key: "facilities",
    label: "Public areas and outlets",
    priority: "must",
    nameHints: /facilit|outlets?|areas?|public|venues?|εγκαταστάσ|χώροι/i,
    coreFields: ["name"],
    keyFields: ["code", "name", "type"],
    minKeys: 2,
    dateFields: [],
    textFields: [],
    fields: [
      { key: "code", label: "code", required: true, content: "id", synonyms: ["facility code", "code", "id", "facility id", "area code", "κωδικός"] },
      { key: "name", label: "name", required: true, content: "text", synonyms: ["name", "facility", "facility name", "area name", "outlet", "outlet name", "ονομασία", "όνομα"] },
      { key: "type", label: "type", required: true, content: "text", synonyms: ["type", "kind", "category", "facility type", "τύπος", "είδος"] },
      { key: "area", label: "building / area", required: true, content: "text", synonyms: ["building", "area", "location", "zone", "where", "κτίριο", "περιοχή", "τοποθεσία"] },
      { key: "notes", label: "notes", required: false, content: "text", synonyms: ["notes", "note", "remarks", "description", "comment", "σημειώσεις", "περιγραφή"] },
    ],
  },
  {
    key: "equipment",
    label: "Asset list and dependency map",
    priority: "must",
    nameHints: /equipment|assets?|plant|\bbms\b|machinery|εξοπλισμ|μηχανήμ/i,
    coreFields: ["name", "id"],
    keyFields: ["id", "name", "type"],
    minKeys: 2,
    dateFields: [],
    textFields: [],
    fields: [
      { key: "id", label: "asset id", required: true, content: "id", synonyms: ["equipment id", "asset id", "asset", "asset no", "asset tag", "tag", "id", "code", "equipment no", "κωδικός", "κωδικός παγίου"] },
      { key: "name", label: "asset name", required: true, content: "text", synonyms: ["name", "asset name", "equipment name", "description", "equipment", "designation", "ονομασία", "περιγραφή"] },
      { key: "type", label: "type", required: true, content: "text", synonyms: ["type", "asset type", "equipment type", "category", "class", "kind", "τύπος", "κατηγορία"] },
      { key: "building", label: "building", required: false, content: "text", synonyms: ["building", "block", "wing", "bldg", "κτίριο"] },
      { key: "location", label: "location", required: false, content: "text", synonyms: ["location", "room", "plant room", "position", "where", "installed in", "τοποθεσία", "θέση"] },
      { key: "serves", label: "serves (dependency map)", required: false, content: "text", synonyms: ["serves", "feeds", "supplies", "serving", "services", "dependency", "dependent rooms", "dependents", "coverage", "zones served", "rooms served", "areas served", "εξυπηρετεί", "τροφοδοτεί"] },
      { key: "make", label: "make / model", required: false, content: "text", synonyms: ["make", "model", "make model", "manufacturer", "brand", "κατασκευαστής", "μοντέλο"] },
      { key: "installed_year", label: "install year / last service", required: false, content: "text", synonyms: ["installed", "installed year", "install year", "installation year", "year", "commissioned", "installation date", "last service", "last major service", "service date", "έτος εγκατάστασης", "εγκατάσταση"] },
    ],
  },
];

export const DATASET_BY_KEY: Record<string, DatasetSpec> = Object.fromEntries(DATASETS.map((d) => [d.key, d]));

export const DATASET_LABELS: Record<DatasetKey, string> = {
  ...Object.fromEntries(DATASETS.map((d) => [d.key, d.label])),
  sops: "SOPs and checklists",
  unknown: "Not recognised",
} as Record<DatasetKey, string>;

/** How a status value should be read, whatever the spelling. */
export type StatusMeaning = "closed" | "open" | "in_progress" | "waiting" | "cancelled" | "unknown";

const STATUS_RULES: [RegExp, StatusMeaning][] = [
  [/^(closed?|completed?|complete|done|finished|resolved|fixed|ok|solved|κλειστ\w*|ολοκληρ\w*|έγινε|επιλύθηκε|τελείωσε|abgeschlossen|erledigt|terminé|completato|chiuso)\b/iu, "closed"],
  [/\b(cancel+ed|canceled|rejected|void|duplicate|invalid|withdrawn|ακυρ\w*|άκυρ\w*|απορρίφθηκε)\b/iu, "cancelled"],
  [/\b(wait\w*|on hold|hold|parts?|pending|blocked|quote|ordered|awaiting|αναμον\w*|σε αναμονή|ανταλλακτικ\w*)\b/iu, "waiting"],
  [/\b(in progress|progress|assigned|working|started|scheduled|accepted|wip|σε εξέλιξη|ανατέθηκε)\b/iu, "in_progress"],
  [/^(open|new|reported|created|logged|submitted|unassigned|ανοιχτ\w*|νέ[οα]|νέ[οα]ς?)\b/iu, "open"],
];

export function statusMeaning(value: string): StatusMeaning {
  const v = value.trim().toLowerCase();
  if (!v) return "unknown";
  for (const [re, meaning] of STATUS_RULES) if (re.test(v)) return meaning;
  return "unknown";
}

/**
 * A closure note that says nothing. The go/no-go definition: "empty, 'done',
 * 'OK', 'fixed', 'έγινε', 'closed', a name only, or a copy of the request".
 */
const PLACEHOLDER = /^(?:done|ok|okay|oké|fixed|closed|completed|complete|resolved|solved|finished|checked|checked ok|all ok|n\/?a|none|yes|no|see above|as above|-+|\.+|έγινε|εγινε|οκ|εντάξει|ενταξει|τακτοποιήθηκε|ολοκληρώθηκε|τέλος|egine|ok egine|entaxei|taktopoiithike|erledigt|fertig|fait|fatto|ok done|done ok|resolved ok|closed ok)[.!\s]*$/iu;

export function isUsableClosureNote(note: string, description: string | null | undefined): boolean {
  const n = note.trim();
  if (!n) return false;
  if (PLACEHOLDER.test(n)) return false;
  const letters = n.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 4) return false;
  if (description && n.toLowerCase() === description.trim().toLowerCase()) return false;
  return true;
}

/** A closure note that names what was replaced or found: the "cause or part stated" level of the scorecard. */
const PART_OR_CAUSE = /\b(replac\w*|new|install\w*|fitted|changed?|swap\w*|regas\w*|topped up|top up|refill\w*|re-?gas|rewir\w*|re-?wir\w*|descal\w*|unblock\w*|cleared|clean\w*|tighten\w*|reset|rebuilt|repair\w*|soldered|sealed|bled|welded|adjust\w*|calibrat\w*|reprogram\w*|flash\w*|update\w*|valve|pump|filter|fuse|breaker|batter\w*|bulb|lamp|led|cylinder|cartridge|board|pcb|compressor|gas|thermostat|remote|belt|bearing|sensor|hose|siphon|trap|seal|gasket|motor|fan|capacitor|relay|switch|socket|element|heater|stb|set.?top|router|access point|ap|lock|hinge|roller|wheel|drain|coil|condenser|controller|cable|aerator|float|screen|mesh|mattress|kettle|hairdryer|minibar|fridge|safe|tv|αλλαγ\w*|αντικατ\w*|αντικατάσταση|καθαρ\w*|ρύθμισ\w*|επανεκκ\w*|σφίξ\w*|στερέωσ\w*|ξεβούλ\w*|γέμισμ\w*|μπαταρ\w*|λάμπ\w*|κύλινδρ\w*|φίλτρ\w*|βαλβίδ\w*|αντλί\w*|θερμοστάτ\w*|σιφόν\w*|ασφάλει\w*|ράουλ\w*|πλακέτ\w*|συμπιεστ\w*|ανεμιστήρ\w*|καλώδι\w*|στρώμα|χρηματοκιβ\w*|allag\w*|antikatast\w*|kathar\w*|rythmis\w*|epanekk\w*|sfix\w*|xevoul\w*|gemism\w*|mpatar\w*|lamp\w*|kylindr\w*|filtr\w*|valvid\w*|antli\w*|thermostat\w*|sifon\w*|asfalei\w*|raoul\w*|plaket\w*|floter)\b/iu;

export function namesPartOrCause(note: string): boolean {
  return PART_OR_CAUSE.test(note);
}

/** Vague category values: the "general" bucket the scorecard warns about. */
export const CATCH_ALL_CATEGORY = /^(other|others|general|misc|miscellaneous|various|n\/?a|none|unknown|άλλο|άλλα|γενικ\w*|διάφορα|-)$/iu;

/**
 * Headers that say a column carries a person's identity. The reality check
 * counts such columns; it never reads their values into the report.
 */
export const IDENTITY_HEADER = /\b(guest name|first name|last name|surname|full name|family name|given name|name of guest|reviewer name|reviewer|respondent name|respondent|customer name|client name|contact|e-?mail|email address|phone|telephone|mobile|cell|tel|passport|passport no|id number|id no|identity|national id|ssn|date of birth|birth date|dob|birthday|address|street|postcode|zip|loyalty|loyalty no|member no|membership|card number|credit card|iban|ip address|ip|user name|username|login|handle|profile|employee name|technician name|agent name|όνομα|επώνυμο|ονοματεπώνυμο|τηλέφωνο|κινητό|διεύθυνση|διαβατήριο|ταυτότητα|ημερομηνία γέννησης|αφμ|amka|αμκα)\b/iu;

/** Columns that are names of things, not people (asset / facility / room lists). */
export const IDENTITY_EXEMPT_DATASETS: DatasetKey[] = ["rooms", "facilities", "equipment", "occupancy"];
