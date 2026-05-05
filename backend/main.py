from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

app = FastAPI(title="Swing Trading Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def fetch_data(ticker: str) -> pd.DataFrame:
    stock = yf.Ticker(ticker)
    end = datetime.now()
    start = end - timedelta(days=400)
    df = stock.history(start=start, end=end)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for ticker: {ticker}")
    df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
    df.index = pd.to_datetime(df.index)
    return df


def calc_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(span=period, adjust=False).mean()
    avg_loss = loss.ewm(span=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["High"]
    low = df["Low"]
    close = df["Close"].shift(1)
    tr1 = high - low
    tr2 = (high - close).abs()
    tr3 = (low - close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def detect_support_resistance(df: pd.DataFrame, lookback: int = 30) -> tuple[list, list]:
    highs = df["High"].rolling(window=lookback, center=True).max()
    lows = df["Low"].rolling(window=lookback, center=True).min()

    swing_highs = df[df["High"] == highs][["High", "Close"]].dropna()
    swing_lows = df[df["Low"] == lows][["Low", "Close"]].dropna()

    recent_highs = swing_highs.tail(8)
    recent_lows = swing_lows.tail(8)

    resistance_zones = []
    for _, row in recent_highs.iterrows():
        level = row["High"]
        zone_high = level * 1.01
        zone_low = level * 0.99
        resistance_zones.append({
            "high": round(zone_high, 2),
            "low": round(zone_low, 2),
            "mid": round(level, 2),
        })

    support_zones = []
    for _, row in recent_lows.iterrows():
        level = row["Low"]
        zone_high = level * 1.01
        zone_low = level * 0.99
        support_zones.append({
            "high": round(zone_high, 2),
            "low": round(zone_low, 2),
            "mid": round(level, 2),
        })

    resistance_zones = sorted(resistance_zones, key=lambda x: x["mid"], reverse=True)
    support_zones = sorted(support_zones, key=lambda x: x["mid"])

    seen = set()
    filtered_resistance = []
    for z in resistance_zones:
        key = round(z["mid"] / 5, 0)
        if key not in seen:
            seen.add(key)
            filtered_resistance.append(z)

    seen = set()
    filtered_support = []
    for z in support_zones:
        key = round(z["mid"] / 5, 0)
        if key not in seen:
            seen.add(key)
            filtered_support.append(z)

    return filtered_support[:3], filtered_resistance[:3]


def determine_trend(price: float, ema20: float, ema50: float, ema200: float) -> str:
    if price > ema50 and ema20 > ema50:
        if price > ema200:
            return "bullish"
        return "bullish"
    if price < ema50 and ema20 < ema50:
        return "bearish"
    if abs(price - ema50) / ema50 < 0.03:
        return "sideways"
    if price > ema50:
        return "bullish"
    return "bearish"


def determine_setup(trend: str, price: float, ema20: float, ema50: float, rsi: float, support: list, resistance: list) -> str:
    if trend == "bullish":
        if price <= ema20 * 1.01 and price >= ema20 * 0.98:
            return "pullback"
        if support and price <= (support[0]["high"] * 1.02):
            return "pullback"
        if resistance and price >= resistance[0]["low"] * 0.98:
            return "breakout"
        if rsi < 35:
            return "reversal"
        return "pullback"
    elif trend == "bearish":
        if rsi < 30:
            return "reversal"
        if resistance and price >= resistance[-1]["low"] * 0.97:
            return "breakout"
        return "pullback"
    else:
        if rsi < 35:
            return "reversal"
        if resistance and price >= resistance[0]["low"] * 0.97:
            return "breakout"
        return "pullback"


def calculate_signal_strength(trend: str, rsi: float, price: float, ema20: float, ema50: float, ema200: float, atr_pct: float) -> int:
    score = 50

    if trend == "bullish":
        if price > ema20 > ema50 > ema200:
            score += 20
        elif price > ema50 > ema200:
            score += 10
    elif trend == "bearish":
        if price < ema20 < ema50 < ema200:
            score -= 20
        elif price < ema50 < ema200:
            score -= 10

    if 40 <= rsi <= 60:
        score += 5
    elif 30 <= rsi < 40 or 60 < rsi <= 70:
        score += 0
    elif rsi < 30:
        score += 10
    elif rsi > 70:
        score -= 10

    if atr_pct < 0.02:
        score += 5
    elif atr_pct > 0.04:
        score -= 10

    score = max(0, min(100, score))
    return score


def determine_risk(atr_pct: float, trend: str) -> str:
    if atr_pct > 0.04:
        return "high"
    if atr_pct > 0.025:
        return "medium"
    return "low"


def estimate_holding_period(trend: str, atr_pct: float) -> str:
    if trend == "sideways":
        return "2-5 trading days"
    if atr_pct > 0.03:
        return "2-7 trading days"
    if trend == "bullish":
        return "5-12 trading days"
    return "3-10 trading days"


def build_chart_data(df: pd.DataFrame, support_zones: list, resistance_zones: list) -> dict:
    chart_candles = []
    for idx, row in df.tail(120).iterrows():
        ts = int(idx.timestamp())
        chart_candles.append({
            "time": ts,
            "open": round(row["Open"], 2),
            "high": round(row["High"], 2),
            "low": round(row["Low"], 2),
            "close": round(row["Close"], 2),
        })

    volume_data = []
    for idx, row in df.tail(120).iterrows():
        ts = int(idx.timestamp())
        volume_data.append({
            "time": ts,
            "value": int(row["Volume"]),
            "color": "rgba(38, 166, 154, 0.5)" if row["Close"] >= row["Open"] else "rgba(239, 83, 80, 0.5)",
        })

    ema20_data = []
    ema50_data = []
    ema200_data = []
    for idx, row in df.tail(120).iterrows():
        ts = int(idx.timestamp())
        ema20_data.append({"time": ts, "value": round(row["ema20"], 2)})
        ema50_data.append({"time": ts, "value": round(row["ema50"], 2)})
        ema200_data.append({"time": ts, "value": round(row["ema200"], 2)})

    support_lines = []
    for z in support_zones:
        support_lines.append({"level": z["mid"], "label": f"S: {z['mid']}"})

    resistance_lines = []
    for z in resistance_zones:
        resistance_lines.append({"level": z["mid"], "label": f"R: {z['mid']}"})

    return {
        "candles": chart_candles,
        "volume": volume_data,
        "ema20": ema20_data,
        "ema50": ema50_data,
        "ema200": ema200_data,
        "support_lines": support_lines,
        "resistance_lines": resistance_lines,
    }


@app.get("/analyze")
def analyze(ticker: str = Query(..., description="Stock ticker symbol")):
    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    df = fetch_data(ticker)

    df["ema20"] = calc_ema(df["Close"], 20)
    df["ema50"] = calc_ema(df["Close"], 50)
    df["ema200"] = calc_ema(df["Close"], 200)
    df["rsi"] = calc_rsi(df["Close"], 14)
    df["atr"] = calc_atr(df, 14)

    latest = df.iloc[-1]
    price = round(latest["Close"], 2)
    ema20 = round(latest["ema20"], 2)
    ema50 = round(latest["ema50"], 2)
    ema200 = round(latest["ema200"], 2)
    rsi = round(latest["rsi"], 2)
    atr = round(latest["atr"], 2)
    atr_pct = round(atr / price, 4) if price > 0 else 0

    trend = determine_trend(price, ema20, ema50, ema200)
    support_zones, resistance_zones = detect_support_resistance(df)
    setup = determine_setup(trend, price, ema20, ema50, rsi, support_zones, resistance_zones)
    risk = determine_risk(atr_pct, trend)
    holding = estimate_holding_period(trend, atr_pct)
    strength = calculate_signal_strength(trend, rsi, price, ema20, ema50, ema200, atr_pct)

    entry_zone = ""
    exit_zone = ""
    stop_loss = ""

    if trend == "bullish":
        if setup == "pullback":
            if support_zones:
                s = support_zones[0]
                entry_zone = f"{s['low']} - {s['high']}"
                stop_loss = f"Below {s['low'] * 0.98:.2f}"
            else:
                entry_zone = f"{ema20 * 0.99:.2f} - {ema20 * 1.01:.2f}"
                stop_loss = f"Below {ema50 * 0.98:.2f}"
            if resistance_zones:
                exit_zone = f"{resistance_zones[0]['low']} - {resistance_zones[0]['high']}"
            else:
                exit_zone = f"Near recent highs around {price * 1.05:.2f}"
        elif setup == "breakout":
            if resistance_zones:
                r = resistance_zones[0]
                entry_zone = f"Above {r['high']:.2f} (breakout confirmation)"
                stop_loss = f"Below {r['low'] * 0.97:.2f}"
                exit_zone = f"{r['high'] * 1.05:.2f} - {r['high'] * 1.08:.2f}"
            else:
                entry_zone = f"Above {price * 1.02:.2f}"
                stop_loss = f"Below {ema20 * 0.98:.2f}"
                exit_zone = f"Near {price * 1.06:.2f}"
        else:
            if support_zones:
                s = support_zones[0]
                entry_zone = f"{s['low']} - {s['high']}"
                stop_loss = f"Below {s['low'] * 0.97:.2f}"
            else:
                entry_zone = f"{ema20 * 0.99:.2f} - {ema50:.2f}"
                stop_loss = f"Below {ema50 * 0.97:.2f}"
            exit_zone = f"Near {price * 1.08:.2f}"

    elif trend == "bearish":
        if setup == "reversal":
            if support_zones:
                s = support_zones[0]
                entry_zone = f"{s['low']} - {s['high']} (reversal watch)"
                stop_loss = f"Below {s['low'] * 0.97:.2f}"
            else:
                entry_zone = f"Wait for confirmation near {price * 0.98:.2f}"
                stop_loss = f"Below {price * 0.95:.2f}"
            exit_zone = f"Near {ema20:.2f}"
        else:
            if resistance_zones:
                r = resistance_zones[-1]
                entry_zone = f"Watch pullback to {r['low']} - {r['high']}"
                stop_loss = f"Above {r['high'] * 1.02:.2f}"
            else:
                entry_zone = f"Wait for bounce near {ema20 * 0.99:.2f}"
                stop_loss = f"Below {price * 0.96:.2f}"
            exit_zone = f"Near {ema50:.2f}"
    else:
        if support_zones and resistance_zones:
            entry_zone = f"{support_zones[0]['low']} - {support_zones[0]['high']}"
            stop_loss = f"Below {support_zones[0]['low'] * 0.97:.2f}"
            exit_zone = f"{resistance_zones[0]['low']} - {resistance_zones[0]['high']}"
        else:
            entry_zone = f"Range-bound: {price * 0.97:.2f} - {price * 1.03:.2f}"
            stop_loss = f"Below {price * 0.95:.2f}"
            exit_zone = f"Above {price * 1.03:.2f}"

    volume_trend = "increasing" if df["Volume"].tail(5).mean() > df["Volume"].tail(20).mean() else "decreasing"

    indicators = {
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "rsi": rsi,
        "atr": atr,
        "atr_percent": round(atr_pct * 100, 2),
        "current_price": price,
        "volume_trend": volume_trend,
    }

    chart_data = build_chart_data(df, support_zones, resistance_zones)

    result = {
        "ticker": ticker,
        "current_price": price,
        "timestamp": datetime.now().isoformat(),
        "trend": trend,
        "setup_type": setup,
        "signal_strength": strength,
        "support_zones": support_zones,
        "resistance_zones": resistance_zones,
        "entry_zone": entry_zone,
        "exit_zone": exit_zone,
        "stop_loss": stop_loss,
        "holding_period": holding,
        "risk_level": risk,
        "indicators": indicators,
        "chart_data": chart_data,
        "disclaimer": "This analysis is for informational purposes only. It is not financial advice. Always do your own research and consult a licensed financial advisor before making investment decisions.",
    }

    return result


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
