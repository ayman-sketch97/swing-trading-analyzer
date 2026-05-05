"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickData,
  HistogramData,
  LineData,
} from "lightweight-charts";

interface ChartData {
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  volume: { time: number; value: number; color: string }[];
  ema20: { time: number; value: number }[];
  ema50: { time: number; value: number }[];
  ema200: { time: number; value: number }[];
  support_lines: { level: number; label: string }[];
  resistance_lines: { level: number; label: string }[];
}

interface PriceChartProps {
  data: ChartData;
}

export default function PriceChart({ data }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data.candles.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0f172a" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: false,
        borderColor: "#334155",
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    candleSeries.setData(data.candles as CandlestickData[]);

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    volumeSeries.setData(data.volume as HistogramData[]);

    const ema20Series = chart.addLineSeries({
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema20Series.setData(data.ema20.filter(d => d.value > 0) as LineData[]);

    const ema50Series = chart.addLineSeries({
      color: "#3b82f6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Series.setData(data.ema50.filter(d => d.value > 0) as LineData[]);

    const ema200Series = chart.addLineSeries({
      color: "#8b5cf6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Series.setData(data.ema200.filter(d => d.value > 0) as LineData[]);

    data.support_lines.forEach((line) => {
      const lineSeries = chart.addLineSeries({
        color: "#10b981",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const lineData = data.candles.map(c => ({ time: c.time, value: line.level }));
      lineSeries.setData(lineData as LineData[]);
    });

    data.resistance_lines.forEach((line) => {
      const lineSeries = chart.addLineSeries({
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const lineData = data.candles.map(c => ({ time: c.time, value: line.level }));
      lineSeries.setData(lineData as LineData[]);
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div className="w-full">
      <div className="flex gap-4 mb-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-amber-500 inline-block"></span>
          EMA 20
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-blue-500 inline-block"></span>
          EMA 50
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-purple-500 inline-block"></span>
          EMA 200
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-emerald-500 inline-block" style={{ borderTop: "1px dashed" }}></span>
          Support
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-red-500 inline-block" style={{ borderTop: "1px dashed" }}></span>
          Resistance
        </span>
      </div>
      <div ref={chartContainerRef} className="rounded-lg overflow-hidden border border-slate-700" />
    </div>
  );
}
