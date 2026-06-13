from agents.analytics.analyst import build_deterministic_analysis


def test_deterministic_analysis_matches_report_schema():
    metrics = {
        "brands": {
            "bragoddess": {
                "monthly": [{"access_rate": 0.009}],
            },
            "gentslux": {
                "monthly": [{"access_rate": 0.018}],
            },
        },
        "solutions": {
            "solutions": [{
                "severity": "high",
                "category": "ctr_access",
                "problem": "Access is below guardrail.",
                "root_cause": "The click reason is not sharp enough.",
                "solution": "Tighten the first-scroll promise.",
                "experiment": {
                    "name": "First-scroll click reason",
                    "success_rule": "Beat prior access by 20%.",
                },
            }],
        },
        "campaign_ops": {
            "brands": {
                "bragoddess": {
                    "readiness": "ready",
                    "content_route": {
                        "recommended_type": "Tips & Education",
                        "avg_access_rate": 0.014,
                    },
                },
            },
        },
        "anomalies": [{
            "brand": "bragoddess",
            "metric": "content_type_mismatch",
            "best_type": "Tips & Education",
        }],
    }

    analysis = build_deterministic_analysis(metrics)

    assert analysis["executive_summary"]
    assert analysis["recommendations"][0]["action"] == "First-scroll click reason"
    assert analysis["campaign_suggestions"][0]["recommended_content_type"] == "Tips & Education"
    assert analysis["anomalies_explained"][0]["recommended_action"]
