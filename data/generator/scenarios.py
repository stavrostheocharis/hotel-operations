"""Planted ground truth: ~40 underlying issues, each spread over 2-8 signals."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from .config import Config
from .model import Issue, Signal, Stay
from .render import Renderer
from .rng import Rng
from .stays import World
from .topics import FD_DEPARTMENTS, TOPICS, WO_CATEGORIES

TECHS = {
    "HVAC": ["T-01", "T-02"], "Plumbing": ["T-03", "T-04"], "Electrical": ["T-05", "T-01"], "Carpentry & Furniture": ["T-06", "T-07"],
    "Housekeeping": ["HK-SUP"], "IT / TV": ["IT-01", "T-05"], "Pool & Spa": ["T-08", "EXT-POOL"], "Kitchen Equipment": ["EXT-REFRIG", "T-05"],
    "Lift": ["EXT-LIFT", "T-06"], "Grounds & Pest": ["EXT-PEST", "T-09"], "Safety": ["T-06", "T-03"], "Other": ["T-07", "T-09", "T-02"],
}
STATUS_WORDS = {
    "closed": ["Closed", "closed", "CLOSED", "Completed", "Done", "Closed"],
    "open": ["Open", "open", "New"],
    "in_progress": ["In Progress", "in progress", "Assigned", "In progress"],
    "on_hold": ["On Hold", "On hold - parts", "Waiting parts", "On hold"],
}
PRIORITY = {"low": ["Low", "low", "3"], "medium": ["Medium", "Normal", "2", "medium"], "high": ["High", "Urgent", "1", "HIGH"]}
REPORTERS = ["Front Office", "Housekeeping", "Guest", "Engineering", "F&B", "Spa", "Night audit", "GM"]
SHIFTS = ["AM", "PM", "Night", "AM", "PM"]


def _d(s: str) -> date:
    return date.fromisoformat(s)


class Builder:
    def __init__(self, cfg: Config, world: World, R: Renderer, rng: Rng):
        self.cfg, self.world, self.R, self.rng = cfg, world, R, rng
        self.loc = world.loc
        self.issues: list[Issue] = []
        self.signals: list[Signal] = []
        self.m = cfg.messiness

    # ---- generic helpers ------------------------------------------------------
    def issue(self, iid: str, scenario: str, title: str, topic: str, *, root_type: str, root_loc: str, root_desc: str, affected: list[str], recurred: bool, fix_held: bool | None, resolved: bool, status: str, severity: str | None = None, notes: str = "") -> Issue:
        t = TOPICS[topic]
        iss = Issue(issue_id=iid, scenario=scenario, title=title, category=t.category, severity=severity or t.severity, topic=topic, root_cause_type=root_type, root_cause_location=root_loc, root_cause_description=root_desc, affected_locations=affected, recurred=recurred, fix_held=fix_held, resolved_by_season_end=resolved, status_at_season_end=status, notes=notes)
        self.issues.append(iss)
        return iss

    def _add(self, issue: Issue | None, sig: Signal) -> Signal:
        sig.uid = f"S{len(self.signals) + 1:06d}"
        if issue is not None:
            sig.issue_id = issue.issue_id
            sig.role = "planted"
            issue.signals.append(sig)
        self.signals.append(sig)
        return sig

    def stay_for(self, room: str, d: date, window: int = 14) -> tuple[Stay, date]:
        s = self.world.stay_at(room, d)
        if s is None:
            s = self.world.stay_near(room, d, window=window)
        if s is None:
            raise RuntimeError(f"no stay near {room} {d}")
        d2 = min(max(d, s.check_in), s.check_out - timedelta(days=1))
        return s, d2

    def random_stay_on(self, d: date, *, building: str | None = None, floors: list[int] | None = None, exclude: set[str] = frozenset(), min_nights: int = 2) -> Stay:
        pool = [s for s in self.world.occupied_on(d, building, floors) if s.room not in exclude and s.nights >= min_nights and s.check_in < d]
        if not pool:
            pool = [s for s in self.world.occupied_on(d, building, floors) if s.room not in exclude]
        if not pool:
            raise RuntimeError(f"nobody in {building} on {d}")
        return self.rng.choice(sorted(pool, key=lambda s: s.stay_id))

    def random_stay_checkout_between(self, a: date, b: date, *, building: str | None = None, exclude: set[str] = frozenset(), needs: str = "") -> Stay:
        pool = [s for s in self.world.stays if a <= s.check_out <= b and s.nights >= 3 and s.room not in exclude and (building is None or self.loc.room_by_code[s.room].building == building)]
        if needs == "survey":
            pool = [s for s in pool if not s.has_survey]
        if needs == "review":
            pool = [s for s in pool if not s.has_review]
        return self.rng.choice(sorted(pool, key=lambda s: s.stay_id))

    def _office(self, ts: datetime) -> datetime:
        """Tickets are mostly raised during the day shift; nudge night-time stamps to the morning."""
        if 7 <= ts.hour < 22 or self.rng.chance(0.15):
            return ts
        base = ts + timedelta(days=1) if ts.hour >= 22 else ts
        return base.replace(hour=self.rng.randint(7, 9), minute=self.rng.randint(0, 59))

    def _dept(self, topic: str) -> str:
        if self.rng.chance(0.12):
            return self.rng.choice(FD_DEPARTMENTS)
        return TOPICS[topic].department

    def _wo_category(self, topic: str, override: str | None) -> str:
        if override == "wrong":
            return self.rng.choice([c for c in WO_CATEGORIES if c != TOPICS[topic].wo_category])
        if override == "other":
            return "Other"
        if override:
            return override
        x = self.rng.random()
        if x < self.m["wo_other_category_rate"]:
            return "Other"
        if x < self.m["wo_other_category_rate"] + self.m["wo_wrong_category_rate"]:
            return self.rng.choice([c for c in WO_CATEGORIES if c != TOPICS[topic].wo_category])
        return TOPICS[topic].wo_category

    # ---- signal factories -------------------------------------------------------
    def fd(self, issue: Issue | None, room: str | None, d: date, topic: str, *, location: str | None = None, repeat: int = 0, time_kind: str = "any", resolution: str | None = None, alt_room: str = "", stay: Stay | None = None, note: str = "", role: str | None = None) -> Signal:
        if stay is None and room is not None:
            stay, d = self.stay_for(room, d)
        lang = stay.language if stay else "en"
        text, used = self.R.fd_guest_text(topic, lang, room=room, repeat=repeat)
        t = TOPICS[topic]
        loc_true = location or (room if t.scope in ("room",) else (t.default_location or room))
        if t.scope == "building" and location is None and room is not None:
            loc_true = self.loc.equipment_for(self.loc.room_by_code[room].building, "elevator").id if topic == "elevator_stuck" else room
        room_cell = None if room is None else self.R.fd_room_cell(room)
        if room is not None and t.scope == "facility" and self.rng.chance(self.m["fd_missing_room_rate"]):
            room_cell = None
        sig = Signal(
            source="front_desk", topic=topic, category=t.category, location=loc_true, location_type=self.loc.location_type(loc_true),
            ts=self.rng.datetime_on(d, time_kind), language=used, text=text, stay_id=stay.stay_id if stay else None,
            location_text=str(room_cell) if room_cell is not None else "",
            extra={
                "room_cell": room_cell,
                "agent_note": self.R.fd_agent_note(topic) if self.rng.chance(self.m["fd_agent_note_rate"]) else "",
                "department": self._dept(topic),
                "resolution": "" if self.rng.chance(self.m["fd_empty_resolution_rate"]) and resolution is None else self.R.fd_resolution(topic, alt_room=alt_room, override=resolution),
                "shift": self.rng.choice(SHIFTS),
                "guest_room": room or "",
            },
            note=note,
        )
        if role:
            sig.role = role
        return self._add(issue, sig)

    def wo(self, issue: Issue | None, location: str, created: datetime, topic: str, *, closed_after: timedelta | None = None, status: str | None = None, closure: str = "auto", desc: str | None = None, lang: str | None = None, category: str | None = None, reporter: str | None = None, reopened: bool | None = None, priority: str | None = None, note: str = "", role: str | None = None, typo: bool = False) -> Signal:
        t = TOPICS[topic]
        created = self._office(created)
        if desc is None:
            desc, used = self.R.wo_description(topic, location, lang=lang)
        else:
            used = lang or "en"
        if closed_after is None:
            closed_at, st = None, (status or "open")
        else:
            closed_at, st = self._office(created + closed_after), (status or "closed")
            if closed_at <= created:
                closed_at = created + timedelta(minutes=self.rng.randint(20, 90))
        if closure == "auto":
            x = self.rng.random()
            quality = "empty" if x < self.m["wo_empty_closure_rate"] else ("trivial" if x < self.m["wo_empty_closure_rate"] + self.m["wo_trivial_closure_rate"] else "specific")
            closure_text = self.R.wo_closure(topic, lang=used if used in ("en", "el", "gr") else None, quality=quality) if closed_at else ""
        elif closure in ("empty", "trivial", "specific"):
            closure_text = self.R.wo_closure(topic, lang=used if used in ("en", "el", "gr") else None, quality=closure) if closed_at else ""
        else:
            closure_text = closure
        cat = self._wo_category(topic, category)
        loc_text = self.R.location_text(location)
        if typo:
            loc_text = self.R.typo(loc_text)
        if reopened is None:
            reopened_cell = "" if self.rng.chance(self.m["wo_missing_reopened_rate"]) else "N"
        else:
            reopened_cell = "Y" if reopened else "N"
        sig = Signal(
            source="work_order", topic=topic, category=t.category, location=location, location_type=self.loc.location_type(location),
            ts=created, language=used, text=desc, location_text=loc_text,
            extra={
                "closed_at": closed_at, "status_kind": st, "status": self.rng.choice(STATUS_WORDS[st]), "closure": closure_text,
                "category": cat, "technician": self.rng.choice(TECHS.get(t.wo_category, TECHS["Other"])),
                "reported_by": reporter or self.rng.weighted({"Front Office": 0.4, "Housekeeping": 0.3, "Guest": 0.1, "Engineering": 0.12, "F&B": 0.05, "Spa": 0.03}),
                "reopened": reopened_cell, "priority": self.rng.choice(PRIORITY[priority or t.severity]),
            },
            note=note,
        )
        if role:
            sig.role = role
        return self._add(issue, sig)

    def survey(self, issue: Issue | None, stay: Stay, topic: str | None, *, persisted: bool = False, severity: str | None = None, note: str = "", location: str | None = None, role: str | None = None) -> Signal:
        stay.has_survey = True
        text, used = self.R.survey_comment(topic, stay.language, room=stay.room, persisted=persisted)
        t = TOPICS[topic] if topic else None
        sev = severity or (t.severity if t else "low")
        scores = self._scores(t.survey_area if t else None, sev, persisted)
        loc_true = location or (stay.room if (t is None or t.scope == "room") else (t.default_location or stay.room))
        sig = Signal(
            source="survey", topic=topic or "none", category=t.category if t else "none", location=loc_true, location_type=self.loc.location_type(loc_true),
            ts=self.rng.datetime_on(stay.check_out + timedelta(days=self.rng.randint(1, 6)), "any"), language=used if text else stay.language, text=text,
            stay_id=stay.stay_id, extra={"scores": scores, "checkout": stay.check_out},
            note=note,
        )
        if role:
            sig.role = role
        return self._add(issue, sig)

    def review(self, issue: Issue | None, stay: Stay, topic: str | None, *, severity: str | None = None, platform: str | None = None, note: str = "", location: str | None = None, role: str | None = None) -> Signal:
        stay.has_review = True
        t = TOPICS[topic] if topic else None
        sev = severity or (t.severity if t else "low")
        rv = self.R.review(topic, stay.language, room=stay.room, severity=sev, platform=platform,
                           mention_room=self.rng.chance(self.m["review_room_number_rate"]), mention_wing=self.rng.chance(self.m["review_wing_mention_rate"]))
        loc_true = location or (stay.room if (t is None or t.scope == "room") else (t.default_location or stay.room))
        sig = Signal(
            source="review", topic=topic or "none", category=t.category if t else "none", location=loc_true, location_type=self.loc.location_type(loc_true),
            ts=self.rng.datetime_on(stay.check_out + timedelta(days=self.rng.randint(2, 25)), "any"), language=rv.language, text=rv.text, stay_id=stay.stay_id,
            extra={"platform": rv.platform, "title": rv.title, "positive": rv.positive, "negative": rv.negative, "rating5": rv.rating5, "rating10": rv.rating10, "checkout": stay.check_out},
            note=note,
        )
        if role:
            sig.role = role
        return self._add(issue, sig)

    def _scores(self, area: str | None, severity: str, persisted: bool) -> dict[str, int | None]:
        r = self.rng
        base = {k: int(round(min(10, max(1, r.gauss(8.7, 0.8))))) for k in ["overall", "room", "cleanliness", "bathroom", "food_beverage", "staff", "pool_beach", "spa", "value_for_money"]}
        if r.chance(0.45):
            base["spa"] = None
        if area:
            hit = {"low": 2, "medium": 3, "high": 4}[severity] + (1 if persisted else 0)
            if area in base and base[area] is not None:
                base[area] = max(1, base[area] - hit)
            base["overall"] = max(1, base["overall"] - max(1, hit - 1))
            base["value_for_money"] = max(1, base["value_for_money"] - (hit - 1))
        return base

    # ---- scenario builders -------------------------------------------------------
    def same_room_repeat(self, iid: str, room: str, topic: str, rounds: list[dict], *, title: str, root_desc: str, fix_held: bool, survey_round: int | None = None, review_round: int | None = None, persisted_survey: bool = True, status: str = "verified", notes: str = "") -> Issue:
        iss = self.issue(iid, "same_room_repeat", title, topic, root_type="room_equipment", root_loc=room, root_desc=root_desc, affected=[room], recurred=len(rounds) > 1, fix_held=fix_held, resolved=status in ("resolved", "verified"), status=status, notes=notes)
        stays = []
        for i, rd in enumerate(rounds):
            d = _d(rd["date"])
            stay, d = self.stay_for(room, d)
            stays.append(stay)
            fd = self.fd(iss, room, d, topic, repeat=rd.get("repeat", 0), stay=stay)
            created = fd.ts + self.rng.hours(0.3, 20)
            if rd.get("wo", True):
                self.wo(iss, room, created, topic, closed_after=timedelta(hours=rd.get("hours", self.rng.uniform(2, 48))) if rd.get("closed", True) else None,
                        closure=rd.get("closure", "auto"), lang=rd.get("lang"), reopened=rd.get("reopened"), category=rd.get("category"), status=rd.get("status"), reporter="Front Office")
        if survey_round is not None:
            self.survey(iss, stays[survey_round], topic, persisted=persisted_survey)
        if review_round is not None:
            self.review(iss, stays[review_round], topic)
        return iss

    def cluster(self, iid: str, *, title: str, topic: str, equipment: str, building: str | None, floors: list[int] | None, waves: list[dict], root_desc: str, fix_held: bool | None, recurred: bool, status: str = "verified", room_wo: dict | None = None, extra_review: bool = False, extra_survey: bool = False, notes: str = "", fd_location: str | None = None) -> Issue:
        affected: list[str] = []
        iss = self.issue(iid, "shared_cause_cluster", title, topic, root_type="shared_equipment", root_loc=equipment, root_desc=root_desc, affected=[], recurred=recurred, fix_held=fix_held, resolved=status in ("resolved", "verified"), status=status, notes=notes)
        used: set[str] = set()
        last_stay = None
        for w_i, w in enumerate(waves):
            start, end = _d(w["start"]), _d(w["end"])
            rooms = w.get("rooms") or []
            n = w.get("n", len(rooms))
            for k in range(n):
                d = start + timedelta(days=int(self.rng.uniform(0, max(0, (end - start).days))))
                if rooms:
                    room = rooms[k]
                    stay, d = self.stay_for(room, d)
                else:
                    stay = self.random_stay_on(d, building=building, floors=floors, exclude=used)
                    room = stay.room
                used.add(room)
                affected.append(room)
                fd = self.fd(iss, room, d, topic, stay=stay, repeat=1 if (k > 0 and self.rng.chance(0.3)) else 0, location=fd_location)
                last_stay = stay
                if room_wo and w_i == 0 and k == room_wo.get("at", 0):
                    self.wo(iss, room, fd.ts + self.rng.hours(0.5, 4), topic, closed_after=timedelta(hours=room_wo.get("hours", 30)), closure=room_wo.get("closure", "auto"), category=room_wo.get("category"), reporter="Front Office")
            if w.get("equipment_wo", True):
                eq_created = datetime.combine(end, self.rng.time_of_day("office"))
                self.wo(iss, equipment, eq_created, topic, closed_after=timedelta(hours=w.get("eq_hours", 30)) if w.get("eq_closed", True) else None, desc=w.get("eq_desc"), closure=w.get("eq_closure", "specific"), lang=w.get("eq_lang", "en"), category=w.get("eq_category", TOPICS[topic].wo_category), reporter="Engineering", status=w.get("eq_status"), priority="high", reopened=w.get("eq_reopened"))
            if w.get("survey") and last_stay is not None and not last_stay.has_survey:
                self.survey(iss, last_stay, topic, persisted=w.get("persisted", False), location=fd_location)
            if w.get("review") and last_stay is not None and not last_stay.has_review:
                self.review(iss, last_stay, topic, location=fd_location)
        iss.affected_locations = sorted(set(affected))
        return iss

    def fix_not_held(self, iid: str, room: str, topic: str, *, title: str, first: str, second: str | None, root_desc: str, first_closure: str = "trivial", second_closure: str = "specific", review: bool = False, status: str = "verified", notes: str = "") -> Issue:
        iss = self.issue(iid, "fix_not_held", title, topic, root_type="room_equipment", root_loc=room, root_desc=root_desc, affected=[room], recurred=second is not None, fix_held=False if second is None else True, resolved=status in ("resolved", "verified"), status=status, notes=notes)
        stay, d = self.stay_for(room, _d(first))
        fd = self.fd(iss, room, d, topic, stay=stay)
        self.wo(iss, room, fd.ts + self.rng.hours(0.5, 6), topic, closed_after=self.rng.hours(1, 5), closure=first_closure, reporter="Front Office")
        self.survey(iss, stay, topic, persisted=True)
        if review:
            self.review(iss, stay, topic)
        if second:
            stay2, d2 = self.stay_for(room, _d(second))
            if stay2.stay_id == stay.stay_id:
                stay2, d2 = self.stay_for(room, _d(second) + timedelta(days=7))
            fd2 = self.fd(iss, room, d2, topic, stay=stay2)
            self.wo(iss, room, fd2.ts + self.rng.hours(0.5, 8), topic, closed_after=self.rng.hours(3, 40), closure=second_closure, reopened=True if self.rng.chance(0.6) else None, reporter="Front Office")
        return iss

    def long_unresolved(self, iid: str, location: str, topic: str, *, title: str, opened: str, closed: str | None, status_kind: str, fd_dates: list[str], fd_rooms: list[str] | None = None, building: str | None = None, floors: list[int] | None = None, reviews: int = 0, surveys: int = 0, root_desc: str, fix_held: bool | None, closure: str = "specific", desc: str | None = None, category: str | None = None, second_wo: dict | None = None, notes: str = "", root_type: str = "room_equipment", fd_location: str | None = None) -> Issue:
        resolved = closed is not None
        iss = self.issue(iid, "long_unresolved", title, topic, root_type=root_type, root_loc=location, root_desc=root_desc, affected=[location], recurred=True, fix_held=fix_held, resolved=resolved, status="resolved" if resolved else "open", notes=notes)
        created = datetime.combine(_d(opened), self.rng.time_of_day("office"))
        closed_after = (datetime.combine(_d(closed), self.rng.time_of_day("office")) - created) if closed else None
        self.wo(iss, location, created, topic, closed_after=closed_after, status=status_kind if not closed else "closed", closure=closure if closed else "", desc=desc, category=category, reporter="Front Office", lang="en" if desc else None)
        if second_wo:
            c2 = datetime.combine(_d(second_wo["date"]), self.rng.time_of_day("office"))
            self.wo(iss, location, c2, topic, closed_after=timedelta(hours=second_wo.get("hours", 30)) if second_wo.get("closed", True) else None, closure=second_wo.get("closure", "specific"), reopened=second_wo.get("reopened"), status=second_wo.get("status"), reporter="Engineering", lang="en")
        guests: list[Stay] = []
        used: set[str] = set()
        for i, ds in enumerate(fd_dates):
            d = _d(ds)
            if fd_rooms:
                room = fd_rooms[i]
                stay, d = self.stay_for(room, d)
            elif location in self.loc.room_by_code:
                room = location
                stay, d = self.stay_for(room, d)
            else:
                stay = self.random_stay_on(d, building=building, floors=floors, exclude=used)
                room = stay.room
            used.add(room)
            self.fd(iss, room, d, topic, stay=stay, repeat=1 if i > 0 and location in self.loc.room_by_code else 0, location=fd_location or (location if location not in self.loc.room_by_code and TOPICS[topic].scope != "room" else None))
            guests.append(stay)
        for s in guests[:reviews]:
            if not s.has_review:
                self.review(iss, s, topic, location=fd_location or (location if TOPICS[topic].scope != "room" else None))
        for s in guests[-surveys:] if surveys else []:
            if not s.has_survey:
                self.survey(iss, s, topic, persisted=True, location=fd_location or (location if TOPICS[topic].scope != "room" else None))
        return iss

    def ops_recurring(self, iid: str, facility: str, topic: str, *, title: str, start: str, end: str, n_fd: int, n_surveys: int, n_reviews: int, building: str | None = None, root_desc: str, fix_held: bool | None, fix_note: str | None = None, affected_building_code: str | None = None, notes: str = "") -> Issue:
        iss = self.issue(iid, "ops_recurring", title, topic, root_type="process", root_loc=facility, root_desc=root_desc, affected=[facility], recurred=True, fix_held=fix_held, resolved=fix_held is True, status="resolved" if fix_held else "open", notes=notes)
        a, b = _d(start), _d(end)
        used: set[str] = set()
        for i in range(n_fd):
            d = self.rng.date_between(a, b)
            stay = self.random_stay_on(d, building=building, exclude=used)
            used.add(stay.room)
            self.fd(iss, stay.room, d, topic, stay=stay, location=facility, resolution=fix_note if (fix_note and i == n_fd - 1) else None)
        for _ in range(n_surveys):
            stay = self.random_stay_checkout_between(a, b + timedelta(days=4), building=building, exclude=used, needs="survey")
            used.add(stay.room)
            self.survey(iss, stay, topic, location=facility)
        for _ in range(n_reviews):
            stay = self.random_stay_checkout_between(a, b + timedelta(days=4), building=building, exclude=used, needs="review")
            used.add(stay.room)
            self.review(iss, stay, topic, location=facility)
        return iss

    def cross_room_leak(self, iid: str, lower: str, upper: str, *, title: str, first: str, second: str | None, root_desc: str, survey: bool = True, notes: str = "") -> Issue:
        iss = self.issue(iid, "cross_room_leak", title, "ceiling_leak", root_type="structure", root_loc=upper, root_desc=root_desc, affected=[lower, upper], recurred=second is not None, fix_held=True, resolved=True, status="verified", notes=notes)
        stay, d = self.stay_for(lower, _d(first))
        fd = self.fd(iss, lower, d, "ceiling_leak", stay=stay)
        upper_txt = self.R.location_text(upper, style="{n}")
        self.wo(iss, lower, fd.ts + self.rng.hours(0.5, 4), "ceiling_leak", closed_after=timedelta(hours=self.rng.uniform(20, 50)), closure=f"Leak from {upper_txt} shower, see separate ticket. Ceiling to dry then paint", category="other", reporter="Front Office", lang="en")
        self.wo(iss, upper, fd.ts + self.rng.hours(5, 26), "ceiling_leak", closed_after=timedelta(hours=self.rng.uniform(2, 8)), desc=f"Reseal shower tray {upper_txt} - leaking into {self.R.location_text(lower, style='{n}')} below", closure=self.rng.choice(["Resealed shower tray silicone", "Silicone redone around tray, tested ok", "Σιλικόνη ντουζιέρας, ΟΚ"]), category="Plumbing", reporter="Engineering", lang="en")
        if survey:
            self.survey(iss, stay, "ceiling_leak", persisted=False)
        if second:
            stay2, d2 = self.stay_for(lower, _d(second))
            fd2 = self.fd(iss, lower, d2, "ceiling_leak", stay=stay2, repeat=0)
            self.wo(iss, upper, fd2.ts + self.rng.hours(2, 20), "ceiling_leak", closed_after=timedelta(hours=self.rng.uniform(24, 72)), desc=f"Leak into {self.R.location_text(lower, style='{n}')} again - shower waste {upper_txt} cracked", closure="Replaced shower waste and trap, retiled 2 tiles, painted ceiling below", category="Plumbing", reporter="Engineering", reopened=True, lang="en")
            iss.notes = (iss.notes + " First repair (silicone) did not hold; root cause was a cracked shower waste found on the second visit.").strip()
        return iss

    def equipment_repeat(self, iid: str, equipment: str, topic: str, *, title: str, events: list[dict], building: str | None, root_desc: str, fix_held: bool | None, fd_at: list[int], review_at: int | None = None, survey_at: int | None = None, status: str = "verified", notes: str = "", location_for_guests: str | None = None) -> Issue:
        iss = self.issue(iid, "equipment_repeat", title, topic, root_type="shared_equipment", root_loc=equipment, root_desc=root_desc, affected=[equipment], recurred=len(events) > 1, fix_held=fix_held, resolved=status in ("resolved", "verified"), status=status, notes=notes)
        guest_loc = location_for_guests or (equipment if TOPICS[topic].scope != "facility" else TOPICS[topic].default_location)
        stays: list[Stay] = []
        used: set[str] = set()
        for i, ev in enumerate(events):
            d = _d(ev["date"])
            if i in fd_at:
                stay = self.random_stay_on(d, building=building, exclude=used)
                used.add(stay.room)
                stays.append(stay)
                self.fd(iss, stay.room, d, topic, stay=stay, location=guest_loc, time_kind=ev.get("time_kind", "any"))
            created = datetime.combine(d, self.rng.time_of_day(ev.get("time_kind", "office"))) + timedelta(hours=ev.get("delay_h", 1))
            self.wo(iss, equipment, created, topic, closed_after=timedelta(hours=ev.get("hours", 24)) if ev.get("closed", True) else None, closure=ev.get("closure", "specific"), desc=ev.get("desc"), lang=ev.get("lang"), reopened=ev.get("reopened"), status=ev.get("status"), category=ev.get("category"), reporter=ev.get("reporter"))
        if review_at is not None and stays:
            s = stays[min(review_at, len(stays) - 1)]
            if not s.has_review:
                self.review(iss, s, topic, location=guest_loc)
        if survey_at is not None and stays:
            s = stays[min(survey_at, len(stays) - 1)]
            if not s.has_survey:
                self.survey(iss, s, topic, location=guest_loc)
        return iss

    # ---- distractors (hard negatives) ------------------------------------------
    def distractor_fd(self, issue: Issue, d: date, *, building: str | None, topic: str | None = None, note: str = "") -> Signal:
        topic = topic or issue.topic
        stay = self.random_stay_on(d, building=building)
        sig = self.fd(None, stay.room, d, topic, stay=stay, note=note or f"Same topic as {issue.issue_id} in the same week, different building: unrelated one-off.")
        sig.role, sig.distractor_for = "distractor", issue.issue_id
        return sig

    def distractor_wo(self, issue: Issue, d: date, room: str, *, topic: str | None = None, note: str = "") -> Signal:
        topic = topic or issue.topic
        sig = self.wo(None, room, datetime.combine(d, self.rng.time_of_day("office")), topic, closed_after=self.rng.hours(1, 30), note=note or f"Same topic as {issue.issue_id}, close in time, different location: unrelated one-off.")
        sig.role, sig.distractor_for = "distractor", issue.issue_id
        return sig


# ------------------------------------------------------------------------------
# The catalogue
# ------------------------------------------------------------------------------

def plant_all(cfg: Config, world: World, R: Renderer, rng: Rng) -> Builder:
    B = Builder(cfg, world, R, rng.spawn("scenarios"))
    r = B.rng

    # -- Villas -----------------------------------------------------------------
    B.same_room_repeat("ISS-01", "V12", "ac_not_cooling", title="Villa 12 AC fails three times across the summer",
        rounds=[{"date": "2026-06-14", "closure": "Cleaned filters, topped up gas, tested ok 17C", "hours": 5},
                {"date": "2026-07-09", "closure": "reset, doulevei", "hours": 2, "repeat": 0},
                {"date": "2026-08-03", "closure": "Replaced compressor outdoor unit (leak on discharge line)", "hours": 46, "reopened": True, "repeat": 0}],
        root_desc="Refrigerant leak on the villa's split unit; two cosmetic fixes (filters, regas) before the compressor was replaced", fix_held=True,
        survey_round=1, review_round=1, notes="Three different guests, three languages. The final fix (compressor) held: no complaints after 3 Aug.")
    B.same_room_repeat("ISS-02", "V05", "jacuzzi_broken", title="Villa 5 jacuzzi pump keeps failing",
        rounds=[{"date": "2026-07-20", "closure": "Pump reset, jets ok", "hours": 3},
                {"date": "2026-08-24", "closure": "Replaced jet pump", "hours": 28},
                {"date": "2026-09-15", "wo": False}],
        root_desc="Jet pump motor overheating; replacement pump of the same (underpowered) model also failed", fix_held=False, review_round=1, status="reopened",
        notes="Third complaint in September has no work order: front desk only noted 'pump on order'.")
    B.same_room_repeat("ISS-03", "V07", "no_hot_water", title="Villa 7 water heater: three visits before the element was replaced",
        rounds=[{"date": "2026-05-12", "closure": "Boiler was off - restarted", "hours": 1.5},
                {"date": "2026-06-02", "closure": "Thermostatic cartridge replaced", "hours": 6},
                {"date": "2026-06-20", "closure": "Replaced villa water heater element + thermostat", "hours": 30, "reopened": True}],
        root_desc="Scaled heating element in the villa's own 200L water heater", fix_held=True, survey_round=1)
    B.fix_not_held("ISS-04", "V18", "mosquitoes", title="Villa 18 mosquitoes: spraying did not help, screens did",
        first="2026-08-11", second="2026-08-26", first_closure="Sprayed room and terrace", second_closure="Screens fitted on both bedroom doors, drained planter saucers",
        root_desc="Standing water in terrace planters next to the bedroom doors", review=True)
    B.long_unresolved("ISS-05", "V02", "wifi_weak", title="Villa 2 Wi-Fi dead zone open for four months",
        opened="2026-05-18", closed="2026-09-05", status_kind="on_hold", fd_dates=["2026-05-17", "2026-06-28", "2026-08-14"], reviews=2,
        desc="Wifi very weak Villa 2, guest cannot work. AP in villa 1 does not reach. New outdoor AP ordered", closure="Outdoor access point installed on villa 2 pergola, signal -55dBm", category="Other",
        root_desc="No access point covering villa 2; order stuck in procurement", fix_held=True)

    # -- Main Building (A) ----------------------------------------------------------
    B.cluster("ISS-06", title="Main Building chiller trips in the late-July heatwave", topic="ac_not_cooling", equipment="A-CHILLER", building="A", floors=[2, 3],
        waves=[{"start": "2026-07-27", "end": "2026-07-29", "n": 5, "eq_desc": "AC complaints all over Bldg A floors 2-3 since yesterday. Chiller tripped on high pressure, condenser fouled", "eq_closure": "Condenser coils washed, refrigerant charge corrected, running 7C flow", "eq_hours": 20, "review": True}],
        room_wo={"at": 1, "closure": "Checked fan coil ok - chiller issue, see chiller ticket", "hours": 4}, root_desc="Chiller condenser fouled by dust and pollen; tripped on high pressure during the heatwave", fix_held=True, recurred=False)
    B.same_room_repeat("ISS-07", "118", "tv_broken", title="Room 118 set-top box rebooted twice, then replaced",
        rounds=[{"date": "2026-05-06", "closure": "Rebooted set-top box", "hours": 1},
                {"date": "2026-06-11", "closure": "restart apokwdikopoiiti", "hours": 0.5, "lang": "gr"},
                {"date": "2026-07-22", "closure": "Replaced STB", "hours": 3}],
        root_desc="Failing set-top box power supply", fix_held=True)
    B.cross_room_leak("ISS-08", "214", "314", title="Leak from 314 into the bathroom ceiling of 214, twice", first="2026-06-09", second="2026-08-05",
        root_desc="Cracked shower waste in 314; the first visit only redid the silicone")
    B.equipment_repeat("ISS-09", "A-LIFT-1", "elevator_stuck", title="Main Building lobby lift keeps stopping between floors", building="A",
        events=[{"date": "2026-05-22", "closure": "Released guests, lift company called, reset", "hours": 3, "time_kind": "evening"},
                {"date": "2026-07-15", "closure": "Door sensor replaced by lift co.", "hours": 26, "reopened": True},
                {"date": "2026-09-09", "closure": "Lift company serviced, running", "hours": 8, "reopened": True}],
        fd_at=[0, 2], review_at=0, root_desc="Intermittent door-zone sensor fault; serviced three times, never root-caused", fix_held=False, status="reopened")
    B.same_room_repeat("ISS-10", "327", "safe_stuck", title="Room 327 safe: batteries twice, then the safe",
        rounds=[{"date": "2026-06-03", "closure": "Replaced batteries, opened with master", "hours": 1},
                {"date": "2026-07-01", "closure": "allagi mpatariwn", "hours": 0.7, "lang": "gr"},
                {"date": "2026-07-26", "closure": "Replaced safe", "hours": 5, "reopened": True}],
        root_desc="Safe keypad drawing current; batteries drained within weeks", fix_held=True)
    B.fix_not_held("ISS-11", "305", "drain_blocked", title="Room 305 shower drain cleared 'done', still slow for the whole stay",
        first="2026-06-22", second="2026-07-04", first_closure="done", second_closure="Drain unblocked with spring, hair + tile grout in trap", root_desc="Grout debris in the trap from a spring retiling job")
    B.ops_recurring("ISS-12", "REST-ORIZONTAS", "breakfast_slow", title="Breakfast understaffed through August", start="2026-08-01", end="2026-08-25",
        n_fd=2, n_surveys=3, n_reviews=2, root_desc="Two waiters short on the breakfast roster in August", fix_held=None)

    # -- Garden Wing (B) ---------------------------------------------------------------
    B.long_unresolved("ISS-13", "B/3", "wifi_weak", title="Garden Wing 3rd floor Wi-Fi dead zone", opened="2026-06-05", closed="2026-09-20", status_kind="in_progress",
        fd_dates=["2026-06-04", "2026-07-11", "2026-08-19"], fd_rooms=["334", "347", "352"], reviews=2, category="Other",
        desc="Multiple wifi complaints 3rd floor Garden Wing (334, 347, 352). Only one AP on the floor, corridor end rooms get no signal", closure="Two additional APs installed 3rd floor corridor", root_desc="Single access point for 30 rooms on the floor", fix_held=True, root_type="shared_equipment")
    B.long_unresolved("ISS-14", "B-LIFT-1", "elevator_stuck", title="Garden Wing lift out of order ten days waiting for a controller board", opened="2026-07-03", closed="2026-07-13", status_kind="on_hold",
        fd_dates=["2026-07-05", "2026-07-10"], building="B", reviews=1, desc="Lift B stopped, controller board fault - lift co. ordered part", closure="Controller board replaced by lift co., tested", root_desc="Failed lift controller board", fix_held=True, root_type="shared_equipment")
    B.cluster("ISS-15", title="Garden Wing booster pump: reset in July, replaced in August", topic="low_pressure", equipment="B-PUMP", building="B", floors=[2, 3],
        waves=[{"start": "2026-07-18", "end": "2026-07-21", "n": 3, "eq_desc": "Low pressure complaints floors 2-3 Bldg B. Booster pump 2 tripped", "eq_closure": "Pump 2 reset, pressure ok 4 bar", "eq_hours": 2},
               {"start": "2026-08-24", "end": "2026-08-27", "n": 2, "survey": True, "eq_desc": "Low pressure again upper floors B, booster pump 2 tripping repeatedly", "eq_closure": "Replaced booster pump 2 + pressure switch, set 4.5 bar", "eq_hours": 28, "eq_reopened": True}],
        root_desc="Booster pump 2 motor winding failing; the July reset was not a fix", fix_held=True, recurred=True)
    B.cluster("ISS-16", title="Mosquitoes in the Garden Wing ground-floor rooms", topic="mosquitoes", equipment="B", building="B", floors=[1],
        waves=[{"start": "2026-08-08", "end": "2026-08-16", "n": 3, "survey": True, "review": True, "eq_desc": "Mosquito complaints ground floor Garden Wing (several rooms). Pest control to spray garden perimeter", "eq_closure": "Sprayed garden perimeter and irrigation sump", "eq_hours": 20, "eq_category": "Grounds & Pest"}],
        root_desc="Standing water in the irrigation sump next to the Garden Wing", fix_held=False, recurred=True, status="open", notes="Spraying did not hold: the survey and the review arrive after the pest-control ticket.")
    B.same_room_repeat("ISS-17", "245", "ac_dripping", title="Room 245 fan coil drips twice", rounds=[{"date": "2026-06-27", "closure": "Cleared condensate drain, ok", "hours": 2}, {"date": "2026-07-19", "closure": "Re-sloped drain pipe, no drip", "hours": 6, "reopened": True}],
        root_desc="Condensate drain pipe laid with a back-fall", fix_held=True, review_round=1)
    B.fix_not_held("ISS-18", "158", "balcony_door_lock", title="Room 158 balcony door: tightened, then the cylinder replaced", first="2026-05-27", second="2026-06-15",
        first_closure="Tightened handle", second_closure="Replaced lock cylinder and rollers", root_desc="Worn lock cylinder on the sliding door")
    B.ops_recurring("ISS-19", "B/2", "room_not_cleaned", title="Garden Wing 2nd floor housekeeping misses in September", start="2026-09-05", end="2026-09-20",
        n_fd=3, n_surveys=2, n_reviews=1, building="B", root_desc="Housekeeping section on B/2 one attendant short after seasonal staff left", fix_held=None)

    # -- Sea Wing (C) ---------------------------------------------------------------------
    B.cluster("ISS-20", title="Sea Wing hot water: boiler circulation pump fails in June and again in September", topic="no_hot_water", equipment="C-BOILER", building="C", floors=[1, 2, 3],
        waves=[{"start": "2026-06-10", "end": "2026-06-15", "n": 3, "eq_desc": "No hot water complaints whole Sea Wing since Thursday. Circulation pump 1 failed, tank at 38C", "eq_closure": "Replaced circulation pump, HW restored Monday evening", "eq_hours": 40},
               {"start": "2026-09-14", "end": "2026-09-16", "n": 2, "eq_desc": "Sea Wing lukewarm water again upper floors mornings", "eq_closure": "Pump fitted in June was undersized (6m head) - replaced with correct model, tank thermostat recalibrated 60C", "eq_hours": 26, "eq_reopened": True}],
        room_wo={"at": 1, "closure": "Checked mixer ok - boiler issue, see C boiler ticket", "hours": 6, "category": "Plumbing"},
        root_desc="Failed circulation pump on the Sea Wing boiler; June replacement was undersized", fix_held=True, recurred=True)
    B.long_unresolved("ISS-21", "362", "railing_loose", title="Room 362 loose balcony railing waits three months for a welder", opened="2026-05-30", closed="2026-08-30", status_kind="on_hold",
        fd_dates=["2026-05-29", "2026-07-25"], reviews=1, desc="Balcony railing loose 362 - URGENT, temporary brace fitted, welder ordered", closure="Railing re-anchored and welded, load tested", root_desc="Corroded railing anchors", fix_held=True)
    B.same_room_repeat("ISS-22", "266", "minibar_warm", title="Room 266 minibar reset, then replaced", rounds=[{"date": "2026-07-06", "closure": "Reset thermostat, cooling", "hours": 1}, {"date": "2026-07-28", "closure": "Minibar replaced", "hours": 4}],
        root_desc="Failing minibar compressor", fix_held=True, survey_round=0)
    B.same_room_repeat("ISS-23", "375", "keycard_fails", title="Room 375 door lock fails for three guests in a row",
        rounds=[{"date": "2026-06-18", "closure": "Re-encoded cards", "hours": 0.5}, {"date": "2026-07-23", "closure": "Replaced lock batteries", "hours": 1}, {"date": "2026-08-20", "closure": "Lock replaced", "hours": 5, "reopened": True}],
        root_desc="Corroded battery contacts in the door lock", fix_held=True, review_round=2)
    B.cluster("ISS-24", title="Sewage smell on the Sea Wing ground floor: traps refilled in May, vent cleared in October", topic="sewage_smell", equipment="C", building="C", floors=[1],
        waves=[{"start": "2026-05-08", "end": "2026-05-13", "n": 3, "eq_desc": "Drain smell complaints C ground floor (3 rooms). Floor traps dry - refilled, vent stack checked", "eq_closure": "traps filled, ok", "eq_hours": 5, "eq_category": "Plumbing"},
               {"start": "2026-10-03", "end": "2026-10-06", "n": 2, "eq_desc": "Smell again C ground floor bathrooms", "eq_closure": "Sewer vent pipe on roof blocked by bird nest - cleared, smell gone", "eq_hours": 10, "eq_category": "Plumbing", "eq_reopened": True}],
        root_desc="Blocked sewer vent stack on the Sea Wing roof", fix_held=True, recurred=True)
    B.same_room_repeat("ISS-25", "274", "bed_uncomfortable", title="Room 274 mattress complaints from three stays",
        rounds=[{"date": "2026-06-05", "wo": False}, {"date": "2026-06-19", "closure": "Mattress turned, topper added", "hours": 3}, {"date": "2026-07-14", "closure": "Mattress replaced", "hours": 24, "reopened": True}],
        root_desc="Worn-out mattress", fix_held=True, survey_round=0, review_round=2, persisted_survey=False)

    # -- Cliff Wing (D) -----------------------------------------------------------------------
    B.ops_recurring("ISS-26", "BEACHBAR", "noise_music", title="Beach bar music keeps Cliff Wing guests awake until the 23:00 curfew", start="2026-07-10", end="2026-08-09",
        n_fd=3, n_surveys=1, n_reviews=2, building="D", root_desc="Beach bar DJ sets running past midnight; sound system faces the Cliff Wing", fix_held=True, fix_note="Music off at 23:00 agreed with F&B from 10/8")
    B.cluster("ISS-27", title="Cliff Wing chiller fan bearing hums at night", topic="noise_equipment", equipment="D-CHILLER", building="D", floors=[2],
        waves=[{"start": "2026-07-30", "end": "2026-08-02", "n": 3, "review": True, "eq_desc": "Humming/vibration complaints D 2nd floor nights. Chiller fan bearing noisy", "eq_closure": "Chiller fan bearing replaced, anti-vibration mounts renewed", "eq_hours": 30}],
        root_desc="Worn fan bearing on the Cliff Wing chiller", fix_held=True, recurred=False)
    B.fix_not_held("ISS-28", "192", "ac_dripping", title="Room 192 AC drip closed 'ok', drain line found blocked three weeks later", first="2026-07-14", second="2026-08-02",
        first_closure="ok", second_closure="Drain line unblocked, tray cleaned", root_desc="Blocked condensate drain line")
    B.long_unresolved("ISS-29", "D-BOILER", "no_hot_water", title="Cliff Wing boiler cannot keep up at full occupancy", opened="2026-08-06", closed=None, status_kind="on_hold",
        fd_dates=["2026-08-03", "2026-08-09", "2026-08-15", "2026-08-22"], building="D", surveys=1, desc="Lukewarm water mornings all over Cliff Wing when full. Boiler timer adjusted, solar circuit bled - still marginal. Second storage tank needed, quote requested", category="Plumbing",
        second_wo={"date": "2026-08-20", "closed": False, "status": "on_hold"}, root_desc="Boiler and storage undersized for full occupancy; second tank on order", fix_held=False, root_type="shared_equipment", fd_location=None)
    B.long_unresolved("ISS-30", "185", "shower_door", title="Room 185 shower screen waits six weeks for a part", opened="2026-06-16", closed="2026-07-30", status_kind="on_hold",
        fd_dates=["2026-06-15", "2026-07-08"], surveys=1, desc="Shower door off rail 185, hinge broken - new hinge/screen ordered", closure="Hinge replaced, door aligned", root_desc="Broken shower door hinge, part on back-order", fix_held=True)

    # -- Facilities -------------------------------------------------------------------------------
    B.cluster("ISS-31", title="Infinity pool cold in early May: heat pump compressor", topic="pool_cold", equipment="POOLINF-HEATPUMP", building=None, floors=None,
        waves=[{"start": "2026-05-02", "end": "2026-05-09", "n": 2, "review": True, "eq_desc": "Infinity pool 21C, heat pump not running - compressor fault", "eq_closure": "Heat pump compressor replaced, 27C reached", "eq_hours": 60}],
        root_desc="Failed heat-pump compressor", fix_held=True, recurred=False, fd_location="POOL-INFINITY")
    B.ops_recurring("ISS-32", "POOL-MAIN", "sunbeds", title="Sunbed shortage at the main pool in high season", start="2026-07-12", end="2026-08-20",
        n_fd=1, n_surveys=2, n_reviews=3, root_desc="Fewer sunbeds than guests at peak; towel-reservation rule not enforced", fix_held=None)
    B.equipment_repeat("ISS-33", "SPA-HEATER", "hammam_cold", title="Hammam steam generator fails three times", building=None,
        events=[{"date": "2026-06-08", "closure": "Reset, steam ok", "hours": 2}, {"date": "2026-07-21", "closure": "Steam generator descaled", "hours": 10, "reopened": True}, {"date": "2026-09-02", "closure": "Replaced heating element", "hours": 30, "reopened": True}],
        fd_at=[0, 1, 2], review_at=1, survey_at=2, root_desc="Scale build-up on the steam generator element from hard water", fix_held=True, location_for_guests="SPA")
    B.long_unresolved("ISS-34", "GYM", "gym_treadmill", title="Gym treadmill out of order since May, never repaired", opened="2026-05-20", closed=None, status_kind="on_hold",
        fd_dates=["2026-06-10", "2026-07-30"], reviews=1, desc="Treadmill 1 error E3, service company notified, waiting for quote", root_desc="Treadmill motor controller; service quote never approved", fix_held=None, root_type="shared_equipment", fd_location="GYM")
    B.ops_recurring("ISS-35", "REST-AMMOS", "food_cold", title="Ammos taverna kitchen overwhelmed in August", start="2026-08-05", end="2026-08-24",
        n_fd=1, n_surveys=2, n_reviews=3, root_desc="Kitchen pass heat lamp broken and one cook short at lunch", fix_held=None)
    B.cluster("ISS-36", title="Elia dining room AC fails during late-July service", topic="restaurant_hot", equipment="ELIA-AC", building=None, floors=None,
        waves=[{"start": "2026-07-24", "end": "2026-07-26", "n": 2, "review": True, "eq_desc": "Elia split units 2 and 3 not cooling, dining room 31C during service", "eq_closure": "Cleaned condensers, regassed 2 units, ok 22C", "eq_hours": 18}],
        root_desc="Two of four split units low on refrigerant", fix_held=True, recurred=False, fd_location="REST-ELIA")
    B.equipment_repeat("ISS-37", "BEACHBAR-COLD", "bar_warm_drinks", title="Beach bar ice machine: descaled, then the condenser fan", building=None,
        events=[{"date": "2026-07-08", "closure": "Ice machine descaled, ok", "hours": 4, "reporter": "F&B"}, {"date": "2026-07-19", "closure": "Refrigeration tech replaced condenser fan, cold room 3C", "hours": 26, "reopened": True, "reporter": "F&B"}],
        fd_at=[1], review_at=0, survey_at=0, root_desc="Condenser fan motor failing; descaling treated the symptom", fix_held=True, location_for_guests="BEACHBAR")
    B.cluster("ISS-38", title="Main pool cloudy in early July: filter sand", topic="pool_cloudy", equipment="POOLMAIN-FILTER", building=None, floors=None,
        waves=[{"start": "2026-07-02", "end": "2026-07-06", "n": 2, "review": True, "survey": True, "eq_desc": "Main pool cloudy 3 days, backwash not helping, filter sand channelled", "eq_closure": "Replaced filter sand, dosing adjusted, water clear", "eq_hours": 36}],
        root_desc="Channelled filter sand in the main pool filtration", fix_held=True, recurred=False, fd_location="POOL-MAIN")
    B.equipment_repeat("ISS-39", "SPA", "spa_changing_smell", title="Spa changing rooms damp smell returns after each clean", building=None,
        events=[{"date": "2026-06-20", "closure": "Deep cleaned, drains cleared", "hours": 6, "category": "Housekeeping"}, {"date": "2026-08-11", "closure": "Extractor fan replaced", "hours": 24, "reopened": True}],
        fd_at=[0], review_at=None, survey_at=0, root_desc="Undersized extraction and a leaking shower tray behind the lockers", fix_held=False, status="reopened", location_for_guests="SPA")
    B.cluster("ISS-40", title="Key cards fail across the Main Building after a lock-server update", topic="keycard_fails", equipment="LOCKS-CONTROLLER", building="A", floors=None,
        waves=[{"start": "2026-06-15", "end": "2026-06-18", "n": 4, "eq_desc": "Key card failures all over Bldg A since the lock server update on Sunday. Encoder clock drifted", "eq_closure": "Encoder clock re-synced, all active cards re-issued", "eq_hours": 14, "eq_category": "IT / TV"}],
        room_wo={"at": 0, "closure": "Re-encoded cards", "hours": 1, "category": "Electrical"}, root_desc="Lock-server clock drift after a software update", fix_held=True, recurred=False)
    B.same_room_repeat("ISS-41", "341", "ac_noisy", title="Room 341 noisy fan coil", rounds=[{"date": "2026-07-02", "closure": "Tightened fan housing, noise gone", "hours": 2}, {"date": "2026-08-15", "closure": "Replaced fan motor bearing", "hours": 5, "reopened": True}],
        root_desc="Worn fan-coil motor bearing", fix_held=True, survey_round=0)
    B.cross_room_leak("ISS-42", "171", "271", title="Leak from 271 into 171 in late September", first="2026-09-22", second=None, root_desc="Failed silicone around the shower tray in 271")

    # -- Hard negatives: same topic, same week, somewhere else ---------------------------------
    by_id = {i.issue_id: i for i in B.issues}
    B.distractor_fd(by_id["ISS-06"], _d("2026-07-28"), building="C")
    B.distractor_wo(by_id["ISS-06"], _d("2026-07-28"), "V09")
    B.distractor_fd(by_id["ISS-20"], _d("2026-06-12"), building="B")
    B.distractor_wo(by_id["ISS-20"], _d("2026-06-13"), "143")
    B.distractor_fd(by_id["ISS-20"], _d("2026-09-15"), building="A")
    B.distractor_fd(by_id["ISS-15"], _d("2026-07-20"), building="D")
    B.distractor_fd(by_id["ISS-24"], _d("2026-05-10"), building="A")
    B.distractor_fd(by_id["ISS-27"], _d("2026-08-01"), building="A", topic="ac_noisy")
    B.distractor_fd(by_id["ISS-29"], _d("2026-08-10"), building="B")
    B.distractor_fd(by_id["ISS-40"], _d("2026-06-16"), building="C")
    B.distractor_wo(by_id["ISS-01"], _d("2026-07-10"), "V13", note="AC complaint in the villa next door one day after the ISS-01 July event: unrelated one-off.")
    B.distractor_wo(by_id["ISS-23"], _d("2026-07-24"), "376", note="Key-card issue next door to 375 one day later: unrelated one-off.")
    B.distractor_fd(by_id["ISS-12"], _d("2026-07-20"), building=None, note="Breakfast complaint in July, before the August staffing gap: unrelated one-off.")

    for iss in B.issues:
        n = len(iss.signals)
        assert 2 <= n <= 8, (iss.issue_id, n)
    return B
