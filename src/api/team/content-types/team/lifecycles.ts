import { teamLabel } from '../../team-label';

// `label` ("DeTectUs (2026)") is what the admin shows when picking a team, e.g. in award results, so
// teams with the same name in different years can be told apart. It is never edited by hand.
export default {
  beforeCreate(event: any) {
    const { data } = event.params;
    data.label = teamLabel(data.name, data.year);
  },

  async beforeUpdate(event: any) {
    const { data, where } = event.params;
    if (!('name' in data) && !('year' in data)) return;
    const current = await strapi.db.query('api::team.team').findOne({ where, select: ['name', 'year'] });
    data.label = teamLabel(data.name ?? current?.name, 'year' in data ? data.year : current?.year);
  },
};
