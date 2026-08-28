export default function Progresso({ valore, sottile = false }) {
  const perc = Math.max(0, Math.min(100, valore * 100));
  return (
    <div
      className={`barra ${sottile ? 'barra-sottile' : ''}`}
      role="progressbar" aria-valuenow={Math.round(perc)} aria-valuemin={0} aria-valuemax={100}
    >
      <div className="barra-fill" style={{ width: `${perc}%` }} />
    </div>
  );
}
