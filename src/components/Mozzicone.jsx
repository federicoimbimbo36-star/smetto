export default function Mozzicone({ stato = 'pieno', acceso = false }) {
  if (stato === 'vuoto') return <div className="butt-empty" />;
  return (
    <div className={`butt ${stato === 'oltre' ? 'butt-over' : ''}`}>
      <div className="butt-paper" />
      <div className="butt-filter" />
      {acceso && <div className="butt-ember" />}
    </div>
  );
}
