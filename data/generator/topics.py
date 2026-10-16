"""Topic registry: what a complaint is about, and how each source system labels it."""

from __future__ import annotations

from dataclasses import dataclass

# ticketing-system drop-down (what technicians can pick)
WO_CATEGORIES = [
    "HVAC", "Plumbing", "Electrical", "Carpentry & Furniture", "Housekeeping", "IT / TV",
    "Pool & Spa", "Kitchen Equipment", "Lift", "Grounds & Pest", "Safety", "Other",
]

# front-desk log drop-down
FD_DEPARTMENTS = ["Maintenance", "Housekeeping", "F&B", "Front Office", "Spa", "IT", "Security", "Guest Relations"]


@dataclass(frozen=True)
class Topic:
    key: str
    category: str        # true category used in the answer key
    wo_category: str     # the *correct* ticketing drop-down value
    department: str      # the *correct* front-desk department
    severity: str        # low | medium | high
    survey_area: str     # survey score column most affected
    scope: str           # room | facility | building | any
    default_location: str = ""   # for facility topics: the facility code
    has_wo: bool = True  # whether maintenance normally opens a ticket
    is_request: bool = False


_T = [
    # key, category, wo_category, department, severity, survey_area, scope, default_location, has_wo, is_request
    ("ac_not_cooling", "hvac", "HVAC", "Maintenance", "high", "room", "room", "", True, False),
    ("ac_noisy", "hvac", "HVAC", "Maintenance", "medium", "room", "room", "", True, False),
    ("ac_dripping", "hvac", "HVAC", "Maintenance", "medium", "room", "room", "", True, False),
    ("no_hot_water", "plumbing", "Plumbing", "Maintenance", "high", "bathroom", "room", "", True, False),
    ("low_pressure", "plumbing", "Plumbing", "Maintenance", "medium", "bathroom", "room", "", True, False),
    ("drain_blocked", "plumbing", "Plumbing", "Maintenance", "medium", "bathroom", "room", "", True, False),
    ("toilet_flush", "plumbing", "Plumbing", "Maintenance", "medium", "bathroom", "room", "", True, False),
    ("ceiling_leak", "plumbing", "Plumbing", "Maintenance", "high", "bathroom", "room", "", True, False),
    ("sewage_smell", "plumbing", "Plumbing", "Maintenance", "medium", "bathroom", "room", "", True, False),
    ("lights_flicker", "electrical", "Electrical", "Maintenance", "low", "room", "room", "", True, False),
    ("safe_stuck", "electrical", "Electrical", "Maintenance", "medium", "room", "room", "", True, False),
    ("tv_broken", "it_tv", "IT / TV", "IT", "low", "room", "room", "", True, False),
    ("keycard_fails", "locks_doors", "Electrical", "Front Office", "medium", "staff", "room", "", True, False),
    ("balcony_door_lock", "locks_doors", "Carpentry & Furniture", "Maintenance", "medium", "room", "room", "", True, False),
    ("noise_music", "noise", "Other", "Guest Relations", "medium", "room", "facility", "BEACHBAR", False, False),
    ("noise_neighbors", "noise", "Other", "Security", "low", "room", "room", "", False, False),
    ("noise_equipment", "noise", "HVAC", "Maintenance", "medium", "room", "building", "", True, False),
    ("room_not_cleaned", "housekeeping", "Housekeeping", "Housekeeping", "medium", "cleanliness", "room", "", False, False),
    ("towels_missing", "housekeeping", "Housekeeping", "Housekeeping", "low", "cleanliness", "room", "", False, False),
    ("mosquitoes", "pest", "Grounds & Pest", "Housekeeping", "medium", "room", "room", "", True, False),
    ("pool_cold", "facilities", "Pool & Spa", "Maintenance", "medium", "pool_beach", "facility", "POOL-INFINITY", True, False),
    ("sunbeds", "facilities", "Other", "Guest Relations", "low", "pool_beach", "facility", "POOL-MAIN", False, False),
    ("pool_cloudy", "facilities", "Pool & Spa", "Maintenance", "medium", "pool_beach", "facility", "POOL-MAIN", True, False),
    ("elevator_stuck", "elevator", "Lift", "Maintenance", "high", "room", "building", "", True, False),
    ("wifi_weak", "it_network", "IT / TV", "IT", "medium", "room", "room", "", True, False),
    ("hammam_cold", "facilities", "Pool & Spa", "Spa", "medium", "spa", "facility", "SPA", True, False),
    ("spa_changing_smell", "facilities", "Housekeeping", "Spa", "low", "spa", "facility", "SPA", True, False),
    ("gym_treadmill", "facilities", "Other", "Maintenance", "low", "spa", "facility", "GYM", True, False),
    ("breakfast_slow", "fnb_service", "Other", "F&B", "medium", "food_beverage", "facility", "REST-ORIZONTAS", False, False),
    ("food_cold", "fnb_service", "Kitchen Equipment", "F&B", "medium", "food_beverage", "facility", "REST-AMMOS", False, False),
    ("bar_warm_drinks", "fnb_service", "Kitchen Equipment", "F&B", "low", "food_beverage", "facility", "BEACHBAR", True, False),
    ("restaurant_hot", "hvac", "HVAC", "F&B", "medium", "food_beverage", "facility", "REST-ELIA", True, False),
    ("bed_uncomfortable", "furniture", "Carpentry & Furniture", "Housekeeping", "medium", "room", "room", "", True, False),
    ("railing_loose", "safety", "Safety", "Maintenance", "high", "room", "room", "", True, False),
    ("minibar_warm", "appliance", "Electrical", "Maintenance", "low", "room", "room", "", True, False),
    ("shower_door", "furniture", "Carpentry & Furniture", "Maintenance", "medium", "bathroom", "room", "", True, False),
    ("jacuzzi_broken", "facilities", "Pool & Spa", "Maintenance", "medium", "room", "room", "", True, False),
    # one-off noise topics
    ("light_bulb", "electrical", "Electrical", "Maintenance", "low", "room", "room", "", True, False),
    ("hairdryer", "appliance", "Electrical", "Housekeeping", "low", "room", "room", "", True, False),
    ("kettle", "appliance", "Electrical", "Housekeeping", "low", "room", "room", "", True, False),
    ("remote", "it_tv", "IT / TV", "Housekeeping", "low", "room", "room", "", True, False),
    ("curtain", "furniture", "Carpentry & Furniture", "Maintenance", "low", "room", "room", "", True, False),
    ("door_squeak", "furniture", "Carpentry & Furniture", "Maintenance", "low", "room", "room", "", True, False),
    ("shower_head", "plumbing", "Plumbing", "Maintenance", "low", "bathroom", "room", "", True, False),
    ("bathroom_fan", "electrical", "Electrical", "Maintenance", "low", "bathroom", "room", "", True, False),
    ("balcony_furniture", "furniture", "Carpentry & Furniture", "Maintenance", "low", "room", "room", "", True, False),
    ("iron", "appliance", "Electrical", "Housekeeping", "low", "room", "room", "", True, False),
    ("late_luggage", "service", "Other", "Front Office", "low", "staff", "room", "", False, False),
    ("slow_checkin", "service", "Other", "Front Office", "low", "staff", "facility", "LOBBY", False, False),
    ("noisy_cleaning", "housekeeping", "Housekeeping", "Housekeeping", "low", "cleanliness", "room", "", False, False),
    ("request_pillows", "request", "Other", "Housekeeping", "low", "staff", "room", "", False, True),
    ("request_cot", "request", "Other", "Housekeeping", "low", "staff", "room", "", False, True),
    ("lost_item", "request", "Other", "Front Office", "low", "staff", "room", "", False, True),
    ("late_checkout", "request", "Other", "Front Office", "low", "staff", "room", "", False, True),
    ("preventive", "preventive", "Other", "Maintenance", "low", "room", "any", "", True, False),
]

