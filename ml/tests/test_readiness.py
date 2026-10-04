from __future__ import annotations

import pytest

from app.validation.readiness import DatasetNotReadyError, check_readiness, require_ready


def _readiness_body(ready: bool, reasons=None):
    return {
        "readinessVersion": 2, "ready": ready, "target": "raisedNewRoundWithin12Months", "usableExamples": 12 if ready else 3,
        "positiveExamples": 6 if ready else 1, "negativeExamples": 6 if ready else 2, "featureCoverage": 0.9 if ready else 0.3,
        "reasons": reasons or ([] if ready else ["Fewer than the minimum usable examples", "Core feature coverage below threshold"]),
    }


def test_check_readiness_parses_the_api_response(fake_client):
    fake_client._readiness = {"raisedNewRoundWithin12Months": _readiness_body(True)}
    report = check_readiness(fake_client, "raisedNewRoundWithin12Months")
    assert report.ready is True
    assert report.usable_examples == 12


def test_require_ready_passes_through_when_ready(fake_client):
    fake_client._readiness = {"raisedNewRoundWithin12Months": _readiness_body(True)}
    report = require_ready(fake_client, "raisedNewRoundWithin12Months")
    assert report.ready is True


def test_require_ready_raises_with_exact_reasons_when_not_ready(fake_client):
    fake_client._readiness = {"raisedNewRoundWithin12Months": _readiness_body(False)}
    with pytest.raises(DatasetNotReadyError) as excinfo:
        require_ready(fake_client, "raisedNewRoundWithin12Months")
    message = str(excinfo.value)
    assert "Fewer than the minimum usable examples" in message
    assert "Core feature coverage below threshold" in message
    assert excinfo.value.report.ready is False


def test_a_report_that_is_not_readiness_v2_never_passes_the_gate(fake_client):
    body = _readiness_body(True)
    del body["readinessVersion"]  # an older backend / legacy V1 report
    fake_client._readiness = {"raisedNewRoundWithin12Months": body}
    with pytest.raises(DatasetNotReadyError) as excinfo:
        require_ready(fake_client, "raisedNewRoundWithin12Months")
    assert "Readiness V2" in str(excinfo.value)
    body["readinessVersion"] = 1
    with pytest.raises(DatasetNotReadyError):
        require_ready(fake_client, "raisedNewRoundWithin12Months")
