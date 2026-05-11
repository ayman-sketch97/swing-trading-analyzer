import pandas as pd
import numpy as np
from datetime import datetime


def detect_consolidation(df: pd.DataFrame, min_days: int = 15, max_days: int = 50) -> dict:
    if df.empty or len(df) < min_days:
        return {"consolidating": False, "score": 0, "details": ""}

    recent = df.tail(max_days)
    high = recent["high"].max()
    low = recent["low"].min()
    range_pct = ((high - low) / low) * 100

    consolidating = range_pct < 20

    score = 15 if consolidating else 0

    tightness = "tight" if range_pct < 10 else "moderate" if range_pct < 20 else "loose"

    return {
        "consolidating": consolidating,
        "range_pct": round(range_pct, 2),
        "range_high": round(float(high), 2),
        "range_low": round(float(low), 2),
        "tightness": tightness,
        "duration_days": min(len(recent), max_days),
        "score": score,
        "details": f"{tightness} consolidation over {min(len(recent), max_days)} days ({range_pct:.1f}% range)",
    }


def detect_breakout(df: pd.DataFrame, lookback: int = 20) -> dict:
    if df.empty or len(df) < lookback + 5:
        return {"breakout": False, "score": 0}

    recent_highs = df["high"].tail(lookback).max()
    current_close = df["close"].iloc[-1]
    current_vol = df["volume"].iloc[-1]
    avg_vol = df["volume"].tail(lookback).mean()

    near_high = current_close >= recent_highs * 0.99
    volume_confirms = current_vol > avg_vol * 1.3

    breakout = bool(near_high and volume_confirms)
    early_breakout = bool(near_high and not volume_confirms)

    score = 0
    if breakout:
        score += 20
    elif early_breakout:
        score += 10

    return {
        "breakout": breakout,
        "early_breakout": early_breakout,
        "resistance_level": round(float(recent_highs), 2),
        "current_price": round(float(current_close), 2),
        "above_resistance": bool(current_close > recent_highs),
        "volume_confirms": bool(volume_confirms),
        "score": score,
        "breakout_pct": round(float((current_close / recent_highs - 1) * 100), 2),
    }


def detect_volatility_squeeze(df: pd.DataFrame, period: int = 20) -> dict:
    if df.empty or len(df) < period:
        return {"squeeze": False, "score": 0}

    high = df["high"].tail(period)
    low = df["low"].tail(period)
    close = df["close"].tail(period)

    bb_mid = close.rolling(20).mean().iloc[-1]
    bb_std = close.rolling(20).std().iloc[-1]
    bb_lower = bb_mid - 2 * bb_std
    bb_upper = bb_mid + 2 * bb_std
    bb_width = (bb_upper - bb_lower) / bb_mid

    avg_width = ((close.rolling(20).mean() + 2 * close.rolling(20).std()) -
                 (close.rolling(20).mean() - 2 * close.rolling(20).std())) / close.rolling(20).mean()
    avg_width = avg_width.tail(100).mean()

    squeezed = bb_width < avg_width * 0.7 if avg_width > 0 else False

    return {
        "squeeze": bool(squeezed),
        "bb_width": round(float(bb_width * 100), 2),
        "avg_bb_width": round(float(avg_width * 100), 2),
        "score": 10 if squeezed else 0,
        "details": f"{'Squeeze detected' if squeezed else 'No squeeze'} - BB width: {bb_width*100:.2f}%",
    }


def detect_support_resistance(df: pd.DataFrame, lookback: int = 20) -> dict:
    recent = df.tail(120)
    current_price = float(recent["close"].iloc[-1])

    lows = recent["low"].rolling(window=lookback, center=True).min()
    highs = recent["high"].rolling(window=lookback, center=True).max()

    swing_lows = recent[recent["low"] == lows][["low"]].dropna()
    swing_highs = recent[recent["high"] == highs][["high"]].dropna()

    support_raw = sorted([float(r["low"]) for _, r in swing_lows.iterrows() if float(r["low"]) < current_price * 0.99], reverse=True)
    resistance_raw = sorted([float(r["high"]) for _, r in swing_highs.iterrows() if float(r["high"]) > current_price * 1.01])

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

    entry_zone_low = support[0] if support else current_price * 0.97
    entry_zone_high = current_price * 0.995
    stop_loss = support[0] * 0.98 if support else current_price * 0.95

    return {
        "support": support,
        "resistance": resistance,
        "support_zones": [{"high": round(s * 1.005, 2), "low": round(s * 0.995, 2), "mid": s} for s in support],
        "resistance_zones": [{"high": round(r * 1.005, 2), "low": round(r * 0.995, 2), "mid": r} for r in resistance],
        "entry_zone": f"{round(entry_zone_low, 2)} - {round(entry_zone_high, 2)}",
        "stop_loss": round(stop_loss, 2),
        "current_price": current_price,
    }


