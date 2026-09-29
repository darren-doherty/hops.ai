import type { ChannelDto, MessageDto, SearchHit, UserDto } from '../shared/types';

/** Current identity comes from ?as=<handle> (real auth is cut, §8). */
export const currentHandle = new URLSearchParams(location.search).get('as');

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(currentHandle ? { 'x-user': currentHandle } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? res.statusText, data);
  return data as T;
}

export const api = {
  users: () => request<UserDto[]>('GET', '/users'),
  me: () => request<UserDto>('GET', '/me'),
  channels: () => request<ChannelDto[]>('GET', '/channels'),
  messages: (channelId: string) => request<MessageDto[]>('GET', `/channels/${channelId}/messages`),
  postMessage: (channelId: string, body: { id: string; body: string; parentId: string | null }) =>
    request<MessageDto>('POST', `/channels/${channelId}/messages`, body),
  search: (q: string) => request<SearchHit[]>('GET', `/search?q=${encodeURIComponent(q)}`),
};
