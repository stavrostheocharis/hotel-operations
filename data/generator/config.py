"""Load ``resort.yaml`` into plain dataclasses."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "resort.yaml"


@dataclass
class RoomTypeShare:
    type: str
    view: str
    share: float


@dataclass
class BuildingCfg:
    code: str
    name: str
    marketing_name: str
    greek_name: str
    floors: list[int]
    room_types: list[RoomTypeShare]
    rooms_per_floor: int = 0
    first_room_on_floor: int = 1
    villas: int = 0

    @property
    def is_villas(self) -> bool:
        return self.villas > 0


@dataclass
class FacilityCfg:
    code: str
    name: str
    type: str
    area: str = ""
    notes: str = ""


@dataclass
class EquipmentCfg:
    id: str
    building: str | None
    type: str
    name: str
    location_text: str
    serves: str
    installed: int


@dataclass
class Config:
    resort_name: str
    short_name: str
    region: str
    stars: int
    season_open: date
    season_close: date
    timezone: str
    buildings: list[BuildingCfg]
    facilities: list[FacilityCfg]
    equipment: list[EquipmentCfg]
    occupancy_curve: dict[str, float]
    stay_length: dict[int, float]
    languages: dict[str, float]
    language_seasonality: dict[str, dict[str, float]]
    nationalities: dict[str, dict[str, float]]
    noise_rates: dict[str, float]
    messiness: dict[str, float]
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def season_days(self) -> int:
        return (self.season_close - self.season_open).days + 1


def _as_date(v: Any) -> date:
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v))


def load_config(path: str | Path | None = None) -> Config:
    path = Path(path) if path else DEFAULT_CONFIG
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)

    r = raw["resort"]
    buildings = [
        BuildingCfg(
            code=b["code"],
            name=b["name"],
            marketing_name=b.get("marketing_name", b["name"]),
            greek_name=b.get("greek_name", b["name"]),
            floors=list(b["floors"]),
            room_types=[RoomTypeShare(**rt) for rt in b["room_types"]],
            rooms_per_floor=int(b.get("rooms_per_floor", 0)),
            first_room_on_floor=int(b.get("first_room_on_floor", 1)),
            villas=int(b.get("villas", 0)),
        )
        for b in raw["buildings"]
    ]
    facilities = [FacilityCfg(**f) for f in raw["facilities"]]
    equipment = [EquipmentCfg(**e) for e in raw["equipment"]]
    return Config(
        resort_name=r["name"],
        short_name=r.get("short_name", r["name"]),
        region=r.get("region", ""),
        stars=int(r.get("stars", 5)),
        season_open=_as_date(r["season_open"]),
        season_close=_as_date(r["season_close"]),
        timezone=r.get("timezone", "Europe/Athens"),
        buildings=buildings,
        facilities=facilities,
        equipment=equipment,
        occupancy_curve={str(k): float(v) for k, v in raw["occupancy_curve"].items()},
        stay_length={int(k): float(v) for k, v in raw["stay_length"]["base"].items()},
        languages={str(k): float(v) for k, v in raw["languages"].items()},
        language_seasonality={str(k): {str(a): float(b) for a, b in v.items()} for k, v in raw.get("language_seasonality", {}).items()},
        nationalities={str(k): {str(a): float(b) for a, b in v.items()} for k, v in raw["nationalities"].items()},
        noise_rates={str(k): float(v) for k, v in raw["noise_rates"].items()},
        messiness={str(k): float(v) for k, v in raw["messiness"].items()},
        raw=raw,
    )
