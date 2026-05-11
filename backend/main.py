from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Optional
import os
import traceback

from modules.data_fetcher import fetch_data, fetch_data_interval, fetch_multi_timeframe, fetch_info, get_cached
from modules.universe_filter import liquidity_filter
from modules.trend_analyzer import calc_ema, analyze_trend, relative_strength_vs_spy
from modules.momentum_engine import calc_rsi, calc_macd, analyze_momentum
from modules.volume_engine import detect_volume_spike, analyze_obv, analyze_volume_trend
from modules.pattern_detector import detect_consolidation, detect_breakout, detect_volatility_squeeze, detect_support_resistance, detect_liquidity_zones, get_market_session
from modules.scoring_engine import compute_stock_score
from modules.market_regime import check_market_regime, get_market_context
from modules.crypto_scanner import scan_crypto, CRYPTO_TICKERS, NARRATIVE_MAP
from modules.portfolio_manager import load_portfolio, save_portfolio, add_position, remove_position, analyze_portfolio
from modules.alert_system import load_alerts, save_alerts, add_alert, check_alerts as check_alerts_fn


app = FastAPI(title="Swing Trading Platform")

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
    "F", "GM", "TSM", "ARM",
]

INDICATOR_TOOLTIPS = {
    "rsi": "RSI (Relative Strength Index) measures speed/change of price movements. 55-75 = healthy momentum.",
    "macd": "MACD shows relationship between two moving averages. Positive histogram = bullish momentum.",
    "ema": "20/50/200 day EMAs show short, medium, and long-term trends. Golden cross = 50 > 200.",
    "bb": "Bollinger Bands measure volatility. Squeeze = low vol before potential breakout.",
    "stoch": "Stochastic Oscillator compares close price to price range. Over 80 = overbought.",
    "atr": "ATR (Average True Range) measures market volatility.",
    "volume": "Volume > 1.5x average indicates strong institutional interest.",
    "obv": "On-Balance Volume tracks cumulative volume. Rising OBV confirms uptrend.",
}


def sanitize_ticker(ticker: str) -> str:
    return ticker.strip().upper().replace(".", "-")


