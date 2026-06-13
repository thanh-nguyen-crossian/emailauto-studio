import pytest
import json
from pathlib import Path
from agents.analytics.data_reader import extract_js_data_object, BRAND_MAP


def test_extract_js_data_object_basic():
    html = """
    <html>
    <script>
    const DATA = {"key": "value", "nested": {"a": 1}};
    </script>
    </html>
    """
    result = extract_js_data_object(html)
    assert result == {"key": "value", "nested": {"a": 1}}


def test_extract_js_data_object_with_braces_in_strings():
    html = 'const DATA = {"msg": "hello {world}", "n": 42};'
    result = extract_js_data_object(html)
    assert result["msg"] == "hello {world}"
    assert result["n"] == 42


def test_extract_js_data_object_missing_raises():
    with pytest.raises(ValueError, match="No 'const DATA =' found"):
        extract_js_data_object("<html>no data here</html>")


def test_brand_map_has_all_four_brands():
    assert set(BRAND_MAP.keys()) == {"bragoddess", "gentslux", "luxfitting", "santafare"}
    assert BRAND_MAP["bragoddess"] == "Bra Goddess"


import tempfile, os
from agents.analytics.data_reader import read_page_performance


def test_read_page_performance_skips_sep_row(tmp_path, monkeypatch):
    """CSV files start with 'sep=,' BOM line — must be skipped."""
    csv_content = (
        '\xef\xbb\xbfsep=,\n'
        '"publisher_email","page_url","page_version","publisher_type","publisher_team",'
        '"cta_url_domain","pbase_line","pbase_code","version_note","page_note",'
        '"stats_access","stats_view","stats_addtocart","stats_initcheckout","stats_checkout",'
        '"stats_purchase","stats_access_error","stats_initcheckout_error","stats_checkout_error",'
        '"stats_revenue","stats_purchase_abandon","stats_revenue_abandon","stats_taken_amount",'
        '"stats_cost_total","stats_tax_amount"\n'
        'Total: 5,,,,,,,,,,100,90,20,15,12,10,0,0,0,400,,,,\n'
        ',https://bragoddess.com/testbra,A,RMKT,,bragoddess.com,Bra,TestBra,,,'
        '50,45,10,8,6,5,0,0,0,200,,,,\n'
    )
    csv_file = tmp_path / "Page performance Test 2026.csv"
    csv_file.write_bytes(csv_content.encode("utf-8-sig"))

    # Monkeypatch SOURCE_DIR to point to tmp_path
    import agents.analytics.data_reader as dr
    original = dr.SOURCE_DIR
    dr.SOURCE_DIR = tmp_path
    try:
        records = read_page_performance()
    finally:
        dr.SOURCE_DIR = original

    # Should have parsed the data row (not Total row, not header)
    assert len(records) >= 1
    row = records[0]
    assert row["cta_url_domain"] == "bragoddess.com"
    assert row["pbase_line"] == "Bra"
    assert row["stats_purchase"] == 5.0


SOURCE_EXISTS = Path("Source/rmkt_email_dashboard.html").exists()


@pytest.mark.skipif(not SOURCE_EXISTS, reason="Source/ files not present")
def test_build_metrics_has_all_brands():
    from agents.analytics.data_reader import build_metrics
    metrics = build_metrics()
    assert "brands" in metrics
    assert "generated_at" in metrics
    assert set(metrics["brands"].keys()) == {"bragoddess", "gentslux", "luxfitting", "santafare"}
    for brand, data in metrics["brands"].items():
        assert "monthly" in data, f"{brand} missing 'monthly'"
        assert "content_types" in data, f"{brand} missing 'content_types'"
        assert "target" in data, f"{brand} missing 'target'"
        assert len(data["monthly"]) > 0, f"{brand} monthly list is empty"


@pytest.mark.skipif(not SOURCE_EXISTS, reason="Source/ files not present")
def test_build_metrics_target_fields():
    from agents.analytics.data_reader import build_metrics
    metrics = build_metrics()
    bg = metrics["brands"]["bragoddess"]
    target = bg["target"]
    assert "target_2026" in target
    assert "ytd_2026" in target
    assert "required_monthly" in target
    assert target["target_2026"] > 0


@pytest.mark.skipif(not SOURCE_EXISTS, reason="Source/ files not present")
def test_build_metrics_filters_timeline_and_records_scope():
    from agents.analytics.data_reader import build_metrics
    metrics = build_metrics(
        selected_sources=["master_plan", "page_performance"],
        selected_sheets=["2026 Forecast", "Schedule"],
        start_month="2025-11",
        end_month="2026-04",
    )

    assert metrics["analysis_scope"]["sources"] == ["master_plan", "page_performance"]
    assert metrics["analysis_scope"]["sheets"] == ["2026 Forecast", "Schedule"]
    assert metrics["analysis_scope"]["start_month"] == "2025-11"
    assert metrics["analysis_scope"]["end_month"] == "2026-04"

    months = {
        row["month"]
        for data in metrics["brands"].values()
        for row in data["monthly"]
    }
    assert months
    assert min(months) >= "2025-11"
    assert max(months) <= "2026-04"
