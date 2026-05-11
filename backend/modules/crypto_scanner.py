from modules.data_fetcher import fetch_data
from modules.trend_analyzer import calc_ema, analyze_trend
from modules.momentum_engine import calc_rsi, calc_macd, analyze_momentum
from modules.volume_engine import detect_volume_spike
from modules.scoring_engine import compute_crypto_score
import pandas as pd
import numpy as np

CRYPTO_TICKERS = [
    "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD",
    "ADA-USD", "AVAX-USD", "DOT-USD", "LINK-USD", "MATIC-USD",
    "UNI-USD", "ATOM-USD", "LTC-USD", "BCH-USD", "NEAR-USD",
    "APT-USD", "ARB-USD", "OP-USD", "INJ-USD", "RUNE-USD",
]

NARRATIVE_MAP = {
    "BTC-USD": "Layer 1",
    "ETH-USD": "Layer 1 / Smart Contracts",
    "SOL-USD": "Layer 1 / High Speed",
    "XRP-USD": "Payments",
    "DOGE-USD": "Meme",
    "ADA-USD": "Layer 1 / Smart Contracts",
    "AVAX-USD": "Layer 1 / Subnets",
    "DOT-USD": "Layer 0 / Parachains",
    "LINK-USD": "Oracle / Infrastructure",
    "MATIC-USD": "L2 / Scaling",
    "UNI-USD": "DeFi / DEX",
    "ATOM-USD": "Interop / Cosmos",
    "LTC-USD": "Payments / Legacy",
    "BCH-USD": "Payments",
    "NEAR-USD": "Layer 1 / Sharding",
    "APT-USD": "Layer 1 / Move",
    "ARB-USD": "L2 / Arbitrum",
    "OP-USD": "L2 / Optimism",
    "INJ-USD": "DeFi / Derivatives",
    "RUNE-USD": "DeFi / Cross-chain",
}


def scan_crypto(min_volume_24h: float = 5_000_000) -> list[dict]:
    results = []
    btc_data = None
    try:
        btc_df = fetch_data("BTC-USD", days=200)
        if not btc_df.empty:
            btc_data = btc_df
            btc_trend = analyze_trend(btc_df)
            btc_momentum = analyze_momentum(btc_df)
    except Exception:
        btc_trend = {"state": "unknown", "score": 0}
        btc_momentum = {"score": 0}

    for ticker in CRYPTO_TICKERS:
        try:
            df = fetch_data(ticker, days=200)
            if df.empty or len(df) < 50:
                continue

            price = float(df["close"].iloc[-1])
            avg_vol = float(df["volume"].tail(20).mean())
            if avg_vol < min_volume_24h:
                continue

            trend = analyze_trend(df)
            momentum = analyze_momentum(df)
            vol = detect_volume_spike(df)
            sr = _detect_sr(df)

            btc_align = 0
            if btc_data is not None and ticker != "BTC-USD":
                corr = df["close"].tail(50).corr(btc_data["close"].tail(50))
                btc_align = 5 if not np.isnan(corr) and corr > 0.7 else 3 if not np.isnan(corr) and corr > 0.4 else 0

            narrative = NARRATIVE_MAP.get(ticker, "Other")
            nar_score = _narrative_score(narrative, momentum, vol)

            liq_score = _liquidity_score(avg_vol, price)
            total_score_data = compute_crypto_score(
                trend_score=trend["score"],
                volume_score=vol["score"],
                momentum_score=momentum["score"],
                liquidity_score=liq_score,
                narrative_score=nar_score,
                btc_alignment=btc_align,
            )

            results.append({
                "ticker": ticker,
                "price": price,
                "score": total_score_data["total_score"],
                "grade": total_score_data["grade"],
                "label": total_score_data["label"],
                "trend_state": trend["state"],
                "rsi": momentum["rsi"],
                "narrative": narrative,
                "volume_spike": vol["spike"],
                "vol_ratio": vol["vol_ratio"],
                "avg_volume": int(avg_vol),
                "support": sr["support"],
                "resistance": sr["resistance"],
                "entry_zone": sr["entry_zone"],
                "stop_loss": sr["stop_loss"],
                "btc_aligned": btc_align >= 5,
            })

        except Exception:
            continue

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def _detect_sr(df: pd.DataFrame) -> dict:
    from modules.pattern_detector import detect_support_resistance
    return detect_support_resistance(df)


def _narrative_score(narrative: str, momentum: dict, vol: dict) -> int:
    score = 5
    hot_narratives = ["Layer 1", "L2 / Scaling", "DeFi", "AI"]
    if narrative in hot_narratives:
        score += 5
    if momentum.get("score", 0) > 5:
        score += 3
    if vol.get("spike"):
        score += 2
    return score


def _liquidity_score(avg_vol: float, price: float) -> int:
    if avg_vol > 100_000_000:
        return 15
    if avg_vol > 50_000_000:
        return 12
    if avg_vol > 10_000_000:
        return 8
    if avg_vol > 5_000_000:
        return 5
    return 0
