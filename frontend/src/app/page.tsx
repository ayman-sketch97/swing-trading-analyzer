"use client";

import { useState, useEffect } from "react";
import PriceChart from "@/components/PriceChart";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Tab = "overview" | "analysis" | "levels" | "fundamentals" | "screener" | "portfolio" | "alerts";

interface Sentiment {
  score: number;
  signal: string;
  color: string;
  confidence: number;
  technical_reasons: string[];
  fundamental_reasons: string[];
}

interface Result {
  ticker: string;
  company_name: string;
  current_price: number;
  timestamp: string;
  trend: string;
  sentiment: Sentiment;
  growth_potential: { score: number; label: string; returns: Record<string, number> };
  fundamentals: Record<string, unknown>;
  risk: { level: string; color: string; volatility_percent: number; annualized_volatility: number };
  strategy: {
    entry_zone: string; stop_loss: string; target_range: string;
    timeframe: string; timeframe_label: string; timeframe_description: string; rationale: string[];
  };
  support: number[];
  resistance: number[];
  volume_spike: boolean;
  indicators: Record<string, unknown>;
  chart_data: Record<string, unknown>;
  disclaimer: string;
}

interface ScreenerStock {
  ticker: string; price: number; trend: string; signal: string; score: number;
  confidence: number; rsi: number; pe_ratio: number | null; revenue_growth: number | null;
  returns_3m: number; volume_spike: boolean; sector: string; fundamental_score: number; risk: string;
}

interface Alert {
  ticker: string; type: string; price_level: number; created: string; triggered: boolean;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "analysis", label: "Analysis", icon: "📈" },
  { id: "levels", label: "Levels", icon: "🎯" },
  { id: "fundamentals", label: "Fundamentals", icon: "💰" },
  { id: "screener", label: "Screener", icon: "🔍" },
  { id: "portfolio", label: "Portfolio", icon: "💼" },
  { id: "alerts", label: "Alerts", icon: "🔔" },
];

