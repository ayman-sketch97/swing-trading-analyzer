"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";

interface ChartData {
  candles: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  volume: Array<{ time: string; value: number; color: string }>;
  rsi: Array<{ time: string; value: number }>;
  ema20: Array<{ time: string; value: number }>;
  ema50: Array<{ time: string; value: number }>;
  ema200: Array<{ time: string; value: number }>;
  support_lines: Array<{ level: number; label: string }>;
  resistance_lines: Array<{ level: number; label: string }>;
}

interface MultiTF {
  [key: string]: { price: number; trend: string; rsi: number; ema20: number; ema50: number; ema200: number };
}

interface LiqZones {
  equal_highs: number[];
  equal_lows: number[];
  wick_rejections: Array<{ type: string; level: number }>;
}

interface Props {
  ticker: string;
  chart: ChartData;
  currentPrice: number;
  structure: string;
  trend: string;
  emaAlignment: string;
  rsi: number;
  rsiZone: string;
  macd: any;
  volume: any;
  sr: any;
  liqZones: LiqZones;
  squeeze: any;
  session: any;
  regime: any;
  multiTF: MultiTF;
  tfAlignment: string;
  noTradeZone: boolean;
  onTimeframeChange: (tf: string, shouldFetch?: boolean) => void;
  activeTF: string;
}

