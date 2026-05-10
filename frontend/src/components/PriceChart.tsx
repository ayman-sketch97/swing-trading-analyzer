"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType } from "lightweight-charts";

export default function PriceChart({ data }: { data: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const candles = data.candles as Array<{ time: string; open: number; high: number; low: number; close: number }>;
    const volume = data.volume as Array<{ time: string; value: number; color: string }>;
    const ema20 = data.ema20 as Array<{ time: string; value: number }>;
    const ema50 = data.ema50 as Array<{ time: string; value: number }>;
    const ema200 = data.ema200 as Array<{ time: string; value: number }>;
    const supportLines = data.support_lines as Array<{ level: number; label: string }>;
    const resistanceLines = data.resistance_lines as Array<{ level: number; label: string }>;
    if (!candles?.length) return;

    if (chartRef.current) chartRef.current.remove();

    const isMobile = containerRef.current.clientWidth < 640;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#020617" }, textColor: "#64748b" },
      grid: { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      width: containerRef.current.clientWidth,
      height: isMobile ? 250 : 350,
      timeScale: { borderColor: "#1e293b" },
      rightPriceScale: { borderColor: "#1e293b" },
    });
    chartRef.current = chart;

    const cs = chart.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444", borderUpColor: "#10b981", borderDownColor: "#ef4444", wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });
    cs.setData(candles as never);

    const vs = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "volume" });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vs.setData(volume as never);

    chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(ema20.filter(d => d.value > 0) as never);
    chart.addLineSeries({ color: "#3b82f6", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(ema50.filter(d => d.value > 0) as never);
    chart.addLineSeries({ color: "#8b5cf6", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(ema200.filter(d => d.value > 0) as never);

    supportLines?.forEach(l => {
      const s = chart.addLineSeries({ color: "#10b981", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(candles.map(c => ({ time: c.time, value: l.level })) as never);
    });

    resistanceLines?.forEach(l => {
      const s = chart.addLineSeries({ color: "#ef4444", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(candles.map(c => ({ time: c.time, value: l.level })) as never);
    });

    chart.timeScale().fitContent();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      }, 100);
    };
    window.addEventListener("resize", onResize);

    return () => { clearTimeout(resizeTimer); window.removeEventListener("resize", onResize); chart.remove(); chartRef.current = null; };
  }, [data]);

  return <div ref={containerRef} className="rounded-lg overflow-hidden border border-slate-800" />;
}
