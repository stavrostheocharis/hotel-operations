"""Orchestrates one full generation run."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from .answer_key import build_answer_key, write_answer_key
from .config import Config, load_config
from .exporters import assign_ids, write_front_desk, write_master_data, write_reviews, write_surveys, write_work_orders
from .locations import build_locations
from .noise import generate_noise
from .render import Renderer
from .rng import Rng
from .scenarios import plant_all
from .stays import World, generate_stays, occupancy_daily


@dataclass
class RunResult:
    out_dir: Path
    seed: int
    counts: dict[str, int] = field(default_factory=dict)
    issues: int = 0
    signals: int = 0
    seconds: float = 0.0


def run(seed: int = 42, out: str | Path = "out", config: str | Path | None = None, quiet: bool = False) -> RunResult:
    t0 = time.time()
    cfg: Config = load_config(config)
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = Rng(seed)

    loc = build_locations(cfg, rng.spawn("locations"))
    stays = generate_stays(cfg, loc, rng)
    world = World(cfg, loc, stays)
    R = Renderer(loc, rng.spawn("render"))
    B = plant_all(cfg, world, R, rng)
    generate_noise(cfg, world, B)
    assign_ids(B.signals, rng)

    counts = write_master_data(out_dir, loc, stays, occupancy_daily(cfg, loc, stays))
    counts["work_orders.csv"] = write_work_orders(out_dir / "work_orders.csv", B.signals)
    counts["front_desk_log.xlsx"] = write_front_desk(out_dir / "front_desk_log.xlsx", B.signals, cfg)
    counts["surveys.csv"] = write_surveys(out_dir / "surveys.csv", B.signals, world.by_id, rng)
    counts["reviews.json"] = write_reviews(out_dir / "reviews.json", B.signals, world.by_id, loc, cfg, rng)
    key = build_answer_key(cfg, seed, B.issues, B.signals)
    write_answer_key(out_dir / "answer_key.json", key)
    counts["answer_key.json"] = len(key["signals"])

    res = RunResult(out_dir=out_dir, seed=seed, counts=counts, issues=len(B.issues), signals=len(B.signals), seconds=round(time.time() - t0, 2))
    if not quiet:
        print(f"{cfg.resort_name} - season {cfg.season_open} to {cfg.season_close} - seed {seed}")
        for name, n in counts.items():
            print(f"  {name:<22} {n:>6} rows")
        st = key["stats"]
        print(f"  planted issues: {st['issues']}  signals by role: {st['by_role']}")
        print(f"  written to {out_dir.resolve()} in {res.seconds}s")
    return res