export default function ChartAnalysis({
  ticker, chart, currentPrice, structure, trend, emaAlignment,
  rsi, rsiZone, macd, volume, sr, liqZones, squeeze, session, regime,
  multiTF, tfAlignment, noTradeZone,
  onTimeframeChange, activeTF,
}: Props) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const mainChart = useRef<IChartApi | null>(null);
  const rsiChart = useRef<IChartApi | null>(null);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);

  const tfLabels = [
    { id: "15 min", label: "15m" },
    { id: "1 hour", label: "1H" },
    { id: "1 day", label: "1D" },
  ];

  useEffect(() => {
    if (!mainChartRef.current || !rsiChartRef.current) return;
    const c = chart?.candles;
    if (!c?.length) return;

    if (mainChart.current) mainChart.current.remove();
    if (rsiChart.current) rsiChart.current.remove();

    const isMobile = mainChartRef.current.clientWidth < 640;
    const w = mainChartRef.current.clientWidth;

    const main = createChart(mainChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#020617" }, textColor: "#64748b" },
      grid: { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      width: w, height: isMobile ? 260 : 380,
      timeScale: { borderColor: "#1e293b", timeVisible: activeTF !== "1 day" },
      rightPriceScale: { borderColor: "#1e293b" },
      crosshair: { mode: 0 },
    });
    mainChart.current = main;

    const cs = main.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });
    cs.setData(c as any);

    const vs = main.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    if (chart?.volume) vs.setData(chart.volume as any);

    const addLine = (data: any, color: string, width: number = 1, style: number = 0) => {
      if (!data?.length) return;
      const s = main.addLineSeries({ color, lineWidth: width as any, lineStyle: style as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(data as any);
    };

    addLine(chart.ema20, "#f59e0b", 1);
    addLine(chart.ema50, "#3b82f6", 2);
    addLine(chart.ema200, "#8b5cf6", 2);

    chart.support_lines?.forEach(l => {
      const s = main.addLineSeries({ color: "#10b981", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(c.map((candle: any) => ({ time: candle.time, value: l.level })) as any);
      main.addLineSeries({ color: "#10b981", lineWidth: 0 as any }).setData([] as any);
    });

    chart.resistance_lines?.forEach(l => {
      const s = main.addLineSeries({ color: "#ef4444", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(c.map((candle: any) => ({ time: candle.time, value: l.level })) as any);
    });

    liqZones?.equal_highs?.forEach(h => {
      const s = main.addLineSeries({ color: "#f97316", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(c.map((candle: any) => ({ time: candle.time, value: h })) as any);
    });

    liqZones?.equal_lows?.forEach(l => {
      const s = main.addLineSeries({ color: "#22d3ee", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(c.map((candle: any) => ({ time: candle.time, value: l })) as any);
    });

    main.timeScale().fitContent();

    const rw = rsiChartRef.current.clientWidth;
    const rsiC = createChart(rsiChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#020617" }, textColor: "#64748b" },
      grid: { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      width: rw, height: 80,
      timeScale: { borderColor: "#1e293b", visible: false },
      rightPriceScale: { borderColor: "#1e293b" },
    });
    rsiChart.current = rsiC;

    if (chart?.rsi?.length) {
      const rsiData = chart.rsi.filter((d: any) => d.value !== null);
      rsiC.addLineSeries({ color: "#a855f7", lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: false }).setData(rsiData as any);
      rsiC.addLineSeries({ color: "#ef444480", lineWidth: 0 as any, lineStyle: 2 as any, priceLineVisible: false, lastValueVisible: false })
        .setData(chart.rsi.map((d: any) => ({ time: d.time, value: 70 })) as any);
      rsiC.addLineSeries({ color: "#10b98180", lineWidth: 0 as any, lineStyle: 2 as any, priceLineVisible: false, lastValueVisible: false })
        .setData(chart.rsi.map((d: any) => ({ time: d.time, value: 30 })) as any);
    }
    rsiC.timeScale().fitContent();

    const onResize = () => {
      if (mainChartRef.current) {
        const nw = mainChartRef.current.clientWidth;
        main.applyOptions({ width: nw });
        rsiC.applyOptions({ width: rw });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      main.remove(); rsiC.remove();
      mainChart.current = null; rsiChart.current = null;
    };
  }, [chart, activeTF, ticker]);

  const trendColor = (t: string) =>
    t === "strong_uptrend" || t === "uptrend" ? "text-emerald-400" :
    t === "bearish" ? "text-red-400" : "text-amber-400";

  const rsiColor = rsi > 75 ? "text-red-400" : rsi < 30 ? "text-emerald-400" : rsi >= 55 && rsi <= 75 ? "text-emerald-400" : "text-amber-400";

  const notes: string[] = [];
  if (noTradeZone) {
    if (structure === "ranging") notes.push("Ranging — no clear direction, wait for breakout");
    if (rsi > 78) notes.push(`RSI ${rsi} overbought, no volume confirmation`);
    if (tfAlignment === "conflict") notes.push("Timeframes disagree — wait for alignment");
  } else {
    if (structure === "bullish") notes.push("Bullish structure, EMA aligned");
    if (volume?.spike) notes.push(`${volume.vol_ratio?.toFixed(1)}x volume spike — strong confirmation`);
  }
  if (squeeze?.squeeze) notes.push("BB squeeze — watch for expansion");
  if (session?.session) notes.push(`${session.session} session — ${session.volatility_expected} vol`);
  if (!notes.length) notes.push("No strong signals, monitor");

  const resLevels = sr?.resistance?.slice(0, 3).map((l: number) => `R: $${l.toFixed(0)}`).join("  ") || "";
  const supLevels = sr?.support?.slice(0, 3).map((l: number) => `S: $${l.toFixed(0)}`).join("  ") || "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg">
          {tfLabels.map(tf => (
            <button key={tf.id} onClick={() => onTimeframeChange(tf.id, true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                activeTF === tf.id ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
              }`}>
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-slate-800">
        <div ref={mainChartRef} />
        <div className="absolute top-2 left-2 flex flex-col gap-0.5 pointer-events-none">
          <div className="flex flex-wrap gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${structure === "bullish" ? "bg-emerald-950/80 text-emerald-400" : structure === "bearish" ? "bg-red-950/80 text-red-400" : "bg-amber-950/80 text-amber-400"}`}>{structure}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${emaAlignment === "bullish" ? "bg-emerald-950/80 text-emerald-400" : emaAlignment === "bearish" ? "bg-red-950/80 text-red-400" : "bg-amber-950/80 text-amber-400"}`}>EMA {emaAlignment}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900/80 text-cyan-300">RSI {rsi} ({rsiZone})</span>
            {noTradeZone && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-950/90 text-red-400">NO TRADE</span>}
          </div>
        </div>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5 pointer-events-none">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-950/80 text-purple-300">{trend}</span>
          {volume?.spike && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-950/80 text-sky-300">{volume.vol_ratio?.toFixed(1)}x VOL</span>}
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900/80 text-white">${currentPrice?.toFixed(2)}</span>
        </div>

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-none max-w-[140px]">
          {notes.slice(0, 3).map((n, i) => (
            <div key={i} className="px-2 py-1 rounded text-[9px] leading-tight bg-slate-950/70 text-slate-300 border-l-2 border-blue-500/50 shadow-lg backdrop-blur-sm">
              {n}
            </div>
          ))}
        </div>

        <div className="absolute bottom-6 left-2 flex flex-col gap-0.5 pointer-events-none text-[8px]">
          {supLevels && <div className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400/80 font-mono">{supLevels}</div>}
          {resLevels && <div className="px-1.5 py-0.5 rounded bg-red-950/60 text-red-400/80 font-mono">{resLevels}</div>}
        </div>
      </div>
      <div ref={rsiChartRef} className="rounded-lg overflow-hidden border border-slate-800" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
          <div className="text-[10px] text-slate-500 uppercase">Structure</div>
          <div className={`text-sm font-bold capitalize ${trendColor(structure)}`}>{structure}</div>
          <div className="text-[10px] text-slate-600">
            {structure === "bullish" ? "Higher highs structure" :
             structure === "bearish" ? "Lower lows structure" :
             structure === "squeeze" ? "Volatility compression" : "No clear direction"}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
          <div className="text-[10px] text-slate-500 uppercase">EMA</div>
          <div className={`text-sm font-bold capitalize ${emaAlignment === "bullish" ? "text-emerald-400" : emaAlignment === "bearish" ? "text-red-400" : "text-amber-400"}`}>{emaAlignment}</div>
          <div className="text-[10px] text-slate-600">{emaAlignment === "bullish" ? "20 > 50 > 200" : emaAlignment === "bearish" ? "Price below all MAs" : "Mixed"}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
          <div className="text-[10px] text-slate-500 uppercase">RSI ({rsi})</div>
          <div className={`text-sm font-bold capitalize ${rsiColor}`}>{rsiZone}</div>
          <div className="text-[10px] text-slate-600">
            {rsi > 75 ? "Overbought - may retrace" :
             rsi < 30 ? "Oversold - potential bounce" :
             rsi >= 55 && rsi <= 75 ? "Healthy momentum zone" : "Neutral"}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
          <div className="text-[10px] text-slate-500 uppercase">Volume</div>
          <div className="text-sm font-bold text-white">{volume?.spike ? `${volume.vol_ratio?.toFixed(1)}x spike` : "Normal"}</div>
          <div className="text-[10px] text-slate-600">{volume?.spike ? "Institutional interest" : "No unusual activity"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Multi-Timeframe</h3>
          <div className="space-y-2">
            {Object.entries(multiTF || {}).map(([tf, data]: [string, any]) => (
              <div key={tf} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{tf}</span>
                <span className={`font-medium ${trendColor(data.trend)}`}>{data.trend}</span>
                <span className="text-white font-mono">${data.price}</span>
                <span className="text-slate-500">RSI {data.rsi}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-800 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Alignment</span>
              <span className={tfAlignment === "aligned" ? "text-emerald-400" : "text-red-400"}>{tfAlignment}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Support & Resistance</h3>
          <div className="space-y-1">
            <div className="text-[10px] text-red-400 font-medium mb-0.5">Resistance</div>
            {sr?.resistance?.map((l: number, i: number) => (
              <div key={`r${i}`} className="flex justify-between text-xs">
                <span className="text-slate-500">R{i + 1}</span>
                <span className="text-white font-mono">${l.toFixed(2)}</span>
                <span className="text-slate-600">{((l - currentPrice) / currentPrice * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-1 space-y-1">
            <div className="text-[10px] text-emerald-400 font-medium mb-0.5">Support</div>
            {sr?.support?.map((l: number, i: number) => (
              <div key={`s${i}`} className="flex justify-between text-xs">
                <span className="text-slate-500">S{i + 1}</span>
                <span className="text-white font-mono">${l.toFixed(2)}</span>
                <span className="text-slate-600">{(l - currentPrice) / currentPrice * 100 >= 0 ? "+" : ""}{((l - currentPrice) / currentPrice * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Session & Liquidity</h3>
          {session && (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Session</span>
                <span className={`font-medium ${session.is_major_session ? "text-yellow-400" : "text-slate-300"}`}>{session.session}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vol expected</span>
                <span className={session.volatility_expected === "high" ? "text-red-400" : session.volatility_expected === "low" ? "text-emerald-400" : "text-amber-400"}>{session.volatility_expected}</span>
              </div>
              <div className="text-[10px] text-slate-600 mt-1">{session.description}</div>
            </div>
          )}
          {liqZones && (
            <div className="mt-2 border-t border-slate-800 pt-2 space-y-1 text-xs">
              {liqZones.equal_highs?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Equal Highs (liq)</span>
                  <span className="text-orange-400">{liqZones.equal_highs.map((h: number) => `$${h.toFixed(0)}`).join(", ")}</span>
                </div>
              )}
              {liqZones.equal_lows?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Equal Lows (liq)</span>
                  <span className="text-cyan-400">{liqZones.equal_lows.map((l: number) => `$${l.toFixed(0)}`).join(", ")}</span>
                </div>
              )}
              {liqZones.wick_rejections?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Wick Rejections</span>
                  <span className="text-purple-400">{liqZones.wick_rejections.length} detected</span>
                </div>
              )}
              {(!liqZones.equal_highs?.length && !liqZones.equal_lows?.length && !liqZones.wick_rejections?.length) && (
                <div className="text-slate-600">No clear liquidity zones</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Chart Analysis</h3>
          <div className="space-y-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-500 font-medium mb-0.5">Current Market Structure</div>
              <p className="text-slate-300">
                {structure === "bullish"
                  ? "Price is in a clear uptrend with EMA 20 above 50 above 200. Higher highs and higher lows confirming bullish structure."
                  : structure === "bearish"
                  ? "Price is in a downtrend with bearish EMA alignment. Lower highs and lower lows confirming bearish structure."
                  : structure === "squeeze"
                  ? "Volatility is compressing (Bollinger Bands squeezing). This often precedes an explosive move but direction is unknown."
                  : "Price is ranging with no clear directional bias. EMA lines are flat / mixed. Best to wait for breakout or breakdown."}
              </p>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-medium mb-0.5">Indicator Interpretation</div>
              <p className="text-slate-300">
                EMA alignment is <strong className={emaAlignment === "bullish" ? "text-emerald-400" : "text-red-400"}>{emaAlignment}</strong>. RSI at <strong className={rsiColor}>{rsi}</strong> ({rsiZone}).
                Volume is {volume?.spike ? `elevated (${volume.vol_ratio?.toFixed(1)}x avg) - confirming the move` : "normal - no strong confirmation"}.
                {squeeze?.squeeze ? " BB squeeze detected - watch for expansion." : ""}
              </p>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-medium mb-0.5">Market Regime</div>
              <p className="text-slate-300">
                SPY is in a <strong className={regime?.regime === "bullish" ? "text-emerald-400" : "text-red-400"}>{regime?.regime || "unknown"}</strong> regime.
                {regime?.spy_above_200ma ? " Market is above 200MA - favorable for long setups." : " Market below 200MA - caution warranted."}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Trade Context</h3>
          {noTradeZone ? (
            <div className="space-y-2">
              <div className="bg-red-950/30 border border-red-800/50 rounded p-2">
                <div className="text-red-400 font-bold text-xs">NO CLEAN SETUP ON CHART RIGHT NOW</div>
                <p className="text-slate-400 text-[10px] mt-1">
                  {structure === "ranging" ? "Price is chopping in a range. Wait for breakout/breakdown with volume." :
                   rsi > 78 ? "RSI is overbought without volume confirmation. Risk of fakeout." :
                   tfAlignment === "conflict" ? "Timeframes disagree. Wait for alignment." :
                   "Conditions are not met for a high-probability setup."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-emerald-950/20 border border-emerald-800/30 rounded p-2">
                <div className="text-emerald-400 font-bold text-xs">SETUP DETECTED</div>
                <p className="text-slate-400 text-[10px] mt-1">
                  {structure === "bullish" && trend.includes("uptrend")
                    ? "Bullish trend with positive EMA alignment. Look for pullback to EMA or support for entry."
                    : "Setup forming. Monitor for confirmation."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div><span className="text-slate-500">Entry Zone:</span> <span className="text-emerald-400 font-mono">
                  ${sr?.support?.[0]?.toFixed(2) || "N/A"} - ${currentPrice?.toFixed(2)}
                </span></div>
                <div><span className="text-slate-500">Stop Loss:</span> <span className="text-red-400 font-mono">
                  ${sr?.support?.[1] ? (sr.support[1] * 0.99).toFixed(2) : currentPrice ? (currentPrice * 0.95).toFixed(2) : "N/A"}
                </span></div>
                <div><span className="text-slate-500">TP1:</span> <span className="text-blue-400 font-mono">
                  ${sr?.resistance?.[0]?.toFixed(2) || "N/A"}
                </span></div>
                <div><span className="text-slate-500">TP2:</span> <span className="text-blue-400 font-mono">
                  ${sr?.resistance?.[1]?.toFixed(2) || "N/A"}
                </span></div>
              </div>
            </div>
          )}
          <div className="mt-2 border-t border-slate-800 pt-2 space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Squeeze:</span>
              <span className={squeeze?.squeeze ? "text-yellow-400" : "text-slate-500"}>{squeeze?.squeeze ? "Active" : "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">TF Alignment:</span>
              <span className={tfAlignment === "aligned" ? "text-emerald-400" : "text-red-400"}>{tfAlignment}</span>
            </div>
            {squeeze?.bb_width && (
              <div className="flex justify-between">
                <span className="text-slate-500">BB Width:</span>
                <span className="text-white">{squeeze.bb_width}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-amber-950/20 border border-amber-900/50 rounded p-2">
        <p className="text-amber-500/70 text-[10px]">
          Analysis based on {activeTF} chart data. The system provides analysis only. It does not guarantee outcomes or predict markets with certainty.
        </p>
      </div>
    </div>
  );
}
