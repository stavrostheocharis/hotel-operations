"""Smoke test: regenerate with a fixed seed and check counts, ids, formats and determinism."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pandas as pd
import pytest

from generator.pipeline import run

SEED = 42
MONTHS = ["April", "May", "June", "July", "August", "September", "October"]
WO_COLUMNS = ["Ticket No", "Created", "Closed", "Location", "Category", "Description", "Closure Note", "Technician", "Status", "Priority", "Reported By", "Reopened"]
FD_COLUMNS = ["#", "Date", "Time", "Room", "Guest comment (original)", "Agent note", "Dept", "Resolution", "Shift"]
SURVEY_COLUMNS = ["response_id", "reservation_no", "checkout_date", "language", "overall", "room", "cleanliness", "bathroom", "food_beverage", "staff", "pool_beach", "spa", "value_for_money", "nps", "comment", "would_recommend"]
STAY_COLUMNS = ["reservation_no", "room", "check_in", "check_out", "nights", "adults", "children", "nationality", "market_segment", "board", "booked_on"]
ROOM_COLUMNS = ["room_code", "building", "building_name", "floor", "room_type", "view", "is_villa"]
OCC_COLUMNS = ["date", "building", "rooms_available", "rooms_occupied", "occupancy_pct", "arrivals", "departures"]
REVIEW_KEYS = {
    "google": {"platform", "review_id", "date", "rating", "language", "text", "owner_reply"},
    "booking": {"platform", "review_id", "date", "score", "title", "positive", "negative", "language", "traveler_type", "room_type_stayed", "nights", "stay_month"},
    "tripadvisor": {"platform", "review_id", "published", "date_of_stay", "rating", "title", "text", "language", "trip_type"},
}


@pytest.fixture(scope="session")
def season(tmp_path_factory):
    out = tmp_path_factory.mktemp("season")
    res = run(seed=SEED, out=out, quiet=True)
    return out, res


def _load(out: Path):
    wo = pd.read_csv(out / "work_orders.csv", sep=";", encoding="utf-8-sig", dtype=str).fillna("")
    sheets = pd.read_excel(out / "front_desk_log.xlsx", sheet_name=None, header=2)
    fd = pd.concat(sheets.values(), ignore_index=True)
    sv = pd.read_csv(out / "surveys.csv", dtype=str).fillna("")
    rv = json.load(open(out / "reviews.json", encoding="utf-8"))
    key = json.load(open(out / "answer_key.json", encoding="utf-8"))
    return wo, sheets, fd, sv, rv, key


def test_runs_quickly_and_writes_every_file(season):
    out, res = season
    assert res.seconds < 60
    for name in ["work_orders.csv", "front_desk_log.xlsx", "surveys.csv", "reviews.json", "rooms.csv", "facilities.csv", "equipment.csv", "stays.csv", "occupancy_daily.csv", "answer_key.json"]:
        assert (out / name).exists(), name


def test_row_counts(season):
    out, res = season
    c = res.counts
    assert c["rooms.csv"] == 298
    assert c["facilities.csv"] == 11
    assert c["equipment.csv"] == 25
    assert c["occupancy_daily.csv"] == 214 * 5
    assert 6000 <= c["stays.csv"] <= 10000
    assert 800 <= c["work_orders.csv"] <= 1600
    assert 300 <= c["front_desk_log.xlsx"] <= 900
    assert 1800 <= c["surveys.csv"] <= 3500
    assert 400 <= c["reviews.json"] <= 1000


def test_formats_are_stable(season):
    out, _ = season
    raw = (out / "work_orders.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf"), "work_orders.csv is a BOM-prefixed Excel-style export"
    assert b";" in raw.split(b"\r\n")[0] and b"\r\n" in raw
    wo, sheets, fd, sv, rv, key = _load(out)
    assert list(wo.columns) == WO_COLUMNS
    assert list(sheets) == MONTHS
    for df in sheets.values():
        assert list(df.columns) == FD_COLUMNS
    assert list(sv.columns) == SURVEY_COLUMNS
    assert list(pd.read_csv(out / "stays.csv", nrows=1).columns) == STAY_COLUMNS
    assert list(pd.read_csv(out / "rooms.csv", nrows=1).columns) == ROOM_COLUMNS
    assert list(pd.read_csv(out / "occupancy_daily.csv", nrows=1).columns) == OCC_COLUMNS
    assert set(rv) == {"property", "source", "count", "reviews"}
    for r in rv["reviews"]:
        assert set(r) == REVIEW_KEYS[r["platform"]], r
    assert set(key) == {"generator_version", "seed", "resort", "season", "how_to_read", "stats", "issues", "signals"}
    assert re.fullmatch(r"\d{2}/\d{2}/\d{4} \d{2}:\d{2}", wo["Created"].iloc[0])


def test_every_answer_key_signal_exists_in_an_export(season):
    out, _ = season
    wo, sheets, fd, sv, rv, key = _load(out)
    ids = {
        "work_orders.csv": set(wo["Ticket No"]),
        "front_desk_log.xlsx": set(fd["#"].astype(int).astype(str)),
        "surveys.csv": set(sv["response_id"]),
        "reviews.json": set(r["review_id"] for r in rv["reviews"]),
    }
    missing = [s["signal_id"] for s in key["signals"] if s["record_id"] not in ids[s["source_file"]]]
    assert not missing, missing[:10]
    assert len({s["signal_id"] for s in key["signals"]}) == len(key["signals"])
    # and the other way round: every export row is described in the key
    total_rows = sum(len(v) for v in ids.values())
    assert total_rows == len(key["signals"])


def test_planted_issues(season):
    out, _ = season
    key = json.load(open(out / "answer_key.json", encoding="utf-8"))
    issues = key["issues"]
    assert 40 <= len(issues) <= 45
    for i in issues:
        assert 2 <= i["signal_count"] <= 8, i["issue_id"]
        assert len({s.split("-")[0] for s in i["signal_ids"]}) >= 2, f"{i['issue_id']} is not spread across exports"
        assert i["fix_held"] in (True, False, None)
    kinds = {i["scenario"] for i in issues}
    assert {"same_room_repeat", "shared_cause_cluster", "fix_not_held", "long_unresolved", "ops_recurring", "cross_room_leak", "equipment_repeat"} <= kinds
    by_issue = {}
    for s in key["signals"]:
        if s["issue_id"]:
            by_issue.setdefault(s["issue_id"], []).append(s)
    assert set(by_issue) == {i["issue_id"] for i in issues}
    roles = key["stats"]["by_role"]
    assert roles["noise"] > 10 * roles["planted"], "plenty of background noise"
    assert roles["distractor"] >= 10 and roles["duplicate"] >= 10
    assert any(s["duplicate_of"] for s in key["signals"])


def test_timestamps_consistent_with_stays(season):
    out, _ = season
    wo, sheets, fd, sv, rv, key = _load(out)
    stays = pd.read_csv(out / "stays.csv", parse_dates=["check_in", "check_out"]).set_index("reservation_no")
    for s in key["signals"]:
        if s["stay_id"] is None:
            continue
        row = stays.loc[s["stay_id"]]
        ts = pd.Timestamp(s["timestamp"]).normalize()
        if s["source_file"] == "front_desk_log.xlsx":
            assert row.check_in <= ts < row.check_out, s
        else:
            assert ts >= row.check_out, s
    created = pd.to_datetime(wo["Created"], format="%d/%m/%Y %H:%M")
    closed = pd.to_datetime(wo["Closed"].replace("", None), format="%d/%m/%Y %H:%M")
    assert not (closed < created).any()


def test_deterministic_across_runs(season, tmp_path):
    out, _ = season
    again = tmp_path / "again"
    run(seed=SEED, out=again, quiet=True)
    for f in sorted(out.iterdir()):
        if f.suffix == ".xlsx":
            a = pd.read_excel(f, sheet_name=None, header=2)
            b = pd.read_excel(again / f.name, sheet_name=None, header=2)
            assert list(a) == list(b) and all(a[k].equals(b[k]) for k in a), f.name
        else:
            assert hashlib.sha256(f.read_bytes()).hexdigest() == hashlib.sha256((again / f.name).read_bytes()).hexdigest(), f.name


def test_other_seed_gives_other_data(season, tmp_path):
    out, _ = season
    other = tmp_path / "seed7"
    run(seed=7, out=other, quiet=True)
    assert (out / "work_orders.csv").read_bytes() != (other / "work_orders.csv").read_bytes()
    key7 = json.load(open(other / "answer_key.json", encoding="utf-8"))
    assert len(key7["issues"]) == 42


def test_no_personal_data(season):
    out, _ = season
    wo, sheets, fd, sv, rv, key = _load(out)
    blob = "\n".join([wo.to_csv(index=False), fd.to_csv(index=False), sv.to_csv(index=False), json.dumps(rv, ensure_ascii=False)])
    assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", blob)
    assert not re.search(r"\+\d{2}\s?\d{3}\s?\d{3}\s?\d{3,4}", blob)
    for col in ["Technician", "Reported By"]:
        assert wo[col].str.fullmatch(r"[A-Z&\- /a-z]+(-\d+)?|HK-SUP|IT-01|EXT-[A-Z]+|T-\d{2}").all()
