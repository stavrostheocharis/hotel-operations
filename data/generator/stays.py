"""Occupancy curve, PMS stays and the daily occupancy table."""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np

from .config import Config
from .locations import Locations
from .model import Stay
from .rng import Rng

SEGMENTS = {"Tour Operator": 0.38, "OTA": 0.30, "Direct": 0.24, "Travel Agent": 0.06, "Corporate": 0.02}
BOARDS = {"BB": 0.55, "HB": 0.35, "FB": 0.06, "RO": 0.04}


def occupancy_targets(cfg: Config, rng: Rng) -> dict[date, float]:
    """Per-day target share of occupied rooms."""
    months = sorted(cfg.occupancy_curve.items())
    xs, ys = [], []
    for ym, share in months:
        y, m = (int(p) for p in ym.split("-"))
        xs.append(date(y, m, 15).toordinal())
        ys.append(share)
    # pin the ends so April 1 and October 31 are lower than their mid-month values
    xs = [cfg.season_open.toordinal()] + xs + [cfg.season_close.toordinal()]
    ys = [ys[0] * 0.75] + ys + [ys[-1] * 0.55]
    days = [cfg.season_open + timedelta(days=i) for i in range(cfg.season_days)]
    base = np.interp([d.toordinal() for d in days], xs, ys)
    out: dict[date, float] = {}
    for d, b in zip(days, base):
        # charter arrival ripple: Thursday/Saturday/Sunday turnover days run fuller
        ripple = {3: 0.02, 5: 0.03, 6: 0.02, 1: -0.02, 2: -0.02}.get(d.weekday(), 0.0)
        val = float(b) + ripple + rng.gauss(0, 0.012)
        out[d] = float(min(0.99, max(0.04, val)))
    return out


def _length_weights(cfg: Config, d: date) -> dict[int, float]:
    w = dict(cfg.stay_length)
    if d.month in (7, 8):
        for k in w:
            if k >= 7:
                w[k] *= 1.6
            elif k <= 3:
                w[k] *= 0.6
    elif d.month in (4, 10):
        for k in w:
            if k <= 3:
                w[k] *= 1.6
            elif k >= 7:
                w[k] *= 0.6
    return w


def _language_for_month(cfg: Config, ym: str) -> dict[str, float]:
    mult = cfg.language_seasonality.get(ym, {})
    return {lang: share * mult.get(lang, 1.0) for lang, share in cfg.languages.items()}


def generate_stays(cfg: Config, loc: Locations, rng: Rng) -> list[Stay]:
    targets = occupancy_targets(cfg, rng.spawn("occupancy"))
    r = rng.spawn("stays")
    rooms = [rm.code for rm in loc.rooms]
    n_rooms = len(rooms)
    free_from: dict[str, date] = {code: cfg.season_open for code in rooms}
    occupied_until: dict[str, date] = {code: cfg.season_open for code in rooms}
    stays: list[Stay] = []
    day = cfg.season_open
    while day <= cfg.season_close:
        target = round(targets[day] * n_rooms)
        occupied = sum(1 for code in rooms if occupied_until[code] > day)
        need = target - occupied
        if need > 0:
            free = [code for code in rooms if free_from[code] <= day]
            # villas and suites sell slightly less in the shoulder months
            chosen = r.sample(free, min(need, len(free)))
            ym = f"{day.year}-{day.month:02d}"
            lang_weights = _language_for_month(cfg, ym)
            for code in chosen:
                nights = r.weighted(_length_weights(cfg, day))
                check_out = min(day + timedelta(days=nights), cfg.season_close)
                if check_out <= day:
                    continue
                lang = r.weighted(lang_weights)
                nat = r.weighted(cfg.nationalities[lang])
                room = loc.room_by_code[code]
                family = "Family" in room.room_type or room.is_villa or "Three" in room.room_type
                adults = r.weighted({1: 0.08, 2: 0.78, 3: 0.09, 4: 0.05}) if not room.is_villa else r.weighted({2: 0.35, 4: 0.40, 5: 0.10, 6: 0.15})
                kid_p = 0.55 if family else (0.22 if day.month in (7, 8) else 0.10)
                children = r.weighted({1: 0.55, 2: 0.38, 3: 0.07}) if r.chance(kid_p) else 0
                lead = int(abs(r.gauss(0, 60))) + r.randint(2, 20)
                stays.append(
                    Stay(
                        stay_id=0,
                        room=code,
                        check_in=day,
                        check_out=check_out,
                        adults=adults,
                        children=children,
                        nationality=nat,
                        language=lang,
                        segment=r.weighted(SEGMENTS),
                        board=r.weighted(BOARDS),
                        booked_on=day - timedelta(days=lead),
                    )
                )
                # same-day turnover most of the time in peak, a cleaning gap otherwise
                gap = 0 if r.chance(0.85 if day.month in (6, 7, 8, 9) else 0.5) else r.randint(1, 2)
                occupied_until[code] = check_out
                free_from[code] = check_out + timedelta(days=gap)
        day += timedelta(days=1)

    # PMS confirmation numbers follow booking order, not arrival order
    stays.sort(key=lambda s: (s.booked_on, s.room))
    next_id = 2605011
    for s in stays:
        s.stay_id = next_id
        next_id += r.weighted({1: 0.80, 2: 0.14, 3: 0.04, 7: 0.02})
    stays.sort(key=lambda s: (s.check_in, s.room))
    return stays


