"use client";

import { useState } from "react";
import PriceChart from "@/components/PriceChart";
import AnalysisCard from "@/components/AnalysisCard";

interface AnalysisResult {
  ticker: string;
  current_price: number;
  timestamp: string;
  trend: string;
  setup_type: string;
  signal_strength: number;
  support_zones: { high: number; low: number; mid: number }[];
  resistance_zones: { high: number; low: number; mid: number }[];
  entry_zone: string;
  exit_zone: string;
  stop_loss: string;
  holding_period: string;
  risk_level: string;
  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;
    rsi: number;
    atr: number;
    atr_percent: number;
    current_price: number;
    volume_trend: string;
  };
  chart_data: {
    candles: { time: number; open: number; high: number; low: number; close: number }[];
    volume: { time: number; value: number; color: string }[];
    ema20: { time: number; value: number }[];
    ema50: { time: number; value: number }[];
    ema200: { time: number; value: number }[];
    support_lines: { level: number; label: string }[];
    resistance_lines: { level: number; label: string }[];
  };
  disclaimer: string;
}

interface WatchlistItem {
  ticker: string;
  trend: string;
  strength: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("watchlist");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const saveWatchlist = (items: WatchlistItem[]) => {
    setWatchlist(items);
    if (typeof window !== "undefined") {
      localStorage.setItem("watchlist", JSON.stringify(items));
    }
  };

  const analyze = async (searchTicker?: string) => {
    const t = (searchTicker || ticker).trim().toUpperCase();
    if (!t) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/analyze?ticker=${encodeURIComponent(t)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to analyze ticker");
      }
      const data = await res.json();
      setResult(data);
      setTicker(t);

      const exists = watchlist.find((w) => w.ticker === t);
      if (!exists) {
        const newItem: WatchlistItem = {
          ticker: t,
          trend: data.trend,
          strength: data.signal_strength,
        };
        saveWatchlist([...watchlist, newItem]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const removeFromWatchlist = (t: string) => {
    saveWatchlist(watchlist.filter((w) => w.ticker !== t));
  };

  const analyzeFromWatchlist = (t: string) => {
    analyze(t);
  };

  const trendColor = (trend: string) => {
    if (trend === "bullish") return "bullish";
    if (trend === "bearish") return "bearish";
    return "neutral";
  };

  const riskColor = (risk: string) => {
    if (risk === "low") return "bullish";
    if (risk === "high") return "bearish";
    return "neutral";
  };

  const strengthColor = (score: number) => {
    if (score >= 70) return "bullish";
    if (score <= 30) return "bearish";
    return "neutral";
  };

  return (
    <main className="min-h-screen bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Swing Trading Analyzer</h1>
          <p className="text-slate-400">Probabilistic technical analysis for swing trading setups</p>
        </header>

        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && analyze()}
            placeholder="Enter ticker (e.g. AAPL, TSLA, BTC)"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={() => analyze()}
            disabled={loading || !ticker}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {watchlist.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm text-slate-400 uppercase tracking-wider mb-2">Watchlist</h2>
            <div className="flex flex-wrap gap-2">
              {watchlist.map((item) => (
                <div
                  key={item.ticker}
                  className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
                >
                  <button
                    onClick={() => analyzeFromWatchlist(item.ticker)}
                    className="text-white font-medium hover:text-blue-400 transition-colors"
                  >
                    {item.ticker}
                  </button>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      item.trend === "bullish"
                        ? "bg-emerald-900/50 text-emerald-400"
                        : item.trend === "bearish"
                        ? "bg-red-900/50 text-red-400"
                        : "bg-amber-900/50 text-amber-400"
                    }`}
                  >
                    {item.trend}
                  </span>
                  <span className="text-xs text-slate-500">{item.strength}%</span>
                  <button
                    onClick={() => removeFromWatchlist(item.ticker)}
                    className="text-slate-600 hover:text-red-400 transition-colors ml-1"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{result.ticker}</h2>
                <p className="text-slate-400">
                  ${result.current_price.toFixed(2)} •{" "}
                  {new Date(result.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Signal Strength</div>
                <div
                  className={`text-3xl font-bold ${
                    strengthColorClass(result.signal_strength)
                  }`}
                >
                  {result.signal_strength}/100
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <AnalysisCard
                label="Trend"
                value={result.trend}
                color={trendColor(result.trend)}
              />
              <AnalysisCard
                label="Setup Type"
                value={result.setup_type}
                color="neutral"
              />
              <AnalysisCard
                label="Risk Level"
                value={result.risk_level}
                color={riskColor(result.risk_level)}
              />
              <AnalysisCard
                label="Holding Period"
                value={result.holding_period}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AnalysisCard label="Entry Zone" value={result.entry_zone} color="bullish" />
              <AnalysisCard label="Exit Zone" value={result.exit_zone} color="bearish" />
              <AnalysisCard label="Stop Loss" value={result.stop_loss} color="bearish" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <AnalysisCard label="RSI (14)" value={result.indicators.rsi.toFixed(1)} />
              <AnalysisCard label="EMA 20" value={result.indicators.ema20.toFixed(2)} />
              <AnalysisCard label="EMA 50" value={result.indicators.ema50.toFixed(2)} />
              <AnalysisCard label="EMA 200" value={result.indicators.ema200.toFixed(2)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-emerald-400 text-sm font-medium mb-3">Support Zones</h3>
                {result.support_zones.length > 0 ? (
                  <div className="space-y-2">
                    {result.support_zones.map((zone, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-400">S{i + 1}</span>
                        <span className="text-slate-200">
                          ${zone.low} - ${zone.high}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No clear support zones detected</p>
                )}
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="text-red-400 text-sm font-medium mb-3">Resistance Zones</h3>
                {result.resistance_zones.length > 0 ? (
                  <div className="space-y-2">
                    {result.resistance_zones.map((zone, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-400">R{i + 1}</span>
                        <span className="text-slate-200">
                          ${zone.low} - ${zone.high}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No clear resistance zones detected</p>
                )}
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Price Chart</h3>
              <PriceChart data={result.chart_data} />
            </div>

            <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-4">
              <p className="text-amber-400/80 text-sm">{result.disclaimer}</p>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="text-center py-16">
            <div className="text-slate-600 text-6xl mb-4">📊</div>
            <p className="text-slate-500">Enter a ticker to begin analysis</p>
            <div className="mt-4 flex justify-center gap-2 flex-wrap">
              {["AAPL", "TSLA", "NVDA", "MSFT", "AMZN"].map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTicker(t);
                    analyze(t);
                  }}
                  className="bg-slate-800 border border-slate-700 hover:border-blue-500 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function strengthColorClass(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score <= 30) return "text-red-400";
  return "text-amber-400";
}
