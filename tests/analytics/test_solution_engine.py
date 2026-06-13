from agents.analytics.solution_engine import build_solution_plan


def _brand(access=0.012, optout=0.002, spam=0.0001):
    return {
        "monthly": [{
            "month": "2026-05",
            "month_num": 5,
            "open_rate": 0.45,
            "access_rate": access,
            "optout_rate": optout,
            "spam_rate": spam,
        }],
        "content_types": [
            {"type": "Tips & Education", "n_sends": 4, "avg_access_rate": 0.014},
            {"type": "Sale / Promotion", "n_sends": 12, "avg_access_rate": 0.007},
        ],
    }


def test_solution_plan_flags_low_access_with_experiment_and_guardrails():
    metrics = {
        "brands": {"bragoddess": _brand(access=0.0065)},
        "page_performance": [{
            "cta_url_domain": "bragoddess.com",
            "page_url": "https://bragoddess.com/daisy",
            "stats_access": 100,
            "stats_purchase": 11,
        }],
        "anomalies": [],
    }

    plan = build_solution_plan(metrics)
    access_solutions = [
        item for item in plan["solutions"]
        if item["brand_slug"] == "bragoddess" and item["category"] == "ctr_access"
    ]

    assert access_solutions
    solution = access_solutions[0]
    assert solution["experiment"]["primary_metric"] == "Access/Delivered"
    assert "Optout/Delivered" in solution["experiment"]["guardrails"]
    assert "Spam/Delivered" in solution["experiment"]["guardrails"]
    assert any("Open rate" in point for point in solution["evidence"])


def test_solution_plan_flags_list_health_pressure():
    metrics = {
        "brands": {"gentslux": _brand(access=0.018, optout=0.006, spam=0.0006)},
        "page_performance": [],
        "anomalies": [],
    }

    plan = build_solution_plan(metrics)
    health = [
        item for item in plan["solutions"]
        if item["brand_slug"] == "gentslux" and item["category"] == "list_health"
    ]

    assert health
    assert health[0]["severity"] == "high"
    assert "suppress" in health[0]["solution"].lower() or "Suppress" in health[0]["solution"]


def test_solution_plan_adds_portfolio_priorities():
    metrics = {
        "brands": {
            "bragoddess": _brand(access=0.0065),
            "luxfitting": _brand(access=0.012),
        },
        "page_performance": [{
            "cta_url_domain": "luxfitting.com",
            "page_url": "https://luxfitting.com/ella",
            "stats_access": 50,
            "stats_purchase": 6,
        }],
        "anomalies": [],
    }

    plan = build_solution_plan(metrics)

    assert plan["portfolio_priorities"]
    assert any("CTR/access" in item for item in plan["portfolio_priorities"])


def test_solution_plan_avoids_sale_route_when_non_sale_access_is_close():
    metrics = {
        "brands": {
            "luxfitting": {
                "monthly": [{
                    "month": "2026-05",
                    "month_num": 5,
                    "open_rate": 0.48,
                    "access_rate": 0.007,
                    "optout_rate": 0.002,
                    "spam_rate": 0.0001,
                }],
                "content_types": [
                    {"type": "Sale / Promotion", "n_sends": 60, "avg_access_rate": 0.0104, "avg_cbh_1k": 5.1},
                    {"type": "Birthday / Occasion", "n_sends": 3, "avg_access_rate": 0.0101, "avg_cbh_1k": 5.9},
                ],
            }
        },
        "page_performance": [],
        "anomalies": [],
    }

    plan = build_solution_plan(metrics)
    content_solution = next(
        item for item in plan["solutions"]
        if item["brand_slug"] == "luxfitting" and item["experiment"]["name"].endswith("access lift")
    )

    assert "Birthday / Occasion" in content_solution["experiment"]["name"]
