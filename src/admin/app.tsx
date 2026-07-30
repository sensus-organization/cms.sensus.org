const SUPER_ADMIN_CODE = 'strapi-super-admin';
const HOME_PATHS = ['/admin', '/admin/'];
const DEFAULT_PATH = '/admin/content-manager';
const STYLE_ID = 'sensus-hide-settings';
const HIDE_CSS = 'a[href="/admin/settings"] { display: none; }';

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

const redirectHome = () => {
  if (!HOME_PATHS.includes(window.location.pathname)) return;
  const state = window.history.state;
  window.history.replaceState(state, '', `${DEFAULT_PATH}${window.location.search}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state }));
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
    safeSync();
    redirectHome();

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = window.history[method];
      window.history[method] = function patched(this: History, ...args: Parameters<typeof original>) {
        const result = original.apply(this, args);
        safeSync();
        redirectHome();
        return result;
      };
    }

    window.addEventListener('popstate', safeSync);
    window.addEventListener('storage', safeSync);
  },
};
