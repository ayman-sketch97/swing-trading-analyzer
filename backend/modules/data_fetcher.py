import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional
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


def fetch_data(ticker: str, days: int = 400) -> pd.DataFrame:
    cache_key = f"fetch_data_{ticker}_{days}"
    return get_cached(cache_key, lambda: _fetch_data(ticker, days))


def _fetch_data(ticker: str, days: int = 400) -> pd.DataFrame:
    stock = yf.Ticker(ticker)
    end = datetime.now()
    start = end - timedelta(days=days)
    df = stock.history(start=start, end=end)
    if df.empty:
        raise ValueError(f"No data found for ticker: {ticker}")
    df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
    df.index = pd.to_datetime(df.index)
    df.columns = [c.lower() for c in df.columns]
    return df


def fetch_data_interval(ticker: str, interval: str = "1h", period: str = "1mo") -> pd.DataFrame:
    cache_key = f"fetch_interval_{ticker}_{interval}_{period}"
    return get_cached(cache_key, lambda: _fetch_data_interval(ticker, interval, period), ttl=120)


def _fetch_data_interval(ticker: str, interval: str, period: str) -> pd.DataFrame:
    df = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
    if df is None or df.empty:
        raise ValueError(f"No {interval} data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() for c in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]
    if "close" not in df.columns and "Close" in [c.capitalize() for c in df.columns]:
        df.columns = [c.lower() for c in df.columns]
    df.index = pd.to_datetime(df.index)
    return df[["open", "high", "low", "close", "volume"]].copy()


def fetch_multi_timeframe(ticker: str) -> dict:
    configs = [
        ("15m", "5d", "15 min"),
        ("1h", "1mo", "1 hour"),
        ("1d", "1y", "1 day"),
    ]
    result = {}
    for interval, period, label in configs:
        try:
            df = fetch_data_interval(ticker, interval, period)
            result[label] = df
        except Exception:
            continue
    return result


def fetch_info(ticker: str) -> dict:
    cache_key = f"info_{ticker}"
    return get_cached(cache_key, lambda: _fetch_info(ticker), ttl=600)


def _fetch_info(ticker: str) -> dict:
    try:
        return yf.Ticker(ticker).info
    except Exception:
        return {}


def fetch_multi(tickers: list[str], days: int = 400) -> dict[str, pd.DataFrame]:
    result = {}
    for t in tickers:
        try:
            df = fetch_data(t, days)
            if df is not None and len(df) > 50:
                result[t] = df
        except Exception:
            continue
    return result


def get_market_cap(ticker: str) -> Optional[float]:
    info = fetch_info(ticker)
    return info.get("marketCap")


def get_avg_volume(df: pd.DataFrame, period: int = 50) -> float:
    return float(df["volume"].tail(period).mean())
