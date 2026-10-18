import type { Core } from '@strapi/strapi';
import { applyContentModelStash } from './migrations/simplify-content-model';
import { teamLabel } from './api/team/team-label';

const COLLECTION_ACTIONS = ['find', 'findOne'];
const SINGLE_ACTIONS = ['find'];

const PUBLIC_PERMISSIONS: Record<string, string[]> = {
  'api::page.page': COLLECTION_ACTIONS,
  'api::team.team': COLLECTION_ACTIONS,
  'api::edition.edition': COLLECTION_ACTIONS,
  'api::organization.organization': COLLECTION_ACTIONS,
  'api::partner.partner': COLLECTION_ACTIONS,
  'api::news-article.news-article': COLLECTION_ACTIONS,
  'api::global.global': SINGLE_ACTIONS,
  'api::home.home': SINGLE_ACTIONS,
  'api::contact.contact': SINGLE_ACTIONS,
};

const LIST_PAGE_SIZE = 100;
const STRAPI_DEFAULT_PAGE_SIZE = 10;

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

async function setListPageSize(strapi: Core.Strapi) {
  const service = strapi.plugin('content-manager').service('content-types') as any;
  let updated = 0;
  for (const contentType of service.findDisplayedContentTypes()) {
    if (contentType.kind !== 'collectionType') continue;
    const configuration = await service.findConfiguration(contentType);
    if (configuration.settings?.pageSize !== STRAPI_DEFAULT_PAGE_SIZE) continue;
    await service.updateConfiguration(contentType, {
      ...configuration,
      settings: { ...configuration.settings, pageSize: LIST_PAGE_SIZE },
    });
    updated += 1;
  }
  if (updated > 0) strapi.log.info(`[admin] list view page size set to ${LIST_PAGE_SIZE} for ${updated} content type(s)`);
}

// Anything with a year (or else a date) lists newest first. Types without a better title (Organization)
// show the year.
async function sortNewestFirst(strapi: Core.Strapi) {
  const service = strapi.plugin('content-manager').service('content-types') as any;
  let updated = 0;
  for (const contentType of service.findDisplayedContentTypes()) {
    const sortBy = ['year', 'date'].find((attribute) => contentType.attributes[attribute]);
    if (contentType.kind !== 'collectionType' || !sortBy) continue;
    const configuration = await service.findConfiguration(contentType);
    const { defaultSortBy, defaultSortOrder, mainField } = configuration.settings ?? {};
    if (defaultSortBy === sortBy && defaultSortOrder === 'DESC' && mainField !== 'documentId') continue;
    await service.updateConfiguration(contentType, {
      ...configuration,
      settings: {
        ...configuration.settings,
        defaultSortBy: sortBy,
        defaultSortOrder: 'DESC',
        mainField: mainField === 'documentId' ? sortBy : mainField,
      },
    });
    updated += 1;
  }
  if (updated > 0) strapi.log.info(`[admin] list view sorted newest first for ${updated} content type(s)`);
}

// Fills Team.label for teams that don't have the current one yet (raw update, so updatedAt is kept).
async function syncTeamLabels(strapi: Core.Strapi) {
  const teams = await strapi.db.connection('teams').select('id', 'name', 'year', 'label');
  const outdated = teams.filter((team: any) => team.label !== teamLabel(team.name, team.year));
  for (const team of outdated) {
    await strapi.db.connection('teams').where({ id: team.id }).update({ label: teamLabel(team.name, team.year) });
  }
  if (outdated.length > 0) strapi.log.info(`[admin] team labels filled for ${outdated.length} team(s)`);
}

type Configuration = { settings: Record<string, any>; metadatas: Record<string, any>; layouts: Record<string, any> };

// Admin labels: Team.label is computed, so it stays out of the edit form, and the team list shows the
// year in place of the abbreviation; award results show their category and pick teams by label
// ("DeTectUs (2026)"); widgets show their type.
const ADMIN_LABELS: { uid: string; component?: boolean; apply: (configuration: Configuration) => void }[] = [
  {
    uid: 'api::team.team',
    apply: ({ metadatas, layouts }) => {
      metadatas.label.edit = { ...metadatas.label.edit, visible: false, editable: false };
      if (!layouts.list.includes('year')) {
        const abbr = layouts.list.indexOf('abbr');
        if (abbr === -1) layouts.list.push('year');
        else layouts.list[abbr] = 'year';
      }
    },
  },
  {
    uid: 'archive.award-result',
    component: true,
    apply: ({ settings, metadatas }) => {
      settings.mainField = 'category';
      for (const place of ['first', 'second', 'third']) {
        metadatas[place].edit = { ...metadatas[place].edit, mainField: 'label' };
      }
    },
  },
  {
    uid: 'blocks.widget',
    component: true,
    apply: ({ settings }) => {
      settings.mainField = 'type';
    },
  },
];

// The team picker falls back to document ids for roles that can't read Team.label, so every role that
// reads specific team fields also reads the label (roles created later included).
async function grantTeamLabelRead(strapi: Core.Strapi) {
  const permissions = await strapi.db.query('admin::permission').findMany({
    where: { subject: 'api::team.team', action: 'plugin::content-manager.explorer.read' },
  });
  const missing = permissions.filter(
    (permission: any) => Array.isArray(permission.properties?.fields) && !permission.properties.fields.includes('label')
  );
  for (const permission of missing) {
    await strapi.db.query('admin::permission').update({
      where: { id: permission.id },
      data: { properties: { ...permission.properties, fields: [...permission.properties.fields, 'label'] } },
    });
  }
  if (missing.length > 0) strapi.log.info(`[admin] team label made readable for ${missing.length} role permission(s)`);
}

async function configureAdminLabels(strapi: Core.Strapi) {
  const contentTypes = strapi.plugin('content-manager').service('content-types') as any;
  const components = strapi.plugin('content-manager').service('components') as any;
  let updated = 0;
  for (const { uid, component, apply } of ADMIN_LABELS) {
    const service = component ? components : contentTypes;
    const model = component ? components.findComponent(uid) : contentTypes.findContentType(uid);
    const configuration = await service.findConfiguration(model);
    const next = structuredClone(configuration);
    apply(next);
    if (JSON.stringify(next) === JSON.stringify(configuration)) continue;
    await service.updateConfiguration(model, next);
    updated += 1;
  }
  if (updated > 0) strapi.log.info(`[admin] labels configured for ${updated} type(s)`);
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
    await applyContentModelStash(strapi);

    if (process.env.ENFORCE_PERMISSIONS === 'true') {
      strapi.log.info('[security] asserting public API permissions (ENFORCE_PERMISSIONS=true)');
      await grantPublicPermissions(strapi);
    } else {
      strapi.log.info(
        '[security] public API permissions left untouched — set ENFORCE_PERMISSIONS=true to re-assert them'
      );
    }

    await lockDownUsersPermissions(strapi);
    await setListPageSize(strapi);
    await sortNewestFirst(strapi);
    await syncTeamLabels(strapi);
    await configureAdminLabels(strapi);
    await grantTeamLabelRead(strapi);
  },
};
