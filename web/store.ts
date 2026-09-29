import { create } from 'zustand';
import type { ChannelDto, UserDto } from '../shared/types';

export type View = { kind: 'activity' } | { kind: 'channel'; channelId: string };

type State = {
  me: UserDto | null;
  usersById: Record<string, UserDto>;
  channels: ChannelDto[];
  view: View | null;
  threadRootId: string | null;

  setSession: (me: UserDto, users: UserDto[], channels: ChannelDto[]) => void;
  setView: (view: View) => void;
  openThread: (rootId: string | null) => void;
};

export const useStore = create<State>((set) => ({
  me: null,
  usersById: {},
  channels: [],
  view: null,
  threadRootId: null,

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
}));
