import { BarChart2, Users, Plus, Target, User } from 'lucide-react';

export default function BottomNav({ active, onChange, badge }) {
  const item = (id, Icon, label) => (
    <button className={`nav-item ${active === id ? 'nav-item-active' : ''}`} onClick={() => onChange(id)}>
      <span className="nav-icon">
        <Icon size={19} />
        {id === 'gruppo' && badge > 0 && <span className="nav-badge">{badge > 9 ? '9+' : badge}</span>}
      </span>
      <span>{label}</span>
    </button>
  );
  return (
    <div className="bottom-nav">
      {item('registra', Plus, 'Registra')}
      {item('piano', Target, 'Piano')}
      {item('recap', BarChart2, 'Recap')}
      {item('gruppo', Users, 'Gruppo')}
      {item('account', User, 'Account')}
    </div>
  );
}
