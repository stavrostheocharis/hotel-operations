"""Deterministic random helpers.

Everything derives from one ``random.Random`` seeded by the CLI ``--seed``; child
generators are spawned by name so that adding a new consumer does not shift the
draws of unrelated ones.
"""

from __future__ import annotations

import hashlib
import random
from datetime import date, datetime, time, timedelta
from typing import Iterable, Sequence, TypeVar

T = TypeVar("T")


class Rng:
    def __init__(self, seed: int | str):
        if isinstance(seed, str):
            seed = int(hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16], 16)
        self.seed = seed
        self._r = random.Random(seed)

    # -- derivation -------------------------------------------------------
    def spawn(self, name: str) -> "Rng":
        return Rng(f"{self.seed}:{name}")

    # -- primitives -------------------------------------------------------
    def random(self) -> float:
        return self._r.random()

    def chance(self, p: float) -> bool:
        return self._r.random() < p

    def randint(self, a: int, b: int) -> int:
        return self._r.randint(a, b)

    def uniform(self, a: float, b: float) -> float:
        return self._r.uniform(a, b)

    def gauss(self, mu: float, sigma: float) -> float:
        return self._r.gauss(mu, sigma)

    def choice(self, seq: Sequence[T]) -> T:
        return self._r.choice(seq)

    def sample(self, seq: Sequence[T], k: int) -> list[T]:
        k = min(k, len(seq))
        return self._r.sample(list(seq), k)

    def shuffle(self, seq: list) -> list:
        self._r.shuffle(seq)
        return seq

    def weighted(self, weights: dict[T, float] | Sequence[tuple[T, float]]) -> T:
        items = list(weights.items()) if isinstance(weights, dict) else list(weights)
        total = sum(w for _, w in items)
        x = self._r.random() * total
        acc = 0.0
        for item, w in items:
            acc += w
            if x < acc:
                return item
        return items[-1][0]

    def pick_distinct(self, seq: Sequence[T], k: int, *, avoid: Iterable[T] = ()) -> list[T]:
        pool = [s for s in seq if s not in set(avoid)]
        return self.sample(pool, k)

    # -- dates & times ----------------------------------------------------
    def date_between(self, a: date, b: date) -> date:
        """Inclusive on both ends."""
        span = (b - a).days
        if span <= 0:
            return a
        return a + timedelta(days=self._r.randint(0, span))

    def time_of_day(self, kind: str = "any") -> time:
        """Plausible clock times for a given kind of event."""
        ranges = {
            "any": [(7, 23)],
            "morning": [(7, 11)],
            "afternoon": [(13, 18)],
            "evening": [(18, 23)],
            "night": [(22, 24), (0, 2)],
            "office": [(8, 17)],
            "shift": [(7, 15), (15, 23)],
            "checkin": [(14, 20)],
        }
        lo, hi = self.choice(ranges.get(kind, ranges["any"]))
        h = self._r.randint(lo, max(lo, hi - 1))
        return time(hour=h % 24, minute=self._r.randint(0, 59))

    def datetime_on(self, d: date, kind: str = "any") -> datetime:
        return datetime.combine(d, self.time_of_day(kind))

    def hours(self, lo: float, hi: float) -> timedelta:
        return timedelta(hours=self.uniform(lo, hi))
