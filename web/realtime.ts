// WebSocket client. Best-effort (§5.1): every (re)connect refetches the current
// view, which covers anything missed while disconnected, including the gap
// between the initial HTTP load and the socket subscribing.
import { loadActivity, refreshCurrentView } from './actions';
import { useStore } from './store';
import type { ServerEvent } from '../shared/types';

let started = false;

export function connectRealtime(handle: string) {
  if (started) return; // StrictMode runs effects twice in dev
  started = true;
  let attempt = 0;

  const open = () => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/realtime?as=${encodeURIComponent(handle)}`);

    ws.onopen = () => {
      attempt = 0;
      useStore.getState().setConnection('open');
      void refreshCurrentView();
    };
    ws.onmessage = (e) => handleEvent(JSON.parse(e.data) as ServerEvent);
    ws.onclose = () => {
      useStore.getState().setConnection('reconnecting');
      const delay = Math.min(1000 * 2 ** attempt++, 10_000);
      setTimeout(open, delay);
    };
  };
  open();
}

function handleEvent(event: ServerEvent) {
  const s = useStore.getState();
  switch (event.type) {
    case 'message.upserted':
      s.upsertMessage(event.message);
      break;
    case 'activity.changed':
      s.setUnreadCount(event.unreadCount);
      // The event only carries the count; fetch the items if the feed is on screen.
      if (s.view?.kind === 'activity') void loadActivity();
      break;
    case 'reactions.updated':
      s.setReactions(event.messageId, event.reactions);
      break;
    case 'notification.received':
      s.pushToast(event.notification);
      break;
  }
}
