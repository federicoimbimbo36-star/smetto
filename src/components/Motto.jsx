import { MANTRA } from '../constants';

export default function Motto({ compatto = false }) {
  return (
    <div className={`motto ${compatto ? 'motto-compatto' : ''}`}>
      <span className="motto-testo">{MANTRA}</span>
      {!compatto && <span className="motto-coda">Se ricadi, riprova.</span>}
    </div>
  );
}
