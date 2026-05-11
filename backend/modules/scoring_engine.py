def compute_stock_score(
    trend_score: int,
    volume_score: int,
    pattern_score: int,
    momentum_score: int,
    rs_score: int,
    obv_score: int,
) -> dict:
    score = trend_score + volume_score + pattern_score + momentum_score + rs_score + obv_score
    score = max(-100, min(100, score))

    if score >= 80:
        grade = "A+"
        label = "Strong Setup"
        signal = "Strong Buy"
    elif score >= 70:
        grade = "A"
        label = "High Quality"
        signal = "Strong Buy"
    elif score >= 55:
        grade = "B"
        label = "Good Setup"
        signal = "Buy"
    elif score >= 40:
        grade = "C"
        label = "Average"
        signal = "Hold"
    elif score >= 20:
        grade = "D"
        label = "Weak"
        signal = "Hold"
    else:
        grade = "F"
        label = "Avoid"
        signal = "Sell"

    return {
        "total_score": score,
        "grade": grade,
        "label": label,
        "signal": signal,
        "components": {
            "trend": {"score": trend_score, "max": 25, "label": "Trend Alignment"},
            "volume": {"score": volume_score, "max": 20, "label": "Volume Strength"},
            "pattern": {"score": pattern_score, "max": 20, "label": "Breakout Pattern"},
            "momentum": {"score": momentum_score, "max": 10, "label": "RSI / Momentum"},
            "relative_strength": {"score": rs_score, "max": 15, "label": "Relative Strength"},
            "institutional": {"score": obv_score, "max": 10, "label": "Institutional Signals"},
        },
    }


def compute_crypto_score(
    trend_score: int,
    volume_score: int,
    momentum_score: int,
    liquidity_score: int,
    narrative_score: int,
    btc_alignment: int,
) -> dict:
    score = trend_score + volume_score + momentum_score + liquidity_score + narrative_score + btc_alignment
    score = max(-100, min(100, score))

    if score >= 75:
        grade = "A"
        label = "Strong Setup"
    elif score >= 55:
        grade = "B"
        label = "Good Setup"
    elif score >= 35:
        grade = "C"
        label = "Average"
    else:
        grade = "D"
        label = "Weak"

    return {
        "total_score": score,
        "grade": grade,
        "label": label,
        "components": {
            "trend": {"score": trend_score, "max": 20},
            "volume": {"score": volume_score, "max": 25},
            "momentum": {"score": momentum_score, "max": 15},
            "liquidity": {"score": liquidity_score, "max": 15},
            "narrative": {"score": narrative_score, "max": 15},
            "btc_alignment": {"score": btc_alignment, "max": 10},
        },
    }
