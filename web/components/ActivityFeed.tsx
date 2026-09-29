import { useEffect, useState } from 'react';
import { loadActivity, markAllActivityRead } from '../actions';
import { useStore } from '../store';
import { ActivityItem } from './ActivityItem';

type Filter = 'all' | 'unread';

export function ActivityFeed() {
  const items = useStore((s) => s.activity);
  const unreadCount = useStore((s) => s.unreadCount);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadActivity().catch((err) => setError(String(err.message ?? err)));
  }, []);

  const visible = filter === 'unread' ? items?.filter((i) => !i.readAt) : items;

  return (
    <>
      <header className="main-header activity-header">
        <h1>Activity</h1>
        <div className="tabs" role="tablist">
          {(['all', 'unread'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : `Unread${unreadCount ? ` (${unreadCount})` : ''}`}
            </button>
          ))}
        </div>
        <button className="link-button" onClick={markAllActivityRead} disabled={unreadCount === 0}>
          Mark all as read
        </button>
      </header>

      <div className="activity-list">
        {error && <div className="empty notice">Couldn't load activity: {error}</div>}
        {!items && !error && <div className="empty muted">Loading…</div>}
        {visible?.length === 0 && (
          <div className="empty muted">
            {filter === 'unread' ? "You're all caught up." : 'Mentions, replies, reactions and DMs will show up here.'}
          </div>
        )}
        {visible?.map((item) => <ActivityItem key={item.id} item={item} />)}
      </div>
    </>
  );
}
