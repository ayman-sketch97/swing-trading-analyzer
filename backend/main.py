from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional
import json
import os
import time

data_cache = {}
CACHE_TTL = 300


def get_cached(key: str, fetch_fn, ttl: int = CACHE_TTL):
    now = time.time()
    if key in data_cache and (now - data_cache[key]["ts"]) < ttl:
        return data_cache[key]["data"]
    result = fetch_fn()
    data_cache[key] = {"data": result, "ts": now}
    return result


def clean_types(obj):
    if isinstance(obj, dict):
        return {k: clean_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [clean_types(v) for v in obj]
    elif hasattr(obj, "item"):
        return obj.item()
    return obj


app = FastAPI(title="Trading & Investing Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WATCHLIST_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX",
    "AMD", "CRM", "AVGO", "ORCL", "COST", "JPM", "V", "JNJ",
    "WMT", "PG", "UNH", "HD", "DIS", "ADBE", "PYPL", "INTC",
    "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "ADA-USD",
    "SPY", "QQQ", "IWM", "VOO", "VTI", "DIA", "XLF", "XLE", "XLK",
    "XLV", "XLI", "XLP", "XLU", "XLY", "XLB", "XLRE",
    "BA", "CAT", "CSCO", "CVX", "DOW", "GS", "HON", "IBM", "KO",
    "MCD", "MMM", "MRK", "NKE", "PFE", "RTX", "TRV", "AXP", "GE",
    "T", "VZ", "WFC", "C", "BAC", "ABNB", "DASH", "SQ", "SHOP",
    "SNAP", "UBER", "LYFT", "PINS", "ZM", "CRWD", "DDOG", "NET",
    "PLTR", "SOFI", "RIVN", "LCID", "MRNA", "BNTX", "ABBV", "LLY",
    "NVO", "TMO", "DHR", "QCOM", "TXN", "MU", "ASML", "AMAT",
    "LRCX", "KLAC", "PANW", "FTNT", "NOW", "WDAY", "TEAM", "PATH",
    "TOST", "CPNG", "MELI", "SE", "BABA", "JD", "NIO", "XPEV",
    "F", "GM", "TSM", "ARM", "INTC", "UBER",
]

PORTFOLIO_FILE = os.path.join(os.path.dirname(__file__), "portfolio.json")
ALERTS_FILE = os.path.join(os.path.dirname(__file__), "alerts.json")


def load_json(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def sanitize_ticker(ticker: str) -> str:
    ticker = ticker.strip().upper().replace(".", "-")
    return ticker


def fetch_data(ticker: str, days: int = 400) -> pd.DataFrame:
    cache_key = f"fetch_data_{ticker}_{days}"
    return get_cached(cache_key, lambda: _fetch_data(ticker, days))


def _fetch_data(ticker: str, days: int = 400) -> pd.DataFrame:
    stock = yf.Ticker(ticker)
    end = datetime.now()
    start = end - timedelta(days=days)
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
    return 100 - (100 / (1 + rs))


def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low = df["High"], df["Low"]
    close = df["Close"].shift(1)
    tr = pd.concat([high - low, (high - close).abs(), (low - close).abs()], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def calc_macd(series: pd.Series) -> dict:
    ema_fast = series.ewm(span=12, adjust=False).mean()
    ema_slow = series.ewm(span=26, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal = macd_line.ewm(span=9, adjust=False).mean()
    return {
        "macd": round(macd_line.iloc[-1], 2),
        "signal": round(signal.iloc[-1], 2),
        "histogram": round((macd_line.iloc[-1] - signal.iloc[-1]), 2),
    }


def calc_bollinger_bands(series: pd.Series, period: int = 20) -> dict:
    sma = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper, lower = sma + (std * 2), sma - (std * 2)
    return {
        "upper": round(upper.iloc[-1], 2),
        "middle": round(sma.iloc[-1], 2),
        "lower": round(lower.iloc[-1], 2),
        "bandwidth": round(((upper.iloc[-1] - lower.iloc[-1]) / sma.iloc[-1]) * 100, 2),
    }


def calc_stochastic(df: pd.DataFrame, k_period: int = 14) -> dict:
    low_min = df["Low"].rolling(window=k_period).min()
    high_max = df["High"].rolling(window=k_period).max()
    k = 100 * (df["Close"] - low_min) / (high_max - low_min).replace(0, np.nan)
    d = k.rolling(window=3).mean()
    return {
        "k": round(k.iloc[-1], 2) if not np.isnan(k.iloc[-1]) else 50,
        "d": round(d.iloc[-1], 2) if not np.isnan(d.iloc[-1]) else 50,
    }


def detect_support_resistance(df: pd.DataFrame, lookback: int = 20) -> dict:
    recent = df.tail(120)
    current_price = recent["Close"].iloc[-1]

    lows = recent["Low"].rolling(window=lookback, center=True).min()
    highs = recent["High"].rolling(window=lookback, center=True).max()

    swing_lows = recent[recent["Low"] == lows][["Low"]].dropna()
    swing_highs = recent[recent["High"] == highs][["High"]].dropna()

    support_raw = sorted([r["Low"] for _, r in swing_lows.iterrows() if r["Low"] < current_price * 0.99], reverse=True)
    resistance_raw = sorted([r["High"] for _, r in swing_highs.iterrows() if r["High"] > current_price * 1.01])

    def dedup(levels, current, min_gap_pct=0.025, max_count=3):
        result = []
        for level in levels:
            if not result or abs(level - result[-1]) / current > min_gap_pct:
                result.append(round(level, 2))
            if len(result) >= max_count:
                break
        return result

    support = dedup(support_raw, current_price)
    resistance = dedup(resistance_raw, current_price)

    while len(support) < 3:
        last = support[-1] if support else current_price * 0.94
        support.append(round(last * 0.96, 2))
    support.sort(reverse=True)

    while len(resistance) < 3:
        last = resistance[-1] if resistance else current_price * 1.06
        resistance.append(round(last * 1.04, 2))
    resistance.sort()

    return {
        "support": support,
        "resistance": resistance,
        "support_zones": [{"high": round(s * 1.005, 2), "low": round(s * 0.995, 2), "mid": s} for s in support],
        "resistance_zones": [{"high": round(r * 1.005, 2), "low": round(r * 0.995, 2), "mid": r} for r in resistance],
    }


def determine_trend(price, ema20, ema50, ema200) -> str:
    if price > ema50 and ema20 > ema50:
        return "bullish"
    if price < ema50 and ema20 < ema50:
        return "bearish"
    if abs(price - ema50) / ema50 < 0.03:
        return "sideways"
    return "bullish" if price > ema50 else "bearish"


def compute_sentiment(trend, rsi, macd, price, ema20, ema50, ema200, stoch, bb, atr_pct, fundamentals) -> dict:
    score = 0
    reasons = []
    tech_reasons = []
    fund_reasons = []

    if price > ema20 > ema50 > ema200:
        score += 25
        tech_reasons.append("EMAs aligned bullishly (20>50>200)")
    elif price > ema50 > ema200:
        score += 15
        tech_reasons.append("Price above key EMAs")
    elif price < ema200:
        score -= 20
        tech_reasons.append("Price below 200-day EMA")

    if macd["histogram"] > 0:
        score += 10
        tech_reasons.append("MACD histogram positive (momentum bullish)")
    else:
        score -= 10
        tech_reasons.append("MACD histogram negative (momentum bearish)")

    if macd["macd"] > macd["signal"]:
        score += 5
        tech_reasons.append("MACD line above signal line")
    else:
        score -= 5

    if rsi < 30:
        score += 15
        tech_reasons.append("RSI oversold (<30) - potential reversal")
    elif rsi > 70:
        score -= 15
        tech_reasons.append("RSI overbought (>70) - potential pullback")
    elif 40 <= rsi <= 60:
        tech_reasons.append("RSI in neutral zone")

    if stoch["k"] < 20:
        score += 10
        tech_reasons.append("Stochastic oversold")
    elif stoch["k"] > 80:
        score -= 10
        tech_reasons.append("Stochastic overbought")

    if price < bb["lower"]:
        score += 10
        tech_reasons.append("Price below lower Bollinger Band")
    elif price > bb["upper"]:
        score -= 10
        tech_reasons.append("Price above upper Bollinger Band")

    if atr_pct < 0.02:
        tech_reasons.append("Low volatility environment")
    elif atr_pct > 0.04:
        tech_reasons.append("High volatility environment")

    if fundamentals.get("revenue_growth") and fundamentals["revenue_growth"] > 0.15:
        score += 15
        fund_reasons.append(f"Strong revenue growth ({fundamentals['revenue_growth']*100:.1f}%)")
    elif fundamentals.get("revenue_growth") and fundamentals["revenue_growth"] > 0:
        score += 5
        fund_reasons.append("Positive revenue growth")

    if fundamentals.get("earnings_growth") and fundamentals["earnings_growth"] > 0.2:
        score += 15
        fund_reasons.append(f"Strong earnings growth ({fundamentals['earnings_growth']*100:.1f}%)")

    pe = fundamentals.get("pe_ratio")
    if pe and pe < 20:
        score += 10
        fund_reasons.append(f"Attractive valuation (P/E: {pe:.1f})")
    elif pe and pe > 50:
        score -= 10
        fund_reasons.append(f"High valuation (P/E: {pe:.1f})")

    de = fundamentals.get("debt_to_equity")
    if de and de < 0.5:
        score += 5
        fund_reasons.append("Low debt levels")
    elif de and de > 2:
        score -= 5
        fund_reasons.append("High debt levels")

    if trend == "bullish":
        score += 10
    elif trend == "bearish":
        score -= 10

    score = max(-100, min(100, score))
    confidence = min(95, abs(score) + 20)

    if score >= 60:
        signal, color = "Strong Buy", "#10b981"
    elif score >= 20:
        signal, color = "Buy", "#34d399"
    elif score >= -20:
        signal, color = "Hold", "#f59e0b"
    elif score >= -60:
        signal, color = "Sell", "#f87171"
    else:
        signal, color = "Strong Sell", "#ef4444"

    return {
        "score": score,
        "signal": signal,
        "color": color,
        "confidence": round(confidence, 1),
        "technical_reasons": tech_reasons,
        "fundamental_reasons": fund_reasons,
    }


def compute_strategy(trend, sentiment, price, sr, atr, fundamentals, df) -> dict:
    atr_pct = atr / price if price > 0 else 0.02
    score = sentiment["score"]

    if score >= 40:
        entry_zone = f"{sr['support_zones'][0]['low']} - {sr['support_zones'][0]['high']}" if sr["support_zones"] else f"{price * 0.97:.2f} - {price * 0.99:.2f}"
        stop_loss = f"{sr['support_zones'][0]['low'] * 0.98:.2f}" if sr["support_zones"] else f"{price * 0.95:.2f}"
        target_range = f"{sr['resistance_zones'][0]['low']} - {sr['resistance_zones'][0]['high']}" if sr["resistance_zones"] else f"{price * 1.12:.2f} - {price * 1.18:.2f}"
    elif score <= -40:
        entry_zone = "Wait for reversal confirmation"
        stop_loss = f"{price * 0.95:.2f}"
        target_range = f"{price * 0.88:.2f} - {price * 0.92:.2f}"
    else:
        entry_zone = f"{sr['support_zones'][0]['low']} - {sr['support_zones'][0]['high']}" if sr["support_zones"] else f"{price * 0.96:.2f} - {price * 0.98:.2f}"
        stop_loss = f"{sr['support_zones'][0]['low'] * 0.97:.2f}" if sr["support_zones"] else f"{price * 0.94:.2f}"
        target_range = f"{sr['resistance_zones'][0]['low']} - {sr['resistance_zones'][0]['high']}" if sr["resistance_zones"] else f"{price * 1.05:.2f} - {price * 1.10:.2f}"

    if atr_pct > 0.03:
        timeframe = "short"
        timeframe_label = "Short-term (2-7 trading days)"
        desc = "High volatility favors shorter holding periods to capture quick moves"
    elif score >= 50 and fundamentals.get("revenue_growth", 0) > 0.1:
        timeframe = "long"
        timeframe_label = "Long-term (1-3+ months)"
        desc = "Strong fundamentals and bullish trend support a longer holding period"
    else:
        timeframe = "medium"
        timeframe_label = "Medium-term (1-4 weeks)"
        desc = "Moderate setup suitable for swing trading timeframe"

    rationale = []
    if trend == "bullish":
        rationale.append("Clear upward trend established")
    elif trend == "bearish":
        rationale.append("Downtrend in place - caution advised")
    else:
        rationale.append("Price consolidating - wait for direction")

    if sentiment["score"] >= 40:
        rationale.append("Multiple technical and fundamental indicators align positively")
    elif sentiment["score"] <= -40:
        rationale.append("Technical and fundamental indicators suggest weakness")
    else:
        rationale.append("Mixed signals - limited conviction in either direction")

    return {
        "entry_zone": entry_zone,
        "stop_loss": stop_loss,
        "target_range": target_range,
        "timeframe": timeframe,
        "timeframe_label": timeframe_label,
        "timeframe_description": desc,
        "rationale": rationale,
    }


def compute_risk(atr_pct, trend, volatility_30d) -> dict:
    vol_score = atr_pct * 100
    if vol_score > 4:
        level = "high"
        color = "#ef4444"
    elif vol_score > 2.5:
        level = "medium"
        color = "#f59e0b"
    else:
        level = "low"
        color = "#10b981"

    return {
        "level": level,
        "color": color,
        "volatility_percent": round(vol_score, 2),
        "annualized_volatility": round(volatility_30d * np.sqrt(252) * 100, 2),
    }


def compute_market_context() -> dict:
    indices = {"SPY": "S&P 500", "QQQ": "NASDAQ", "IWM": "Russell 2000"}
    result = {"indices": {}, "overall": "neutral"}

    scores = []
    for ticker, name in indices.items():
        try:
            df = fetch_data(ticker, days=250)
            df["ema50"] = calc_ema(df["Close"], 50)
            df["ema200"] = calc_ema(df["Close"], 200)
            price = df["Close"].iloc[-1]
            ema50 = df["ema50"].iloc[-1]
            ema200 = df["ema200"].iloc[-1]
            change_1m = (price / df["Close"].iloc[-21] - 1) * 100

            trend = "bullish" if price > ema50 and price > ema200 else "bearish" if price < ema200 else "mixed"
            result["indices"][ticker] = {
                "name": name,
                "price": round(price, 2),
                "trend": trend,
                "change_1m": round(change_1m, 2),
            }
            scores.append(1 if trend == "bullish" else -1 if trend == "bearish" else 0)
        except Exception:
            result["indices"][ticker] = {"name": name, "price": None, "trend": "unknown", "change_1m": None}

    avg = sum(scores) / len(scores) if scores else 0
    result["overall"] = "bullish" if avg > 0.3 else "bearish" if avg < -0.3 else "neutral"
    return result


def build_chart_data(df: pd.DataFrame, sr: dict) -> dict:
    candles, volume, ema20d, ema50d, ema200d = [], [], [], [], []
    for idx, row in df.tail(120).iterrows():
        ts = idx.strftime("%Y-%m-%d")
        candles.append({"time": ts, "open": round(row["Open"], 2), "high": round(row["High"], 2), "low": round(row["Low"], 2), "close": round(row["Close"], 2)})
        volume.append({"time": ts, "value": int(row["Volume"]), "color": "rgba(38,166,154,0.5)" if row["Close"] >= row["Open"] else "rgba(239,83,80,0.5)"})
        ema20d.append({"time": ts, "value": round(row["ema20"], 2)})
        ema50d.append({"time": ts, "value": round(row["ema50"], 2)})
        ema200d.append({"time": ts, "value": round(row["ema200"], 2)})

    return {
        "candles": candles,
        "volume": volume,
        "ema20": ema20d,
        "ema50": ema50d,
        "ema200": ema200d,
        "support_lines": [{"level": s, "label": f"S{i+1}"} for i, s in enumerate(sr["support"])],
        "resistance_lines": [{"level": r, "label": f"R{i+1}"} for i, r in enumerate(sr["resistance"])],
    }


def analyze_fundamentals(ticker: str) -> dict:
    return get_cached(f"fundamentals_{ticker}", lambda: _analyze_fundamentals(ticker), ttl=600)


def _analyze_fundamentals(ticker: str) -> dict:
    try:
        info = yf.Ticker(ticker).info
    except Exception:
        return {}

    result = {}
    result["sector"] = info.get("sector", "N/A")
    result["industry"] = info.get("industry", "N/A")
    result["short_name"] = info.get("shortName", ticker)
    result["market_cap"] = info.get("marketCap", 0)
    result["pe_ratio"] = info.get("trailingPE")
    result["forward_pe"] = info.get("forwardPE")
    result["peg_ratio"] = info.get("pegRatio")
    result["price_to_book"] = info.get("priceToBook")
    result["debt_to_equity"] = info.get("debtToEquity")
    result["revenue_growth"] = info.get("revenueGrowth")
    result["earnings_growth"] = info.get("earningsGrowth")
    result["profit_margin"] = info.get("profitMargins")
    result["operating_margin"] = info.get("operatingMargins")
    result["return_on_equity"] = info.get("returnOnEquity")
    result["current_ratio"] = info.get("currentRatio")
    result["dividend_yield"] = info.get("dividendYield")
    result["beta"] = info.get("beta")
    result["target_price"] = info.get("targetMeanPrice")
    result["recommendation"] = info.get("recommendationKey", "N/A")
    result["52_week_high"] = info.get("fiftyTwoWeekHigh")
    result["52_week_low"] = info.get("fiftyTwoWeekLow")

    rev = result.get("revenue_growth")
    earn = result.get("earnings_growth")
    pe = result.get("pe_ratio")
    de = result.get("debt_to_equity")
    pm = result.get("profit_margin")

    f_score = 50
    if rev and rev > 0.15: f_score += 15
    elif rev and rev > 0: f_score += 5
    if earn and earn > 0.2: f_score += 15
    elif earn and earn > 0: f_score += 5
    if pe and pe < 20: f_score += 10
    elif pe and pe > 50: f_score -= 10
    if de and de < 0.5: f_score += 5
    elif de and de > 2: f_score -= 5
    if pm and pm > 0.2: f_score += 10
    elif pm and pm < 0: f_score -= 10

    f_score = max(0, min(100, f_score))

    if f_score >= 75: label = "Excellent"
    elif f_score >= 60: label = "Good"
    elif f_score >= 40: label = "Average"
    elif f_score >= 20: label = "Below Average"
    else: label = "Weak"

    result["score"] = f_score
    result["label"] = label

    return result


def detect_volume_spike(df: pd.DataFrame) -> bool:
    avg_vol_20 = df["Volume"].tail(20).mean()
    current_vol = df["Volume"].iloc[-1]
    return bool(current_vol > avg_vol_20 * 1.5) if avg_vol_20 > 0 else False


@app.get("/analyze")
def analyze(ticker: str = Query(...)):
    ticker = sanitize_ticker(ticker)
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
    ema20, ema50, ema200 = round(latest["ema20"], 2), round(latest["ema50"], 2), round(latest["ema200"], 2)
    rsi, atr = round(latest["rsi"], 2), round(latest["atr"], 2)
    atr_pct = atr / price if price > 0 else 0

    trend = determine_trend(price, ema20, ema50, ema200)
    sr = detect_support_resistance(df)
    macd = calc_macd(df["Close"])
    bb = calc_bollinger_bands(df["Close"])
    stoch = calc_stochastic(df)
    fundamentals = analyze_fundamentals(ticker)
    volume_spike = detect_volume_spike(df)

    volatility_30d = float(df["Close"].pct_change().tail(30).std())
    risk = compute_risk(atr_pct, trend, volatility_30d)
    sentiment = compute_sentiment(trend, rsi, macd, price, ema20, ema50, ema200, stoch, bb, atr_pct, fundamentals)
    strategy = compute_strategy(trend, sentiment, price, sr, atr, fundamentals, df)

    growth_score = 50
    returns_3m = float((price / df["Close"].iloc[-63] - 1) * 100) if len(df) > 63 else 0.0
    if returns_3m > 10: growth_score += 15
    elif returns_3m < -10: growth_score -= 15
    if fundamentals.get("revenue_growth", 0) > 0.15: growth_score += 15
    if fundamentals.get("earnings_growth", 0) > 0.2: growth_score += 15
    growth_score = max(0, min(100, growth_score))
    growth_label = "High Growth" if growth_score >= 70 else "Moderate Growth" if growth_score >= 50 else "Low Growth" if growth_score >= 30 else "Declining"

    returns = {
        "1_month": round(float((price / df["Close"].iloc[-21] - 1) * 100), 2) if len(df) > 21 else 0.0,
        "3_months": round(float(returns_3m), 2),
        "6_months": round(float((price / df["Close"].iloc[-126] - 1) * 100), 2) if len(df) > 126 else 0.0,
        "1_year": round(float((price / df["Close"].iloc[-252] - 1) * 100), 2) if len(df) > 252 else 0.0,
    }

    return {
        "ticker": ticker,
        "company_name": fundamentals.get("short_name", ticker),
        "current_price": price,
        "timestamp": datetime.now().isoformat(),
        "trend": trend,
        "sentiment": sentiment,
        "growth_potential": {"score": growth_score, "label": growth_label, "returns": returns},
        "fundamentals": fundamentals,
        "risk": risk,
        "strategy": strategy,
        "support": sr["support"],
        "resistance": sr["resistance"],
        "volume_spike": volume_spike,
        "indicators": {
            "ema20": ema20, "ema50": ema50, "ema200": ema200,
            "rsi": rsi, "atr": atr, "atr_percent": round(atr_pct * 100, 2),
            "macd": macd, "bollinger_bands": bb, "stochastic": stoch,
            "volume_trend": "increasing" if df["Volume"].tail(5).mean() > df["Volume"].tail(20).mean() else "decreasing",
        },
        "chart_data": build_chart_data(df, sr),
        "disclaimer": "This analysis is for informational purposes only. It is not financial advice. All outputs are based on historical data and technical patterns. Past performance does not guarantee future results. Always do your own research and consult a licensed financial advisor.",
    }


@app.get("/screener")
def screener(
    preset: str = Query("all", description="Preset: all, strong_buy, growth, momentum, value"),
    ticker: Optional[str] = Query(None, description="Specific ticker to analyze"),
):
    stocks = []
    tickers_to_scan = [sanitize_ticker(ticker)] if ticker else WATCHLIST_TICKERS
    for t in tickers_to_scan:
        try:
            df = fetch_data(t, days=250)
            if len(df) < 50:
                continue
            df["ema20"] = calc_ema(df["Close"], 20)
            df["ema50"] = calc_ema(df["Close"], 50)
            df["ema200"] = calc_ema(df["Close"], 200)
            df["rsi"] = calc_rsi(df["Close"], 14)
            df["atr"] = calc_atr(df, 14)

            latest = df.iloc[-1]
            price = round(latest["Close"], 2)
            atr_pct = round(latest["atr"] / price, 4) if price > 0 else 0
            trend = determine_trend(price, round(latest["ema20"], 2), round(latest["ema50"], 2), round(latest["ema200"], 2))
            macd = calc_macd(df["Close"])
            bb = calc_bollinger_bands(df["Close"])
            stoch = calc_stochastic(df)
            fundamentals = analyze_fundamentals(t)
            sentiment = compute_sentiment(trend, round(latest["rsi"], 2), macd, price, round(latest["ema20"], 2), round(latest["ema50"], 2), round(latest["ema200"], 2), stoch, bb, atr_pct, fundamentals)

            returns_3m = round(float((price / df["Close"].iloc[-63] - 1) * 100), 2) if len(df) > 63 else 0.0
            vol_spike = detect_volume_spike(df)

            stock = {
                "ticker": t, "price": price, "trend": trend,
                "signal": sentiment["signal"], "score": sentiment["score"],
                "confidence": sentiment["confidence"],
                "rsi": round(latest["rsi"], 1),
                "pe_ratio": fundamentals.get("pe_ratio"),
                "revenue_growth": round(fundamentals.get("revenue_growth", 0) * 100, 1) if fundamentals.get("revenue_growth") else None,
                "earnings_growth": round(fundamentals.get("earnings_growth", 0) * 100, 1) if fundamentals.get("earnings_growth") else None,
                "returns_3m": returns_3m,
                "volume_spike": vol_spike,
                "sector": fundamentals.get("sector", "N/A"),
                "fundamental_score": fundamentals.get("score", 50),
                "risk": "high" if atr_pct > 0.04 else "medium" if atr_pct > 0.025 else "low",
            }

            if preset == "strong_buy" and sentiment["score"] < 40:
                continue
            if preset == "growth" and fundamentals.get("revenue_growth", 0) < 0.1:
                continue
            if preset == "momentum" and not (trend == "bullish" and vol_spike):
                continue
            if preset == "value" and (not fundamentals.get("pe_ratio") or fundamentals["pe_ratio"] > 25):
                continue

            stocks.append(stock)
        except Exception:
            continue

    stocks.sort(key=lambda x: x["score"], reverse=True)
    return {"count": len(stocks), "preset": preset, "stocks": stocks}


@app.get("/market")
def market_context():
    return compute_market_context()


@app.get("/portfolio")
def get_portfolio():
    return {"holdings": load_json(PORTFOLIO_FILE)}


@app.post("/portfolio/add")
def add_to_portfolio(ticker: str = Query(...), entry_price: float = Query(...), shares: int = Query(1), entry_date: Optional[str] = Query(None)):
    portfolio = load_json(PORTFOLIO_FILE)
    portfolio.append({
        "ticker": ticker.upper(),
        "entry_price": entry_price,
        "shares": shares,
        "entry_date": entry_date or datetime.now().isoformat(),
    })
    save_json(PORTFOLIO_FILE, portfolio)
    return {"status": "added", "holdings": portfolio}


@app.delete("/portfolio/remove")
def remove_from_portfolio(ticker: str = Query(...), index: int = Query(0)):
    portfolio = load_json(PORTFOLIO_FILE)
    ticker_upper = ticker.upper()
    portfolio = [h for i, h in enumerate(portfolio) if not (h["ticker"] == ticker_upper and i == index)]
    save_json(PORTFOLIO_FILE, portfolio)
    return {"status": "removed", "holdings": portfolio}


@app.get("/portfolio/analyze")
def analyze_portfolio():
    portfolio = load_json(PORTFOLIO_FILE)
    results = []
    for h in portfolio:
        try:
            analysis = analyze(h["ticker"])
            pnl = (analysis["current_price"] - h["entry_price"]) * h["shares"]
            pnl_pct = (analysis["current_price"] / h["entry_price"] - 1) * 100
            results.append({
                **h,
                "current_price": analysis["current_price"],
                "pnl": round(pnl, 2),
                "pnl_percent": round(pnl_pct, 2),
                "trend": analysis["trend"],
                "signal": analysis["sentiment"]["signal"],
            })
        except Exception:
            continue
    return {"holdings": results}


@app.get("/alerts")
def get_alerts():
    return {"alerts": load_json(ALERTS_FILE)}


@app.post("/alerts/add")
def add_alert(ticker: str = Query(...), alert_type: str = Query(...), price_level: float = Query(...)):
    alerts = load_json(ALERTS_FILE)
    alerts.append({
        "ticker": ticker.upper(),
        "type": alert_type,
        "price_level": price_level,
        "created": datetime.now().isoformat(),
        "triggered": False,
    })
    save_json(ALERTS_FILE, alerts)
    return {"status": "created"}


@app.post("/alerts/check")
def check_alerts():
    alerts = load_json(ALERTS_FILE)
    triggered = []
    for a in alerts:
        if a.get("triggered"):
            continue
        try:
            current = fetch_data(a["ticker"], days=5).iloc[-1]["Close"]
            if (a["type"] == "above" and current >= a["price_level"]) or \
               (a["type"] == "below" and current <= a["price_level"]):
                a["triggered"] = True
                a["triggered_price"] = round(current, 2)
                a["triggered_at"] = datetime.now().isoformat()
                triggered.append(a)
        except Exception:
            pass
    save_json(ALERTS_FILE, alerts)
    return {"triggered": triggered}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
