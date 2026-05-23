const BASE = '';  // Proxied by Vite in dev, same origin in prod

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login:         (username, password) => req('POST', '/api/auth/login',  { username, password }),
  logout:        ()                   => req('POST', '/api/auth/logout'),
  me:            ()                   => req('GET',  '/api/auth/me'),
  today:         ()                   => req('GET',  '/api/calls/today'),
  range:         (from, to)           => req('GET',  `/api/calls/range?from=${from}&to=${to}`),
  adminUsers:    ()                   => req('GET',  '/api/admin/users'),
  adminChannels: ()                   => req('GET',  '/api/admin/channels'),
  updateChannelAlias: (channel, alias) =>
    req('PUT', `/api/admin/channels/${encodeURIComponent(channel)}`, { alias }),
};
