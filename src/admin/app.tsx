const SUPER_ADMIN_CODE = 'strapi-super-admin';
const HOME_PATHS = ['/admin', '/admin/', '/admin/content-manager', '/admin/content-manager/'];
const DEFAULT_PATH = '/admin/content-manager/collection-types/api::page.page';
const STYLE_ID = 'sensus-hide-settings';
const HIDE_CSS = 'a[href="/admin/settings"] { display: none; }';
const SSO_LINK_ID = 'sensus-sso-link';
const SSO_PATH = '/admin-sso';
const LOGIN_PATH = '/admin/auth/login';
const FORGOT_SELECTOR = 'a[href="/admin/auth/forgot-password"]';

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

const addSsoLink = () => {
  if (window.location.pathname !== LOGIN_PATH) {
    document.getElementById(SSO_LINK_ID)?.remove();
    return;
  }
  if (document.getElementById(SSO_LINK_ID)) return;

  const forgot = document.querySelector<HTMLAnchorElement>(FORGOT_SELECTOR);
  const anchor = forgot?.parentElement?.parentElement;
  if (!forgot || !anchor) return;

  const link = document.createElement('a');
  link.id = SSO_LINK_ID;
  link.href = SSO_PATH;
  link.className = forgot.className;

  const label = document.createElement('span');
  label.className = forgot.firstElementChild?.className ?? '';
  label.textContent = 'Sign in with SensUs Identity';
  link.appendChild(label);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:center;padding-top:8px';
  row.appendChild(link);
  anchor.insertAdjacentElement('afterend', row);
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
    addSsoLink();

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = window.history[method];
      window.history[method] = function patched(this: History, ...args: Parameters<typeof original>) {
        const result = original.apply(this, args);
        safeSync();
        redirectHome();
        addSsoLink();
        return result;
      };
    }

    new MutationObserver(addSsoLink).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', safeSync);
    window.addEventListener('popstate', addSsoLink);
    window.addEventListener('storage', safeSync);
  },
};
