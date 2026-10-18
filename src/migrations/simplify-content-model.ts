import type { Core } from '@strapi/strapi';

/**
 * Content model simplification, part 2 of 2 (runs at bootstrap, after the schema sync).
 *
 * Rebuilds what database/migrations/2026.10.12T00.00.00.simplify-content-model.js stashed before the
 * sync dropped the old tables. Works on database rows rather than documents so draft and published
 * versions are migrated independently and nothing gets (re)published. Runs once: the stash table is
 * dropped at the end, inside the same transaction.
 */

const STASH_TABLE = '_simplify_content_model_stash';

type Data = Record<string, any>;
type Link = { id: number; __pivot: { field: string; component_type: string } };

interface HighlightedText {
  text: string;
  highlight: string | null;
}

interface OrganizationRow {
  year: number;
  published: boolean;
  departments: Data[];
}

interface Stash {
  organizations: OrganizationRow[];
  personGrids: { gridId: number; people: Data[] }[];
  timelineEvents: Data[];
  theme: { editionIds: number[]; description: string | null; challenge: string | null; videoUrl: string | null; thumbnail: number | null } | null;
  addresses: {
    globals: { id: number; contactEmail: string | null; donationUrl: string | null }[];
    visitingAddress: Data | null;
    shippingAddress: Data | null;
    mapsUrl: string | null;
  };
  newsBodies: { articleId: number; body: unknown[] }[];
  heroTitles: ({ heroId: number } & HighlightedText)[];
  widgets: {
    pageId: number;
    field: string;
    order: number;
    type: string;
    label: string | null;
    description: string | null;
    title: HighlightedText | null;
  }[];
}

// Same steps as Strapi's document service: create nested components first, then the component row
// pointing at them.
async function createComponent(strapi: Core.Strapi, uid: string, data: Data): Promise<{ id: number }> {
  const { attributes } = strapi.getModel(uid as any);
  const row: Data = { ...data };

  for (const [name, attribute] of Object.entries(attributes) as [string, any][]) {
    if (attribute.type !== 'component' || row[name] == null) continue;
    if (attribute.repeatable) {
      const links: Link[] = [];
      for (const item of row[name]) {
        links.push(await createLink(strapi, name, attribute.component, item));
      }
      row[name] = links;
    } else {
      row[name] = await createLink(strapi, name, attribute.component, row[name]);
    }
  }

  return strapi.db.query(uid as any).create({ data: row });
}

async function createLink(strapi: Core.Strapi, field: string, uid: string, data: Data): Promise<Link> {
  const { id } = await createComponent(strapi, uid, data);
  return { id, __pivot: { field, component_type: uid } };
}

async function createLinks(strapi: Core.Strapi, field: string, uid: string, items: Data[]) {
  const links: Link[] = [];
  for (const item of items) {
    links.push(await createLink(strapi, field, uid, item));
  }
  return links;
}

const update = (strapi: Core.Strapi, uid: string, id: number, data: Data) =>
  strapi.db.query(uid as any).update({ where: { id }, data });

// db.query bumps updatedAt, and a draft row ending up newer than its published row shows as
// "Modified" in the admin. The migration changes no content, so the original timestamps are restored.
const TIMESTAMPED_TABLES = ['editions', 'news_articles', 'pages', 'globals'];

async function readTimestamps(trx: any) {
  const timestamps: Record<string, { id: number; updated_at: unknown }[]> = {};
  for (const table of TIMESTAMPED_TABLES) {
    timestamps[table] = await trx(table).select('id', 'updated_at');
  }
  return timestamps;
}

async function restoreTimestamps(trx: any, timestamps: Record<string, { id: number; updated_at: unknown }[]>) {
  for (const [table, rows] of Object.entries(timestamps)) {
    for (const { id, updated_at } of rows) {
      await trx(table).where({ id }).update({ updated_at });
    }
  }
}

