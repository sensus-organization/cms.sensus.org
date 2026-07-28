import type { Core } from '@strapi/strapi';

const COLLECTION_ACTIONS = ['find', 'findOne'];
const SINGLE_ACTIONS = ['find'];

const PUBLIC_PERMISSIONS: Record<string, string[]> = {
  'api::page.page': COLLECTION_ACTIONS,
  'api::person.person': COLLECTION_ACTIONS,
  'api::team.team': COLLECTION_ACTIONS,
  'api::edition.edition': COLLECTION_ACTIONS,
  'api::partner.partner': COLLECTION_ACTIONS,
  'api::timeline-event.timeline-event': COLLECTION_ACTIONS,
  'api::news-article.news-article': COLLECTION_ACTIONS,
  'api::global.global': SINGLE_ACTIONS,
  'api::home.home': SINGLE_ACTIONS,
  'api::contact.contact': SINGLE_ACTIONS,
};

const REVOKED_PUBLIC_PREFIXES = [
  'plugin::users-permissions.auth.',
  'plugin::users-permissions.user.',
  'plugin::users-permissions.role.',
  'plugin::upload.',
];

async function grantPublicPermissions(strapi: Core.Strapi) {
  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });
  if (!role) return;
  const intended = new Set<string>();
  let granted = 0;
  for (const [uid, actions] of Object.entries(PUBLIC_PERMISSIONS)) {
    for (const act of actions) {
      const action = `${uid}.${act}`;
      intended.add(action);
      const existing = await strapi.db
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action, role: role.id } });
      if (!existing) {
        await strapi.db
          .query('plugin::users-permissions.permission')
          .create({ data: { action, role: role.id } });
        granted += 1;
      }
    }
  }
  if (granted > 0) strapi.log.info(`[security] granted ${granted} public permission(s)`);

  const permissions = await strapi.db
    .query('plugin::users-permissions.permission')
    .findMany({ where: { role: role.id } });
  const stray = permissions.filter(
    (permission: { action: string }) =>
      permission.action.startsWith('api::') && !intended.has(permission.action)
  );
  if (stray.length > 0) {
    await strapi.db.query('plugin::users-permissions.permission').deleteMany({
      where: { id: { $in: stray.map((permission: { id: number }) => permission.id) } },
    });
    strapi.log.info(
      `[security] revoked ${stray.length} unintended public api permission(s): ${stray
        .map((permission: { action: string }) => permission.action)
        .join(', ')}`
    );
  }
}

async function lockDownUsersPermissions(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'advanced' });
  const advanced = (await store.get({})) as Record<string, unknown> | null;
  if (advanced && advanced.allow_register !== false) {
    await store.set({ value: { ...advanced, allow_register: false } });
    strapi.log.info('[security] users-permissions: allow_register disabled');
  }

  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });
  if (!role) {
    strapi.log.info('[security] lockdown: no public role yet, nothing to revoke');
    return;
  }

  const permissions = await strapi.db
    .query('plugin::users-permissions.permission')
    .findMany({ where: { role: role.id } });
  const revoked = permissions.filter((permission: { action: string }) =>
    REVOKED_PUBLIC_PREFIXES.some((prefix) => permission.action.startsWith(prefix))
  );
  if (revoked.length > 0) {
    await strapi.db.query('plugin::users-permissions.permission').deleteMany({
      where: { id: { $in: revoked.map((permission: { id: number }) => permission.id) } },
    });
  }
  strapi.log.info(
    `[security] lockdown enforced: allow_register false, ${revoked.length} public plugin permission(s) revoked${
      revoked.length > 0
        ? `: ${revoked.map((permission: { action: string }) => permission.action).join(', ')}`
        : ''
    }`
  );
}

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    if (process.env.NODE_ENV !== 'production') return;
    const placeholder = /^to\s*be\s*modified/i;
    const weak = ['APP_KEYS', 'API_TOKEN_SALT', 'ADMIN_JWT_SECRET', 'TRANSFER_TOKEN_SALT', 'JWT_SECRET', 'ENCRYPTION_KEY'].filter(
      (name) => (process.env[name] || '').split(',').some((part) => placeholder.test(part.trim()))
    );
    if (weak.length) {
      strapi.log.error(`[security] refusing to start: ${weak.join(', ')} still hold .env.example placeholder values`);
      throw new Error(`Placeholder secrets in production: ${weak.join(', ')}`);
    }
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    if (process.env.ENFORCE_PERMISSIONS === 'true') {
      strapi.log.info('[security] asserting public API permissions (ENFORCE_PERMISSIONS=true)');
      await grantPublicPermissions(strapi);
    } else {
      strapi.log.info(
        '[security] public API permissions left untouched — set ENFORCE_PERMISSIONS=true to re-assert them'
      );
    }

    await lockDownUsersPermissions(strapi);
  },
};
