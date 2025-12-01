import { getUsageColorClass } from '../constants';

type Props = {
  label: string;
  percent: number;
  used?: number;
  limit?: number;
  className?: string;
};

export default function ProgressBar({ label, percent, used, limit, className }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const colorClass = getUsageColorClass(pct);
  return (
    <div className={className}>
      <h2>{label}</h2>
      <div className="progress-bar">
        <div className={`progress-fill ${label.toLowerCase().includes('premium') ? 'premium' : 'standard'} ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`usage-text ${colorClass}`}>
        {typeof used === 'number' && typeof limit === 'number' ? `${used} / ${limit} (${pct}%)` : `(${pct}%)`}
      </div>
    </div>
  );
}
