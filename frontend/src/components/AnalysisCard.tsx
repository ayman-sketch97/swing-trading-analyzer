interface AnalysisCardProps {
  label: string;
  value: string;
  icon?: string;
  color?: "bullish" | "bearish" | "neutral";
}

export default function AnalysisCard({ label, value, color }: AnalysisCardProps) {
  const colorClasses = {
    bullish: "text-emerald-400",
    bearish: "text-red-400",
    neutral: "text-amber-400",
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-semibold ${color ? colorClasses[color] : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}
