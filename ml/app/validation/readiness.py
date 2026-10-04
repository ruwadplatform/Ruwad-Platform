"""Readiness gate — the ONE thing standing between "we have data" and
"we're allowed to train a real model." Queries the backend's existing
MlReadinessService (built in Phase 1C, backend/src/ml-data/ml-readiness.
service.ts) rather than re-implementing the same thresholds/logic here —
single source of truth stays in NestJS.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..ruwad_client import RuwadClient


# The meaning of "ready" changed in Readiness V2 (training-eligible snapshots only, attested outcome
# coverage for negatives, applicability-aware core-feature coverage). A real run only trusts a report that
# says it is V2 — an older backend (or a cached/legacy V1 report) can never green-light training.
REQUIRED_READINESS_VERSION = 2


class DatasetNotReadyError(Exception):
    """Raised when the readiness gate blocks training. Carries the full
    report so the caller can print exactly why, never just "not ready"."""

    def __init__(self, report: "ReadinessReport"):
        self.report = report
        reasons = "\n".join(f"  - {r}" for r in report.reasons)
        super().__init__(
            f"Training blocked.\n\nTarget: {report.target}\n"
            f"Usable examples: {report.usable_examples}\n"
            f"Positive: {report.positive_examples}\nNegative: {report.negative_examples}\n"
            f"Core feature coverage: {report.feature_coverage * 100:.0f}%\n\nReasons:\n{reasons}"
        )


@dataclass
class ReadinessReport:
    ready: bool
    target: str
    usable_examples: int
    positive_examples: int
    negative_examples: int
    feature_coverage: float
    reasons: list[str]
    readiness_version: int = 0

    @staticmethod
    def from_api(body: dict) -> "ReadinessReport":
        return ReadinessReport(
            ready=bool(body["ready"]), target=body["target"],
            usable_examples=int(body["usableExamples"]), positive_examples=int(body["positiveExamples"]),
            negative_examples=int(body["negativeExamples"]), feature_coverage=float(body["featureCoverage"]),
            reasons=list(body.get("reasons", [])),
            readiness_version=int(body.get("readinessVersion", 0)),
        )


def check_readiness(client: RuwadClient, target: str) -> ReadinessReport:
    return ReadinessReport.from_api(client.fetch_readiness(target))


def require_ready(client: RuwadClient, target: str) -> ReadinessReport:
    """Raises DatasetNotReadyError if not ready — the CLI's --test-only mode
    is the ONLY code path that skips this function entirely (see train.py);
    it is never bypassed for a real training run."""
    report = check_readiness(client, target)
    if report.readiness_version != REQUIRED_READINESS_VERSION:
        report.ready = False
        report.reasons = [
            f"Backend reported readiness version {report.readiness_version or "unknown"}; real training requires Readiness V{REQUIRED_READINESS_VERSION}",
            *report.reasons,
        ]
        raise DatasetNotReadyError(report)
    if not report.ready:
        raise DatasetNotReadyError(report)
    return report
