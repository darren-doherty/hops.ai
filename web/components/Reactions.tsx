import { toggleReaction } from '../actions';
import { useStore } from '../store';
import type { ReactionSummary } from '../../shared/types';

/** One chip per emoji; yours are highlighted and clicking toggles your reaction. */
export function Reactions({ messageId, reactions }: { messageId: string; reactions: ReactionSummary[] }) {
  const me = useStore((s) => s.me)!;
  const usersById = useStore((s) => s.usersById);
  if (!reactions.length) return null;

  return (
    <div className="reactions">
      {reactions.map((r) => {
        const mine = r.userIds.includes(me.id);
        const names = r.userIds.map((id) => (id === me.id ? 'You' : usersById[id]?.name.split(' ')[0] ?? 'Someone'));
        return (
          <button
            key={r.emoji}
            className={`reaction-chip ${mine ? 'mine' : ''}`}
            onClick={() => toggleReaction(messageId, r.emoji)}
            title={`${names.join(', ')} reacted with ${r.emoji}`}
            aria-pressed={mine}
          >
            <span>{r.emoji}</span>
            <span className="reaction-count">{r.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}
