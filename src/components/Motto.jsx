import { MANTRA } from '../constants';

export default function Motto({ coda = true }) {
  return (
    <div className="motto">
      <span className="motto-testo">{MANTRA}</span>
      {coda && <span className="motto-coda">Se ricadi, riprova.</span>}
    </div>
  );
}
