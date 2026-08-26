export default function Progresso({ valore }) {
  return <div className="progress"><div className="progress-fill" style={{ width: `${Math.min(100, valore * 100)}%` }} /></div>;
}
