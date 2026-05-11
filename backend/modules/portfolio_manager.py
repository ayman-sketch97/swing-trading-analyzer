import json
import os
from datetime import datetime
from typing import Optional

PORTFOLIO_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "portfolio.json")


def load_portfolio() -> list[dict]:
    if os.path.exists(PORTFOLIO_FILE):
        with open(PORTFOLIO_FILE, "r") as f:
            return json.load(f)
    return []


def save_portfolio(data: list[dict]):
    with open(PORTFOLIO_FILE, "w") as f:
        json.dump(data, f, indent=2)


def add_position(ticker: str, entry_price: float, quantity: float, entry_date: Optional[str] = None, leverage: float = 1.0) -> dict:
    portfolio = load_portfolio()
    position = {
        "ticker": ticker.upper(),
        "entry_price": entry_price,
        "quantity": quantity,
        "entry_date": entry_date or datetime.now().isoformat(),
        "leverage": leverage,
    }
    portfolio.append(position)
    save_portfolio(portfolio)
    return {"status": "added", "position": position, "holdings": portfolio}


def remove_position(ticker: str, index: int = 0) -> dict:
    portfolio = load_portfolio()
    ticker_upper = ticker.upper()
    portfolio = [h for i, h in enumerate(portfolio) if not (h["ticker"] == ticker_upper and i == index)]
    save_portfolio(portfolio)
    return {"status": "removed", "holdings": portfolio}


def advise_holding(ticker: str, entry_price: float, current_price: float, pnl_percent: float) -> dict:
    advice = {"action": "hold", "reason": "", "urgency": "low", "suggested_qty": None}

    if pnl_percent > 15:
        if pnl_percent > 30:
            advice["action"] = "take_profit"
            advice["reason"] = f"Up {pnl_percent:.1f}% — consider taking partial profits (30%+ gain)"
            advice["urgency"] = "medium"
            advice["suggested_qty"] = 0.5
        else:
            advice["action"] = "hold"
            advice["reason"] = f"Up {pnl_percent:.1f}% — let runners ride, trail stop higher"
            advice["urgency"] = "low"
    elif pnl_percent > 5:
        advice["action"] = "hold"
        advice["reason"] = f"Up {pnl_percent:.1f}% — position is working, hold with stop"
        advice["urgency"] = "low"
    elif pnl_percent > -5:
        advice["action"] = "hold"
        advice["reason"] = "Flat or small movement — hold and wait for direction"
        advice["urgency"] = "low"
    elif pnl_percent > -15:
        advice["action"] = "watch"
        advice["reason"] = f"Down {abs(pnl_percent):.1f}% — monitor closely, set a firm stop"
        advice["urgency"] = "medium"
    else:
        advice["action"] = "cut_loss"
        advice["reason"] = f"Down {abs(pnl_percent):.1f}% — consider cutting losses before further decline"
        advice["urgency"] = "high"
        advice["suggested_qty"] = 0

    return advice


