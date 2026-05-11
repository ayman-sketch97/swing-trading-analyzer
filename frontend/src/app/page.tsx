"use client";

import { useState, useEffect, useRef } from "react";
import ChartAnalysis from "@/components/ChartAnalysis";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type MainTab = "analyzer" | "screener" | "crypto" | "portfolio";

interface AnalysisResult {
  ticker: string; company_name: string; current_price: number; timestamp: string;
  trend: string; sentiment: Sentiment; market_regime: any;
  growth_potential: { score: number; label: string; returns: Record<string, number> };
  fundamentals: Record<string, any>; risk: { level: string; color: string; volatility_percent: number; annualized_volatility: number };
  strategy: { entry_zone: string; stop_loss: string; target_range: string; timeframe: string; timeframe_label: string; timeframe_description: string; rationale: string[] };
  support: number[]; resistance: number[];
  volume_spike: boolean; institutional: any;
  indicators: Record<string, any>; chart_data: any; tooltips: Record<string, string>;
  disclaimer: string;
}

interface Sentiment { score: number; signal: string; color: string; confidence: number; technical_reasons: string[]; fundamental_reasons: string[]; }

interface ScreenerStock {
  ticker: string; price: number; trend: string; signal: string; score: number;
  grade: string; label: string; confidence: number; rsi: number;
  pe_ratio: number | null; revenue_growth: number | null;
  returns_3m: number; volume_spike: boolean;
  consolidating: boolean; breakout: boolean;
  sector: string; fundamental_score: number; risk: string;
  rs_ratio: number; entry_zone: string; stop_loss: string;
  support_1: string; resistance_1: string;
}

interface CryptoResult {
  ticker: string; price: number; score: number; grade: string; label: string;
  trend_state: string; rsi: number; narrative: string;
  volume_spike: boolean; vol_ratio: number;
  avg_volume: number; entry_zone: string; stop_loss: string;
  btc_aligned: boolean;
}

interface PortfolioAnalysis { holdings: PortfolioHolding[]; summary: PortfolioSummary; }
interface PortfolioHolding { ticker: string; entry_price: number; quantity: number; entry_date: string; current_price: number; cost_basis: number; current_value: number; pnl: number; pnl_percent: number; allocation_pct: number; }
interface PortfolioSummary { total_positions: number; total_cost: number; total_value: number; total_pnl: number; total_pnl_percent: number; win_rate: number; winners: number; losers: number; concentration_risk: number; concentration_warning: boolean; }

