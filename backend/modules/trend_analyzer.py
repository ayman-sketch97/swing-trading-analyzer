import pandas as pd
import numpy as np


def calc_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def analyze_trend(df: pd.DataFrame) -> dict:
    min_bars = 50
    if len(df) > 100:
        try:
            freq = pd.infer_freq(df.index)
            if freq and "h" not in freq and "min" not in freq:
                min_bars = 200
        except Exception:
            min_bars = 200 if len(df) >= 200 else 50
    if df.empty or len(df) < min_bars:
        return {"state": "insufficient_data", "score": 0, "details": {}}

    close = df["close"]
    ema20 = calc_ema(close, 20)
    ema50 = calc_ema(close, 50)
    ema200 = calc_ema(close, 200)

    price = float(close.iloc[-1])
    e20 = float(ema20.iloc[-1])
    e50 = float(ema50.iloc[-1])
    e200 = float(ema200.iloc[-1])

    above_50ma = price > e50
    golden_cross = e50 > e200
    ema20_rising = ema20.iloc[-1] > ema20.iloc[-5] if len(ema20) > 5 else False

    recent = close.tail(50)
    half = len(recent) // 2
    first_half_high = recent[:half].max()
    first_half_low = recent[:half].min()
    second_half_high = recent[half:].max()
    second_half_low = recent[half:].min()
    higher_highs = second_half_high > first_half_high
    higher_lows = second_half_low > first_half_low

    if above_50ma and golden_cross and higher_highs and higher_lows:
        state = "strong_uptrend"
        score = 25
    elif above_50ma and golden_cross:
        state = "uptrend"
        score = 18
    elif above_50ma and ema20_rising:
        state = "uptrend_neutral"
        score = 12
    elif price > e200:
        state = "neutral_bullish"
        score = 8
    elif price < e200:
        state = "weak"
        score = -10
    else:
        state = "neutral"
        score = 0

    return {
        "state": state,
        "score": score,
        "price": round(price, 2),
        "ema20": round(e20, 2),
        "ema50": round(e50, 2),
        "ema200": round(e200, 2),
        "above_50ma": above_50ma,
        "golden_cross": golden_cross,
        "ema20_rising": ema20_rising,
        "higher_highs": higher_highs,
        "higher_lows": higher_lows,
        "details": {
            "price_vs_50ma": f"{'above' if above_50ma else 'below'} 50MA",
            "ma_structure": "golden" if golden_cross else "death" if e50 < e200 else "mixed",
            "hh_hh": f"{'HH' if higher_highs else 'LH'} / {'HL' if higher_lows else 'LL'}",
        },
    }


def relative_strength_vs_spy(ticker: str, df_stock: pd.DataFrame, df_spy: pd.DataFrame) -> dict:
    if df_stock.empty or df_spy.empty or len(df_stock) < 63 or len(df_spy) < 63:
        return {"rs_ratio": 1.0, "score": 0}

    stock_ret_3m = float(df_stock["close"].iloc[-1] / df_stock["close"].iloc[-63] - 1)
    spy_ret_3m = float(df_spy["close"].iloc[-1] / df_spy["close"].iloc[-63] - 1)

    rs_ratio = (1 + stock_ret_3m) / (1 + spy_ret_3m) if spy_ret_3m != -1 else 1.0

    if rs_ratio > 1.2:
        score = 15
        strength = "strong"
    elif rs_ratio > 1.05:
        score = 10
        strength = "moderate"
    elif rs_ratio > 0.95:
        score = 5
        strength = "neutral"
    else:
        score = -5
        strength = "weak"

    return {
        "rs_ratio": round(rs_ratio, 3),
        "stock_return_3m": round(stock_ret_3m * 100, 2),
        "spy_return_3m": round(spy_ret_3m * 100, 2),
        "score": score,
        "strength": strength,
    }
