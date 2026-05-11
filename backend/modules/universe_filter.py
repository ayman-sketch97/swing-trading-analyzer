from modules.data_fetcher import fetch_info, get_avg_volume, fetch_data
import pandas as pd


def liquidity_filter(ticker: str, df: pd.DataFrame = None) -> dict:
    info = fetch_info(ticker)
    market_cap = info.get("marketCap", 0) or 0
    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
    if df is not None and price == 0 and not df.empty:
        price = float(df["close"].iloc[-1])
    avg_vol = 0
    if df is not None:
        avg_vol = get_avg_volume(df)
    elif ticker:
        try:
            df2 = fetch_data(ticker, 100)
            if not df2.empty:
                avg_vol = get_avg_volume(df2)
                if price == 0:
                    price = float(df2["close"].iloc[-1])
        except Exception:
            pass

    passes = market_cap >= 2_000_000_000 and avg_vol >= 500_000 and price >= 10

    return {
        "ticker": ticker,
        "market_cap": market_cap,
        "avg_volume": avg_vol,
        "price": price,
        "passes": passes,
        "reasons": [],
    }


def get_rejection_reasons(result: dict) -> list[str]:
    reasons = []
    if result["market_cap"] < 2_000_000_000:
        reasons.append(f"Market cap ${result['market_cap']/1e9:.1f}B < $2B")
    if result["avg_volume"] < 500_000:
        reasons.append(f"Avg volume {result['avg_volume']:.0f} < 500K")
    if result["price"] < 10:
        reasons.append(f"Price ${result['price']:.2f} < $10")
    return reasons
