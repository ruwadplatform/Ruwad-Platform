"""Target type (classification vs. regression) comes from NestJS's own
target registry (GET /ml-data/targets, built in Phase 1C) — never
hardcoded here, so there is exactly one place that decides what a target
IS across the whole platform.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from ..ruwad_client import RuwadClient


class TargetType(str, Enum):
    CLASSIFICATION = "classification"
    REGRESSION = "regression"


@dataclass
class TargetMeta:
    name: str
    group: str
    target_version: str
    window_months: int
    target_type: TargetType


def fetch_target_meta(client: RuwadClient, target: str) -> TargetMeta:
    targets = client.fetch_targets()
    for t in targets:
        if t["name"] == target:
            value_type = t["valueType"]
            return TargetMeta(
                name=t["name"], group=t["group"], target_version=t["targetVersion"], window_months=t["windowMonths"],
                target_type=TargetType.CLASSIFICATION if value_type == "boolean" else TargetType.REGRESSION,
            )
    raise ValueError(f"Unknown target \"{target}\" — not present in GET /ml-data/targets")
