from agents.analytics.campaign_ops import build_campaign_ops_plan


def _brand(access=0.012, optout=0.002, spam=0.0001):
    return {
        "monthly": [{
            "access_rate": access,
            "optout_rate": optout,
            "spam_rate": spam,
        }],
        "segments": [
            {
                "segment": "A,B,C,D (+Yahoo)",
                "n_sends": 10,
                "avg_access_rate": 0.013,
                "avg_cbh_1k": 7.2,
            },
            {
                "segment": "A,B,C,D,F (+Yahoo)",
                "n_sends": 4,
                "avg_access_rate": 0.009,
                "avg_cbh_1k": 4.8,
            },
        ],
        "content_types": [
            {"type": "Tips & Education", "avg_access_rate": 0.011},
            {"type": "Customer Reviews", "avg_access_rate": 0.014},
        ],
    }


def test_campaign_ops_plan_has_brand_readiness_and_filters():
    metrics = {
        "brands": {"bragoddess": _brand()},
        "page_performance": [{
            "cta_url_domain": "bragoddess.com",
            "page_url": "https://bragoddess.com/daisy",
            "stats_access": 100,
            "stats_purchase": 12,
        }],
    }

    plan = build_campaign_ops_plan(metrics)
    brand = plan["brands"]["bragoddess"]

    assert brand["readiness"] == "ready"
    assert brand["audience_filter"]["include"][0] == "A,B,C,D (+Yahoo)"
    assert any("F-segment" in rule for rule in brand["audience_filter"]["exclude"])
    assert brand["content_route"]["recommended_type"] == "Customer Reviews"
    assert brand["measurement_plan"]["page_signal"]["avg_purchase_per_access"] == 0.12


def test_campaign_ops_flags_high_risk_send_as_needs_review():
    metrics = {
        "brands": {"gentslux": _brand(access=0.006, optout=0.008, spam=0.001)},
        "page_performance": [],
    }

    plan = build_campaign_ops_plan(metrics)
    brand = plan["brands"]["gentslux"]

    assert brand["readiness"] == "needs_review"
    assert len(brand["readiness_reasons"]) >= 2
    assert plan["portfolio_status"]["needs_review"] == 1
