"""The hidden answer key the linking engine is scored against."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from . import __version__
from .config import Config
from .model import Issue, Signal

SOURCE_FILES = {"work_order": "work_orders.csv", "front_desk": "front_desk_log.xlsx", "survey": "surveys.csv", "review": "reviews.json"}
RECORD_FIELD = {"work_order": "Ticket No", "front_desk": "# (column A, any monthly sheet)", "survey": "response_id", "review": "review_id"}


def build_answer_key(cfg: Config, seed: int, issues: list[Issue], signals: list[Signal]) -> dict:
    by_uid = {s.uid: s for s in signals}
    sig_rows = []
    for s in sorted(signals, key=lambda s: (s.ts, s.uid)):
        sig_rows.append(
            {
                "signal_id": s.export_id,
                "source_file": SOURCE_FILES[s.source],
                "record_id": s.record_id,
                "issue_id": s.issue_id,
                "role": s.role,
                "true_location": s.location,
                "true_location_type": s.location_type,
                "true_category": s.category,
                "topic": s.topic,
                "stay_id": s.stay_id,
                "timestamp": s.ts.isoformat(timespec="minutes"),
                "language": s.language,
                "duplicate_of": by_uid[s.duplicate_of].export_id if s.duplicate_of else None,
                "distractor_for": s.distractor_for or None,
                "note": s.note or None,
            }
        )
    issue_rows = []
    for i in issues:
        sigs = sorted(i.signals, key=lambda s: s.ts)
        issue_rows.append(
            {
                "issue_id": i.issue_id,
                "scenario": i.scenario,
                "title": i.title,
                "category": i.category,
                "topic": i.topic,
                "severity": i.severity,
                "root_cause": {"type": i.root_cause_type, "location": i.root_cause_location, "description": i.root_cause_description},
                "affected_locations": i.affected_locations,
                "first_signal": sigs[0].ts.isoformat(timespec="minutes"),
                "last_signal": sigs[-1].ts.isoformat(timespec="minutes"),
                "recurred": i.recurred,
                "fix_held": i.fix_held,
                "resolved_by_season_end": i.resolved_by_season_end,
                "status_at_season_end": i.status_at_season_end,
                "signal_ids": [s.export_id for s in sigs],
                "work_order_ids": [s.record_id for s in sigs if s.source == "work_order"],
                "signal_count": len(sigs),
                "notes": i.notes or None,
            }
        )
    roles = Counter(s.role for s in signals)
    return {
        "generator_version": __version__,
        "seed": seed,
        "resort": cfg.resort_name,
        "season": {"open": cfg.season_open.isoformat(), "close": cfg.season_close.isoformat()},
        "how_to_read": {
            "signal_id": "'<prefix>-<record_id>' where prefix is WO (work_orders.csv Ticket No), FD (front_desk_log.xlsx column #), SV (surveys.csv response_id) or RV (reviews.json review_id).",
            "issue_id": "null for background noise; distractors are noise too (issue_id null) but name the issue they resemble in distractor_for.",
            "role": "planted = part of an issue; noise = unrelated one-off; distractor = unrelated one-off deliberately placed near an issue; duplicate = second ticket for the same noise problem (see duplicate_of).",
            "true_location": "room code (rooms.csv), facility code (facilities.csv), equipment id (equipment.csv), a building code (A-D, V) or a floor code like 'B/3'.",
            "fix_held": "true/false for the final recorded fix; null when no fix was ever recorded (process issues, open tickets).",
            "stay_id": "reservation_no in stays.csv; filled for front-desk, survey and review signals; the room can be resolved from stays.csv.",
        },
        "stats": {
            "issues": len(issues),
            "signals_total": len(signals),
            "by_role": dict(roles),
            "by_source": dict(Counter(s.source for s in signals)),
            "planted_by_source": dict(Counter(s.source for s in signals if s.role == "planted")),
            "scenarios": dict(Counter(i.scenario for i in issues)),
        },
        "issues": issue_rows,
        "signals": sig_rows,
    }


def write_answer_key(path: Path, key: dict) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(key, fh, ensure_ascii=False, indent=1)