TOPICS: dict[str, Topic] = {
    k: Topic(key=k, category=c, wo_category=w, department=d, severity=s, survey_area=a, scope=sc, default_location=dl, has_wo=hw, is_request=rq)
    for (k, c, w, d, s, a, sc, dl, hw, rq) in _T
}

# how often each topic shows up as unrelated background noise
NOISE_WEIGHTS_ROOM = {
    "ac_not_cooling": 6, "ac_noisy": 3, "ac_dripping": 3, "no_hot_water": 4, "low_pressure": 3, "drain_blocked": 4,
    "toilet_flush": 4, "sewage_smell": 1.5, "lights_flicker": 3, "safe_stuck": 5, "tv_broken": 5, "keycard_fails": 5,
    "balcony_door_lock": 2, "noise_neighbors": 3, "room_not_cleaned": 3, "towels_missing": 3, "mosquitoes": 2,
    "wifi_weak": 4, "bed_uncomfortable": 1.5, "minibar_warm": 4, "shower_door": 2, "light_bulb": 7, "hairdryer": 4,
    "kettle": 3, "remote": 6, "curtain": 2, "door_squeak": 2, "shower_head": 3, "bathroom_fan": 2, "balcony_furniture": 2, "iron": 2,
}
NOISE_WEIGHTS_FACILITY = {
    "pool_cloudy": 1, "sunbeds": 3, "breakfast_slow": 3, "food_cold": 3, "bar_warm_drinks": 1.5, "hammam_cold": 1,
    "spa_changing_smell": 1, "gym_treadmill": 1, "restaurant_hot": 1, "noise_music": 2, "pool_cold": 1,
}
NOISE_WEIGHTS_REQUEST = {"request_pillows": 5, "request_cot": 2, "lost_item": 3, "late_checkout": 4, "late_luggage": 2, "slow_checkin": 2, "noisy_cleaning": 2}

SURVEY_COLUMNS = ["overall", "room", "cleanliness", "bathroom", "food_beverage", "staff", "pool_beach", "spa", "value_for_money"]
