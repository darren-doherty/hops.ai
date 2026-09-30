import { useEffect } from 'react';
import { openNotification } from '../actions';
import { useStore } from '../store';
import { Icon } from './Icon';
import type { NotificationDto } from '../../shared/types';

const AUTO_DISMISS_MS = 8000;

/**
 * Push notifications delivered by the (fake) notification provider: the
 * in-app stand-in for a phone buzzing. Only alerts arrive here (mentions and
 * DMs, after the grace period); everything else lives quietly in Activity.
 */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} notification={t} />
      ))}
    </div>
  );
}

function Toast({ notification }: { notification: NotificationDto }) {
  const dismiss = useStore((s) => s.dismissToast);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(notification.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification.id, dismiss]);

  return (
    <div className="toast" role="status">
      <button className="toast-body" onClick={() => openNotification(notification)}>
        <span className="toast-title">
          <Icon name="bell" size={14} /> {notification.title}
        </span>
        <span className="toast-text clamp-2">{notification.body}</span>
      </button>
      <button className="toast-close" onClick={() => dismiss(notification.id)} aria-label="Dismiss notification">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
