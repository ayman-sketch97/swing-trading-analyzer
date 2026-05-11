import pandas as pd
import numpy as np


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(span=period, adjust=False).mean()
    avg_loss = loss.ewm(span=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def calc_macd(series: pd.Series) -> dict:
    ema_fast = series.ewm(span=12, adjust=False).mean()
    ema_slow = series.ewm(span=26, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal = macd_line.ewm(span=9, adjust=False).mean()
    return {
        "macd": round(float(macd_line.iloc[-1]), 2),
        "signal": round(float(signal.iloc[-1]), 2),
        "histogram": round(float(macd_line.iloc[-1] - signal.iloc[-1]), 2),
        "macd_above_signal": bool(macd_line.iloc[-1] > signal.iloc[-1]),
        "histogram_rising": bool(
            (macd_line.iloc[-1] - signal.iloc[-1]) > (macd_line.iloc[-5] - signal.iloc[-5])
            if len(macd_line) > 5 else False
        ),
    }


def analyze_momentum(df: pd.DataFrame) -> dict:
    if df.empty or len(df) < 20:
        return {"score": 0, "details": {}}

    close = df["close"]
    rsi_series = calc_rsi(close, 14)
    rsi = float(rsi_series.iloc[-1])
    macd = calc_macd(close)

    ret_1m = float(close.iloc[-1] / close.iloc[-21] - 1) if len(close) > 21 else 0.0
    ret_3m = float(close.iloc[-1] / close.iloc[-63] - 1) if len(close) > 63 else 0.0

    score = 0
    reasons = []

    if 55 <= rsi <= 75:
        score += 10
        reasons.append(f"RSI healthy ({rsi:.1f})")
    elif 45 <= rsi < 55:
        score += 5
        reasons.append(f"RSI neutral ({rsi:.1f})")
    elif rsi > 75:
        score -= 5
        reasons.append(f"RSI overbought ({rsi:.1f}) - risk of pullback")
    elif rsi < 35:
        score += 3
        reasons.append(f"RSI approaching oversold ({rsi:.1f})")

    if macd["macd_above_signal"] and macd["histogram"] > 0:
        score += 8
        reasons.append(f"MACD bullish (line {macd['macd']} > signal {macd['signal']})")
    elif macd["histogram"] > 0:
        score += 4
        reasons.append("MACD histogram positive")
    else:
        score -= 5
        reasons.append("MACD bearish")

    if ret_3m > 15:
        score += 7
        reasons.append(f"Strong 3M return ({ret_3m:.1f}%)")
    elif ret_3m > 5:
        score += 4
        reasons.append(f"Positive 3M return ({ret_3m:.1f}%)")
    elif ret_3m < -10:
        score -= 5
        reasons.append(f"Weak 3M return ({ret_3m:.1f}%)")

    if ret_1m > 5:
        score += 3
        reasons.append(f"Recent 1M momentum ({ret_1m:.1f}%)")

    return {
        "rsi": round(rsi, 1),
        "rsi_zone": "healthy" if 55 <= rsi <= 75 else "overbought" if rsi > 75 else "oversold" if rsi < 30 else "neutral",
        "macd": macd,
        "returns": {
            "1m": round(ret_1m * 100, 2),
            "3m": round(ret_3m * 100, 2),
        },
        "score": score,
        "reasons": reasons,
    }
