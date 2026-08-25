type Props = {
  label: string;
  percent: number;
  used?: number;
  limit?: number;
  className?: string;
  /** Colour of the fill. Derived from the label when not given. */
  variant?: 'premium' | 'standard' | 'claude';
};

export default function ProgressBar({ label, percent, used, limit, className, variant }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const fill = variant ?? (label.toLowerCase().includes('premium') ? 'premium' : 'standard');
  return (
    <div className={className}>
      <h2>{label}</h2>
      <div className="progress-bar">
        <div className={`progress-fill ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="usage-text">
        {typeof used === 'number' && typeof limit === 'number' ? `${used} / ${limit} (${pct}%)` : `(${pct}%)`}
      </div>
    </div>
  );
}
