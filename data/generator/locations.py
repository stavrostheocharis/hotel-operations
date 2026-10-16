"""Build the location hierarchy (rooms, facilities, shared equipment)."""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import Config
from .model import Equipment, Facility, Room
from .rng import Rng


@dataclass
class Locations:
    rooms: list[Room]
    facilities: list[Facility]
    equipment: list[Equipment]
    building_names: dict[str, str]
    building_marketing: dict[str, str]
    building_greek: dict[str, str]
    room_by_code: dict[str, Room] = field(default_factory=dict)
    facility_by_code: dict[str, Facility] = field(default_factory=dict)
    equipment_by_id: dict[str, Equipment] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.room_by_code = {r.code: r for r in self.rooms}
        self.facility_by_code = {f.code: f for f in self.facilities}
        self.equipment_by_id = {e.id: e for e in self.equipment}

    # -- lookups ----------------------------------------------------------
    def rooms_in(self, building: str) -> list[Room]:
        return [r for r in self.rooms if r.building == building]

    def rooms_on_floor(self, building: str, floor: int) -> list[Room]:
        return [r for r in self.rooms if r.building == building and r.floor == floor]

    def location_type(self, code: str) -> str:
        if code in self.room_by_code:
            return "room"
        if code in self.facility_by_code:
            return "facility"
        if code in self.equipment_by_id:
            return "equipment"
        if code in self.building_names:
            return "building"
        if "/" in code and code.split("/")[0] in self.building_names:
            return "floor"
        raise KeyError(code)

    def building_of(self, code: str) -> str | None:
        if code in self.building_names:
            return code
        if "/" in code and code.split("/")[0] in self.building_names:
            return code.split("/")[0]
        if code in self.room_by_code:
            return self.room_by_code[code].building
        if code in self.equipment_by_id:
            return self.equipment_by_id[code].building
        if code in self.facility_by_code:
            f = self.facility_by_code[code]
            for b, name in self.building_names.items():
                if name.lower() in f.area.lower():
                    return b
        return None

    def equipment_for(self, building: str, etype: str) -> Equipment:
        for e in self.equipment:
            if e.building == building and e.type == etype:
                return e
        raise KeyError((building, etype))

    def wing_name(self, building: str) -> str:
        return self.building_marketing.get(building, building)


def build_locations(cfg: Config, rng: Rng) -> Locations:
    rooms: list[Room] = []
    for b in cfg.buildings:
        type_weights = {(rt.type, rt.view): rt.share for rt in b.room_types}
        if b.is_villas:
            for n in range(1, b.villas + 1):
                t, v = rng.weighted(type_weights)
                rooms.append(Room(code=f"V{n:02d}", building=b.code, floor=0, room_type=t, view=v, is_villa=True, number=n))
            continue
        for floor in b.floors:
            for i in range(b.rooms_per_floor):
                num = b.first_room_on_floor + i
                # sea-facing rooms tend to sit on one side of the corridor: keep type
                # allocation blocky rather than fully random, like a real floor plan
                t, v = rng.weighted(type_weights)
                code = f"{floor}{num:02d}"
                rooms.append(Room(code=code, building=b.code, floor=floor, room_type=t, view=v, is_villa=False, number=int(code)))

    facilities = [Facility(code=f.code, name=f.name, type=f.type, area=f.area, notes=f.notes) for f in cfg.facilities]
    equipment = [
        Equipment(id=e.id, building=e.building, type=e.type, name=e.name, location_text=e.location_text, serves=e.serves, installed=e.installed)
        for e in cfg.equipment
    ]
    return Locations(
        rooms=rooms,
        facilities=facilities,
        equipment=equipment,
        building_names={b.code: b.name for b in cfg.buildings},
        building_marketing={b.code: b.marketing_name for b in cfg.buildings},
        building_greek={b.code: b.greek_name for b in cfg.buildings},
    )