def detect_liquidity_zones(df: pd.DataFrame) -> dict:
    if df.empty or len(df) < 30:
        return {"equal_highs": [], "equal_lows": [], "wick_rejections": []}

    recent = df.tail(60)
    price = float(recent["close"].iloc[-1])

    equal_highs = []
    for i in range(10, len(recent) - 5):
        left = float(recent["high"].iloc[i - 5:i].max())
        mid = float(recent["high"].iloc[i])
        right = float(recent["high"].iloc[i + 1:i + 6].max())
        if abs(mid - left) / max(mid, 0.01) < 0.01 and abs(mid - right) / max(mid, 0.01) < 0.01:
            if mid > price * 0.95 and not any(abs(mid - e) / max(mid, 0.01) < 0.005 for e in equal_highs):
                equal_highs.append(round(mid, 2))

    equal_lows = []
    for i in range(10, len(recent) - 5):
        left = float(recent["low"].iloc[i - 5:i].min())
        mid = float(recent["low"].iloc[i])
        right = float(recent["low"].iloc[i + 1:i + 6].min())
        if abs(mid - left) / max(mid, 0.01) < 0.01 and abs(mid - right) / max(mid, 0.01) < 0.01:
            if mid < price * 1.05 and not any(abs(mid - e) / max(mid, 0.01) < 0.005 for e in equal_lows):
                equal_lows.append(round(mid, 2))

    wick_rejections = []
    for i in range(5, len(recent) - 2):
        candle = recent.iloc[i]
        body = abs(float(candle["close"]) - float(candle["open"]))
        upper_wick = float(candle["high"]) - max(float(candle["close"]), float(candle["open"]))
        lower_wick = min(float(candle["close"]), float(candle["open"])) - float(candle["low"])
        if body > 0:
            if upper_wick > body * 2 and upper_wick > (float(candle["high"]) - float(candle["low"])) * 0.6:
                wick_rejections.append({
                    "type": "rejection_above",
                    "level": round(float(candle["high"]), 2),
                    "index": int(i),
                })
            if lower_wick > body * 2 and lower_wick > (float(candle["high"]) - float(candle["low"])) * 0.6:
                wick_rejections.append({
                    "type": "rejection_below",
                    "level": round(float(candle["low"]), 2),
                    "index": int(i),
                })

    return {
        "equal_highs": equal_highs[:3],
        "equal_lows": equal_lows[:3],
        "wick_rejections": wick_rejections[-4:],
    }


def get_market_session() -> dict:
    now = datetime.now()
    hour = now.hour
    minute = now.minute
    total_min = hour * 60 + minute

    if 0 <= total_min < 540:
        session = "asian"
        vol_expected = "low"
        desc = "Low volatility, range-bound typically"
    elif 540 <= total_min < 630:
        session = "london_open"
        vol_expected = "increasing"
        desc = "London open - breakouts often start here"
    elif 630 <= total_min < 900:
        session = "london"
        vol_expected = "moderate"
        desc = "London morning, established trends"
    elif 900 <= total_min < 960:
        session = "ny_open"
        vol_expected = "high"
        desc = "NYSE open - highest volume session"
    elif 960 <= total_min < 1140:
        session = "ny_afternoon"
        vol_expected = "moderate"
        desc = "NY afternoon, trend continuation/reversal zone"
    elif 1140 <= total_min < 1200:
        session = "ny_close"
        vol_expected = "high"
        desc = "NYSE close - often volatile"
    else:
        session = "after_hours"
        vol_expected = "low"
        desc = "After hours - low liquidity, unreliable signals"

    return {
        "session": session,
        "volatility_expected": vol_expected,
        "description": desc,
        "is_major_session": session in ["london_open", "ny_open", "ny_close"],
    }
