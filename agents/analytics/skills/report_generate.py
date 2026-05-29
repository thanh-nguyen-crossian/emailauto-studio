"""
report_generate — Calls Claude API to produce a weekly performance narrative.

Takes the combined outputs of kpi_compute, anomaly_detect, rfm_track, and flow_monitor,
feeds them to Claude with the report_generate.md prompt, and delivers the report
to configured outputs (Slack webhook, email, or file).
"""

import json
import os
from pathlib import Path
from typing import Any

import anthropic


MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1024
PROMPT_PATH = Path(__file__).parent / "report_generate.md"


def _build_system_prompt() -> str:
    return PROMPT_PATH.read_text()


def _build_user_message(payload: dict) -> str:
    return (
        f"Generate the weekly performance report for the week ending {payload['week_ending']}.\n\n"
        f"```json\n{json.dumps(payload, indent=2)}\n```"
    )


def generate_report(
    week_ending: str,
    kpi_report: dict,
    anomaly_report: dict,
    rfm_reports: list[dict],
    flow_reports: list[dict],
    api_key: str | None = None,
) -> str:
    client = anthropic.Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])

    payload = {
        "week_ending": week_ending,
        "kpi_report": kpi_report,
        "anomaly_report": anomaly_report,
        "rfm_report": rfm_reports,
        "flow_report": flow_reports,
    }

    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=_build_system_prompt(),
        messages=[{"role": "user", "content": _build_user_message(payload)}],
    )
    return message.content[0].text


def deliver_report(report_text: str, output_config: dict) -> None:
    """Route the report to configured destinations."""
    if slack_url := output_config.get("slack_webhook"):
        import urllib.request
        body = json.dumps({"text": report_text}).encode()
        req = urllib.request.Request(slack_url, data=body, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)

    if file_path := output_config.get("file"):
        Path(file_path).write_text(report_text)

    if output_config.get("stdout"):
        print(report_text)


def run(
    week_ending: str,
    kpi_path: str | Path,
    anomaly_path: str | Path,
    rfm_paths: list[str | Path],
    flow_paths: list[str | Path],
    output_config: dict | None = None,
    api_key: str | None = None,
) -> str:
    kpi = json.loads(Path(kpi_path).read_text())
    anomaly = json.loads(Path(anomaly_path).read_text())
    rfm = [json.loads(Path(p).read_text()) for p in rfm_paths]
    flows = [json.loads(Path(p).read_text()) for p in flow_paths]

    report = generate_report(week_ending, kpi, anomaly, rfm, flows, api_key)

    if output_config:
        deliver_report(report, output_config)
    else:
        print(report)

    return report


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 5:
        print(
            "Usage: report_generate.py <week_ending> <kpi.json> <anomaly.json> "
            "<rfm1.json> [rfm2.json ...] --flows <flow1.json> [--out file.md] [--slack <webhook_url>]"
        )
        sys.exit(1)

    args = sys.argv[1:]
    week = args[0]
    kpi_p = args[1]
    anomaly_p = args[2]

    rfm_ps, flow_ps = [], []
    out_file, slack_url = None, None
    mode = "rfm"
    for arg in args[3:]:
        if arg == "--flows":
            mode = "flows"
        elif arg == "--out":
            mode = "out"
        elif arg == "--slack":
            mode = "slack"
        elif mode == "rfm":
            rfm_ps.append(arg)
        elif mode == "flows":
            flow_ps.append(arg)
        elif mode == "out":
            out_file = arg
            mode = "rfm"
        elif mode == "slack":
            slack_url = arg
            mode = "rfm"

    cfg: dict[str, Any] = {"stdout": True}
    if out_file:
        cfg["file"] = out_file
    if slack_url:
        cfg["slack_webhook"] = slack_url

    run(week, kpi_p, anomaly_p, rfm_ps, flow_ps, cfg)
