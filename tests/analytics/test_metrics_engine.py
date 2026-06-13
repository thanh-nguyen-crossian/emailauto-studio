from agents.analytics.metrics_engine import detect_anomalies, BRAND_BENCHMARKS


def _make_brand(monthly=None, content_types=None, segments=None, target=None):
    """Helper: build a minimal brand dict for testing."""
    return {
        "monthly": monthly or [],
        "sends": [],
        "kpi": {},
        "content_types": content_types or [],
        "segments": segments or [],
        "target": target or {},
        "factor_table": [],
        "flow_health": {},
    }


def test_no_anomalies_when_insufficient_data():
    brands = {"bragoddess": _make_brand(monthly=[{"year": "2026", "cbh_per_1k": 7.0, "optout_rate": 0.004}])}
    result = detect_anomalies(brands)
    assert result == []


def test_cbh_pace_anomaly_detected():
    # YTD = 50k, target = 500k, required_monthly = 80k → pace well below
    monthly = [
        {"year": "2026", "month": "2026-01", "cbh_per_1k": 5.0, "optout_rate": 0.004, "CBH": 20000},
        {"year": "2026", "month": "2026-02", "cbh_per_1k": 5.0, "optout_rate": 0.004, "CBH": 15000},
    ]
    target = {"target_2026": 500000, "ytd_2026": 35000, "required_monthly": 80000}
    brands = {"bragoddess": _make_brand(monthly=monthly, target=target)}
    anomalies = detect_anomalies(brands)
    cbh_anomaly = next((a for a in anomalies if a["metric"] == "cbh_monthly_pace"), None)
    assert cbh_anomaly is not None
    assert cbh_anomaly["brand"] == "bragoddess"
    assert cbh_anomaly["severity"] == "high"
    assert cbh_anomaly["current"] < cbh_anomaly["required"]


def test_content_type_mismatch_detected():
    # Tips & Education (best, 8.25 CBH/1K) has only 5 sends vs Sale/Promotion 60 sends
    content_types = [
        {"type": "Tips & Education", "n_sends": 5, "avg_cbh_1k": 8.25},
        {"type": "Sale/Promotion", "n_sends": 60, "avg_cbh_1k": 6.78},
    ]
    monthly = [{"year": "2026", "cbh_per_1k": 6.0, "optout_rate": 0.004}] * 6
    brands = {"bragoddess": _make_brand(monthly=monthly, content_types=content_types)}
    anomalies = detect_anomalies(brands)
    ct_anomaly = next((a for a in anomalies if a["metric"] == "content_type_mismatch"), None)
    assert ct_anomaly is not None
    assert ct_anomaly["best_type"] == "Tips & Education"
    assert ct_anomaly["overused_type"] == "Sale/Promotion"


def test_f_segment_anomaly_detected():
    # F-segment sends = 20 out of 100 total (20% > 15% threshold)
    segments = [
        {"segment": "A,B,C,D", "n_sends": 80, "avg_cbh_1k": 7.0},
        {"segment": "A,B,C,D,F", "n_sends": 20, "avg_cbh_1k": 5.0},
    ]
    monthly = [{"year": "2026", "cbh_per_1k": 6.0, "optout_rate": 0.004}] * 6
    brands = {"bragoddess": _make_brand(monthly=monthly, segments=segments)}
    anomalies = detect_anomalies(brands)
    f_anomaly = next((a for a in anomalies if a["metric"] == "f_segment_share"), None)
    assert f_anomaly is not None
    assert f_anomaly["f_share_pct"] == 20.0


def test_brand_benchmarks_have_all_four_brands():
    assert set(BRAND_BENCHMARKS.keys()) == {"bragoddess", "gentslux", "luxfitting", "santafare"}
    for brand, b in BRAND_BENCHMARKS.items():
        assert "best_content_type" in b
        assert "best_cbh_1k" in b
        assert "overused_type" in b
