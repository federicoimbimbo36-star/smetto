import { initials } from '../utils/format';

export default function AvatarCircle({ name, color, size = 40 }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}