// Organizations become their own documents, one per year, published if the edition was. A draft that
// differed from the published edition keeps its own (unpublished) content.
async function migrateOrganizations(strapi: Core.Strapi, stash: Stash) {
  const organizations = strapi.documents('api::organization.organization');
  const content = ({ year, departments }: OrganizationRow) => ({ year, departments });

  for (const year of new Set(stash.organizations.map((organization) => organization.year))) {
    const draft = stash.organizations.find((organization) => organization.year === year && !organization.published);
    const published = stash.organizations.find((organization) => organization.year === year && organization.published);

    if (!published) {
      await organizations.create({ data: content(draft!) as any });
      continue;
    }
    const { documentId } = await organizations.create({ data: content(published) as any, status: 'published' });
    if (draft && JSON.stringify(content(draft)) !== JSON.stringify(content(published))) {
      await organizations.update({ documentId, data: content(draft) as any });
    }
  }
}

// Strapi keeps custom admin roles (Editor, Author) limited to the fields they were granted, so new fields
// would be invisible to them. Each role keeps the reach it had: the fields that replace old ones are added,
// and Organization gets the same permissions the role had on Edition. Super Admin is synced by Strapi.
const ADDED_FIELDS: Record<string, string[]> = {
  'api::global.global': [
    'visitingAddress.label',
    'visitingAddress.lines',
    'shippingAddress.label',
    'shippingAddress.lines',
    'mapsUrl',
  ],
  'api::home.home': ['hero.title.text', 'hero.title.highlight'],
  'api::edition.edition': ['description', 'challenge', 'videoUrl', 'thumbnail'],
};

const ORGANIZATION_FIELDS = [
  'year',
  'departments.name',
  'departments.members.name',
  'departments.members.role',
  'departments.members.affiliation',
  'departments.members.photo',
  'departments.members.link',
];

async function grantAdminAccess(strapi: Core.Strapi) {
  const permissions = await strapi.db.query('admin::permission').findMany({
    where: { subject: { $in: Object.keys(ADDED_FIELDS) } },
    populate: ['role'],
  });

  const organizationPermissions: Data[] = [];
  let extended = 0;
  for (const permission of permissions) {
    if (!permission.role || permission.role.code === 'strapi-super-admin') continue;
    const fields: string[] | undefined = permission.properties?.fields;

    if (Array.isArray(fields)) {
      await update(strapi, 'admin::permission', permission.id, {
        properties: { ...permission.properties, fields: [...new Set([...fields, ...ADDED_FIELDS[permission.subject]])] },
      });
      extended += 1;
    }
    if (permission.subject === 'api::edition.edition') {
      organizationPermissions.push({
        action: permission.action,
        actionParameters: permission.actionParameters ?? {},
        subject: 'api::organization.organization',
        properties: Array.isArray(fields) ? { ...permission.properties, fields: ORGANIZATION_FIELDS } : permission.properties,
        conditions: permission.conditions ?? [],
        role: permission.role.id,
      });
    }
  }

  await strapi.service('admin::permission').createMany(organizationPermissions);
  strapi.log.info(
    `[migration] admin roles: ${extended} permission(s) extended with new fields, ${organizationPermissions.length} Organization permission(s) granted`
  );
}

// API roles (e.g. Public) that could read editions can read organizations, which used to be part of them.
async function grantApiAccess(strapi: Core.Strapi) {
  const permissions = await strapi.db.query('plugin::users-permissions.permission').findMany({
    where: { action: { $in: ['api::edition.edition.find', 'api::edition.edition.findOne'] } },
    populate: ['role'],
  });

  for (const permission of permissions) {
    if (!permission.role) continue;
    const action = permission.action.replace('api::edition.edition.', 'api::organization.organization.');
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: permission.role.id } });
    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: permission.role.id } });
      strapi.log.info(`[migration] API role "${permission.role.name}": granted ${action}`);
    }
  }
}

async function migratePersonGrids(strapi: Core.Strapi, stash: Stash) {
  for (const { gridId, people } of stash.personGrids) {
    await update(strapi, 'blocks.person-grid', gridId, {
      people: await createLinks(strapi, 'people', 'people.person', people),
    });
  }
}

async function migrateTimeline(strapi: Core.Strapi, stash: Stash, trx: any) {
  const timelines = await trx('components_blocks_timelines').select('id');
  for (const { id } of timelines) {
    await update(strapi, 'blocks.timeline', id, {
      events: await createLinks(strapi, 'events', 'shared.timeline-event', stash.timelineEvents),
    });
  }
}

async function migrateTheme(strapi: Core.Strapi, stash: Stash) {
  if (!stash.theme) return;
  const { editionIds, ...fields } = stash.theme;
  for (const id of editionIds) {
    await update(strapi, 'api::edition.edition', id, fields);
  }
}

