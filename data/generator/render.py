"""Compose free text and messy location strings from the text banks."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .locations import Locations
from .rng import Rng
from .texts import de, el, en, fr, he, it, ru, staff
from .topics import TOPICS

LANG_MODULES = {"en": en, "de": de, "fr": fr, "it": it, "el": el, "ru": ru, "he": he}
STAFF_LANG_WEIGHTS = {"en": 0.55, "el": 0.28, "gr": 0.17}
PLATFORM_WEIGHTS = {"google": 0.40, "booking": 0.38, "tripadvisor": 0.22}

ROOM_TYPE_SHORT = {
    "Classic Garden View": "garden view room",
    "Superior Sea View": "sea view room",
    "Junior Suite": "junior suite",
    "Family Suite": "family suite",
    "Superior Pool View": "pool view room",
    "Deluxe Sea View Suite": "sea view suite",
    "Suite with Private Pool": "private pool suite",
    "Two-Bedroom Pool Villa": "two-bedroom villa",
    "Three-Bedroom Pool Villa": "three-bedroom villa",
}

# messy facility / equipment names as staff type them
FACILITY_ALIASES = {
    "POOL-MAIN": ["Main pool", "main pool", "Big pool", "Pool 1", "lagoon pool", "κεντρική πισίνα", "Main Pool area", "pool"],
    "POOL-INFINITY": ["Infinity pool", "infinity", "Adults pool", "Pool 2", "adults only pool", "infinity πισίνα"],
    "SPA": ["Spa", "SPA", "Thalassa spa", "spa - hammam", "Spa changing rooms", "spa reception", "σπα"],
    "GYM": ["Gym", "gym", "Fitness", "fitness room", "γυμναστήριο"],
    "REST-ORIZONTAS": ["Orizontas", "Main restaurant", "breakfast room", "Orizontas rest.", "main rest", "Ορίζοντας"],
    "REST-AMMOS": ["Ammos", "Beach taverna", "Ammos kitchen", "ammos", "Άμμος", "taverna"],
    "REST-ELIA": ["Elia", "Elia roof", "fine dining", "Elia restaurant", "Ελιά"],
    "BEACHBAR": ["Beach bar", "Kyma", "Kyma bar", "beach bar BOH", "beachbar", "Κύμα"],
    "LOBBY": ["Lobby", "Reception", "lobby", "main lobby"],
    "KIDS": ["Kids club", "mini club", "kids"],
    "PARKING": ["Parking", "car park", "entrance parking"],
}
EQUIPMENT_ALIASES = {
    "boiler": ["Bldg {b} boiler room", "{b} boiler", "Boiler room {b}", "{wing} boiler", "Λεβητοστάσιο {b}", "boiler {b} bldg", "plant room {b}", "{b} plant room - boiler"],
    "chiller": ["Bldg {b} chiller", "{b} roof chiller", "chiller {b}", "Ψύκτης {b}", "roof {b} - chiller", "{wing} chiller"],
    "water_pump": ["Bldg {b} pump room", "{b} booster pump", "pumps {b}", "pressure pump {b}", "Πιεστικό {b}", "{wing} pump set"],
    "elevator": ["Lift {b}", "Elevator {b}", "lift {b} bldg", "ασανσέρ {b}", "Bldg {b} lift", "{wing} lift"],
    "pool_plant": ["Main pool plant room", "pool pump room", "filtration main pool", "pool plant"],
    "heat_pump": ["Infinity pool heat pump", "heat pump pool 2", "pool heating", "αντλία θερμότητας πισίνα"],
    "refrigeration": ["Beach bar ice machine", "Kyma cold room", "beach bar fridge", "παγομηχανή beach bar"],
    "audio": ["Beach bar PA", "Kyma sound system", "beach bar speakers"],
    "split_ac": ["Elia AC units", "Elia split", "roof restaurant AC", "κλιματιστικά Elia"],
    "drainage": ["Ammos grease trap", "grease trap", "λιποσυλλέκτης Ammos"],
    "access_control": ["Lock server", "IT rack back office", "key encoder", "door locks system"],
}
ROOM_STYLES = [
    "{n}", "{n}", "{n}", "Rm {n}", "rm {n}", "Room {n}", "room {n}", "#{n}", "{n} ", " {n}", "Rm. {n}", "R{n}",
    "{n} bathroom", "{n} - bath", "{n} balcony", "{b}{n}", "{b}-{n}", "{b} {n}", "{n} ({wing})", "Δωμ. {n}", "δωμ {n}", "dwm {n}",
]
VILLA_STYLES = ["Villa {n}", "villa {n}", "V{n:02d}", "V{n}", "VILLA {n}", "Villa{n}", "V-{n:02d}", "vila {n}", "Βίλα {n}", "villa {n} terrace", "Villa {n} bathroom", "Villa {n:02d}"]


@dataclass
class Review:
    platform: str
    title: str
    text: str
    positive: str
    negative: str
    rating5: int
    rating10: float
    language: str


class Renderer:
    def __init__(self, loc: Locations, rng: Rng):
        self.loc = loc
        self.rng = rng

    # -- helpers ------------------------------------------------------------
    def _mod(self, lang: str):
        return LANG_MODULES.get(lang, en)

    def guest_sentence(self, topic: str, lang: str) -> tuple[str, str]:
        """A complaint sentence in ``lang``; falls back to English and says which was used."""
        mod = self._mod(lang)
        bank = mod.GUEST.get(topic)
        if not bank:
            mod, lang = en, "en"
            bank = en.GUEST[topic]
        return self.rng.choice(bank), lang

    def fill(self, text: str, room: str | None = None) -> str:
        wing, rtype = "", ""
        if room and room in self.loc.room_by_code:
            rm = self.loc.room_by_code[room]
            wing = self.loc.wing_name(rm.building)
            rtype = ROOM_TYPE_SHORT.get(rm.room_type, rm.room_type)
        return text.replace("{wing}", wing).replace("{roomtype}", rtype)

    # -- messy location text -------------------------------------------------
    def location_text(self, code: str, *, style: str | None = None) -> str:
        """What a technician or agent typed for a location."""
        r = self.rng
        if code in self.loc.room_by_code:
            rm = self.loc.room_by_code[code]
            if rm.is_villa:
                s = style or r.choice(VILLA_STYLES)
                return s.format(n=rm.number)
            s = style or r.choice(ROOM_STYLES)
            return s.format(n=rm.code, b=rm.building, wing=self.loc.wing_name(rm.building))
        if code in self.loc.facility_by_code:
            return r.choice(FACILITY_ALIASES.get(code, [self.loc.facility_by_code[code].name]))
        if code in self.loc.equipment_by_id:
            eq = self.loc.equipment_by_id[code]
            aliases = EQUIPMENT_ALIASES.get(eq.type, [eq.location_text])
            if eq.type == "elevator" and eq.id.endswith("-2"):
                aliases = ["Lift {b}2", "Elevator {b} garden side", "lift 2 bldg {b}", "{wing} lift 2"]
            elif eq.type == "elevator" and eq.building == "A":
                aliases = ["Lift {b}1", "Elevator {b} lobby", "lift 1 bldg {b}", "{wing} lift 1", "ασανσέρ λόμπι"]
            if r.chance(0.25):
                return eq.location_text
            return r.choice(aliases).format(b=eq.building or "", wing=self.loc.wing_name(eq.building) if eq.building else "")
        return code

    def fd_room_cell(self, code: str | None):
        """Room column of the front-desk log: ints for rooms, mixed text for villas."""
        if code is None:
            return None
        if code in self.loc.room_by_code:
            rm = self.loc.room_by_code[code]
            if rm.is_villa:
                return self.rng.choice(["Villa {n}", "V{n:02d}", "villa {n}", "Villa {n:02d}", "V {n}"]).format(n=rm.number)
            if self.rng.chance(0.08):
                return f"{rm.code} "  # trailing space, text cell
            return int(rm.code)
        if code in self.loc.facility_by_code:
            return self.rng.choice(FACILITY_ALIASES[code])
        return code

    def typo(self, text: str) -> str:
        """Swap two adjacent digits in a room number (noise tickets only)."""
        digits = [i for i, ch in enumerate(text) if ch.isdigit()]
        if len(digits) < 3:
            return text
        i = self.rng.choice(digits[1:])
        j = i - 1
        if not text[j].isdigit() or text[i] == text[j]:
            return text
        chars = list(text)
        chars[i], chars[j] = chars[j], chars[i]
        return "".join(chars)

    # -- staff texts ---------------------------------------------------------
    def wo_description(self, topic: str, location: str, *, lang: str | None = None, prefix: str | None = None) -> tuple[str, str]:
        lang = lang or self.rng.weighted(STAFF_LANG_WEIGHTS)
        bank = staff.WO_DESC.get(topic, {})
        variants = bank.get(lang) or bank.get("en") or [topic.replace("_", " ")]
        if not bank.get(lang):
            lang = "en"
        text = self.rng.choice(variants)
        if "{loc}" in text:
            if self.rng.chance(0.7):
                text = text.replace("{loc}", self.location_text(location))
            else:
                text = text.replace(" {loc}", "").replace("{loc}", "")
        text = " ".join(text.split())
        if prefix:
            text = f"{prefix} {text}"
        if self.rng.chance(0.15):
            text = text.lower()
        return text, lang

    def wo_closure(self, topic: str, *, lang: str | None = None, quality: str = "specific") -> str:
        """quality: specific | trivial | empty"""
        if quality == "empty":
            return ""
        lang = lang or self.rng.weighted(STAFF_LANG_WEIGHTS)
        if quality == "trivial":
            return self.rng.choice(staff.GENERIC_CLOSE[lang])
        bank = staff.WO_CLOSE.get(topic, {})
        variants = bank.get(lang) or bank.get("en") or staff.GENERIC_CLOSE["en"]
        text = self.rng.choice(variants)
        if self.rng.chance(0.2):
            text = text.lower()
        return text

    def fd_agent_note(self, topic: str) -> str:
        core = self.rng.choice(staff.FD_CORE.get(topic, [topic.replace("_", " ")]))
        prefix = self.rng.choice(staff.FD_PREFIX)
        suffix = self.rng.choice(staff.FD_SUFFIX)
        note = f"{prefix} {core}. {suffix}".strip()
        return " ".join(note.split())

    def fd_resolution(self, topic: str, *, alt_room: str = "", override: str | None = None) -> str:
        if override is not None:
            return override
        t = TOPICS[topic]
        key = {
            "Maintenance": "maintenance", "Housekeeping": "housekeeping", "F&B": "fnb", "Front Office": "request",
            "Guest Relations": "guest_relations", "Security": "security", "IT": "it", "Spa": "spa",
        }.get(t.department, "maintenance")
        if t.is_request:
            key = "request"
        text = self.rng.choice(staff.FD_RESOLUTION[key])
        if "{alt_room}" in text:
            if not alt_room:
                text = "Resolved"
            else:
                text = text.replace("{alt_room}", alt_room)
        return text

    # -- guest texts ---------------------------------------------------------
    def fd_guest_text(self, topic: str, lang: str, *, room: str | None = None, repeat: int = 0) -> tuple[str, str]:
        text, used = self.guest_sentence(topic, lang)
        text = self.fill(text, room)
        if repeat >= 1 and used in REPEAT_SUFFIX:
            text = f"{text} {self.rng.choice(REPEAT_SUFFIX[used])}"
        return text, used

    def survey_comment(self, topic: str | None, lang: str, *, room: str | None = None, persisted: bool = False) -> tuple[str, str]:
        mod = self._mod(lang)
        if topic is None:
            if self.rng.chance(0.75):
                return self.rng.choice(mod.POSITIVE), lang
            return f"{self.rng.choice(mod.OPENERS)} {self.rng.choice(mod.MILD_NEGATIVE)}", lang
        complaint, used = self.guest_sentence(topic, lang)
        mod = self._mod(used)
        parts = []
        if self.rng.chance(0.5):
            parts.append(self.rng.choice(mod.OPENERS))
        parts.append(complaint)
        if persisted and used in PERSISTED_SUFFIX:
            parts.append(self.rng.choice(PERSISTED_SUFFIX[used]))
        if self.rng.chance(0.55):
            parts.append(self.rng.choice(mod.CLOSERS))
        return self.fill(" ".join(parts), room), used

    def review(self, topic: str | None, lang: str, *, room: str | None, severity: str = "medium", platform: str | None = None, mention_room: bool = False, mention_wing: bool = False) -> Review:
        platform = platform or self.rng.weighted(PLATFORM_WEIGHTS)
        mod = self._mod(lang)
        r = self.rng
        if topic is None:
            positive = " ".join(r.sample(mod.POSITIVE[:-1], 1) + r.sample(mod.OPENERS, 1))
            negative = r.choice(mod.MILD_NEGATIVE) if r.chance(0.35) else ""
            rating5 = r.weighted({5: 0.72, 4: 0.28}) if not negative else r.weighted({5: 0.35, 4: 0.6, 3: 0.05})
            title = r.choice(mod.TITLES_POS if rating5 == 5 else mod.TITLES_POS + mod.TITLES_MIXED)
            used = lang
        else:
            complaint, used = self.guest_sentence(topic, lang)
            mod = self._mod(used)
            positive = " ".join(r.sample(mod.OPENERS, r.randint(1, 2)))
            negative = complaint
            if r.chance(0.6):
                negative = f"{negative} {r.choice(mod.CLOSERS)}"
            rating5 = {"low": r.weighted({4: 0.7, 3: 0.3}), "medium": r.weighted({4: 0.35, 3: 0.5, 2: 0.15}), "high": r.weighted({3: 0.4, 2: 0.45, 1: 0.15})}[severity]
            title = r.choice(mod.TITLES_MIXED if rating5 >= 3 else mod.TITLES_NEG)
        wing_sentence = ""
        if mention_wing and room and room in self.loc.room_by_code and not self.loc.room_by_code[room].is_villa:
            wing_sentence = self.fill(r.choice(mod.WING_MENTION), room)
        room_sentence = ""
        if mention_room and room and room in self.loc.room_by_code:
            rm = self.loc.room_by_code[room]
            room_sentence = (mod.VILLA_MENTION if rm.is_villa else mod.ROOM_MENTION).format(num=rm.number if rm.is_villa else rm.code)
        positive = self.fill(" ".join(p for p in [wing_sentence, positive] if p), room)
        negative = self.fill(" ".join(p for p in [negative, room_sentence] if p), room)
        text = " ".join(p for p in [positive, negative] if p)
        rating10 = {5: r.choice([9.0, 9.5, 10.0]), 4: r.choice([7.5, 8.0, 8.5]), 3: r.choice([5.5, 6.0, 6.5]), 2: r.choice([3.5, 4.0, 4.5]), 1: r.choice([2.0, 2.5, 3.0])}[rating5]
        return Review(platform=platform, title=title, text=text, positive=positive, negative=negative, rating5=rating5, rating10=rating10, language=used)


REPEAT_SUFFIX = {
    "en": ["This is the second time we report it.", "Same problem as two days ago.", "Already reported, still not fixed.", "Third time now."],
    "de": ["Das ist das zweite Mal, dass wir das melden.", "Gleiches Problem wie vor zwei Tagen.", "Schon gemeldet, immer noch nicht behoben.", "Jetzt schon zum dritten Mal."],
    "fr": ["C'est la deuxième fois que nous le signalons.", "Même problème qu'il y a deux jours.", "Déjà signalé, toujours pas réparé.", "Troisième fois maintenant."],
    "it": ["È la seconda volta che lo segnaliamo.", "Stesso problema di due giorni fa.", "Già segnalato, ancora non risolto.", "Terza volta ormai."],
    "el": ["Είναι η δεύτερη φορά που το αναφέρουμε.", "Ίδιο πρόβλημα με πριν δύο μέρες.", "Το έχουμε ήδη πει, ακόμα δεν φτιάχτηκε.", "Τρίτη φορά πια."],
    "ru": ["Мы сообщаем об этом уже второй раз.", "Та же проблема, что и два дня назад.", "Уже сообщали, до сих пор не починили."],
    "he": ["זו הפעם השנייה שאנחנו מדווחים על זה.", "אותה בעיה כמו לפני יומיים.", "כבר דיווחנו, עדיין לא תוקן."],
}
PERSISTED_SUFFIX = {
    "en": ["Someone came and said it was fixed, but it was the same the next day.", "It was 'repaired' twice and never really worked.", "Maintenance came, but nothing changed for the rest of the week."],
    "de": ["Es kam jemand und meinte, es sei behoben, aber am nächsten Tag war es genauso.", "Es wurde zweimal „repariert“ und hat nie richtig funktioniert.", "Die Technik kam, aber den Rest der Woche änderte sich nichts."],
    "fr": ["Quelqu'un est venu en disant que c'était réparé, mais le lendemain c'était pareil.", "Ça a été « réparé » deux fois et ça n'a jamais vraiment marché.", "La maintenance est passée, mais rien n'a changé le reste de la semaine."],
    "it": ["È venuto qualcuno dicendo che era risolto, ma il giorno dopo era uguale.", "È stato \"riparato\" due volte e non ha mai funzionato davvero.", "La manutenzione è passata, ma per il resto della settimana non è cambiato nulla."],
    "el": ["Ήρθε κάποιος και είπε ότι φτιάχτηκε, αλλά την επόμενη μέρα τα ίδια.", "«Επισκευάστηκε» δύο φορές και δεν δούλεψε ποτέ σωστά.", "Ήρθε η συντήρηση, αλλά δεν άλλαξε τίποτα την υπόλοιπη εβδομάδα."],
    "ru": ["Приходил мастер и сказал, что починил, но на следующий день всё повторилось.", "«Чинили» дважды, и так и не заработало."],
    "he": ["מישהו בא ואמר שזה תוקן, אבל למחרת זה היה אותו דבר.", "זה 'תוקן' פעמיים ואף פעם לא באמת עבד."],
}