export default function Home() {
  const [mainTab, setMainTab] = useState<MainTab>("analyzer");
  const [market, setMarket] = useState<any>({});
  useEffect(() => { fetch(`${API}/market/regime`).then(r => r.json()).then(setMarket).catch(() => {}); }, []);
  return (
    <main className="min-h-screen bg-[#020617] text-slate-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 animate-fadeIn">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent animate-gradient">Swing Trading Platform</h1>
            <p className="text-slate-600 text-xs mt-0.5">Technical Analysis &bull; Stock Screening &bull; Crypto Scanning &bull; Portfolio Management</p>
          </div>
          {market.regime && (
            <div className="flex items-center gap-2 text-xs bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 px-3 py-1.5 rounded-full">
              <span className="text-slate-500">Market:</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${market.regime === "bullish" ? "bg-emerald-950/60 text-emerald-400 border border-emerald-900/50" : market.regime === "bearish_volatile" ? "bg-red-950/60 text-red-400 border border-red-900/50" : "bg-amber-950/60 text-amber-400 border border-amber-900/50"}`}>{market.regime.replace(/_/g, " ")}</span>
              {market.spy_price && <span className="text-slate-400 font-mono">SPY <span className="text-white">${market.spy_price}</span></span>}
            </div>
          )}
        </header>
        <div className="flex gap-1 mb-6 bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 p-1 rounded-xl overflow-x-auto animate-slideDown">
          {[
            { id: "analyzer" as MainTab, label: "Ticker Analysis", icon: "🎯" },
            { id: "screener" as MainTab, label: "Stock Screener", icon: "📈" },
            { id: "crypto" as MainTab, label: "Crypto Scanner", icon: "₿" },
            { id: "portfolio" as MainTab, label: "Portfolio", icon: "💼" },
          ].map(t => (
            <button key={t.id} onClick={() => setMainTab(t.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${mainTab === t.id ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"}`}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div className="animate-fadeIn" key={mainTab}>
          {mainTab === "analyzer" && <AnalysisView API={API} />}
          {mainTab === "screener" && <ScreenerView API={API} />}
          {mainTab === "crypto" && <CryptoView API={API} />}
          {mainTab === "portfolio" && <PortfolioView API={API} />}
        </div>
      </div>
    </main>
  );
}

function AnalysisView({ API }: { API: string }) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"dashboard" | "chart">("dashboard");
  const [chartData, setChartData] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [activeTF, setActiveTF] = useState("1 day");
  const [portfolioMsg, setPortfolioMsg] = useState("");

  const addToPortfolio = async () => {
    if (!r) return;
    try {
      const res = await fetch(`${API}/portfolio/add?ticker=${r.ticker}&entry_price=${r.current_price}&quantity=1`, { method: "POST" });
      if (res.ok) {
        setPortfolioMsg(`Added ${r.ticker} to portfolio at $${r.current_price}`);
        setTimeout(() => setPortfolioMsg(""), 3000);
      } else {
        setPortfolioMsg("Failed to add to portfolio");
      }
    } catch {
      setPortfolioMsg("Failed to add to portfolio");
    }
  };

  const analyze = async (t?: string) => {
    const s = (t || ticker).trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(""); setResult(null); setChartData(null);
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const r = await fetch(`${API}/analyze?ticker=${encodeURIComponent(s)}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Failed"); }
        setResult(await r.json()); setTicker(s); break;
      } catch (e: any) {
        if (attempt < 2 && (e.name === "AbortError" || e.message?.includes("Failed to fetch"))) {
          await new Promise(r => setTimeout(r, 3000)); continue;
        }
        setError(e.message || "Analysis failed");
      }
    }
    setLoading(false);
  };

  const fetchChart = async (tf: string) => {
    if (!ticker) return;
    setChartLoading(true);
    try {
      const r = await fetch(`${API}/analyze/chart?ticker=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(tf)}`);
      if (!r.ok) throw new Error("Chart data unavailable");
      setChartData(await r.json()); setActiveTF(tf);
    } catch { setError("CHART DATA NOT AVAILABLE"); }
    setChartLoading(false);
  };

  useEffect(() => { if (viewMode === "chart" && ticker && !chartData) fetchChart(activeTF); }, [viewMode]);

  const r = result;
  const ind = r?.indicators || {};
  const s = r?.sentiment;
  const ret = r?.growth_potential?.returns || {};
  const regime = r?.market_regime || {};

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && analyze()}
            placeholder="Enter ticker (AAPL, NVDA, TSLA, BTC-USD)..."
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all duration-200" />
        </div>
        <button onClick={() => analyze()} disabled={loading || !ticker}
          className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:shadow-none">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
              Analyzing
            </span>
          ) : "Analyze"}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2 animate-slideDown">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-7 bg-slate-800/50 rounded-xl w-1/3 animate-shimmer" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-800/50 rounded-xl animate-shimmer" />)}</div>
          <div className="h-56 bg-slate-800/50 rounded-xl animate-shimmer" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="h-40 bg-slate-800/50 rounded-xl animate-shimmer" /><div className="h-40 bg-slate-800/50 rounded-xl animate-shimmer" /></div>
        </div>
      )}

      {!r && !loading && !error && (
        <div className="text-center py-20 animate-fadeIn">
          <div className="text-5xl mb-4 opacity-50">&#x1F3AF;</div>
          <p className="text-slate-500 text-sm mb-4">Enter a ticker for full technical analysis</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {["AAPL", "NVDA", "TSLA", "MSFT", "BTC-USD"].map(t => (
              <button key={t} onClick={() => { setTicker(t); analyze(t); }}
                className="bg-slate-900/60 border border-slate-700/50 hover:border-blue-500/50 text-slate-400 hover:text-white px-4 py-2 rounded-xl text-xs transition-all duration-200 hover:shadow-lg hover:shadow-blue-600/5">{t}</button>
            ))}
          </div>
        </div>
      )}

      {r && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/50 rounded-xl p-4 animate-slideUp">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold text-sm px-3 py-1.5 rounded-lg shadow-lg shadow-blue-600/20">{r.ticker}</div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">${r.current_price.toFixed(2)}</span>
                  <span className="text-slate-500 text-xs">{r.company_name}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${r.trend === "strong_uptrend" || r.trend === "uptrend" ? "bg-emerald-950/60 text-emerald-400 border border-emerald-900/50" : r.trend === "bearish" ? "bg-red-950/60 text-red-400 border border-red-900/50" : "bg-amber-950/60 text-amber-400 border border-amber-900/50"}`}>{r.trend.replace(/_/g, " ")}</span>
              {r.volume_spike && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-950/60 text-purple-400 border border-purple-900/50">Vol Spike</span>}
            </div>
            <div className={`px-4 py-2 rounded-xl border text-center backdrop-blur-sm ${s?.signal === "Strong Buy" ? "bg-emerald-950/30 border-emerald-600/50" : s?.signal === "Buy" ? "bg-emerald-950/30 border-emerald-700/50" : s?.signal === "Sell" ? "bg-red-950/30 border-red-700/50" : "bg-amber-950/30 border-amber-700/50"}`}>
              <div className={`text-xl font-bold ${s?.signal === "Strong Buy" ? "text-emerald-400" : s?.signal === "Buy" ? "text-green-400" : s?.signal === "Sell" ? "text-red-400" : "text-amber-400"}`}>{s?.signal || "WAIT"}</div>
              <div className="text-slate-500 text-[10px] mt-0.5">Score: {s?.score ?? "-"} &middot; Conf: {s?.confidence ?? "-"}%</div>
            </div>
            <button onClick={addToPortfolio}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
              Add to Portfolio
            </button>
          </div>
          {portfolioMsg && (
            <div className="bg-emerald-950/30 border border-emerald-800/50 text-emerald-400 px-4 py-2 rounded-xl text-sm animate-slideDown flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {portfolioMsg}
            </div>
          )}

          <div className="flex gap-1 bg-slate-900/50 border border-slate-800/50 p-1 rounded-xl w-fit backdrop-blur-sm">
            <button onClick={() => setViewMode("dashboard")}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${viewMode === "dashboard" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300"}`}><span className="mr-1">&#x1F4CA;</span>Dashboard</button>
            <button onClick={() => setViewMode("chart")}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${viewMode === "chart" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300"}`}><span className="mr-1">&#x1F4C8;</span>Live Chart</button>
          </div>

          {viewMode === "chart" ? (
            chartLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 bg-slate-900 rounded-lg w-1/3" />
                <div className="h-80 bg-slate-900 rounded-lg" />
                <div className="h-20 bg-slate-900 rounded-lg" />
              </div>
            ) : chartData ? (
              <ChartAnalysis
                ticker={ticker} chart={chartData.chart} currentPrice={chartData.current_price}
                structure={chartData.market_structure} trend={chartData.trend} emaAlignment={chartData.ema_alignment}
                rsi={chartData.rsi} rsiZone={chartData.rsi_zone} macd={chartData.macd}
                volume={chartData.volume} sr={chartData.support_resistance} liqZones={chartData.liquidity_zones}
                squeeze={chartData.squeeze} session={chartData.session} regime={chartData.market_regime}
                multiTF={chartData.multi_timeframe || {}} tfAlignment={chartData.timeframe_alignment}
                noTradeZone={chartData.no_trade_zone}
                onTimeframeChange={(tf) => { setActiveTF(tf); fetchChart(tf); }} activeTF={activeTF}
              />
            ) : (
              <div className="text-center py-8 bg-slate-900 border border-slate-800 rounded-lg">
                <p className="text-slate-500 text-sm">Click "Live Chart" to load</p>
              </div>
            )
          ) : (
            <DashboardView r={r} ind={ind} s={s} ret={ret} regime={regime} />
          )}
        </>
      )}
    </div>
  );
}