def advise_portfolio(current_prices: dict[str, float]) -> dict:
    portfolio = load_portfolio()
    if not portfolio:
        return {"holdings": [], "suggestions": []}

    results = []
    total_cost = 0
    total_value = 0

    for h in portfolio:
        ticker = h["ticker"]
        current = current_prices.get(ticker, h["entry_price"])
        cost = h["entry_price"] * h["quantity"]
        value = current * h["quantity"]
        pnl = value - cost
        pnl_pct = ((current / h["entry_price"]) - 1) * 100
        advice = advise_holding(ticker, h["entry_price"], current, pnl_pct)

        results.append({
            **h,
            "current_price": round(current, 2),
            "cost_basis": round(cost, 2),
            "current_value": round(value, 2),
            "pnl": round(pnl, 2),
            "pnl_percent": round(pnl_pct, 2),
            "advice": advice,
        })
        total_cost += cost
        total_value += value

    for r in results:
        r["allocation_pct"] = round((r["current_value"] / total_value * 100) if total_value > 0 else 0, 2)

    winners = [r for r in results if r["pnl"] > 0]
    losers = [r for r in results if r["pnl"] < 0]
    win_rate = (len(winners) / len(results) * 100) if results else 0

    total_pnl = total_value - total_cost
    total_pnl_pct = ((total_value / total_cost) - 1) * 100 if total_cost > 0 else 0

    high_urgency = [r for r in results if r["advice"]["urgency"] == "high"]
    medium_urgency = [r for r in results if r["advice"]["urgency"] == "medium"]

    suggestions = []
    if high_urgency:
        tickers_list = ", ".join(h["ticker"] for h in high_urgency)
        suggestions.append(f"⚠️ {len(high_urgency)} position(s) in critical condition: {tickers_list}. Consider cutting losses.")
    if len(losers) > len(winners):
        suggestions.append("📉 More losers than winners — review your entry criteria and consider tightening stops.")
    if win_rate < 40 and len(results) >= 3:
        suggestions.append("🎯 Win rate below 40% — focus on higher-conviction setups with better R/R ratios.")
    if total_pnl_pct > 20:
        suggestions.append(f"💰 Portfolio up {total_pnl_pct:.1f}% — consider taking some profits to lock in gains.")
    if total_pnl_pct < -15:
        suggestions.append(f"🔻 Portfolio down {total_pnl_pct:.1f}% — reduce position sizes and wait for better opportunities.")

    return {
        "holdings": results,
        "suggestions": suggestions,
        "summary": {
            "total_positions": len(results),
            "total_cost": round(total_cost, 2),
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_percent": round(total_pnl_pct, 2),
            "win_rate": round(win_rate, 1),
            "winners": len(winners),
            "losers": len(losers),
            "health_score": round(max(0, min(100, 50 + total_pnl_pct + (win_rate - 50) * 0.5)), 1),
            "critical_alerts": len(high_urgency),
            "warnings": len(medium_urgency),
        },
        "diversification": {
            "concentration_risk": round(max(r["allocation_pct"] for r in results), 1) if results else 0,
            "note": "Consider diversifying — no single position should exceed 25% of portfolio." if max(r["allocation_pct"] for r in results) > 25 else "Diversification looks healthy.",
        },
    }


def analyze_portfolio(current_prices: dict[str, float]) -> dict:
    portfolio = load_portfolio()
    if not portfolio:
        return {"holdings": [], "summary": {}}

    results = []
    total_cost = 0
    total_value = 0
    sector_exposure = {}
    tickers_by_sector = {}

    for h in portfolio:
        ticker = h["ticker"]
        current = current_prices.get(ticker, h["entry_price"])
        cost = h["entry_price"] * h["quantity"]
        value = current * h["quantity"]
        pnl = value - cost
        pnl_pct = ((current / h["entry_price"]) - 1) * 100

        results.append({
            **h,
            "current_price": round(current, 2),
            "cost_basis": round(cost, 2),
            "current_value": round(value, 2),
            "pnl": round(pnl, 2),
            "pnl_percent": round(pnl_pct, 2),
        })

        total_cost += cost
        total_value += value

    for r in results:
        alloc = (r["current_value"] / total_value * 100) if total_value > 0 else 0
        r["allocation_pct"] = round(alloc, 2)

    winners = [r for r in results if r["pnl"] > 0]
    losers = [r for r in results if r["pnl"] < 0]
    win_rate = (len(winners) / len(results) * 100) if results else 0

    total_pnl = total_value - total_cost
    total_pnl_pct = ((total_value / total_cost) - 1) * 100 if total_cost > 0 else 0

    sorted_results = sorted(results, key=lambda x: abs(x["pnl"]), reverse=True)
    best_trade = sorted_results[0] if sorted_results and sorted_results[0]["pnl"] > 0 else None
    worst_trade = sorted_results[-1] if sorted_results and sorted_results[-1]["pnl"] < 0 else None

    top_positions = sorted(results, key=lambda x: x["current_value"], reverse=True)
    concentration = 0
    if len(top_positions) >= 3:
        concentration = sum(p["current_value"] for p in top_positions[:3]) / total_value * 100

    return {
        "holdings": results,
        "summary": {
            "total_positions": len(results),
            "total_cost": round(total_cost, 2),
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_percent": round(total_pnl_pct, 2),
            "win_rate": round(win_rate, 1),
            "winners": len(winners),
            "losers": len(losers),
            "best_trade": best_trade,
            "worst_trade": worst_trade,
            "concentration_risk": round(concentration, 1),
            "concentration_warning": concentration > 30,
        },
    }
