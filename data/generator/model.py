"""In-memory records shared by the generator stages."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any


@dataclass
class Room:
    code: str            # "312", "V12"
    building: str        # "A".."D", "V"
    floor: int
    room_type: str
    view: str
    is_villa: bool
    number: int          # 312 or 12 (villa number)


@dataclass
class Facility:
    code: str
    name: str
    type: str
    area: str
    notes: str


@dataclass
class Equipment:
    id: str
    building: str | None
    type: str
    name: str
    location_text: str
    serves: str
    installed: int


@dataclass
class Stay:
    stay_id: int
    room: str
    check_in: date
    check_out: date
    adults: int
    children: int
    nationality: str
    language: str
    segment: str
    board: str
    booked_on: date
    has_survey: bool = False
    has_review: bool = False

    @property
    def nights(self) -> int:
        return (self.check_out - self.check_in).days

    def covers(self, d: date) -> bool:
        return self.check_in <= d < self.check_out


@dataclass
class Signal:
    """One raw observation before export.

    ``location`` / ``category`` are the *true* values that go into the answer key;
    ``location_text`` is what a human typed into the source system.
    """

    source: str                      # work_order | front_desk | survey | review
    topic: str
    category: str
    location: str                    # room code, facility code or equipment id
    location_type: str               # room | facility | equipment
    ts: datetime
    language: str
    text: str
    issue_id: str | None = None
    stay_id: int | None = None
    location_text: str = ""
    extra: dict[str, Any] = field(default_factory=dict)
    export_id: str = ""              # filled by the exporters
    record_id: str = ""              # id as it appears in the export file
    role: str = "noise"              # noise | planted | distractor | duplicate
    duplicate_of: str = ""           # uid of the signal this duplicates
    distractor_for: str = ""         # issue id this hard negative is meant to confuse
    note: str = ""                   # free-form explanation for the answer key
    uid: str = ""                    # stable internal id (assigned in pipeline)


@dataclass
class Issue:
    issue_id: str
    scenario: str                    # same_room_repeat | shared_cause_cluster | fix_not_held | long_unresolved | ops_recurring | cross_room_leak | equipment_repeat
    title: str
    category: str
    severity: str                    # low | medium | high
    topic: str
    root_cause_type: str             # room_equipment | shared_equipment | process | structure
    root_cause_location: str
    root_cause_description: str
    affected_locations: list[str]
    recurred: bool
    fix_held: bool | None            # None when no fix was attempted / recorded
    resolved_by_season_end: bool
    status_at_season_end: str        # resolved | verified | open | reopened
    signals: list[Signal] = field(default_factory=list)
    notes: str = ""

    @property
    def first_ts(self) -> datetime:
        return min(s.ts for s in self.signals)

    @property
    def last_ts(self) -> datetime:
        return max(s.ts for s in self.signals)