def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low = df["high"], df["low"]
    close = df["close"].shift(1)
    tr = pd.concat([high - low, (high - close).abs(), (low - close).abs()], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def calc_bollinger_bands(series: pd.Series, period: int = 20) -> dict:
    sma = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper, lower = sma + (std * 2), sma - (std * 2)
    return {
        "upper": round(float(upper.iloc[-1]), 2),
        "middle": round(float(sma.iloc[-1]), 2),
        "lower": round(float(lower.iloc[-1]), 2),
        "bandwidth": round(float(((upper.iloc[-1] - lower.iloc[-1]) / sma.iloc[-1]) * 100), 2),
    }


def calc_stochastic(df: pd.DataFrame, k_period: int = 14) -> dict:
    low_min = df["low"].rolling(window=k_period).min()
    high_max = df["high"].rolling(window=k_period).max()
    k = 100 * (df["close"] - low_min) / (high_max - low_min).replace(0, np.nan)
    d = k.rolling(window=3).mean()
    return {
        "k": round(float(k.iloc[-1]), 2) if not np.isnan(k.iloc[-1]) else 50,
        "d": round(float(d.iloc[-1]), 2) if not np.isnan(d.iloc[-1]) else 50,
    }


def build_chart_data(df: pd.DataFrame, sr: dict) -> dict:
    candles, volume, ema20d, ema50d, ema200d = [], [], [], [], []
    for idx, row in df.tail(120).iterrows():
        ts = idx.strftime("%Y-%m-%d")
        candles.append({"time": ts, "open": round(float(row["open"]), 2), "high": round(float(row["high"]), 2), "low": round(float(row["low"]), 2), "close": round(float(row["close"]), 2)})
        volume.append({"time": ts, "value": int(row["volume"]), "color": "rgba(38,166,154,0.5)" if row["close"] >= row["open"] else "rgba(239,83,80,0.5)"})
        ema20d.append({"time": ts, "value": round(float(row["ema20"]), 2)})
        ema50d.append({"time": ts, "value": round(float(row["ema50"]), 2)})
        ema200d.append({"time": ts, "value": round(float(row["ema200"]), 2)})
    return {
        "candles": candles,
        "volume": volume,
        "ema20": ema20d,
        "ema50": ema50d,
        "ema200": ema200d,
        "support_lines": [{"level": s, "label": f"S{i+1}"} for i, s in enumerate(sr["support"])],
        "resistance_lines": [{"level": r, "label": f"R{i+1}"} for i, r in enumerate(sr["resistance"])],
    }


@app.get("/analyze")
def analyze(ticker: str = Query(...)):
    try:
        ticker = sanitize_ticker(ticker)
        if not ticker:
            raise HTTPException(status_code=400, detail="Ticker is required")

        df = fetch_data(ticker)
        df["ema20"] = calc_ema(df["close"], 20)
        df["ema50"] = calc_ema(df["close"], 50)
        df["ema200"] = calc_ema(df["close"], 200)
        df["rsi"] = calc_rsi(df["close"], 14)
        df["atr"] = calc_atr(df, 14)

        latest = df.iloc[-1]
        price = round(float(latest["close"]), 2)
        ema20, ema50, ema200 = round(float(latest["ema20"]), 2), round(float(latest["ema50"]), 2), round(float(latest["ema200"]), 2)
        rsi_val, atr_val = round(float(latest["rsi"]), 2), round(float(latest["atr"]), 2)
        atr_pct = atr_val / price if price > 0 else 0

        trend = analyze_trend(df)
        sr = detect_support_resistance(df)
        macd = calc_macd(df["close"])
        bb = calc_bollinger_bands(df["close"])
        stoch = calc_stochastic(df)
        info = fetch_info(ticker)
        vol_spike = detect_volume_spike(df)
        obv = analyze_obv(df)
        regime = check_market_regime()

        sentiment = compute_sentiment(trend, rsi_val, macd, price, ema20, ema50, ema200, stoch, bb, atr_pct, info)
        strategy = compute_strategy(trend["state"], sentiment, price, sr, atr_val, info)

        volatility_30d = float(df["close"].pct_change().tail(30).std())
        risk = compute_risk(atr_pct, trend["state"], volatility_30d)

        growth_score = 50
        returns_3m = float((price / df["close"].iloc[-63] - 1) * 100) if len(df) > 63 else 0.0
        if returns_3m > 10: growth_score += 15
        elif returns_3m < -10: growth_score -= 15
        if info.get("revenueGrowth", 0) > 0.15: growth_score += 15
        if info.get("earningsGrowth", 0) > 0.2: growth_score += 15
        growth_score = max(0, min(100, growth_score))
        growth_label = "High Growth" if growth_score >= 70 else "Moderate Growth" if growth_score >= 50 else "Low Growth" if growth_score >= 30 else "Declining"

        returns = {
            "1_month": round(float((price / df["close"].iloc[-21] - 1) * 100), 2) if len(df) > 21 else 0.0,
            "3_months": round(float(returns_3m), 2),
            "6_months": round(float((price / df["close"].iloc[-126] - 1) * 100), 2) if len(df) > 126 else 0.0,
            "1_year": round(float((price / df["close"].iloc[-252] - 1) * 100), 2) if len(df) > 252 else 0.0,
        }

        fundamentals = build_fundamentals(info)

        return {
            "ticker": ticker,
            "company_name": info.get("shortName", ticker),
            "current_price": price,
            "timestamp": datetime.now().isoformat(),
            "trend": trend["state"],
            "sentiment": sentiment,
            "scoring": sentiment.get("components", {}),
            "growth_potential": {"score": growth_score, "label": growth_label, "returns": returns},
            "fundamentals": fundamentals,
            "risk": risk,
            "strategy": strategy,
            "support": sr["support"],
            "resistance": sr["resistance"],
            "volume_spike": vol_spike["spike"],
            "institutional": obv,
            "market_regime": regime,
            "indicators": {
                "ema20": ema20, "ema50": ema50, "ema200": ema200,
                "rsi": rsi_val, "atr": atr_val, "atr_percent": round(atr_pct * 100, 2),
                "macd": {k: round(v, 2) if isinstance(v, float) else v for k, v in macd.items()},
                "bollinger_bands": bb, "stochastic": stoch,
                "volume_trend": "increasing" if df["volume"].tail(5).mean() > df["volume"].tail(20).mean() else "decreasing",
                "obv_rising": obv["rising"],
            },
            "chart_data": build_chart_data(df, sr),
            "tooltips": INDICATOR_TOOLTIPS,
            "disclaimer": "This analysis is for informational purposes only. It is not financial advice.",
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed for {ticker}: {str(e)}")


def compute_sentiment(trend, rsi, macd, price, ema20, ema50, ema200, stoch, bb, atr_pct, fundamentals) -> dict:
    score = 0
    tech_reasons = []
    fund_reasons = []

    ema_aligned = price > ema20 > ema50 > ema200
    ema_bearish = price < ema50 and ema20 < ema50
    macd_bullish = macd["histogram"] > 0
    rsi_oversold = rsi < 25
    rsi_overbought = rsi > 75
    stoch_oversold = stoch["k"] < 20
    stoch_overbought = stoch["k"] > 80
    bb_lower_band = price < bb["lower"]
    bb_upper_band = price > bb["upper"]

    if ema_aligned:
        score += 20
        tech_reasons.append(f"Bullish alignment: 20EMA ({ema20}) > 50EMA ({ema50}) > 200EMA ({ema200})")
    elif ema_bearish:
        score -= 20
        tech_reasons.append(f"Bearish alignment: price below 50EMA ({ema50})")
    elif price > ema200:
        score += 5
        tech_reasons.append("Price above 200-day EMA (long-term uptrend)")
    else:
        score -= 10
        tech_reasons.append("Price below 200-day EMA (long-term downtrend)")

    if macd_bullish and macd["macd"] > macd["signal"]:
        score += 12
        tech_reasons.append(f"MACD bullish: line ({macd['macd']}) > signal ({macd['signal']}), histogram positive ({macd['histogram']})")
    elif macd_bullish:
        score += 6
        tech_reasons.append("MACD histogram positive (short-term momentum up)")
    else:
        score -= 8
        tech_reasons.append("MACD histogram negative (momentum down)")

    if rsi_oversold:
        score += 12
        tech_reasons.append(f"RSI deeply oversold ({rsi}) — potential bounce opportunity")
    elif rsi < 35:
        score += 6
        tech_reasons.append(f"RSI approaching oversold ({rsi}) — watch for reversal")
    elif rsi_overbought:
        score -= 12
        tech_reasons.append(f"RSI overbought ({rsi}) — potential pullback risk")
    elif rsi > 65:
        score -= 6
        tech_reasons.append(f"RSI nearing overbought ({rsi})")

    if stoch_oversold:
        score += 8
        tech_reasons.append("Stochastic oversold — may reverse up")
    elif stoch_overbought:
        score -= 8
        tech_reasons.append("Stochastic overbought — may reverse down")

    if bb_lower_band:
        score += 8
        tech_reasons.append(f"Price near lower Bollinger Band (${bb['lower']}) — potential support bounce")
    elif bb_upper_band:
        score -= 8
        tech_reasons.append(f"Price near upper Bollinger Band (${bb['upper']}) — extended")

    if atr_pct > 0.015:
        tech_reasons.append(f"ATR {atr_pct*100:.1f}% — {'high' if atr_pct > 0.03 else 'moderate'} volatility")

    if fundamentals.get("revenue_growth") and fundamentals["revenue_growth"] > 0.15:
        score += 12
        fund_reasons.append(f"Revenue growth {fundamentals['revenue_growth']*100:.1f}%")
    elif fundamentals.get("revenue_growth") and fundamentals["revenue_growth"] > 0:
        score += 4
        fund_reasons.append("Positive revenue growth")

    if fundamentals.get("earnings_growth") and fundamentals["earnings_growth"] > 0.2:
        score += 12
        fund_reasons.append(f"Earnings growth {fundamentals['earnings_growth']*100:.1f}%")
    elif fundamentals.get("earnings_growth") and fundamentals["earnings_growth"] > 0:
        score += 4
        fund_reasons.append("Positive earnings growth")

    pe = fundamentals.get("pe_ratio")
    if pe and 10 < pe < 20:
        score += 8
        fund_reasons.append(f"Reasonable P/E ({pe:.1f})")
    elif pe and pe < 10:
        score += 4
        fund_reasons.append(f"Low P/E ({pe:.1f})")
    elif pe and pe > 40:
        score -= 8
        fund_reasons.append(f"Rich valuation (P/E: {pe:.1f})")

    de = fundamentals.get("debt_to_equity")
    if de is not None and de < 0.5:
        score += 4
        fund_reasons.append("Low debt/equity")
    elif de is not None and de > 2:
        score -= 4
        fund_reasons.append("High debt/equity")

    score = max(-100, min(100, score))
    confidence = min(90, max(10, abs(score) + 15))

    if score >= 70:
        signal, color = "Strong Buy", "#10b981"
    elif score >= 30:
        signal, color = "Buy", "#34d399"
    elif score >= -30:
        signal, color = "Hold", "#f59e0b"
    elif score >= -70:
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


def compute_strategy(trend, sentiment, price, sr, atr, fundamentals) -> dict:
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
        desc = "High volatility favors shorter holding periods"
    elif score >= 50 and fundamentals.get("revenue_growth", 0) > 0.1:
        timeframe = "long"
        timeframe_label = "Long-term (1-3+ months)"
        desc = "Strong fundamentals support longer holding period"
    else:
        timeframe = "medium"
        timeframe_label = "Medium-term (1-4 weeks)"
        desc = "Moderate setup suitable for swing trading"

    rationale = []
    if trend == "bullish" or trend == "strong_uptrend":
        rationale.append("Clear upward trend established")
    elif trend == "bearish":
        rationale.append("Downtrend in place - caution advised")
    else:
        rationale.append("Price consolidating - wait for direction")

    if sentiment["score"] >= 40:
        rationale.append("Multiple technical and fundamental indicators align positively")
    elif sentiment["score"] <= -40:
        rationale.append("Technical and fundamental indicators suggest weakness")

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
        level, color = "high", "#ef4444"
    elif vol_score > 2.5:
        level, color = "medium", "#f59e0b"
    else:
        level, color = "low", "#10b981"
    return {
        "level": level,
        "color": color,
        "volatility_percent": round(vol_score, 2),
        "annualized_volatility": round(float(volatility_30d * np.sqrt(252) * 100), 2),
    }


def build_fundamentals(info: dict) -> dict:
    result = {}
    for k in ["sector", "industry", "shortName", "marketCap", "trailingPE", "forwardPE",
              "pegRatio", "priceToBook", "debtToEquity", "revenueGrowth", "earningsGrowth",
              "profitMargins", "operatingMargins", "returnOnEquity", "currentRatio",
              "dividendYield", "beta", "targetMeanPrice", "recommendationKey",
              "fiftyTwoWeekHigh", "fiftyTwoWeekLow"]:
        result[k] = info.get(k)

    f_score = 50
    rev = result.get("revenueGrowth")
    earn = result.get("earningsGrowth")
    pe = result.get("trailingPE")
    de = result.get("debtToEquity")
    pm = result.get("profitMargins")

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
    label = "Excellent" if f_score >= 75 else "Good" if f_score >= 60 else "Average" if f_score >= 40 else "Below Average" if f_score >= 20 else "Weak"

    result["score"] = f_score
    result["label"] = label
    return result


@app.get("/analyze/simple")
def analyze_simple(ticker: str = Query(...)):
    try:
        ticker = sanitize_ticker(ticker)
        df = fetch_data(ticker, days=100)
        latest = df.iloc[-1]
        return {
            "ticker": ticker,
            "price": round(float(latest["close"]), 2),
            "change": round(float((latest["close"] / df.iloc[-2]["close"] - 1) * 100), 2),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analyze/chart")
def analyze_chart(ticker: str = Query(...), timeframe: str = Query("1 day")):
    ticker = sanitize_ticker(ticker)
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    try:
        mtf = fetch_multi_timeframe(ticker)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Chart data unavailable: {str(e)}")

    tf_map = {"15 min": "15m", "1 hour": "1h", "1 day": "1d"}
    selected = mtf.get(timeframe)
    if selected is None:
        selected = mtf.get("1 day", next(iter(mtf.values())) if mtf else None)
    if selected is None or selected.empty:
        raise HTTPException(status_code=404, detail="CHART DATA NOT AVAILABLE")

    df = selected
    df["ema20"] = calc_ema(df["close"], 20)
    df["ema50"] = calc_ema(df["close"], 50)
    df["ema200"] = calc_ema(df["close"], 200)
    df["rsi"] = calc_rsi(df["close"], 14)

    price = float(df["close"].iloc[-1])
    ema20 = float(df["ema20"].iloc[-1])
    ema50 = float(df["ema50"].iloc[-1])
    ema200 = float(df["ema200"].iloc[-1])
    rsi_val = float(df["rsi"].iloc[-1]) if not pd.isna(df["rsi"].iloc[-1]) else None
    macd = calc_macd(df["close"])

    trend = analyze_trend(df)
    sr = detect_support_resistance(df)
    vol = detect_volume_spike(df)
    squeeze = detect_volatility_squeeze(df)
    liq = detect_liquidity_zones(df)
    session = get_market_session()
    regime = check_market_regime()

    ema_aligned = price > ema20 > ema50 > ema200
    ema_bearish = price < ema50 and ema20 < ema50
    macd_bullish = macd["histogram"] > 0

    if ema_aligned and macd_bullish:
        structure = "bullish"
    elif ema_bearish and not macd_bullish:
        structure = "bearish"
    elif squeeze["squeeze"]:
        structure = "squeeze"
    else:
        structure = "ranging"

    is_intraday = timeframe in ("15 min", "1 hour")
    to_time = (lambda t: int(t.timestamp())) if is_intraday else (lambda t: t.strftime("%Y-%m-%d"))

    candles_out = []
    for idx, row in df.iterrows():
        candles_out.append({
            "time": to_time(idx),
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
        })

    volume_out = []
    for idx, row in df.iterrows():
        volume_out.append({
            "time": to_time(idx),
            "value": int(row["volume"]),
            "color": "rgba(38,166,154,0.5)" if row["close"] >= row["open"] else "rgba(239,83,80,0.5)",
        })

    rsi_out = []
    for idx, row in df.iterrows():
        rsi_val_row = round(float(row["rsi"]), 1) if not pd.isna(row["rsi"]) else None
        rsi_out.append({
            "time": to_time(idx),
            "value": rsi_val_row,
        })

    ema20_out = filter_vals([{"time": to_time(idx), "value": round(float(row["ema20"]), 2)} for idx, row in df.iterrows()])
    ema50_out = filter_vals([{"time": to_time(idx), "value": round(float(row["ema50"]), 2)} for idx, row in df.iterrows()])
    ema200_out = filter_vals([{"time": to_time(idx), "value": round(float(row["ema200"]), 2)} for idx, row in df.iterrows()])

    all_tfs = {}
    for tf_label, tf_df in mtf.items():
        if tf_df is not None and not tf_df.empty:
            tdf = tf_df.copy()
            tdf["ema20"] = calc_ema(tdf["close"], 20)
            tdf["ema50"] = calc_ema(tdf["close"], 50)
            tdf["ema200"] = calc_ema(tdf["close"], 200)
            t_price = float(tdf["close"].iloc[-1])
            t_trend = analyze_trend(tdf)
            t_rsi_series = calc_rsi(tdf["close"], 14)
            t_rsi_val = float(t_rsi_series.iloc[-1]) if not pd.isna(t_rsi_series.iloc[-1]) else None
            all_tfs[tf_label] = {
                "price": round(t_price, 2),
                "trend": t_trend["state"],
                "rsi": round(t_rsi_val, 1),
                "ema20": round(float(tdf["ema20"].iloc[-1]), 2),
                "ema50": round(float(tdf["ema50"].iloc[-1]), 2),
                "ema200": round(float(tdf["ema200"].iloc[-1]), 2),
            }

    tf_alignment = "aligned"
    trends_set = set(v["trend"] for v in all_tfs.values())
    if len(trends_set) > 1:
        tf_alignment = "conflict"
    if "bearish" in trends_set and "strong_uptrend" in trends_set:
        tf_alignment = "strong_conflict"

    return {
        "ticker": ticker,
        "timeframe": timeframe,
        "current_price": round(price, 2),
        "market_structure": structure,
        "trend": trend["state"],
        "ema_alignment": "bullish" if ema_aligned else "bearish" if ema_bearish else "mixed",
        "rsi": round(rsi_val, 1) if rsi_val is not None else None,
        "rsi_zone": "overbought" if rsi_val and rsi_val > 75 else "oversold" if rsi_val and rsi_val < 30 else "healthy" if rsi_val and 55 <= rsi_val <= 75 else "neutral",
        "macd": {k: round(v, 2) if isinstance(v, float) else v for k, v in macd.items()},
        "volume": {
            "spike": vol["spike"],
            "vol_ratio": vol["vol_ratio"],
            "avg_20": vol["avg_volume_20"],
            "current": vol["current_volume"],
        },
        "support_resistance": {
            "support": sr["support"],
            "resistance": sr["resistance"],
            "support_zones": sr["support_zones"],
            "resistance_zones": sr["resistance_zones"],
        },
        "liquidity_zones": liq,
        "squeeze": squeeze,
        "session": session,
        "market_regime": regime,
        "multi_timeframe": all_tfs,
        "timeframe_alignment": tf_alignment,
        "chart": {
            "candles": candles_out,
            "volume": volume_out,
            "rsi": rsi_out,
            "ema20": ema20_out,
            "ema50": ema50_out,
            "ema200": ema200_out,
            "support_lines": [{"level": s, "label": f"S{i+1}"} for i, s in enumerate(sr["support"])],
            "resistance_lines": [{"level": r, "label": f"R{i+1}"} for i, r in enumerate(sr["resistance"])],
        },
        "no_trade_zone": structure == "ranging" or (rsi_val is not None and rsi_val > 78 and not vol["spike"]),
    }


def filter_vals(vals: list) -> list:
    return [v for v in vals if v["value"] > 0]


@app.get("/screener")
def screener(
    preset: str = Query("all"),
    ticker: Optional[str] = Query(None),
    min_score: float = Query(0),
):
    stocks = []
    tickers_to_scan = [sanitize_ticker(ticker)] if ticker else WATCHLIST_TICKERS

    for t in tickers_to_scan:
        try:
            df = fetch_data(t, days=250)
            if df.empty or len(df) < 50:
                continue
            df["ema20"] = calc_ema(df["close"], 20)
            df["ema50"] = calc_ema(df["close"], 50)
            df["ema200"] = calc_ema(df["close"], 200)
            df["rsi"] = calc_rsi(df["close"], 14)
            df["atr"] = calc_atr(df, 14)

            latest = df.iloc[-1]
            price = round(float(latest["close"]), 2)
            atr_pct = float(latest["atr"] / price) if price > 0 else 0
            trend = analyze_trend(df)
            macd = calc_macd(df["close"])
            bb = calc_bollinger_bands(df["close"])
            stoch = calc_stochastic(df)
            info = fetch_info(t)
            sentiment = compute_sentiment(trend, round(float(latest["rsi"]), 2), macd, price,
                                          round(float(latest["ema20"]), 2), round(float(latest["ema50"]), 2),
                                          round(float(latest["ema200"]), 2), stoch, bb, atr_pct, info)

            volume_spike = detect_volume_spike(df)
            consolidation = detect_consolidation(df)
            breakout = detect_breakout(df)
            obv = analyze_obv(df)

            spy_df = get_cached("spy_for_rs", lambda: fetch_data("SPY", days=250), ttl=300)
            rs = relative_strength_vs_spy(t, df, spy_df)

            scoring = compute_stock_score(
                trend_score=trend["score"],
                volume_score=volume_spike["score"] + (5 if consolidation["consolidating"] else 0),
                pattern_score=breakout["score"] + consolidation["score"],
                momentum_score=round(float(latest["rsi"]), 0),
                rs_score=rs["score"],
                obv_score=obv["score"],
            )

            returns_3m = round(float((price / df["close"].iloc[-63] - 1) * 100), 2) if len(df) > 63 else 0.0
            fundamentals = build_fundamentals(info)

            stock = {
                "ticker": t,
                "price": price,
                "trend": trend["state"],
                "signal": sentiment["signal"],
                "score": scoring["total_score"],
                "grade": scoring["grade"],
                "label": scoring["label"],
                "confidence": sentiment["confidence"],
                "rsi": round(float(latest["rsi"]), 1),
                "pe_ratio": info.get("trailingPE"),
                "revenue_growth": round(info.get("revenueGrowth", 0) * 100, 1) if info.get("revenueGrowth") else None,
                "returns_3m": returns_3m,
                "volume_spike": volume_spike["spike"],
                "consolidating": consolidation["consolidating"],
                "breakout": breakout["breakout"],
                "sector": info.get("sector", "N/A"),
                "fundamental_score": fundamentals.get("score", 50),
                "risk": "high" if atr_pct > 0.04 else "medium" if atr_pct > 0.025 else "low",
                "rs_ratio": rs["rs_ratio"],
                "entry_zone": f"${round(price * 0.98, 2)} - ${round(price * 1.01, 2)}",
                "stop_loss": f"${round(price * 0.95, 2)}",
                "support_1": f"${round(price * 0.96, 2)}",
                "resistance_1": f"${round(price * 1.04, 2)}",
            }

            if preset == "strong_buy" and scoring["total_score"] < 40:
                continue
            if preset == "growth" and info.get("revenueGrowth", 0) < 0.1:
                continue
            if preset == "momentum" and not (trend["state"] in ["strong_uptrend", "uptrend"] and volume_spike["spike"]):
                continue
            if preset == "value" and (not info.get("trailingPE") or info["trailingPE"] > 25):
                continue

            if scoring["total_score"] < min_score:
                continue

            stocks.append(stock)
        except Exception:
            continue

    stocks.sort(key=lambda x: x["score"], reverse=True)
    return {"count": len(stocks), "preset": preset, "stocks": stocks}


@app.get("/screener/scan")
def scan_stocks(
    min_score: float = Query(70, description="Minimum score threshold"),
    max_results: int = Query(50),
):
    stocks = screener(preset="all", min_score=min_score)
    return {
        "count": len(stocks["stocks"]),
        "threshold": min_score,
        "results": stocks["stocks"][:max_results],
    }


@app.get("/crypto/scan")
def crypto_scan():
    results = scan_crypto()
    return {"count": len(results), "results": results}


@app.get("/crypto/tickers")
def crypto_tickers():
    return {"tickers": CRYPTO_TICKERS, "narratives": NARRATIVE_MAP}


@app.get("/market")
def market_context():
    return get_market_context()


@app.get("/market/regime")
def market_regime():
    return check_market_regime()


@app.get("/portfolio")
def get_portfolio():
    return {"holdings": load_portfolio()}


@app.post("/portfolio/add")
def add_to_portfolio(
    ticker: str = Query(...),
    entry_price: float = Query(...),
    quantity: float = Query(1),
    entry_date: Optional[str] = Query(None),
    leverage: float = Query(1.0),
):
    return add_position(ticker, entry_price, quantity, entry_date, leverage)


@app.delete("/portfolio/remove")
def remove_from_portfolio(ticker: str = Query(...), index: int = Query(0)):
    return remove_position(ticker, index)


@app.get("/portfolio/analyze")
def analyze_portfolio_endpoint():
    portfolio = load_portfolio()
    current_prices = {}
    for h in portfolio:
        try:
            df = fetch_data(h["ticker"], days=5)
            if not df.empty:
                current_prices[h["ticker"]] = float(df["close"].iloc[-1])
        except Exception:
            current_prices[h["ticker"]] = h["entry_price"]
    return analyze_portfolio(current_prices)


@app.get("/alerts")
def get_alerts():
    return {"alerts": load_alerts()}


@app.post("/alerts/add")
def add_alert_endpoint(ticker: str = Query(...), alert_type: str = Query(...), price_level: float = Query(...)):
    return add_alert(ticker, alert_type, price_level)


@app.post("/alerts/check")
def check_alerts_endpoint():
    portfolio = load_portfolio()
    current_prices = {}
    for h in portfolio:
        try:
            df = fetch_data(h["ticker"], days=5)
            if not df.empty:
                current_prices[h["ticker"]] = float(df["close"].iloc[-1])
        except Exception:
            pass
    alerts_list = load_alerts()
    for a in alerts_list:
        try:
            if not a.get("triggered"):
                df = fetch_data(a["ticker"], days=5)
                if not df.empty:
                    current_prices[a["ticker"]] = float(df["close"].iloc[-1])
        except Exception:
            pass
    triggered = check_alerts_fn(current_prices)
    return {"triggered": triggered, "alerts": load_alerts()}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
