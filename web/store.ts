import { create } from 'zustand';
import type { ActivityFeedDto, ActivityItemDto, ChannelDto, MessageDto, UserDto } from '../shared/types';

export type View =
  | { kind: 'activity' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'search'; q: string };

export type SendState = 'pending' | 'failed';
export type Connection = 'connecting' | 'open' | 'reconnecting';

type State = {
  me: UserDto | null;
  usersById: Record<string, UserDto>;
  channels: ChannelDto[];
  view: View | null;
  threadRootId: string | null;
  highlightMessageId: string | null;
  connection: Connection;

  // Normalised messages (§5.3): one map, plus ordered id lists per channel / thread.
  // An undefined list means "not loaded yet".
  messagesById: Record<string, MessageDto>;
  channelOrder: Record<string, string[] | undefined>;
  threadOrder: Record<string, string[] | undefined>;
  /** Optimistic sends that the server hasn't confirmed yet. */
  sendState: Record<string, SendState>;

  activity: ActivityItemDto[] | null;
  unreadCount: number;

  setSession: (me: UserDto, users: UserDto[], channels: ChannelDto[]) => void;
  setView: (view: View) => void;
  openThread: (rootId: string | null) => void;
  setHighlight: (id: string | null) => void;
  setConnection: (connection: Connection) => void;

  upsertMessage: (dto: MessageDto) => void;
  setChannelMessages: (channelId: string, dtos: MessageDto[]) => void;
  addPending: (dto: MessageDto) => void;
  setSendState: (id: string, state: SendState) => void;
  discard: (id: string) => void;

  setThread: (root: MessageDto, replies: MessageDto[]) => void;
  setActivity: (feed: ActivityFeedDto) => void;
  setUnreadCount: (n: number) => void;
  markActivityRead: (id: string) => void;
  markAllActivityRead: () => void;
};

const byTime = (all: Record<string, MessageDto>) => (a: string, b: string) => {
  const ma = all[a], mb = all[b];
  return ma.createdAt < mb.createdAt ? -1 : ma.createdAt > mb.createdAt ? 1 : a < b ? -1 : 1;
};

/** Adds or re-positions an id in a time-ordered list, never duplicating it. */
function placeInOrder(list: string[], id: string, all: Record<string, MessageDto>): string[] {
  return [...list.filter((x) => x !== id), id].sort(byTime(all));
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = record;
  return rest;
}