@dataclass
class World:
    """Stays plus the indexes the scenario builders need."""

    cfg: Config
    loc: Locations
    stays: list[Stay]
    by_room: dict[str, list[Stay]] = field(default_factory=dict)
    by_id: dict[int, Stay] = field(default_factory=dict)
    _starts: dict[str, list[date]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for s in self.stays:
            self.by_room.setdefault(s.room, []).append(s)
            self.by_id[s.stay_id] = s
        for room, lst in self.by_room.items():
            lst.sort(key=lambda s: s.check_in)
            self._starts[room] = [s.check_in for s in lst]

    def stay_at(self, room: str, d: date) -> Stay | None:
        lst = self.by_room.get(room, [])
        if not lst:
            return None
        i = bisect_right(self._starts[room], d) - 1
        if i >= 0 and lst[i].covers(d):
            return lst[i]
        return None

    def stay_near(self, room: str, d: date, window: int = 12, min_nights: int = 2) -> Stay | None:
        """The stay in ``room`` whose dates are closest to ``d`` (within ``window`` days)."""
        best, best_dist = None, None
        for s in self.by_room.get(room, []):
            if s.nights < min_nights:
                continue
            if s.covers(d):
                return s
            dist = (s.check_in - d).days if s.check_in > d else (d - s.check_out).days + 1
            if dist <= window and (best_dist is None or dist < best_dist):
                best, best_dist = s, dist
        return best

    def stays_between(self, room: str, a: date, b: date, min_nights: int = 2) -> list[Stay]:
        return [s for s in self.by_room.get(room, []) if s.check_out > a and s.check_in <= b and s.nights >= min_nights]

    def occupied_on(self, d: date, building: str | None = None, floors: list[int] | None = None) -> list[Stay]:
        out = []
        for room, lst in self.by_room.items():
            rm = self.loc.room_by_code[room]
            if building and rm.building != building:
                continue
            if floors and rm.floor not in floors:
                continue
            s = self.stay_at(room, d)
            if s is not None:
                out.append(s)
        return out


def occupancy_daily(cfg: Config, loc: Locations, stays: list[Stay]) -> list[dict]:
    buildings = [b.code for b in cfg.buildings]
    counts = {b: len(loc.rooms_in(b)) for b in buildings}
    rows = []
    days = [cfg.season_open + timedelta(days=i) for i in range(cfg.season_days)]
    occ = {(d, b): 0 for d in days for b in buildings}
    arr = {(d, b): 0 for d in days for b in buildings}
    dep = {(d, b): 0 for d in days for b in buildings}
    for s in stays:
        b = loc.room_by_code[s.room].building
        d = s.check_in
        arr[(d, b)] += 1
        if s.check_out in dep:
            pass
        if (s.check_out, b) in dep:
            dep[(s.check_out, b)] += 1
        while d < s.check_out:
            occ[(d, b)] += 1
            d += timedelta(days=1)
    for d in days:
        for b in buildings:
            rows.append(
                {
                    "date": d.isoformat(),
                    "building": b,
                    "rooms_available": counts[b],
                    "rooms_occupied": occ[(d, b)],
                    "occupancy_pct": round(100 * occ[(d, b)] / counts[b], 1),
                    "arrivals": arr[(d, b)],
                    "departures": dep[(d, b)],
                }
            )
    return rows
