'use strict';

/**
 * Content model simplification, part 1 of 2 (runs before Strapi syncs the schema).
 *
 * The sync drops every table and column that left the schema (people, memberships, departments,
 * timeline events, the widget blocks, home theme, news body, edition orgIntro, ...). Everything that has to survive
 * is read here and parked as JSON in a stash table. Part 2 (src/migrations/simplify-content-model.ts)
 * rebuilds it as components once the new schema exists, then drops the stash.
 */

const STASH_TABLE = '_simplify_content_model_stash';

const WIDGET_TYPES = {
  'blocks.team-grid': { type: 'teams', table: 'components_blocks_team_grids' },
  'blocks.world-map': { type: 'world-map', table: 'components_blocks_world_maps' },
  'blocks.archive-hub': { type: 'archive', table: 'components_blocks_archive_hubs' },
  'blocks.organization': { type: 'organization', table: 'components_blocks_organizations' },
};

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const blank = (value) => value === null || value === undefined || value === '';
const orNull = (value) => (blank(value) ? null : value);

const photoJoin = (alias, personColumn) =>
  function () {
    this.on(`${alias}.related_id`, '=', personColumn)
      .andOnVal(`${alias}.related_type`, '=', 'api::person.person')
      .andOnVal(`${alias}.field`, '=', 'photo');
  };

// One organization per edition row (draft and published separately). Members are grouped the way the
// website used to do it at request time: memberships in `order`, grouped by department name, groups
// sorted by department order (no department first).
async function readOrganizations(knex) {
  const rows = await knex('memberships as m')
    .join('memberships_edition_lnk as el', 'el.membership_id', 'm.id')
    .join('memberships_person_lnk as pl', 'pl.membership_id', 'm.id')
    .join('people as p', 'p.id', 'pl.person_id')
    .leftJoin('memberships_department_lnk as dl', 'dl.membership_id', 'm.id')
    .leftJoin('departments as d', 'd.id', 'dl.department_id')
    .leftJoin('files_related_mph as ph', photoJoin('ph', 'p.id'))
    .select(
      'el.edition_id as editionId',
      'm.role as role',
      'd.name as department',
      'd.order as departmentOrder',
      'p.name as name',
      'p.link as link',
      'ph.file_id as photo'
    )
    .orderBy([{ column: 'el.edition_id' }, { column: 'm.order' }, { column: 'm.id' }]);

  const byEdition = {};
  for (const row of rows) {
    const groups = (byEdition[row.editionId] ??= new Map());
    const key = row.department ?? '';
    if (!groups.has(key)) {
      groups.set(key, { name: orNull(row.department), order: row.departmentOrder ?? -1, members: [] });
    }
    groups.get(key).members.push({
      name: row.name,
      role: orNull(row.role),
      photo: row.photo ?? null,
      link: orNull(row.link),
    });
  }

  const editions = await knex('editions').select('id', 'year', 'published_at');
  return editions
    .map((edition) => ({
      year: edition.year,
      published: edition.published_at !== null,
      departments: [...(byEdition[edition.id]?.values() ?? [])]
        .sort((a, b) => a.order - b.order)
        .map(({ name, members }) => ({ name, members })),
    }))
    .filter((organization) => organization.departments.length > 0);
}

// Person grids showed role/title/affiliation depending on the grid's toggles and size. People are
// now inline, so only what was actually visible is copied and the toggles go away.
async function readPersonGrids(knex) {
  const rows = await knex('components_blocks_person_grids as g')
    .join('components_blocks_person_grids_people_lnk as l', 'l.person_grid_id', 'g.id')
    .join('people as p', 'p.id', 'l.person_id')
    .leftJoin('files_related_mph as ph', photoJoin('ph', 'p.id'))
    .select(
      'g.id as gridId',
      'g.size as size',
      'g.show_role as showRole',
      'g.show_affiliation as showAffiliation',
      'p.name as name',
      'p.role as role',
      'p.title as title',
      'p.affiliation as affiliation',
      'p.link as link',
      'ph.file_id as photo'
    )
    .orderBy([{ column: 'g.id' }, { column: 'l.person_ord' }, { column: 'l.id' }]);

  const byGrid = {};
  for (const row of rows) {
    const size = row.size || 'md';
    const showRole = row.showRole ?? true;
    const showAffiliation = row.showAffiliation ?? false;
    (byGrid[row.gridId] ??= []).push({
      name: row.name,
      role: orNull((showRole && orNull(row.role)) || (size !== 'sm' && orNull(row.title)) || null),
      affiliation: showAffiliation || (size === 'sm' && !showRole) ? orNull(row.affiliation) : null,
      photo: row.photo ?? null,
      link: orNull(row.link),
    });
  }
  return Object.entries(byGrid).map(([gridId, people]) => ({ gridId: Number(gridId), people }));
}