async function migrateGlobal(strapi: Core.Strapi, stash: Stash) {
  const { globals, visitingAddress, shippingAddress, mapsUrl } = stash.addresses;
  for (const global of globals) {
    const data: Data = { mapsUrl };
    if (global.contactEmail) data.contactEmail = global.contactEmail;
    if (global.donationUrl) data.donationUrl = global.donationUrl;
    if (visitingAddress) data.visitingAddress = await createLink(strapi, 'visitingAddress', 'shared.address', visitingAddress);
    if (shippingAddress) data.shippingAddress = await createLink(strapi, 'shippingAddress', 'shared.address', shippingAddress);
    await update(strapi, 'api::global.global', global.id, data);
  }
}

async function migrateHeroTitles(strapi: Core.Strapi, stash: Stash) {
  for (const { heroId, text, highlight } of stash.heroTitles) {
    await update(strapi, 'home.hero', heroId, {
      title: await createLink(strapi, 'title', 'shared.highlighted-text', { text, highlight }),
    });
  }
}

// The old body becomes the article's first section, ahead of the existing ones.
async function migrateNewsBodies(strapi: Core.Strapi, stash: Stash, trx: any) {
  for (const { articleId, body } of stash.newsBodies) {
    const existing = await trx('news_articles_cmps')
      .where({ entity_id: articleId, field: 'sections' })
      .orderBy([{ column: 'order' }, { column: 'id' }])
      .select('cmp_id');
    const intro = await createLink(strapi, 'sections', 'news.section', { layout: 'text', highlight: false, body });
    const sections = [
      intro,
      ...existing.map(({ cmp_id }: { cmp_id: number }) => ({
        id: cmp_id,
        __pivot: { field: 'sections', component_type: 'news.section' },
      })),
    ];
    await update(strapi, 'api::news-article.news-article', articleId, { sections });
  }
}

// Widgets go back where the block they replace used to sit in the dynamic zone.
async function migrateWidgets(strapi: Core.Strapi, stash: Stash, trx: any) {
  const pageIds = [...new Set(stash.widgets.map((widget) => widget.pageId))];
  for (const pageId of pageIds) {
    const existing = await trx('pages_cmps')
      .where({ entity_id: pageId, field: 'sections' })
      .orderBy([{ column: 'order' }, { column: 'id' }])
      .select('cmp_id', 'component_type', 'order');

    const entries: { order: number; id: number; component: string }[] = existing.map((row: any) => ({
      order: Number(row.order),
      id: row.cmp_id,
      component: row.component_type,
    }));

    for (const widget of stash.widgets.filter((candidate) => candidate.pageId === pageId)) {
      const { id } = await createComponent(strapi, 'blocks.widget', {
        type: widget.type,
        label: widget.label,
        description: widget.description,
        title: widget.title,
      });
      entries.push({ order: Number(widget.order), id, component: 'blocks.widget' });
    }

    entries.sort((a, b) => a.order - b.order);
    await update(strapi, 'api::page.page', pageId, {
      sections: entries.map(({ id, component }) => ({ id, __component: component, __pivot: { field: 'sections' } })),
    });
  }
}

export async function applyContentModelStash(strapi: Core.Strapi) {
  if (!(await strapi.db.connection.schema.hasTable(STASH_TABLE))) return;

  await strapi.db.transaction(async ({ trx }) => {
    const row = await trx(STASH_TABLE).first('payload');
    const stash: Stash = JSON.parse(row.payload);
    const timestamps = await readTimestamps(trx);

    await migrateOrganizations(strapi, stash);
    await migratePersonGrids(strapi, stash);
    await migrateTimeline(strapi, stash, trx);
    await migrateTheme(strapi, stash);
    await migrateGlobal(strapi, stash);
    await migrateHeroTitles(strapi, stash);
    await migrateNewsBodies(strapi, stash, trx);
    await migrateWidgets(strapi, stash, trx);
    await grantAdminAccess(strapi);
    await grantApiAccess(strapi);

    await restoreTimestamps(trx, timestamps);

    await trx.schema.dropTable(STASH_TABLE);
  });

  strapi.log.info('[migration] content model simplification applied');
}
