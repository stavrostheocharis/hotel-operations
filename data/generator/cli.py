"""``python -m generator --seed 42 --out out/``"""

from __future__ import annotations

import argparse

from .pipeline import run


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="generator", description="Generate one synthetic resort season (exports + answer key).")
    p.add_argument("--seed", type=int, default=42, help="random seed (default 42); same seed -> same files")
    p.add_argument("--out", default="out", help="output directory (default ./out)")
    p.add_argument("--config", default=None, help="resort YAML (default: data/resort.yaml next to the package)")
    p.add_argument("--quiet", action="store_true", help="print nothing")
    a = p.parse_args(argv)
    run(seed=a.seed, out=a.out, config=a.config, quiet=a.quiet)
    return 0
