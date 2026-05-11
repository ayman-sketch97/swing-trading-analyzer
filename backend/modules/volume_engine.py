import pandas as pd
import numpy as np


def detect_volume_spike(df: pd.DataFrame, factor: float = 1.5, period: int = 20) -> dict:
    if df.empty or len(df) < period:
        return {"spike": False, "score": 0}

    avg_vol = df["volume"].tail(period).mean()
    current_vol = df["volume"].iloc[-1]
    spike = bool(current_vol > avg_vol * factor) if avg_vol > 0 else False

    vol_ratio = float(current_vol / avg_vol) if avg_vol > 0 else 1.0

    up_days = df[df["close"] >= df["close"].shift(1)]
    down_days = df[df["close"] < df["close"].shift(1)]
    up_vol_avg = up_days["volume"].tail(period).mean() if len(up_days) > 0 else 0
    down_vol_avg = down_days["volume"].tail(period).mean() if len(down_days) > 0 else 0

    score = 0
    if spike:
        score += 10
    if vol_ratio > 2:
        score += 5
    if up_vol_avg > down_vol_avg * 1.2:
        score += 5

    return {
        "spike": spike,
        "vol_ratio": round(vol_ratio, 2),
        "avg_volume_20": int(avg_vol),
        "current_volume": int(current_vol),
        "up_volume_ratio": round(float(up_vol_avg / down_vol_avg), 2) if down_vol_avg > 0 else 1.0,
        "score": score,
    }


def calc_obv(df: pd.DataFrame) -> pd.Series:
    obv = [0]
    for i in range(1, len(df)):
        if df["close"].iloc[i] > df["close"].iloc[i - 1]:
            obv.append(obv[-1] + df["volume"].iloc[i])
        elif df["close"].iloc[i] < df["close"].iloc[i - 1]:
            obv.append(obv[-1] - df["volume"].iloc[i])
        else:
            obv.append(obv[-1])
    return pd.Series(obv, index=df.index)


def analyze_obv(df: pd.DataFrame) -> dict:
    if df.empty or len(df) < 30:
        return {"rising": False, "score": 0}

    obv = calc_obv(df)
    obv_rising = obv.iloc[-1] > obv.iloc[-10] if len(obv) > 10 else False
    obv_confirm = (obv_rising and df["close"].iloc[-1] > df["close"].iloc[-10]) if len(df) > 10 else False

    score = 5 if obv_rising else -3

    return {
        "rising": bool(obv_rising),
        "confirming_price": bool(obv_confirm),
        "score": score,
    }


def analyze_volume_trend(df: pd.DataFrame) -> dict:
    vol = df["volume"]
    vol_ma5 = vol.tail(5).mean()
    vol_ma20 = vol.tail(20).mean()
    trend = "increasing" if vol_ma5 > vol_ma20 else "decreasing"

    recent_20 = df.tail(20)
    accumulation_days = len(recent_20[recent_20["close"] > recent_20["close"].shift(1)])
    distribution_days = 20 - accumulation_days

    vma_ratio = float(vol_ma5 / vol_ma20) if vol_ma20 > 0 else 1.0

    return {
        "trend": trend,
        "vol_ma5": int(vol_ma5),
        "vol_ma20": int(vol_ma20),
        "vma_ratio": round(vma_ratio, 2),
        "accumulation_days": int(accumulation_days),
        "distribution_days": int(distribution_days),
        "accumulation_strong": accumulation_days > distribution_days,
    }