export const useStore = create<State>((set) => ({
  me: null,
  usersById: {},
  channels: [],
  view: null,
  threadRootId: null,
  highlightMessageId: null,
  connection: 'connecting',
  messagesById: {},
  channelOrder: {},
  threadOrder: {},
  sendState: {},
  activity: null,
  unreadCount: 0,

  setSession: (me, users, channels) =>
    set({
      me,
      usersById: Object.fromEntries(users.map((u) => [u.id, u])),
      channels,
      view: channels.length
        ? { kind: 'channel', channelId: (channels.find((c) => c.name === 'general') ?? channels[0]).id }
        : { kind: 'activity' },
    }),
  setView: (view) => set({ view, threadRootId: null }),
  openThread: (threadRootId) => set({ threadRootId }),
  setHighlight: (highlightMessageId) => set({ highlightMessageId }),
  setConnection: (connection) => set({ connection }),

  /**
   * The one way server state enters the store (HTTP responses and realtime
   * events alike). Stale versions are ignored, so events arriving late or
   * twice are harmless (§5.1).
   */
  upsertMessage: (dto) =>
    set((s) => {
      const local = s.messagesById[dto.id];
      if (local && dto.version < local.version) return {};
      const messagesById = { ...s.messagesById, [dto.id]: dto };
      const patch: Partial<State> = { messagesById };
      // A server-confirmed copy (version >= 1) settles an optimistic send, whether
      // it arrived as the HTTP response or as the realtime echo.
      if (dto.version >= 1 && s.sendState[dto.id]) patch.sendState = omit(s.sendState, dto.id);
      if (dto.parentId) {
        const list = s.threadOrder[dto.parentId];
        if (list) patch.threadOrder = { ...s.threadOrder, [dto.parentId]: placeInOrder(list, dto.id, messagesById) };
      } else {
        const list = s.channelOrder[dto.channelId];
        if (list) patch.channelOrder = { ...s.channelOrder, [dto.channelId]: placeInOrder(list, dto.id, messagesById) };
      }
      return patch;
    }),

  setChannelMessages: (channelId, dtos) =>
    set((s) => {
      const messagesById = { ...s.messagesById };
      for (const dto of dtos) {
        const local = messagesById[dto.id];
        if (!local || dto.version >= local.version) messagesById[dto.id] = dto;
      }
      // Keep unconfirmed optimistic messages visible across refetches.
      const pendingHere = Object.keys(s.sendState).filter(
        (id) => messagesById[id]?.channelId === channelId && !messagesById[id]?.parentId,
      );
      const ids = [...new Set([...dtos.map((d) => d.id), ...pendingHere])].sort(byTime(messagesById));
      return { messagesById, channelOrder: { ...s.channelOrder, [channelId]: ids } };
    }),

  addPending: (dto) =>
    set((s) => {
      const messagesById = { ...s.messagesById, [dto.id]: dto };
      const patch: Partial<State> = { messagesById, sendState: { ...s.sendState, [dto.id]: 'pending' } };
      if (dto.parentId) {
        patch.threadOrder = { ...s.threadOrder, [dto.parentId]: placeInOrder(s.threadOrder[dto.parentId] ?? [], dto.id, messagesById) };
      } else {
        patch.channelOrder = { ...s.channelOrder, [dto.channelId]: placeInOrder(s.channelOrder[dto.channelId] ?? [], dto.id, messagesById) };
      }
      return patch;
    }),

  setSendState: (id, state) => set((s) => ({ sendState: { ...s.sendState, [id]: state } })),

  setThread: (root, replies) =>
    set((s) => {
      const messagesById = { ...s.messagesById };
      for (const dto of [root, ...replies]) {
        const local = messagesById[dto.id];
        if (!local || dto.version >= local.version) messagesById[dto.id] = dto;
      }
      const pendingHere = Object.keys(s.sendState).filter((id) => messagesById[id]?.parentId === root.id);
      const ids = [...new Set([...replies.map((r) => r.id), ...pendingHere])].sort(byTime(messagesById));
      return { messagesById, threadOrder: { ...s.threadOrder, [root.id]: ids } };
    }),

  setActivity: (feed) => set({ activity: feed.items, unreadCount: feed.unreadCount }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),

  // Optimistic: the server confirms via activity.changed.
  markActivityRead: (id) =>
    set((s) => {
      const item = s.activity?.find((a) => a.id === id);
      if (!item || item.readAt) return {};
      return {
        activity: s.activity!.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)),
        unreadCount: Math.max(0, s.unreadCount - 1),
      };
    }),
  markAllActivityRead: () =>
    set((s) => ({
      activity: s.activity?.map((a) => (a.readAt ? a : { ...a, readAt: new Date().toISOString() })) ?? null,
      unreadCount: 0,
    })),

  discard: (id) =>
    set((s) => {
      const message = s.messagesById[id];
      if (!message) return {};
      const patch: Partial<State> = { messagesById: omit(s.messagesById, id), sendState: omit(s.sendState, id) };
      if (message.parentId) {
        patch.threadOrder = { ...s.threadOrder, [message.parentId]: s.threadOrder[message.parentId]?.filter((x) => x !== id) };
      } else {
        patch.channelOrder = { ...s.channelOrder, [message.channelId]: s.channelOrder[message.channelId]?.filter((x) => x !== id) };
      }
      return patch;
    }),
}));
