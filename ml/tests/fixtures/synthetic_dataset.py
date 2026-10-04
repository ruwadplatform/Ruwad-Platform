"""Synthetic, clearly-fake dataset generator — TEST_ONLY, never used by a
real training run (app/training/dataset.py has no code path that touches
this file at all; only train.py's CLI imports it, and only when the caller
passes --test-only). Exists purely so the full pipeline (split -> baselines
-> CatBoost -> XGBoost -> evaluate -> calibrate -> explain -> registry ->
inference) can be exercised end-to-end without ever training on
insufficient/fake data as if it were real.

Deterministic (fixed seed) so tests are reproducible. Produces a genuine
(weak, noisy) signal between a handful of features and the target so
trained models aren't purely random — useful for asserting "the model beat
the baseline" in tests without needing a huge dataset.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml_features import ML_FEATURES_V1
from app.training.target_types import TargetMeta, TargetType

REGULATORY_MILESTONES = ["PRECLINICAL", "IRB_APPROVED", "CE_MARK", "FDA_CLEARED", "SFDA_REGISTERED"]


def build_synthetic_dataset(target_meta: TargetMeta, *, n_startups: int = 90, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    base_date = pd.Timestamp("2024-01-01", tz="UTC")

    for i in range(n_startups):
        startup_id = f"synthetic-startup-{i:04d}"
        n_snapshots = int(rng.integers(1, 3))
        cohort_offset_days = int(rng.integers(0, 540))
        annual_revenue = float(rng.lognormal(mean=11.0, sigma=1.2))
        customer_growth_rate = float(rng.normal(0.15, 0.25))
        runway_months = float(rng.uniform(2, 30))
        founder_experience_years = float(rng.uniform(0, 25))

        for s in range(n_snapshots):
            snapshot_at = base_date + pd.Timedelta(days=cohort_offset_days + s * 90)
            row: dict = {
                "startupId": startup_id,
                "snapshotId": f"{startup_id}-snap-{s}",
                "snapshotAt": snapshot_at.isoformat(),
            }
            for feature in ML_FEATURES_V1:
                row[feature] = _synthetic_feature_value(rng, feature, annual_revenue, customer_growth_rate, runway_months, founder_experience_years)

            signal = (
                0.6 * np.tanh(customer_growth_rate)
                + 0.3 * np.tanh((runway_months - 12) / 12)
                + 0.2 * np.tanh((founder_experience_years - 8) / 8)
                + float(rng.normal(0, 0.8))
            )
            target_col = f"target_{target_meta.name}"
            if target_meta.target_type is TargetType.CLASSIFICATION:
                row[target_col] = bool(signal > 0)
            else:
                row[target_col] = round(50.0 + signal * 20.0, 2)
            rows.append(row)

    df = pd.DataFrame(rows)
    target_col = f"target_{target_meta.name}"
    if target_meta.target_type is TargetType.CLASSIFICATION:
        df[target_col] = df[target_col].astype(bool).astype(int)
    else:
        df[target_col] = df[target_col].astype(float)
    return df


def _synthetic_feature_value(rng: np.random.Generator, feature: str, annual_revenue: float, customer_growth_rate: float, runway_months: float, founder_experience_years: float):
    # A handful of missing values are injected deliberately (never for the
    # target column) so preprocessing's missing-value handling is exercised.
    if rng.random() < 0.08:
        return None

    if feature == "regulatoryMilestone":
        return rng.choice(REGULATORY_MILESTONES)
    if feature in ("previousStartupExperience", "clinicalData", "clinicalValidation", "proprietaryTechnology"):
        return bool(rng.random() < 0.4)
    if feature == "annualRevenue":
        return round(annual_revenue, 2)
    if feature == "customerGrowthRate":
        return round(customer_growth_rate, 4)
    if feature == "runwayMonths":
        return round(runway_months, 1)
    if feature == "founderExperienceYears":
        return round(founder_experience_years, 1)
    if feature in ("tam", "sam", "som", "totalFundingRaised", "cashAvailable", "monthlyBurn"):
        return round(float(rng.lognormal(mean=9.0, sigma=1.5)), 2)
    if feature in ("competitionLevel", "technologyReadinessLevel", "leadershipCompleteness", "technicalTeamStrength", "commercialTeamStrength", "technicalComplexity", "replicationDifficulty"):
        return int(rng.integers(1, 10))
    return round(float(rng.uniform(0, 100)), 2)
