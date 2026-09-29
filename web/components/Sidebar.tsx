import { useStore } from '../store';
import { UserSwitcher } from './UserSwitcher';
import { SearchBox } from './SearchBox';
import type { UserDto } from '../../shared/types';

export function Sidebar({ users }: { users: UserDto[] }) {
  const me = useStore((s) => s.me)!;
  const channels = useStore((s) => s.channels);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const isActive = (channelId: string) => view?.kind === 'channel' && view.channelId === channelId;
  const publicChannels = channels.filter((c) => c.kind === 'public');
  const dms = channels.filter((c) => c.kind === 'dm');

  return (
    <nav className="sidebar">
      <UserSwitcher me={me} users={users} />
      <SearchBox />

      <button
        className={`nav-item activity-link ${view?.kind === 'activity' ? 'active' : ''}`}
        onClick={() => setView({ kind: 'activity' })}
      >
        <span>Activity</span>
      </button>

      <h2>Channels</h2>
      {publicChannels.map((c) => (
        <button key={c.id} className={`nav-item ${isActive(c.id) ? 'active' : ''}`} onClick={() => setView({ kind: 'channel', channelId: c.id })}>
          <span className="hash">#</span> {c.name}
        </button>
      ))}

      <h2>Direct messages</h2>
      {dms.map((c) => (
        <button key={c.id} className={`nav-item ${isActive(c.id) ? 'active' : ''}`} onClick={() => setView({ kind: 'channel', channelId: c.id })}>
          {c.name}
        </button>
      ))}
    </nav>
  );
}