async function readTimelineEvents(knex) {
  const rows = await knex('timeline_events').orderBy([{ column: 'order' }, { column: 'id' }]);
  return rows.map((row) => ({
    year: Number.parseInt(row.year, 10),
    title: row.title,
    biomarker: orNull(row.biomarker),
    description: orNull(row.description),
    color: orNull(row.color),
    milestone: Boolean(row.milestone),
    link: orNull(row.link),
  }));
}

// The home "theme" section becomes the current edition's description/challenge/video.
async function readTheme(knex) {
  const global = await knex('globals').first('current_year');
  const theme = await knex('components_home_themes as t')
    .join('homes_cmps as hc', function () {
      this.on('hc.cmp_id', '=', 't.id').andOnVal('hc.component_type', '=', 'home.theme');
    })
    .first('t.id', 't.description', 't.challenge', 't.video_url as videoUrl');
  if (!theme || !global?.current_year) return null;

  const thumbnail = await knex('files_related_mph')
    .where({ related_id: theme.id, related_type: 'home.theme', field: 'thumbnail' })
    .first('file_id');
  const editions = await knex('editions').where({ year: global.current_year }).select('id');

  return {
    editionIds: editions.map((edition) => edition.id),
    description: orNull(theme.description),
    challenge: orNull(theme.challenge),
    videoUrl: orNull(theme.videoUrl),
    thumbnail: thumbnail?.file_id ?? null,
  };
}

// Global.addresses (footer) and Contact.visiting/shippingAddress (contact page) described the same two
// addresses. Global keeps one of each: the contact page's lines, the footer's short tab labels.
async function readAddresses(knex) {
  const addressesOf = (table, fields) =>
    knex(`${table} as c`)
      .join('components_shared_address as a', 'a.id', 'c.cmp_id')
      .where('c.component_type', 'shared.address')
      .whereIn('c.field', fields)
      .select('c.id as linkId', 'c.field as field', 'a.id as id', 'a.label as label', 'a.lines as lines')
      .orderBy([{ column: 'c.order' }, { column: 'c.id' }]);

  const footer = await addressesOf('globals_cmps', ['addresses']);
  const contactAddresses = await addressesOf('contacts_cmps', ['visitingAddress', 'shippingAddress']);
  const contactVisit = contactAddresses.find((address) => address.field === 'visitingAddress');
  const contactShip = contactAddresses.find((address) => address.field === 'shippingAddress');
  const contact = await knex('contacts').first('email', 'donation_url', 'maps_url');
  const globals = await knex('globals').select('id', 'contact_email', 'donation_url');

  const merge = (footerAddress, contactAddress) =>
    footerAddress || contactAddress
      ? {
          label: orNull(footerAddress?.label) ?? orNull(contactAddress?.label),
          lines: orNull(contactAddress?.lines) ?? orNull(footerAddress?.lines),
        }
      : null;

  return {
    globals: globals.map((global) => ({
      id: global.id,
      contactEmail: blank(global.contact_email) ? orNull(contact?.email) : null,
      donationUrl: blank(global.donation_url) ? orNull(contact?.donation_url) : null,
    })),
    visitingAddress: merge(footer[0], contactVisit),
    shippingAddress: merge(footer[1], contactShip),
    mapsUrl: orNull(contact?.maps_url),
    obsolete: {
      globalLinks: footer.map((address) => address.linkId),
      contactLinks: contactAddresses.map((address) => address.linkId),
      addresses: [...footer, ...contactAddresses].map((address) => address.id),
    },
  };
}

