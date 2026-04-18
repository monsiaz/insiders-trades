interface StatsCardProps {
  label: string;
  value: string;
  icon: string;
  className?: string;
}

export function StatsCard({ label, value, icon, className = "" }: StatsCardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900/50 p-5 ${className}`}
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}