function DashboardView({ r, ind, s, ret, regime }: { r: AnalysisResult; ind: any; s: Sentiment | undefined; ret: Record<string, number>; regime: any }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-slideUp">
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3 hover:border-slate-700/50 transition-all duration-200">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Market Regime</div>
          <div className="text-base font-bold text-white capitalize">{regime.regime || "N/A"}</div>
          {regime.spy_above_200ma !== undefined && <div className="text-[11px] text-slate-500 mt-1"><span className={`inline-block w-2 h-2 rounded-full ${regime.spy_above_200ma ? "bg-emerald-500" : "bg-red-500"} mr-1.5`} />SPY {regime.spy_above_200ma ? "above" : "below"} 200MA</div>}
        </div>
        <OverviewCard label="Trend" value={r.trend.replace(/_/g, " ")} color={r.trend.includes("uptrend") ? "text-emerald-400" : r.trend === "bearish" ? "text-red-400" : "text-amber-400"} />
        <OverviewCard label="Risk" value={r.risk.level} color={r.risk.level === "low" ? "text-emerald-400" : r.risk.level === "high" ? "text-red-400" : "text-amber-400"} />
        <OverviewCard label="Volatility" value={`${r.risk.volatility_percent}%`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-slideUp">
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-blue-400">&#x1F4CA;</span>Price Data</h3>
          <div className="space-y-2 text-sm">
            {[{ l: "Open", v: r.chart_data?.candles?.at(-1)?.open }, { l: "High", v: r.chart_data?.candles?.at(-1)?.high }, { l: "Low", v: r.chart_data?.candles?.at(-1)?.low }, { l: "Volume", v: r.chart_data?.volume?.at(-1)?.value }].map(x => (
              <div key={x.l} className="flex justify-between py-1 border-b border-slate-800/30 last:border-0"><span className="text-slate-500">{x.l}</span><span className="text-white font-mono font-medium">{x.l === "Volume" ? x.v?.toLocaleString() || "-" : `$${x.v?.toFixed(2) || "-"}`}</span></div>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-800/50 pt-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Returns</div>
            <div className="grid grid-cols-4 gap-2">
              {[{ l: "1M", v: ret["1_month"] }, { l: "3M", v: ret["3_months"] }, { l: "6M", v: ret["6_months"] }, { l: "1Y", v: ret["1_year"] }].map(x => (
                <div key={x.l} className="text-center bg-slate-800/30 rounded-lg py-2">
                  <div className="text-[10px] text-slate-600 mb-0.5">{x.l}</div>
                  <div className={`text-sm font-bold ${x.v >= 0 ? "text-emerald-400" : "text-red-400"}`}>{x.v >= 0 ? "+" : ""}{x.v?.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-emerald-400">&#x1F4C8;</span>Support & Resistance</h3>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-red-400 font-medium mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Resistance</div>
              {r.resistance?.map((l, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-800/30 last:border-0">
                  <span className="text-slate-500 font-mono text-xs">R{i + 1}</span>
                  <span className="text-white font-mono font-medium">${l.toFixed(2)}</span>
                  <span className="text-slate-500 text-xs">{((l - r.current_price) / r.current_price * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-800/50 pt-3">
              <div className="text-[11px] text-emerald-400 font-medium mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Support</div>
              {r.support?.map((l, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-800/30 last:border-0">
                  <span className="text-slate-500 font-mono text-xs">S{i + 1}</span>
                  <span className="text-white font-mono font-medium">${l.toFixed(2)}</span>
                  <span className="text-slate-500 text-xs">{((l - r.current_price) / r.current_price * 100) >= 0 ? "+" : ""}{((l - r.current_price) / r.current_price * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-slideUp">
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-purple-400">&#x1F4C9;</span>Technical Indicators</h3>
          <div className="grid grid-cols-1 gap-1.5">
            <IndRow label="RSI (14)" value={ind.rsi?.toFixed(1)} color={ind.rsi >= 55 && ind.rsi <= 75 ? "text-emerald-400" : ind.rsi > 75 ? "text-red-400" : "text-amber-400"} />
            <IndRow label="MACD" value={ind.macd?.macd?.toFixed(2)} color={ind.macd?.histogram > 0 ? "text-emerald-400" : "text-red-400"} />
            <IndRow label="MACD Hist" value={ind.macd?.histogram?.toFixed(2)} color={ind.macd?.histogram > 0 ? "text-emerald-400" : "text-red-400"} />
            <IndRow label="EMA 20/50/200" value={`${ind.ema20?.toFixed(0)} / ${ind.ema50?.toFixed(0)} / ${ind.ema200?.toFixed(0)}`} />
            <IndRow label="OBV" value={ind.obv_rising ? "Rising" : "Falling"} color={ind.obv_rising ? "text-emerald-400" : "text-red-400"} />
            <IndRow label="ATR" value={`${ind.atr_percent}%`} color={ind.atr_percent > 3 ? "text-red-400" : ind.atr_percent > 2 ? "text-amber-400" : "text-emerald-400"} />
            <IndRow label="Volume" value={ind.volume_trend || "-"} color={ind.volume_trend === "increasing" ? "text-emerald-400" : "text-red-400"} />
            <IndRow label="BB Width" value={`${ind.bollinger_bands?.bandwidth}%`} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-yellow-400">&#x1F4B0;</span>Fundamentals</h3>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              <IndRow label="Market Cap" value={r.fundamentals?.marketCap ? formatMcap(r.fundamentals.marketCap) : "-"} />
              <IndRow label="P/E" value={r.fundamentals?.trailingPE?.toFixed(1) || "-"} />
              <IndRow label="Rev Growth" value={r.fundamentals?.revenueGrowth != null ? `${(r.fundamentals.revenueGrowth * 100).toFixed(1)}%` : "-"} color={r.fundamentals?.revenueGrowth > 0 ? "text-emerald-400" : "text-red-400"} />
              <IndRow label="Earnings Growth" value={r.fundamentals?.earningsGrowth != null ? `${(r.fundamentals.earningsGrowth * 100).toFixed(1)}%` : "-"} color={r.fundamentals?.earningsGrowth > 0 ? "text-emerald-400" : "text-red-400"} />
              <IndRow label="Debt/Equity" value={r.fundamentals?.debtToEquity?.toFixed(2) || "-"} color={r.fundamentals?.debtToEquity != null && r.fundamentals.debtToEquity < 0.5 ? "text-emerald-400" : "text-amber-400"} />
              <IndRow label="Sector" value={r.fundamentals?.sector || "-"} />
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-blue-400">&#x1F4F0;</span>Sentiment</h3>
            <div className="space-y-1.5 text-sm">
              {s?.technical_reasons?.map((r, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0 opacity-70" /><span className="text-slate-400 text-xs">{r}</span></div>
              ))}
              {(!s?.technical_reasons || s.technical_reasons.length === 0) && <div className="text-slate-600 text-xs">No technical signals</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-slideUp">
        <div className={`bg-slate-900/60 rounded-xl p-4 transition-all duration-200 ${r.strategy?.entry_zone && !r.strategy.entry_zone.includes("Wait") ? "border border-emerald-700/50" : "border border-slate-800/50"}`}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-emerald-400">&#x1F3AF;</span>Trade Plan</h3>
          <div className="space-y-3">
            <div className={`rounded-xl p-4 text-center border ${(s?.score ?? 0) >= 40 ? "bg-emerald-950/30 border-emerald-600/40" : (s?.score ?? 0) <= -40 ? "bg-red-950/30 border-red-600/40" : "bg-amber-950/30 border-amber-600/40"}`}>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Action</div>
              <div className={`text-2xl font-extrabold ${(s?.score ?? 0) >= 40 ? "text-emerald-400" : (s?.score ?? 0) <= -40 ? "text-red-400" : "text-amber-400"}`}>
                {(s?.score ?? 0) >= 40 ? "BUY" : (s?.score ?? 0) <= -40 ? "SELL" : "WAIT"}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {(s?.score ?? 0) >= 40
                  ? (s?.score ?? 0) >= 70 ? "Strong buy signal — high conviction setup" : "Buy signal — favorable entry opportunity"
                  : (s?.score ?? 0) <= -40
                  ? (s?.score ?? 0) <= -70 ? "Strong sell signal — avoid or exit" : "Sell signal — consider exiting"
                  : "No clear signal — wait for better setup"}
              </div>
              <div className="flex justify-center gap-4 mt-2 text-[10px] text-slate-500">
                <span>Score: <strong className={(s?.score ?? 0) >= 40 ? "text-emerald-400" : (s?.score ?? 0) <= -40 ? "text-red-400" : "text-amber-400"}>{s?.score ?? "-"}</strong></span>
                <span>Confidence: <strong>{s?.confidence ?? "-"}%</strong></span>
                <span>Timeframe: <strong className="text-white">{r.strategy?.timeframe_label || "N/A"}</strong></span>
              </div>
            </div>
            <div className="space-y-2">
              <PlanRow label="Entry Zone" value={r.strategy?.entry_zone} color="text-emerald-400" />
              <PlanRow label="TP1" value={r.strategy?.target_range} color="text-blue-400" />
              <PlanRow label="Stop Loss" value={`$${r.strategy?.stop_loss}`} color="text-red-400" />
              <PlanRow label="R/R" value={computeRR(r)} color={computeRRNum(r) >= 2 ? "text-emerald-400" : computeRRNum(r) >= 1 ? "text-amber-400" : "text-red-400"} />
              <PlanRow label="Timeframe" value={r.strategy?.timeframe_label} />
              <PlanRow label="Confidence" value={s?.confidence != null ? `${s.confidence}%` : "-"} color={(s?.confidence ?? 0) >= 70 ? "text-emerald-400" : (s?.confidence ?? 0) >= 40 ? "text-amber-400" : "text-red-400"} />
            </div>
            {r.strategy?.rationale?.length > 0 && (
              <div className="border-t border-slate-800/50 pt-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Rationale</div>
                {r.strategy.rationale.map((rr, i) => (
                  <div key={i} className="text-xs text-slate-400 flex items-start gap-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 flex-shrink-0 opacity-70" />{rr}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-amber-400">&#x1F4CB;</span>Scenarios</h3>
            <div className="space-y-2 text-xs">
              <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3">
                <div className="text-emerald-400 font-semibold text-[10px] uppercase tracking-wider mb-1">Bull Case</div>
                <p className="text-slate-400 text-xs">{r.trend.includes("uptrend") ? "Trend continues with volume confirmation. Breakout above resistance." : "Trend reversal with catalyst. Watch for volume spike."}</p>
              </div>
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                <div className="text-red-400 font-semibold text-[10px] uppercase tracking-wider mb-1">Bear Case</div>
                <p className="text-slate-400 text-xs">{r.trend.includes("bearish") ? "Continued selling pressure. Lower highs pattern." : "Trend failure. Breakdown below support."}</p>
              </div>
              <div className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-3">
                <div className="text-amber-400 font-semibold text-[10px] uppercase tracking-wider mb-1">Invalidation</div>
                <p className="text-slate-400 text-xs">Close below S1 (${r.support?.[0]?.toFixed(2) || "key level"}) on above-avg volume.</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-all duration-200">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-red-400">&#x26A0;&#xFE0F;</span>Risk Notes</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-800/30"><span className="text-slate-500">Risk Level</span><span className={`font-semibold ${colorForRisk(r.risk.level)}`}>{r.risk.level}</span></div>
              <div className="flex justify-between py-1 border-b border-slate-800/30"><span className="text-slate-500">ATR Vol</span><span className="text-white font-mono">{r.risk.volatility_percent}%</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Institutional</span><span className={r.institutional?.rising ? "text-emerald-400 font-semibold" : "text-slate-500"}>{r.institutional?.rising ? "Accumulating" : "Neutral"}</span></div>
              <div className="border-t border-slate-800/50 pt-2 text-slate-600 text-[10px] leading-relaxed">{r.disclaimer}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ScreenerView({ API }: { API: string }) {
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState("score");
  const [error, setError] = useState("");
  const presets = [
    { id: "all", label: "All Stocks" }, { id: "strong_buy", label: "Strong Buy" },
    { id: "growth", label: "Growth" }, { id: "momentum", label: "Momentum" }, { id: "value", label: "Value" },
  ];
  const runScan = async (p: string) => {
    setPreset(p); setLoading(true); setError("");
    try { const r = await fetch(`${API}/screener?preset=${p}&min_score=${minScore}`); const d = await r.json(); setStocks(d.stocks || []); }
    catch { setError("Scan failed"); } finally { setLoading(false); }
  };
  const sorted = [...stocks].sort((a, b) => {
    if (sortBy === "score") return b.score - a.score;
    if (sortBy === "returns") return b.returns_3m - a.returns_3m;
    return 0;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center bg-slate-900/30 border border-slate-800/50 rounded-xl p-3">
        <div className="flex gap-1.5 flex-wrap">
          {presets.map(p => (
            <button key={p.id} onClick={() => runScan(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${preset === p.id ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-600/20" : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/60"}`}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-slate-500 text-xs">Min Score:</span>
          <input type="number" value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="w-16 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
            <option value="score">Score</option><option value="returns">3M Return</option>
          </select>
        </div>
      </div>
      {loading && <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-slate-800/50 rounded-xl animate-shimmer" />)}</div>}
      {error && <div className="bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2">{error}</div>}
      {sorted.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-800/70 text-slate-500 bg-slate-900/60">
                {["Ticker", "Price", "Score", "Grade", "Trend", "RSI", "3M%", "Pattern", "RS", "Risk"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold whitespace-nowrap text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((s, idx) => (
                  <tr key={s.ticker} className={`border-b border-slate-800/30 hover:bg-slate-800/40 cursor-pointer transition-colors duration-150 ${idx % 2 === 0 ? "bg-slate-900/20" : ""}`} onClick={() => window.open(`${API}/analyze?ticker=${s.ticker}`, "_blank")}>
                    <td className="p-3 font-bold text-white">{s.ticker}</td>
                    <td className="p-3 text-white font-mono">${s.price.toFixed(2)}</td>
                    <td className="p-3"><span className={`font-bold ${s.score >= 70 ? "text-emerald-400" : s.score >= 50 ? "text-amber-400" : "text-red-400"}`}>{s.score}</span></td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.grade === "A+" || s.grade === "A" ? "bg-emerald-900/50 text-emerald-400" : s.grade === "B" ? "bg-blue-900/50 text-blue-400" : "bg-slate-800 text-slate-500"}`}>{s.grade}</span></td>
                    <td className="p-3"><span className={`text-[11px] font-medium ${s.trend === "strong_uptrend" ? "text-emerald-400" : s.trend === "uptrend" ? "text-blue-400" : s.trend === "bearish" ? "text-red-400" : "text-amber-400"}`}>{s.trend.replace(/_/g, " ")}</span></td>
                    <td className="p-3 text-white font-mono">{s.rsi.toFixed(0)}</td>
                    <td className={`p-3 whitespace-nowrap font-mono ${s.returns_3m >= 0 ? "text-emerald-400" : "text-red-400"}`}>{s.returns_3m >= 0 ? "+" : ""}{s.returns_3m}%</td>
                    <td className="p-3 text-[10px]">{s.volume_spike && <span className="text-purple-400 font-medium">Vol </span>}{s.consolidating && <span className="text-cyan-400 font-medium">Base </span>}{s.breakout && <span className="text-yellow-400 font-medium">BO</span>}</td>
                    <td className="p-3 text-white font-mono">{s.rs_ratio?.toFixed(2)}</td>
                    <td className="p-3"><span className={`text-[11px] font-medium ${s.risk === "low" ? "text-emerald-400" : s.risk === "medium" ? "text-amber-400" : "text-red-400"}`}>{s.risk}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 text-slate-600 text-[10px] border-t border-slate-800/50 bg-slate-900/40 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500/50" />{sorted.length} stocks &middot; Score &ge; {minScore} &middot; Click row for analysis</div>
        </div>
      )}
      {!loading && sorted.length === 0 && <div className="text-center py-16 bg-slate-900/30 border border-slate-800/50 rounded-xl"><div className="text-4xl mb-3 opacity-50">&#x1F4CA;</div><p className="text-slate-500 text-sm">Click a preset above to scan stocks</p></div>}
    </div>
  );
}

function CryptoView({ API }: { API: string }) {
  const [results, setResults] = useState<CryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const runScan = async () => {
    setLoading(true); setError("");
    try { const r = await fetch(`${API}/crypto/scan`); setResults((await r.json()).results || []); }
    catch { setError("Scan failed"); } finally { setLoading(false); }
  };
  const narCol: Record<string, string> = {
    "Layer 1": "text-purple-400", "Layer 1 / Smart Contracts": "text-blue-400",
    "Layer 1 / High Speed": "text-cyan-400", "L2 / Scaling": "text-emerald-400",
    "DeFi": "text-orange-400", "Meme": "text-pink-400",
  };
  return (
    <div className="space-y-4">
      <button onClick={runScan} disabled={loading} className="bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:from-slate-800 disabled:to-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-purple-600/20 hover:shadow-purple-500/30 disabled:shadow-none">
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
            Scanning
          </span>
        ) : "Scan Crypto Market"}
      </button>
      {error && <div className="bg-red-950/30 border border-red-800/50 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {loading && <div className="space-y-2">{[...Array(10)].map((_, i) => <div key={i} className="h-12 bg-slate-800/50 rounded-xl animate-shimmer" />)}</div>}
      {results.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-800/70 text-slate-500 bg-slate-900/60">
                {["Coin", "Price", "Score", "Grade", "Trend", "RSI", "Narrative", "Vol"].map(h => (
                  <th key={h} className="text-left p-3 font-semibold whitespace-nowrap text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {results.map((c, idx) => (
                  <tr key={c.ticker} className={`border-b border-slate-800/30 hover:bg-slate-800/40 cursor-pointer transition-colors duration-150 ${idx % 2 === 0 ? "bg-slate-900/20" : ""}`} onClick={() => window.open(`${API}/analyze?ticker=${c.ticker}`, "_blank")}>
                    <td className="p-3 font-bold text-white">{c.ticker.replace("-USD", "")}</td>
                    <td className="p-3 text-white font-mono">${c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)}</td>
                    <td className="p-3"><span className={`font-bold ${c.score >= 70 ? "text-emerald-400" : c.score >= 50 ? "text-amber-400" : "text-red-400"}`}>{c.score}</span></td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.grade === "A" ? "bg-emerald-900/50 text-emerald-400" : c.grade === "B" ? "bg-blue-900/50 text-blue-400" : "bg-amber-900/50 text-amber-400"}`}>{c.grade}</span></td>
                    <td className="p-3"><span className={`text-[11px] font-medium ${c.trend_state === "strong_uptrend" || c.trend_state === "uptrend" ? "text-emerald-400" : "text-amber-400"}`}>{c.trend_state.replace(/_/g, " ")}</span></td>
                    <td className="p-3 text-white font-mono">{c.rsi?.toFixed(0)}</td>
                    <td className="p-3"><span className={`text-[11px] font-medium ${narCol[c.narrative] || "text-slate-400"}`}>{c.narrative}</span></td>
                    <td className="p-3">{c.volume_spike ? <span className="text-purple-400 text-[11px] font-medium">{c.vol_ratio?.toFixed(1)}x</span> : <span className="text-slate-600 text-[11px]">Normal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!loading && results.length === 0 && <div className="text-center py-16 bg-slate-900/30 border border-slate-800/50 rounded-xl"><div className="text-4xl mb-3 opacity-50">&#x20BF;</div><p className="text-slate-500 text-sm">Click &quot;Scan Crypto Market&quot; to start</p></div>}
    </div>
  );
}

interface HoldingAdvice {
  action: string; reason: string; urgency: string; suggested_qty: number | null;
}
interface AdvisedHolding extends PortfolioHolding {
  advice: HoldingAdvice;
}
interface PortfolioAdviseResult {
  holdings: AdvisedHolding[];
  suggestions: string[];
  summary: {
    total_positions: number; total_cost: number; total_value: number;
    total_pnl: number; total_pnl_percent: number; win_rate: number;
    winners: number; losers: number; health_score: number;
    critical_alerts: number; warnings: number;
  };
  diversification: { concentration_risk: number; note: string };
}

function PortfolioView({ API }: { API: string }) {
  const [advice, setAdvice] = useState<PortfolioAdviseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [addForm, setAddForm] = useState({ ticker: "", price: "", qty: "1" });
  const [activePfTab, setActivePfTab] = useState<"overview" | "advice">("overview");

  const load = async () => {
    setLoading(true);
    try { const r = await fetch(`${API}/portfolio/advise`); setAdvice(await r.json()); } catch {}
    setLoading(false);
  };

  const add = async () => {
    if (!addForm.ticker || !addForm.price) return;
    await fetch(`${API}/portfolio/add?ticker=${addForm.ticker}&entry_price=${addForm.price}&quantity=${addForm.qty}`, { method: "POST" });
    setAddForm({ ticker: "", price: "", qty: "1" }); load();
  };

  const remove = async (t: string, i: number) => { await fetch(`${API}/portfolio/remove?ticker=${t}&index=${i}`, { method: "DELETE" }); load(); };

  useEffect(() => { load(); }, []);

  const s = advice?.summary;
  const adviceCol: Record<string, string> = {
    hold: "text-blue-400 bg-blue-950/30 border-blue-800/40",
    take_profit: "text-emerald-400 bg-emerald-950/30 border-emerald-800/40",
    watch: "text-amber-400 bg-amber-950/30 border-amber-800/40",
    cut_loss: "text-red-400 bg-red-950/30 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="text-emerald-400">+</span>Add Position</h3>
        <div className="flex flex-wrap gap-2">
          <input type="text" value={addForm.ticker} onChange={e => setAddForm({ ...addForm, ticker: e.target.value.toUpperCase() })} placeholder="Ticker" className="flex-1 min-w-[80px] bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500" />
          <input type="number" value={addForm.price} onChange={e => setAddForm({ ...addForm, price: e.target.value })} placeholder="Entry" className="w-24 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          <input type="number" value={addForm.qty} onChange={e => setAddForm({ ...addForm, qty: e.target.value })} placeholder="Qty" className="w-20 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={add} className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-lg shadow-emerald-600/20">Add</button>
        </div>
      </div>

      <button onClick={load} disabled={loading} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-800 disabled:to-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:shadow-none">
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
            Loading
          </span>
        ) : "Refresh Portfolio"}
      </button>

      {s && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-slideUp">
            <SummaryCard label="Health Score" value={`${s.health_score}/100`} color={s.health_score >= 60 ? "text-emerald-400" : s.health_score >= 35 ? "text-amber-400" : "text-red-400"} />
            <SummaryCard label="Total Value" value={`$${s.total_value?.toLocaleString()}`} color="text-emerald-400" />
            <SummaryCard label="P&L" value={`${s.total_pnl >= 0 ? "+" : ""}$${s.total_pnl?.toFixed(2)}`} color={s.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"} />
            <SummaryCard label="Win Rate" value={`${s.win_rate}%`} color={s.win_rate >= 50 ? "text-emerald-400" : "text-red-400"} />
            <SummaryCard label="Alerts" value={`${s.critical_alerts + s.warnings}`} color={s.critical_alerts > 0 ? "text-red-400" : s.warnings > 0 ? "text-amber-400" : "text-emerald-400"} />
          </div>

          <div className="flex gap-1 bg-slate-900/50 border border-slate-800/50 p-1 rounded-xl w-fit">
            <button onClick={() => setActivePfTab("overview")}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${activePfTab === "overview" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow" : "text-slate-500 hover:text-slate-300"}`}>Holdings</button>
            <button onClick={() => setActivePfTab("advice")}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${activePfTab === "advice" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow" : "text-slate-500 hover:text-slate-300"}`}>Advice</button>
          </div>

          {activePfTab === "advice" && (
            <div className="space-y-3 animate-slideUp">
              {advice?.suggestions?.map((sg, i) => (
                <div key={i} className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3 text-sm text-slate-300 flex items-start gap-2">
                  <span className="text-lg">{sg.includes("critical") || sg.includes("Cutting") ? "&#x26A0;&#xFE0F;" : "&#x1F4A1;"}</span>
                  <span>{sg}</span>
                </div>
              ))}
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Diversification</h3>
                <div className="text-sm text-slate-300">{advice?.diversification?.note}</div>
                <div className="mt-2 text-xs text-slate-500">Top position: {advice?.diversification?.concentration_risk}% of portfolio</div>
              </div>
              {advice?.holdings?.map((h, i) => (
                <div key={i} className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{h.ticker}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${adviceCol[h.advice.action] || "text-slate-400"}`}>
                        {h.advice.action.replace(/_/g, " ")}
                      </span>
                      {h.advice.urgency === "high" && <span className="text-[10px] text-red-400 font-semibold">&#x26A0;&#xFE0F;</span>}
                    </div>
                    <span className={`text-sm font-mono font-medium ${h.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {h.pnl >= 0 ? "+" : ""}{h.pnl_percent.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{h.advice.reason}</p>
                  <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
                    <span>Entry: <strong className="text-white">${h.entry_price.toFixed(2)}</strong></span>
                    <span>Current: <strong className="text-white">${h.current_price.toFixed(2)}</strong></span>
                    <span>Alloc: <strong className="text-white">{h.allocation_pct}%</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activePfTab === "overview" && advice?.holdings && advice.holdings.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-800/70 text-slate-500 bg-slate-900/60">
                    {["Ticker", "Entry", "Current", "P&L", "P&L%", "Alloc%", "Advice", ""].map(h => (<th key={h} className="text-left p-3 font-semibold whitespace-nowrap text-[11px] uppercase tracking-wider">{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {advice.holdings.map((h, i) => (
                      <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/40 transition-colors duration-150 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}>
                        <td className="p-3 font-bold text-white">{h.ticker}</td>
                        <td className="p-3 text-white font-mono">${h.entry_price.toFixed(2)}</td>
                        <td className="p-3 text-white font-mono">${h.current_price.toFixed(2)}</td>
                        <td className={`p-3 font-mono font-medium ${h.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)}</td>
                        <td className={`p-3 font-mono font-medium ${h.pnl_percent >= 0 ? "text-emerald-400" : "text-red-400"}`}>{h.pnl_percent >= 0 ? "+" : ""}{h.pnl_percent.toFixed(1)}%</td>
                        <td className="p-3 text-white font-mono">{h.allocation_pct.toFixed(1)}%</td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${adviceCol[h.advice.action] || "text-slate-400"}`}>
                            {h.advice.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="p-3"><button onClick={() => remove(h.ticker, i)} className="text-red-500 hover:text-red-400 text-[10px] font-medium px-2 py-1 rounded hover:bg-red-950/30 transition-all">Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {(!advice?.holdings || advice.holdings.length === 0) && !loading && (
        <div className="text-center py-16 bg-slate-900/30 border border-slate-800/50 rounded-xl">
          <div className="text-4xl mb-3 opacity-50">&#x1F4BC;</div>
          <p className="text-slate-500 text-sm">No positions yet. Add one above or from Ticker Analysis.</p>
        </div>
      )}
    </div>
  );
}

function OverviewCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3 hover:border-slate-700/50 transition-all duration-200"><div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div><div className={`text-base font-bold truncate ${color || "text-white"} capitalize`}>{value}</div></div>;
}

function IndRow({ label, value, color }: { label: string; value: string | number | undefined | null; color?: string }) {
  return <div className="flex justify-between text-sm py-1.5 border-b border-slate-800/30 last:border-0"><span className="text-slate-500">{label}</span><span className={`font-mono font-medium ${color || "text-white"}`}>{value ?? "N/A"}</span></div>;
}

function PlanRow({ label, value, color }: { label: string; value: string | undefined; color?: string }) {
  return <div className="flex justify-between text-sm py-1"><span className="text-slate-500">{label}</span><span className={`font-mono font-semibold ${color || "text-white"}`}>{value || "N/A"}</span></div>;
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3 hover:border-slate-700/50 transition-all duration-200"><div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div><div className={`text-base font-bold truncate ${color || "text-white"}`}>{value}</div></div>;
}

function colorForRisk(l: string) { return l === "low" ? "text-emerald-400" : l === "high" ? "text-red-400" : "text-amber-400"; }
function formatMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}
function computeRR(r: AnalysisResult): string {
  const entry = parseFloat(r.strategy?.entry_zone?.split(" - ")[0]) || r.current_price;
  const target = parseFloat(r.strategy?.target_range?.split(" - ")[0]) || r.current_price * 1.05;
  const stop = parseFloat(r.strategy?.stop_loss) || r.current_price * 0.95;
  const reward = Math.abs(target - entry); const risk = Math.abs(entry - stop);
  return risk > 0 ? `${(reward / risk).toFixed(1)}:1` : "N/A";
}
function computeRRNum(r: AnalysisResult): number {
  const entry = parseFloat(r.strategy?.entry_zone?.split(" - ")[0]) || r.current_price;
  const target = parseFloat(r.strategy?.target_range?.split(" - ")[0]) || r.current_price * 1.05;
  const stop = parseFloat(r.strategy?.stop_loss) || r.current_price * 0.95;
  return Math.abs(target - entry) / Math.abs(entry - stop) || 0;
}
