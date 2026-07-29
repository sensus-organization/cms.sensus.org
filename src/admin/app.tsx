const SUPER_ADMIN_CODE = 'strapi-super-admin';

export default {
  async bootstrap() {
    try {
      const raw = window.localStorage.getItem('jwtToken');
      const token = raw
        ? JSON.parse(raw)
        : document.cookie
            .split(';')
            .map((entry) => entry.split('=').map((part) => part.trim()))
            .find(([key]) => key === 'jwtToken')?.[1];
      if (!token) return;

      const res = await fetch('/admin/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const { data } = await res.json();
      const roles = data?.roles;
      if (!Array.isArray(roles) || roles.length === 0) return;
      if (roles.some((role: { code?: string }) => role?.code === SUPER_ADMIN_CODE)) return;

      const style = document.createElement('style');
      style.textContent = 'a[href="/admin/settings"] { display: none; }';
      document.head.appendChild(style);
    } catch {
      return;
    }
  },
};
