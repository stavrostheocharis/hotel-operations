"""Unrelated background signals: one-off tickets, complaints, requests, surveys and reviews."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta

from .config import Config
from .rng import Rng
from .scenarios import Builder
from .stays import World
from .texts import staff
from .topics import NOISE_WEIGHTS_FACILITY, NOISE_WEIGHTS_REQUEST, NOISE_WEIGHTS_ROOM, TOPICS


def _poisson(r: Rng, lam: float) -> int:
    if lam <= 0:
        return 0
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= L:
            return k
        k += 1


class Collisions:
    """Keeps noise from accidentally forming a recurrence at the same place."""

    def __init__(self, signals):
        self.idx: dict[tuple[str, str], list[date]] = defaultdict(list)
        for s in signals:
            self.idx[(s.location, s.topic)].append(s.ts.date())

    def ok(self, location: str, topic: str, d: date, span: int = 45) -> bool:
        return all(abs((d - x).days) > span for x in self.idx[(location, topic)])

    def mark(self, location: str, topic: str, d: date) -> None:
        self.idx[(location, topic)].append(d)


def generate_noise(cfg: Config, world: World, B: Builder) -> None:
    r = B.rng.spawn("noise")
    rates = cfg.noise_rates
    m = cfg.messiness
    loc = world.loc
    coll = Collisions(B.signals)
    days = [cfg.season_open + timedelta(days=i) for i in range(cfg.season_days)]
    occupied = {d: world.occupied_on(d) for d in days}
    all_rooms = [rm.code for rm in loc.rooms]
    room_topics_wo = {k: v for k, v in NOISE_WEIGHTS_ROOM.items() if TOPICS[k].has_wo}
    fac_topics_wo = {k: v for k, v in NOISE_WEIGHTS_FACILITY.items() if TOPICS[k].has_wo}

    # ---- work orders ---------------------------------------------------------------
    for d in days:
        n = _poisson(r, rates["work_orders_per_occupied_room_night"] * len(occupied[d]) + 0.8)
        for _ in range(n):
            if r.chance(0.84):
                topic = r.weighted(room_topics_wo)
                if occupied[d] and r.chance(0.72):
                    stay = r.choice(occupied[d])
                    room, reporter = stay.room, r.weighted({"Front Office": 0.55, "Guest": 0.2, "Housekeeping": 0.25})
                else:
                    room, reporter = r.choice(all_rooms), "Housekeeping"
                location = room
            else:
                topic = r.weighted(fac_topics_wo)
                location = TOPICS[topic].default_location
                reporter = r.weighted({"F&B": 0.4, "Spa": 0.2, "Engineering": 0.3, "Front Office": 0.1})
            if not coll.ok(location, topic, d):
                continue
            coll.mark(location, topic, d)
            created = datetime.combine(d, r.time_of_day("shift"))
            closed_after = None if r.chance(0.04) else r.hours(0.5, 60) if r.chance(0.85) else r.hours(60, 200)
            status = None if closed_after else r.weighted({"open": 0.4, "in_progress": 0.4, "on_hold": 0.2})
            sig = B.wo(None, location, created, topic, closed_after=closed_after, status=status, reporter=reporter, typo=r.chance(m["wo_location_typo_rate"]))
            if r.chance(m["wo_duplicate_rate"]):
                dup = B.wo(None, location, created + r.hours(0.3, 7), topic, closed_after=r.hours(0.2, 3) if closed_after else None, status=status, reporter=r.choice(["Housekeeping", "Front Office", "Engineering"]), closure="trivial", note=f"Duplicate of ticket for the same problem logged by another department.")
                dup.role, dup.duplicate_of = "duplicate", sig.uid

    # ---- preventive / routine tickets -------------------------------------------------
    week_start = cfg.season_open
    while week_start <= cfg.season_close:
        for _ in range(_poisson(r, rates["preventive_work_orders_per_week"])):
            desc, kind, cat = r.choice(staff.PM_TICKETS)
            b = r.choice(["A", "B", "C", "D"])
            floor = r.choice(loc.room_by_code and [1, 2, 3] if b != "D" else [1, 2])
            desc = desc.format(b=b, floor=floor)
            if kind == "building-floor":
                location = f"{b}/{floor}"
            elif kind == "building":
                location = b
            elif kind == "chiller":
                location = f"{b}-CHILLER"
            elif kind == "boiler":
                location = f"{b}-BOILER"
            elif kind == "lift":
                location = loc.equipment_for(b, "elevator").id
            else:
                location = kind
            d = week_start + timedelta(days=r.randint(0, 6))
            if d > cfg.season_close:
                continue
            created = datetime.combine(d, r.time_of_day("office"))
            B.wo(None, location, created, "preventive", closed_after=r.hours(1, 30), desc=desc, closure=r.choice(["done", "completed", "", "ok", "έγινε", "Done - next due in 4 weeks"]), category=cat, reporter="Engineering", priority="low", lang="en")
        week_start += timedelta(days=7)

    # ---- front-desk entries -------------------------------------------------------------
    for d in days:
        n = _poisson(r, rates["front_desk_entries_per_occupied_room_night"] * len(occupied[d]))
        for _ in range(n):
            if not occupied[d]:
                break
            stay = r.choice(occupied[d])
            kind = r.weighted({"room": 0.52, "facility": 0.16, "request": 0.32})
            topic = r.weighted({"room": NOISE_WEIGHTS_ROOM, "facility": NOISE_WEIGHTS_FACILITY, "request": NOISE_WEIGHTS_REQUEST}[kind])
            t = TOPICS[topic]
            location = stay.room if t.scope == "room" else (t.default_location or stay.room)
            if not coll.ok(location, topic, d):
                continue
            coll.mark(location, topic, d)
            B.fd(None, stay.room, d, topic, stay=stay)

    # ---- surveys ------------------------------------------------------------------------
    complaint_topics = {k: v for k, v in {**NOISE_WEIGHTS_ROOM, **NOISE_WEIGHTS_FACILITY}.items() if not TOPICS[k].is_request}
    for stay in world.stays:
        if stay.has_survey or stay.check_out >= cfg.season_close or stay.nights < 1:
            continue
        if not r.chance(rates["survey_response_rate"]):
            continue
        has_comment = r.chance(rates["survey_comment_rate"])
        topic = None
        if has_comment and r.chance(rates["survey_complaint_share"]):
            topic = r.weighted(complaint_topics)
            t = TOPICS[topic]
            location = stay.room if t.scope == "room" else (t.default_location or stay.room)
            if not coll.ok(location, topic, stay.check_out, span=30):
                topic = None
            else:
                coll.mark(location, topic, stay.check_out)
        sig = B.survey(None, stay, topic)
        if not has_comment:
            sig.text = ""
            sig.language = stay.language

    # ---- reviews ------------------------------------------------------------------------
    for stay in world.stays:
        if stay.has_review or stay.check_out >= cfg.season_close - timedelta(days=2):
            continue
        if not r.chance(rates["review_rate"]):
            continue
        topic = None
        if r.chance(rates["review_complaint_share"]):
            topic = r.weighted(complaint_topics)
            t = TOPICS[topic]
            location = stay.room if t.scope == "room" else (t.default_location or stay.room)
            if not coll.ok(location, topic, stay.check_out, span=30):
                topic = None
            else:
                coll.mark(location, topic, stay.check_out)
        B.review(None, stay, topic)
