from modules.data_fetcher import fetch_data
from modules.trend_analyzer import calc_ema
import numpy as np


def check_market_regime() -> dict:
    try:
        spy = fetch_data("SPY", days=400)
        if spy.empty or len(spy) < 200:
            return {"regime": "unknown", "allow_signals": True}

        spy_close = spy["close"]
        spy_ema50 = calc_ema(spy_close, 50)
        spy_ema200 = calc_ema(spy_close, 200)

        price = float(spy_close.iloc[-1])
        ema200 = float(spy_ema200.iloc[-1])
        ema50 = float(spy_ema50.iloc[-1])

        bullish_trend = price > ema200 and ema50 > ema200

        spy_returns = spy_close.pct_change().tail(60)
        volatility = float(spy_returns.std() * np.sqrt(252))

        vix_high = volatility > 0.25

        if bullish_trend and not vix_high:
            regime = "bullish"
            allow_signals = True
            signal_reduction = 0
        elif bullish_trend and vix_high:
            regime = "bullish_volatile"
            allow_signals = True
            signal_reduction = 20
        elif not bullish_trend and not vix_high:
            regime = "bearish_calm"
            allow_signals = False
            signal_reduction = 50
        else:
            regime = "bearish_volatile"
            allow_signals = False
            signal_reduction = 100

        return {
            "regime": regime,
            "spy_price": round(price, 2),
            "spy_ema200": round(float(ema200), 2),
            "spy_ema50": round(float(ema50), 2),
            "spy_above_200ma": bool(price > ema200),
            "volatility_annualized": round(volatility * 100, 2),
            "vix_high": bool(vix_high),
            "allow_signals": allow_signals,
            "signal_reduction_pct": signal_reduction,
        }
    except Exception:
        return {"regime": "unknown", "allow_signals": True, "signal_reduction_pct": 0}


def get_market_context() -> dict:
    indices = {"SPY": "S&P 500", "QQQ": "NASDAQ", "IWM": "Russell 2000"}
    result = {"indices": {}, "overall": "neutral"}
    scores = []

    for ticker, name in indices.items():
        try:
            df = fetch_data(ticker, days=250)
            df["ema50"] = calc_ema(df["close"], 50)
            df["ema200"] = calc_ema(df["close"], 200)
            price = float(df["close"].iloc[-1])
            ema50 = float(df["ema50"].iloc[-1])
            ema200 = float(df["ema200"].iloc[-1])
            change_1m = float((price / df["close"].iloc[-21] - 1) * 100) if len(df) > 21 else 0.0

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
