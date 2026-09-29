import { openActivityItem } from '../actions';
import { formatFull, relativeTime } from '../format';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { MessageBody } from './MessageBody';
import type { ActivityItemDto, ActivityReason } from '../../shared/types';

// GitHub-style reason labels: every item says why you're seeing it.
const REASON_LABEL: Record<ActivityReason, string> = {
  mention: 'Mention',
  dm: 'DM',
  participating: 'Thread',
  reaction: 'Reaction',
};

/** "Alice", "Alice and Bob", "Alice, Bob and Carol", "Alice, Bob and 3 others" */
function actorPhrase(names: string[], total: number): string {
  if (total <= 1 || names.length === 1) return names[0];
  if (total === 2) return `${names[0]} and ${names[1]}`;
  if (total === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${total - 2} others`;
}

export function ActivityItem({ item }: { item: ActivityItemDto }) {
  const usersById = useStore((s) => s.usersById);
  const me = useStore((s) => s.me)!;
  const channel = useStore((s) => s.channels.find((c) => c.id === item.channelId));

  const actors = item.actorIds.map((id) => usersById[id]).filter(Boolean);
  const firstNames = actors.map((u) => u.name.split(' ')[0]);
  const who = actorPhrase(firstNames, item.reason === 'reaction' ? item.count : actors.length);

  let action: string;
  switch (item.reason) {
    case 'mention':
      action = 'mentioned you';
      break;
    case 'participating':
      action = item.root?.authorId === me.id ? 'replied to your thread' : "replied in a thread you're in";
      break;
    case 'reaction':
      action = `reacted ${item.emojis.join(' ')} to your message`;
      break;
    case 'dm':
      action = item.count === 1 ? 'sent you a message' : `sent you ${item.count} messages`;
      break;
  }

  const unread = !item.readAt;
  const where = channel ? (channel.kind === 'dm' ? 'Direct message' : `#${channel.name}`) : '';

  return (
    <button className={`activity-item ${unread ? 'unread' : ''}`} onClick={() => openActivityItem(item)}>
      <span className="unread-dot" aria-label={unread ? 'Unread' : undefined} />
      <Avatar user={actors[0]} size={36} />
      <div className="activity-content">
        <div className="activity-headline">
          <span>
            <strong>{who}</strong> {action}
          </span>
          <span className={`reason-chip reason-${item.reason}`}>{REASON_LABEL[item.reason]}</span>
        </div>

        {item.root && (
          <div className="activity-root muted">
            in thread:{' '}
            {item.root.deleted ? <em>This message was deleted.</em> : <span className="clamp-1">{item.root.body}</span>}
          </div>
        )}

        <div className="activity-preview clamp-2">
          <MessageBody text={item.preview} />
          {item.editedAt && <span className="edited muted"> (edited)</span>}
        </div>

        <div className="activity-meta muted">
          {where} · <span title={formatFull(item.latestAt)}>{relativeTime(item.latestAt)}</span>
        </div>
      </div>
    </button>
  );
}
