const SUPER_ADMIN_CODE = 'strapi-super-admin';
const STYLE_ID = 'sensus-hide-settings';
const HIDE_CSS = 'a[href="/admin/settings"] { display: none; }';
const REAUTH_URL = '/oauth2/start?rd=%2Fadmin';

const isProxyChallenge = (res: Response) =>
  res.status === 401 &&
  res.url.startsWith(`${window.location.origin}/`) &&
  (res.headers.get('content-type') ?? '').includes('text/html');

let reauthenticating = false;

const reauthenticate = () => {
  if (reauthenticating) return;
  reauthenticating = true;
  window.location.assign(REAUTH_URL);
};

const readToken = (): string | null => {
  const raw = window.localStorage.getItem('jwtToken');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  const fromCookie = document.cookie
    .split(';')
    .map((entry) => entry.split('=').map((part) => part.trim()))
    .find(([key]) => key === 'jwtToken')?.[1];
  return fromCookie ?? null;
};

const setHidden = (hidden: boolean) => {
  const existing = document.getElementById(STYLE_ID);
  if (!hidden) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = HIDE_CSS;
  document.head.appendChild(style);
};

let lastToken: string | null = null;

const safeSync = () => {
  sync().catch(() => setHidden(false));
};

const sync = async () => {
  if (window.location.pathname.includes('/auth/')) {
    lastToken = null;
    setHidden(false);
    return;
  }

  const token = readToken();
  if (token === lastToken) return;
  lastToken = token;

  if (!token) {
    setHidden(false);
    return;
  }

  try {
    const res = await fetch('/admin/users/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setHidden(false);
      return;
    }
    const { data } = await res.json();
    const roles = data?.roles;
    const known = Array.isArray(roles) && roles.length > 0;
    const isSuperAdmin = known && roles.some((role: { code?: string }) => role?.code === SUPER_ADMIN_CODE);
    setHidden(known && !isSuperAdmin);
  } catch {
    setHidden(false);
  }
};

export default {
  bootstrap() {
    const originalFetch = window.fetch;
    window.fetch = async function patched(...args: Parameters<typeof fetch>) {
      const res = await originalFetch.apply(this, args);
      if (isProxyChallenge(res)) reauthenticate();
      return res;
    };

    safeSync();

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = window.history[method];
      window.history[method] = function patched(this: History, ...args: Parameters<typeof original>) {
        const result = original.apply(this, args);
        safeSync();
        return result;
      };
    }

    window.addEventListener('popstate', safeSync);
    window.addEventListener('storage', safeSync);
  },
};
