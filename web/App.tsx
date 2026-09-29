import { useEffect, useState } from 'react';
import { api, currentHandle } from './api';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { UserPicker } from './components/UserSwitcher';
import type { UserDto } from '../shared/types';

export function App() {
  const me = useStore((s) => s.me);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const allUsers = await api.users();
        setUsers(allUsers);
        if (!currentHandle) return;
        const [meUser, channels] = await Promise.all([api.me(), api.channels()]);
        useStore.getState().setSession(meUser, allUsers, channels);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  if (!currentHandle || (error && users.length)) {
    return <UserPicker users={users} notice={currentHandle ? `No user "${currentHandle}"` : null} />;
  }
  if (error) return <div className="centered">Couldn't reach the server: {error}</div>;
  if (!me) return <div className="centered muted">Loading…</div>;

  return (
    <div className="layout">
      <Sidebar users={users} />
      <Main />
    </div>
  );
}

function Main() {
  const view = useStore((s) => s.view);
  const channels = useStore((s) => s.channels);
  const channel = view?.kind === 'channel' ? channels.find((c) => c.id === view.channelId) : undefined;

  if (view?.kind === 'activity') {
    return (
      <main className="main">
        <header className="main-header">
          <h1>Activity</h1>
        </header>
        <div className="empty muted">Nothing here yet.</div>
      </main>
    );
  }

  return (
    <main className="main">
      <header className="main-header">
        <h1>{channel ? (channel.kind === 'dm' ? channel.name : `# ${channel.name}`) : ''}</h1>
        {channel?.topic && <span className="muted topic">{channel.topic}</span>}
      </header>
      <div className="empty muted">No messages yet.</div>
    </main>
  );
}
