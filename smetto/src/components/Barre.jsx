export default function Barre({ dati, budget, evidenzia }) {
  const max = Math.max(1, budget ?? 0, ...dati.map((d) => d.n));
  return (
    <div className="chart">
      {budget != null && (
        <div className="budget-line" style={{ bottom: 22 + (budget / max) * 84 }}>
          <div className="budget-dash" />
          <span className="budget-tag num">BUDGET {budget}</span>
        </div>
      )}
      <div className="bars">
        {dati.map((d, i) => (
          <div className="bar-col" key={i}>
            <span className={`bar-value num ${d.futuro ? 'invisible' : ''}`}>{d.n}</span>
            <div className={`bar ${d.futuro ? 'bar-future' : ''} ${evidenzia === i ? 'bar-today' : ''}`}
              style={{ height: d.futuro ? 0 : Math.max(2, (d.n / max) * 84) }} />
            <span className="bar-day">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
