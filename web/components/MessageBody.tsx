import { useStore } from '../store';

const MENTION_SPLIT = /(@[a-z0-9_.-]+)/gi;

/** Message text with @mentions of real users highlighted (and your own made stronger, like Slack). */
export function MessageBody({ text, highlight }: { text: string; highlight?: string }) {
  const usersById = useStore((s) => s.usersById);
  const me = useStore((s) => s.me);
  const handles = new Set(Object.values(usersById).map((u) => u.handle));

  return (
    <>
      {text.split(MENTION_SPLIT).map((part, i) => {
        if (i % 2 === 1) {
          const handle = part.slice(1).toLowerCase();
          if (handles.has(handle)) {
            return (
              <span key={i} className={`mention ${handle === me?.handle ? 'mention-me' : ''}`}>
                {part}
              </span>
            );
          }
        }
        return <Highlighted key={i} text={part} term={highlight} />;
      })}
    </>
  );
}

function Highlighted({ text, term }: { text: string; term?: string }) {
  if (!term) return <>{text}</>;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    <>
      {text.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : part,
      )}
    </>
  );
}