const PRESETS = [
  { id: "all", label: "All Stocks", icon: "📋" },
  { id: "strong_buy", label: "Strong Buy", icon: "🟢" },
  { id: "growth", label: "Growth Stocks", icon: "🚀" },
  { id: "momentum", label: "Momentum", icon: "⚡" },
  { id: "value", label: "Value Plays", icon: "💎" },
];

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [market, setMarket] = useState<{ indices?: Record<string, { name: string; price: number | null; trend: string; change_1m: number | null }>; overall?: string }>({});
  const [screenerStocks, setScreenerStocks] = useState<ScreenerStock[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [preset, setPreset] = useState("all");
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newAlert, setNewAlert] = useState({ ticker: "", type: "above", price: "" });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); fetchMarket(); fetchPortfolio(); fetchAlerts(); }, []);

  const fetchMarket = async () => {
    try { const r = await fetch(`${API}/market`); setMarket(await r.json()); } catch {}
  };

  const fetchPortfolio = async () => {
    try { const r = await fetch(`${API}/portfolio`); const d = await r.json(); setPortfolio(d.holdings || []); } catch {}
  };

  const fetchAlerts = async () => {
    try { const r = await fetch(`${API}/alerts`); const d = await r.json(); setAlerts(d.alerts || []); } catch {}
  };

  const checkAlerts = async () => {
    try { const r = await fetch(`${API}/alerts/check`, { method: "POST" }); const d = await r.json(); fetchAlerts(); } catch {}
  };

  const analyze = async (t?: string, retries = 2) => {
    const s = (t || ticker).trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(""); setTab("overview");
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const r = await fetch(`${API}/analyze?ticker=${encodeURIComponent(s)}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Failed"); }
        const d = await r.json();
        setResult(d); setTicker(s);
        return;
      } catch (e: any) {
        if (attempt < retries && (e.name === "AbortError" || e.message?.includes("Failed to fetch"))) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        setError(e.message || "Load failed");
      }
    }
    setLoading(false);
  };

  const runScreener = async (p: string, t?: string) => {
    setPreset(p); setScreenerLoading(true);
    try {
      const params = new URLSearchParams({ preset: p });
      if (t) params.set("ticker", t);
      const r = await fetch(`${API}/screener?${params}`);
      const d = await r.json(); setScreenerStocks(d.stocks || []);
    } catch { setError("Screener failed"); }
    finally { setScreenerLoading(false); }
  };

  const addToPortfolio = async () => {
    if (!result) return;
    try {
      await fetch(`${API}/portfolio/add?ticker=${result.ticker}&entry_price=${result.current_price}&shares=1`, { method: "POST" });
      fetchPortfolio();
    } catch {}
  };

  const addAlert = async () => {
    if (!newAlert.ticker || !newAlert.price) return;
    try {
      await fetch(`${API}/alerts/add?ticker=${newAlert.ticker}&type=${newAlert.type}&price_level=${newAlert.price}`, { method: "POST" });
      setNewAlert({ ticker: "", type: "above", price: "" });
      fetchAlerts();
    } catch {}
  };

  const signalColor = (s: string) =>
    s === "Strong Buy" ? "text-emerald-400" : s === "Buy" ? "text-green-400" : s === "Hold" ? "text-amber-400" : s === "Sell" ? "text-red-400" : "text-red-500";

  const signalBg = (s: string) =>
    s === "Strong Buy" ? "bg-emerald-950/60 border-emerald-600" : s === "Buy" ? "bg-emerald-950/40 border-emerald-700" : s === "Hold" ? "bg-amber-950/40 border-amber-700" : "bg-red-950/40 border-red-700";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Trade Analyzer</h1>
            <p className="text-slate-500 text-xs">Explainable analysis. Data-driven signals.</p>
          </div>
          {hydrated && market.indices && Object.keys(market.indices).length > 0 && (
            <div className="flex gap-3 text-xs">
              {Object.entries(market.indices).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="text-slate-400">{v.name}</span>
                  <span className={v.trend === "bullish" ? "text-emerald-400" : v.trend === "bearish" ? "text-red-400" : "text-amber-400"}>{v.trend}</span>
                  <span className="text-slate-500">{v.price != null ? `$${v.price}` : "-"}</span>
                </div>
              ))}
            </div>
          )}
        </header>

        <div className="flex gap-2 mb-4">
          <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && analyze()}
            placeholder="Enter ticker (AAPL, TSLA, BTC-USD)"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 text-sm" />
          <button onClick={() => analyze()} disabled={loading || !ticker}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {error && <div className="bg-red-950/40 border border-red-800 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm">{error}</div>}

        {!result && !loading && !error && (
          <div className="text-center py-20">
            <div className="text-slate-700 text-5xl mb-3">📊</div>
            <p className="text-slate-500 text-sm">Enter a ticker to begin analysis</p>
            <div className="mt-3 flex justify-center gap-2 flex-wrap">
              {["AAPL", "NVDA", "TSLA", "MSFT", "BTC-USD"].map(t => (
                <button key={t} onClick={() => { setTicker(t); analyze(t); }}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-600 text-slate-500 hover:text-white px-3 py-1.5 rounded-lg text-xs transition-all">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white font-bold text-sm px-3 py-1.5 rounded">{result.ticker}</div>
                <div>
                  <p className="text-lg font-bold text-white">${result.current_price.toFixed(2)}</p>
                  <p className="text-slate-500 text-xs">{result.company_name}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${result.trend === "bullish" ? "bg-emerald-950/50 text-emerald-400" : result.trend === "bearish" ? "bg-red-950/50 text-red-400" : "bg-amber-950/50 text-amber-400"}`}>
                  {result.trend}
                </span>
                {result.volume_spike && <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-950/50 text-purple-400">Vol Spike</span>}
              </div>
              <div className={`px-3 py-2 rounded-lg border ${signalBg(result.sentiment.signal)}`}>
                <div className={`text-xl font-bold ${signalColor(result.sentiment.signal)}`}>{result.sentiment.signal}</div>
                <div className="text-slate-400 text-xs">Score: {result.sentiment.score} | Confidence: {result.sentiment.confidence}%</div>
              </div>
            </div>

            <div className="flex gap-0.5 mb-4 bg-slate-900 p-0.5 rounded-lg">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && <OverviewTab result={result} market={market} addToPortfolio={addToPortfolio} />}
            {tab === "analysis" && <AnalysisTab result={result} />}
            {tab === "levels" && <LevelsTab result={result} />}
            {tab === "fundamentals" && <FundamentalsTab result={result} />}
            {tab === "screener" && <ScreenerTab stocks={screenerStocks} loading={screenerLoading} preset={preset} runScreener={runScreener} analyze={analyze} />}
            {tab === "portfolio" && <PortfolioTab portfolio={portfolio} fetchPortfolio={fetchPortfolio} analyze={analyze} />}
            {tab === "alerts" && <AlertsTab alerts={alerts} newAlert={newAlert} setNewAlert={setNewAlert} addAlert={addAlert} checkAlerts={checkAlerts} />}

            <div className="mt-4 bg-amber-950/20 border border-amber-900/50 rounded p-3">
              <p className="text-amber-500/70 text-xs">{result.disclaimer}</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function OverviewTab({ result, market, addToPortfolio }: { result: Result; market: Record<string, unknown>; addToPortfolio: () => void }) {
  const s = result.sentiment;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card label="Signal" value={s.signal} color={s.signal === "Strong Buy" ? "text-emerald-400" : s.signal === "Buy" ? "text-green-400" : s.signal === "Hold" ? "text-amber-400" : "text-red-400"} />
        <Card label="Trend" value={result.trend} color={result.trend === "bullish" ? "text-emerald-400" : result.trend === "bearish" ? "text-red-400" : "text-amber-400"} />
        <Card label="Risk" value={result.risk.level} color={result.risk.level === "low" ? "text-emerald-400" : result.risk.level === "high" ? "text-red-400" : "text-amber-400"} />
        <Card label="Volatility" value={`${result.risk.volatility_percent}%`} />
        <Card label="Growth" value={result.growth_potential.label} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card label="Entry Zone" value={result.strategy.entry_zone} color="text-emerald-400" />
        <Card label="Target Range" value={result.strategy.target_range} color="text-blue-400" />
        <Card label="Stop Loss" value={`$${result.strategy.stop_loss}`} color="text-red-400" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase">Why this signal?</h3>
          <span className="text-xs text-slate-500">Confidence: {s.confidence}%</span>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Signal Score</span><span className={s.score >= 20 ? "text-emerald-400" : s.score <= -20 ? "text-red-400" : "text-amber-400"}>{s.score}</span></div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${s.score >= 20 ? "bg-emerald-500" : s.score <= -20 ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${50 + s.score / 2}%`, transform: s.score < -50 ? `translateX(${(s.score + 50) * 2}%)` : undefined }} />
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Strong Sell</span><span>Neutral</span><span>Strong Buy</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-blue-400 font-semibold mb-1">TECHNICAL</div>
            {s.technical_reasons.map((r, i) => <div key={i} className="text-xs text-slate-400 mb-0.5 flex items-start gap-1.5"><span className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />{r}</div>)}
          </div>
          <div>
            <div className="text-[10px] text-emerald-400 font-semibold mb-1">FUNDAMENTAL</div>
            {s.fundamental_reasons.length > 0
              ? s.fundamental_reasons.map((r, i) => <div key={i} className="text-xs text-slate-400 mb-0.5 flex items-start gap-1.5"><span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />{r}</div>)
              : <div className="text-xs text-slate-600">Limited fundamental data available</div>}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Strategy</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-white font-medium">{result.strategy.timeframe_label}</span>
        </div>
        <p className="text-xs text-slate-500">{result.strategy.timeframe_description}</p>
        <div className="mt-2 space-y-1">
          {result.strategy.rationale.map((r, i) => (
            <div key={i} className="text-xs text-slate-400 flex items-start gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />{r}</div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={addToPortfolio} className="flex-1 bg-slate-900 border border-slate-800 hover:border-blue-600 text-slate-400 hover:text-white py-2 rounded-lg text-xs transition-all">+ Add to Portfolio</button>
        <button onClick={() => {}} className="flex-1 bg-slate-900 border border-slate-800 hover:border-purple-600 text-slate-400 hover:text-white py-2 rounded-lg text-xs transition-all">+ Set Alert</button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Price Chart</h3>
        <PriceChart data={result.chart_data} />
      </div>
    </div>
  );
}

function AnalysisTab({ result }: { result: Result }) {
  const ind = result.indicators as any;
  const ret = result.growth_potential.returns;
  return (
    <div className="space-y-3">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Returns</h3>
        <div className="grid grid-cols-4 gap-2">
          {[{ l: "1M", v: ret["1_month"] }, { l: "3M", v: ret["3_months"] }, { l: "6M", v: ret["6_months"] }, { l: "1Y", v: ret["1_year"] }].map(r => (
            <div key={r.l} className="bg-slate-800/50 rounded p-2 text-center">
              <div className="text-[10px] text-slate-500">{r.l}</div>
              <div className={`text-sm font-bold ${r.v >= 0 ? "text-emerald-400" : "text-red-400"}`}>{r.v >= 0 ? "+" : ""}{r.v}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Technical Indicators</h3>
        <div className="grid grid-cols-2 gap-2">
          <IndRow label="EMA 20" value={ind.ema20?.toFixed(2)} />
          <IndRow label="EMA 50" value={ind.ema50?.toFixed(2)} />
          <IndRow label="EMA 200" value={ind.ema200?.toFixed(2)} />
          <IndRow label="RSI (14)" value={ind.rsi?.toFixed(1)} />
          <IndRow label="MACD" value={ind.macd?.macd?.toFixed(2)} />
          <IndRow label="MACD Signal" value={ind.macd?.signal?.toFixed(2)} />
          <IndRow label="MACD Histogram" value={ind.macd?.histogram?.toFixed(2)} />
          <IndRow label="Stoch K" value={ind.stochastic?.k?.toFixed(1)} />
          <IndRow label="Stoch D" value={ind.stochastic?.d?.toFixed(1)} />
          <IndRow label="BB Upper" value={ind.bollinger_bands?.upper?.toFixed(2)} />
          <IndRow label="BB Middle" value={ind.bollinger_bands?.middle?.toFixed(2)} />
          <IndRow label="BB Lower" value={ind.bollinger_bands?.lower?.toFixed(2)} />
          <IndRow label="ATR" value={ind.atr?.toFixed(2)} />
          <IndRow label="ATR %" value={`${ind.atr_percent}%`} />
          <IndRow label="Volume Trend" value={ind.volume_trend} />
          <IndRow label="BB Width" value={`${ind.bollinger_bands?.bandwidth}%`} />
        </div>
      </div>
    </div>
  );
}

function LevelsTab({ result }: { result: Result }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-emerald-400 uppercase mb-3">Support Levels</h3>
          <div className="space-y-2">
            {result.support.map((l, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${i === 0 ? "bg-emerald-900/50 text-emerald-400" : i === 1 ? "bg-emerald-900/30 text-emerald-500" : "bg-slate-800 text-slate-500"}`}>S{i + 1}</span>
                  <span className="text-white font-mono text-sm">${l.toFixed(2)}</span>
                </div>
                <span className="text-xs text-slate-600">{((l - result.current_price) / result.current_price * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-red-400 uppercase mb-3">Resistance Levels</h3>
          <div className="space-y-2">
            {result.resistance.map((l, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${i === 0 ? "bg-red-900/50 text-red-400" : i === 1 ? "bg-red-900/30 text-red-500" : "bg-slate-800 text-slate-500"}`}>R{i + 1}</span>
                  <span className="text-white font-mono text-sm">${l.toFixed(2)}</span>
                </div>
                <span className="text-xs text-slate-600">+{((l - result.current_price) / result.current_price * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">Trade Plan</h3>
        <div className="space-y-3">
          <TradePlanRow label="ENTRY ZONE" value={result.strategy.entry_zone} color="text-emerald-400" />
          <TradePlanRow label="TARGET RANGE" value={result.strategy.target_range} color="text-blue-400" />
          <TradePlanRow label="STOP LOSS" value={`$${result.strategy.stop_loss}`} color="text-red-400" />
          <div className="border-t border-slate-800 pt-2">
            <div className="text-[10px] text-slate-500 mb-1">TIMEFRAME</div>
            <div className="text-sm text-white">{result.strategy.timeframe_label}</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">Risk/Reward</h3>
        {(() => {
          const entry = parseFloat(result.strategy.entry_zone.split(" - ")[0]) || result.current_price;
          const target = parseFloat(result.strategy.target_range.split(" - ")[0]) || result.current_price * 1.05;
          const stop = parseFloat(result.strategy.stop_loss) || result.current_price * 0.95;
          const reward = Math.abs(target - entry);
          const risk = Math.abs(entry - stop);
          const rr = risk > 0 ? (reward / risk).toFixed(1) : "N/A";
          return (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center"><div className="text-[10px] text-slate-500">Risk</div><div className="text-sm text-red-400 font-mono">${risk.toFixed(2)}</div></div>
              <div className="text-center"><div className="text-[10px] text-slate-500">Reward</div><div className="text-sm text-emerald-400 font-mono">${reward.toFixed(2)}</div></div>
              <div className="text-center"><div className="text-[10px] text-slate-500">R/R Ratio</div><div className={`text-sm font-bold font-mono ${Number(rr) >= 2 ? "text-emerald-400" : Number(rr) >= 1 ? "text-amber-400" : "text-red-400"}`}>{rr}:1</div></div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function FundamentalsTab({ result }: { result: Result }) {
  const f = result.fundamentals as any;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex-1">
          <div className="text-[10px] text-slate-500">Fundamental Score</div>
          <div className={`text-lg font-bold ${f.score >= 60 ? "text-emerald-400" : f.score >= 40 ? "text-amber-400" : "text-red-400"}`}>{f.label} ({f.score}/100)</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex-1">
          <div className="text-[10px] text-slate-500">Growth Score</div>
          <div className={`text-lg font-bold ${result.growth_potential.score >= 60 ? "text-emerald-400" : result.growth_potential.score >= 40 ? "text-amber-400" : "text-red-400"}`}>{result.growth_potential.label} ({result.growth_potential.score}/100)</div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Company</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-slate-500 text-xs">Sector</span><p className="text-white">{f.sector}</p></div>
          <div><span className="text-slate-500 text-xs">Industry</span><p className="text-white">{f.industry}</p></div>
          <div><span className="text-slate-500 text-xs">Market Cap</span><p className="text-white">{f.market_cap ? formatMcap(f.market_cap) : "N/A"}</p></div>
          <div><span className="text-slate-500 text-xs">Analyst Rating</span><p className={`font-medium ${f.recommendation === "buy" || f.recommendation === "strongBuy" ? "text-emerald-400" : f.recommendation === "sell" ? "text-red-400" : "text-amber-400"}`}>{f.recommendation || "N/A"}</p></div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Valuation</h3>
        <div className="grid grid-cols-3 gap-2">
          <FRow label="P/E" value={f.pe_ratio?.toFixed(1)} />
          <FRow label="Forward P/E" value={f.forward_pe?.toFixed(1)} />
          <FRow label="PEG" value={f.peg_ratio?.toFixed(2)} />
          <FRow label="Price/Book" value={f.price_to_book?.toFixed(2)} />
          <FRow label="Debt/Equity" value={f.debt_to_equity?.toFixed(2)} />
          <FRow label="Current Ratio" value={f.current_ratio?.toFixed(2)} />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Growth & Profitability</h3>
        <div className="grid grid-cols-3 gap-2">
          <FGRow label="Revenue Growth" value={f.revenue_growth} />
          <FGRow label="Earnings Growth" value={f.earnings_growth} />
          <FGRow label="Profit Margin" value={f.profit_margin} />
          <FGRow label="Operating Margin" value={f.operating_margin} />
          <FGRow label="Return on Equity" value={f.return_on_equity} />
          <FRow label="Dividend Yield" value={f.dividend_yield ? `${(f.dividend_yield * 100).toFixed(2)}%` : undefined} />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Price Targets</h3>
        <div className="grid grid-cols-3 gap-2">
          <FRow label="52W High" value={f["52_week_high"] ? `$${f["52_week_high"].toFixed(2)}` : undefined} />
          <FRow label="52W Low" value={f["52_week_low"] ? `$${f["52_week_low"].toFixed(2)}` : undefined} />
          <FRow label="Target Price" value={f.target_price ? `$${f.target_price.toFixed(2)}` : undefined} />
        </div>
        {f.target_price && (
          <div className="mt-2 bg-slate-800/50 rounded p-2 text-center">
            <span className="text-xs text-slate-500">Upside to Target: </span>
            <span className={`text-sm font-bold ${(f.target_price - result.current_price) / result.current_price > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {((f.target_price / result.current_price - 1) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenerTab({ stocks, loading, preset, runScreener, analyze }: {
  stocks: ScreenerStock[]; loading: boolean; preset: string;
  runScreener: (p: string, t?: string) => void; analyze: (t: string) => void;
}) {
  const [searchTicker, setSearchTicker] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="text" value={searchTicker} onChange={e => setSearchTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && searchTicker && analyze(searchTicker)}
          placeholder="Search any ticker (e.g. BRK-B, RIVN, SOFI)..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500" />
        <button onClick={() => { if (searchTicker) runScreener("all", searchTicker); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium">
          Search
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => runScreener(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${preset === p.id ? "bg-blue-600 text-white" : "bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600"}`}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-slate-500 text-sm">Scanning stocks...</div>}

      {stocks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Ticker", "Price", "Trend", "Signal", "Score", "RSI", "P/E", "Rev%", "3M%", "Vol", "Risk", ""].map(h => (
                    <th key={h} className="text-left p-2 text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map(s => (
                  <tr key={s.ticker} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer" onClick={() => analyze(s.ticker)}>
                    <td className="p-2 font-bold text-white">{s.ticker}</td>
                    <td className="p-2 text-white">${s.price.toFixed(2)}</td>
                    <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${s.trend === "bullish" ? "bg-emerald-900/50 text-emerald-400" : s.trend === "bearish" ? "bg-red-900/50 text-red-400" : "bg-amber-900/50 text-amber-400"}`}>{s.trend}</span></td>
                    <td className={`p-2 font-semibold ${s.signal === "Strong Buy" ? "text-emerald-400" : s.signal === "Buy" ? "text-green-400" : s.signal === "Hold" ? "text-amber-400" : "text-red-400"}`}>{s.signal}</td>
                    <td className={`p-2 ${s.score >= 40 ? "text-emerald-400" : s.score <= -40 ? "text-red-400" : "text-amber-400"}`}>{s.score}</td>
                    <td className="p-2 text-white">{s.rsi.toFixed(0)}</td>
                    <td className="p-2 text-white">{s.pe_ratio?.toFixed(1) ?? "-"}</td>
                    <td className={`p-2 ${s.revenue_growth && s.revenue_growth > 0 ? "text-emerald-400" : "text-red-400"}`}>{s.revenue_growth != null ? `${s.revenue_growth}%` : "-"}</td>
                    <td className={`p-2 ${s.returns_3m >= 0 ? "text-emerald-400" : "text-red-400"}`}>{s.returns_3m >= 0 ? "+" : ""}{s.returns_3m}%</td>
                    <td className="p-2">{s.volume_spike ? <span className="text-purple-400 text-[10px]">⚡</span> : "-"}</td>
                    <td className="p-2"><span className={`text-[10px] ${s.risk === "high" ? "text-red-400" : s.risk === "medium" ? "text-amber-400" : "text-emerald-400"}`}>{s.risk}</span></td>
                    <td className="p-2"><span className="text-blue-400 hover:text-blue-300 text-[10px]">Analyze</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && stocks.length === 0 && preset !== "all" && (
        <div className="text-center py-8 bg-slate-900 border border-slate-800 rounded-lg">
          <p className="text-slate-500 text-sm">No stocks match the {preset} criteria</p>
        </div>
      )}
      {!loading && stocks.length === 0 && preset === "all" && (
        <div className="text-center py-8 bg-slate-900 border border-slate-800 rounded-lg">
          <p className="text-slate-500 text-sm">Click a preset to scan stocks</p>
        </div>
      )}
    </div>
  );
}

function PortfolioTab({ portfolio, fetchPortfolio, analyze }: { portfolio: any[]; fetchPortfolio: () => void; analyze: (t: string) => void }) {
  const [analyzed, setAnalyzed] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    if (!portfolio.length) return;
    setLoading(true);
    const results: any[] = [];
    for (const h of portfolio) {
      try {
        const r = await fetch(`${API}/analyze?ticker=${h.ticker}`);
        const d = await r.json();
        const pnl = (d.current_price - h.entry_price) * h.shares;
        results.push({ ...h, current_price: d.current_price, pnl: round2(pnl), pnl_pct: round2((d.current_price / h.entry_price - 1) * 100), trend: d.trend, signal: d.sentiment.signal });
      } catch { results.push({ ...h, error: true }); }
    }
    setAnalyzed(results);
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={runAnalysis} disabled={loading || !portfolio.length}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
          {loading ? "Analyzing..." : "Analyze Holdings"}
        </button>
      </div>

      {analyzed.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                {["Ticker", "Entry", "Current", "Shares", "P/L", "P/L%", "Trend", "Signal", ""].map(h => (
                  <th key={h} className="text-left p-2 text-slate-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analyzed.map((h, i) => (
                <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-2 font-bold text-white">{h.ticker}</td>
                  <td className="p-2 text-white">${h.entry_price.toFixed(2)}</td>
                  <td className="p-2 text-white">{h.error ? "-" : `$${h.current_price.toFixed(2)}`}</td>
                  <td className="p-2 text-white">{h.shares}</td>
                  <td className={`p-2 font-mono ${h.error ? "text-slate-600" : h.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{h.error ? "-" : `${h.pnl >= 0 ? "+" : ""}$${h.pnl}`}</td>
                  <td className={`p-2 font-mono ${h.error ? "text-slate-600" : h.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{h.error ? "-" : `${h.pnl_pct >= 0 ? "+" : ""}${h.pnl_pct}%`}</td>
                  <td className="p-2">{h.error ? "-" : <span className={`px-1.5 py-0.5 rounded text-[10px] ${h.trend === "bullish" ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>{h.trend}</span>}</td>
                  <td className={`p-2 ${h.signal?.includes("Buy") ? "text-emerald-400" : h.signal?.includes("Sell") ? "text-red-400" : "text-amber-400"}`}>{h.signal || "-"}</td>
                  <td className="p-2"><button onClick={() => analyze(h.ticker)} className="text-blue-400 text-[10px]">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {portfolio.length === 0 && (
        <div className="text-center py-8 bg-slate-900 border border-slate-800 rounded-lg">
          <p className="text-slate-500 text-sm">No holdings yet. Analyze a stock and click &quot;Add to Portfolio&quot;</p>
        </div>
      )}
    </div>
  );
}

function AlertsTab({ alerts, newAlert, setNewAlert, addAlert, checkAlerts }: {
  alerts: Alert[]; newAlert: { ticker: string; type: string; price: string };
  setNewAlert: React.Dispatch<React.SetStateAction<any>>;
  addAlert: () => void; checkAlerts: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">New Alert</h3>
        <div className="flex gap-2">
          <input type="text" value={newAlert.ticker} onChange={e => setNewAlert({ ...newAlert, ticker: e.target.value.toUpperCase() })}
            placeholder="Ticker" className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500" />
          <select value={newAlert.type} onChange={e => setNewAlert({ ...newAlert, type: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none">
            <option value="above">Price Above</option>
            <option value="below">Price Below</option>
          </select>
          <input type="number" value={newAlert.price} onChange={e => setNewAlert({ ...newAlert, price: e.target.value })}
            placeholder="Price" className="w-24 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500" />
          <button onClick={addAlert} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs">Add</button>
          <button onClick={checkAlerts} className="bg-slate-800 border border-slate-700 hover:border-blue-600 text-slate-400 hover:text-white px-3 py-1.5 rounded text-xs">Check</button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                {["Ticker", "Type", "Level", "Created", "Status"].map(h => (
                  <th key={h} className="text-left p-2 text-slate-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td className="p-2 font-bold text-white">{a.ticker}</td>
                  <td className="p-2 text-white">{a.type === "above" ? "Above" : "Below"}</td>
                  <td className="p-2 text-white font-mono">${a.price_level.toFixed(2)}</td>
                  <td className="p-2 text-slate-500">{new Date(a.created).toLocaleDateString()}</td>
                  <td className="p-2">{a.triggered ? <span className="text-emerald-400 text-[10px]">Triggered</span> : <span className="text-amber-400 text-[10px]">Active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="text-center py-8 bg-slate-900 border border-slate-800 rounded-lg">
          <p className="text-slate-500 text-sm">No alerts set</p>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      <div className={`text-sm font-semibold ${color || "text-white"} capitalize`}>{value}</div>
    </div>
  );
}

function IndRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="text-white font-mono">{value || "-"}</span></div>;
}

function TradePlanRow({ label, value, color }: { label: string; value: string; color: string }) {
  return <div><div className="text-[10px] text-slate-500 mb-0.5">{label}</div><div className={`text-sm font-mono ${color}`}>{value}</div></div>;
}

function FRow({ label, value }: { label: string; value?: string }) {
  return <div><span className="text-slate-500 text-[10px]">{label}</span><p className="text-white text-sm">{value ?? "N/A"}</p></div>;
}

function FGRow({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return <FRow label={label} value="N/A" />;
  const pct = (value * 100).toFixed(1);
  return <div><span className="text-slate-500 text-[10px]">{label}</span><p className={`text-sm font-semibold ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>{value >= 0 ? "+" : ""}{pct}%</p></div>;
}

function formatMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
