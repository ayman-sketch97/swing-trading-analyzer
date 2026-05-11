import json
import os
from datetime import datetime

ALERTS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alerts.json")


def load_alerts() -> list[dict]:
    if os.path.exists(ALERTS_FILE):
        with open(ALERTS_FILE, "r") as f:
            return json.load(f)
    return []


def save_alerts(data: list[dict]):
    with open(ALERTS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def add_alert(ticker: str, alert_type: str, price_level: float) -> dict:
    alerts = load_alerts()
    alert = {
        "ticker": ticker.upper(),
        "type": alert_type,
        "price_level": price_level,
        "created": datetime.now().isoformat(),
        "triggered": False,
    }
    alerts.append(alert)
    save_alerts(alerts)
    return {"status": "created", "alert": alert}


def check_alerts(current_prices: dict[str, float]) -> list[dict]:
    alerts = load_alerts()
    triggered = []
    for a in alerts:
        if a.get("triggered"):
            continue
        current = current_prices.get(a["ticker"])
        if current is None:
            continue
        if (a["type"] == "above" and current >= a["price_level"]) or \
           (a["type"] == "below" and current <= a["price_level"]):
            a["triggered"] = True
            a["triggered_price"] = round(current, 2)
            a["triggered_at"] = datetime.now().isoformat()
            triggered.append(a)
    save_alerts(alerts)
    return triggered
