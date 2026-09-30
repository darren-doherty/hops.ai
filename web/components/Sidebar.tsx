import { useStore } from '../store';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { UserSwitcher } from './UserSwitcher';
import { SearchBox } from './SearchBox';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { UserDto } from '../../shared/types';

export function Sidebar({ users }: { users: UserDto[] }) {
  const me = useStore((s) => s.me)!;
  const usersById = useStore((s) => s.usersById);
  const channels = useStore((s) => s.channels);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const unreadCount = useStore((s) => s.unreadCount);

  const isActive = (channelId: string) => view?.kind === 'channel' && view.channelId === channelId;
  const publicChannels = channels.filter((c) => c.kind === 'public');
  const dms = channels.filter((c) => c.kind === 'dm');

  return (
    <nav className="sidebar">
      <div className="wordmark">Hops</div>
      <UserSwitcher me={me} users={users} />
      <SearchBox />

      <button
        className={`nav-item activity-link ${view?.kind === 'activity' ? 'active' : ''}`}
        onClick={() => setView({ kind: 'activity' })}
      >
        <Icon name="inbox" />
        <span className="nav-label">Activity</span>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>

      <h2>Channels</h2>
      {publicChannels.map((c) => (
        <button key={c.id} className={`nav-item ${isActive(c.id) ? 'active' : ''}`} onClick={() => setView({ kind: 'channel', channelId: c.id })}>
          <span className="nav-icon">
            <Icon name="hash" size={14} />
          </span>
          <span className="nav-label">{c.name}</span>
        </button>
      ))}

      <h2>Direct messages</h2>
      {dms.map((c) => (
        <button key={c.id} className={`nav-item ${isActive(c.id) ? 'active' : ''}`} onClick={() => setView({ kind: 'channel', channelId: c.id })}>
          <Avatar user={usersById[c.memberIds.find((id) => id !== me.id) ?? '']} size={18} />
          <span className="nav-label">{c.name}</span>
        </button>
      ))}

      <ThemeSwitcher />
    </nav>
  );
}