async function readNewsBodies(knex) {
  const rows = await knex('news_articles').whereNotNull('body').select('id', 'body');
  return rows
    .map((row) => ({ articleId: row.id, body: parseJson(row.body) }))
    .filter((row) => Array.isArray(row.body) && row.body.length > 0);
}

async function readHeroTitles(knex) {
  const rows = await knex('components_home_heroes').select('id', 'title_before', 'title_highlighted');
  return rows
    .filter((row) => !blank(row.title_before) || !blank(row.title_highlighted))
    .map((row) => ({
      heroId: row.id,
      text: [row.title_before, row.title_highlighted].filter((part) => !blank(part)).join(' '),
      highlight: orNull(row.title_highlighted),
    }));
}

async function readHighlightedTitle(knex, componentTable, componentId) {
  const title = await knex(`${componentTable}_cmps as c`)
    .join('components_shared_highlighted_texts as h', 'h.id', 'c.cmp_id')
    .where({ 'c.entity_id': componentId, 'c.field': 'title', 'c.component_type': 'shared.highlighted-text' })
    .first('h.id', 'h.text', 'h.highlight');
  return title ? { id: title.id, text: title.text, highlight: orNull(title.highlight) } : null;
}

// team-grid / world-map / archive-hub / organization become one "widget" block. Their position in
// the page is remembered so part 2 can put the widget back in the same place.
async function readWidgets(knex) {
  const placements = await knex('pages_cmps')
    .whereIn('component_type', Object.keys(WIDGET_TYPES))
    .select('id', 'entity_id', 'cmp_id', 'component_type', 'field', 'order');

  const widgets = [];
  const obsoleteTitles = [];
  for (const placement of placements) {
    const { type, table } = WIDGET_TYPES[placement.component_type];
    const block = await knex(table).where({ id: placement.cmp_id }).first();
    let title = null;
    if (placement.component_type === 'blocks.world-map') {
      title = blank(block?.title) ? null : { text: block.title, highlight: null };
    } else {
      const stored = await readHighlightedTitle(knex, table, placement.cmp_id);
      if (stored) {
        obsoleteTitles.push(stored.id);
        title = { text: stored.text, highlight: stored.highlight };
      }
    }
    widgets.push({
      linkId: placement.id,
      pageId: placement.entity_id,
      field: placement.field,
      order: placement.order,
      type,
      label: orNull(block?.label),
      description: orNull(block?.description),
      title,
    });
  }
  return { widgets, obsoleteTitles };
}

async function up(knex) {
  if (!(await knex.schema.hasTable('memberships'))) {
    return; // fresh database: the old model never existed
  }

  const addresses = await readAddresses(knex);
  const { widgets, obsoleteTitles } = await readWidgets(knex);
  const stash = {
    organizations: await readOrganizations(knex),
    personGrids: await readPersonGrids(knex),
    timelineEvents: await readTimelineEvents(knex),
    theme: await readTheme(knex),
    addresses,
    newsBodies: await readNewsBodies(knex),
    heroTitles: await readHeroTitles(knex),
    widgets,
  };

  await knex.schema.createTable(STASH_TABLE, (table) => {
    table.increments('id');
    table.text('payload');
  });
  await knex(STASH_TABLE).insert({ payload: JSON.stringify(stash) });

  // Rows the sync would leave behind as orphans: links to removed fields/components and the
  // components that only those links referenced.
  await knex('globals_cmps').whereIn('id', addresses.obsolete.globalLinks).del();
  await knex('contacts_cmps').whereIn('id', addresses.obsolete.contactLinks).del();
  await knex('components_shared_address').whereIn('id', addresses.obsolete.addresses).del();
  await knex('pages_cmps').whereIn('id', widgets.map((widget) => widget.linkId)).del();
  await knex('components_shared_highlighted_texts').whereIn('id', obsoleteTitles).del();
  await knex('files_related_mph').whereIn('related_type', ['api::person.person', 'home.theme']).del();
  await knex('homes_cmps').where({ component_type: 'home.theme' }).del();
}

async function down() {
  throw new Error('The content model simplification cannot be reverted; restore a database backup instead.');
}

module.exports = { up, down };
