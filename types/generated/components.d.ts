import type { Schema, Struct } from '@strapi/strapi';

export interface ArchiveAwardResult extends Struct.ComponentSchema {
  collectionName: 'components_archive_award_results';
  info: {
    displayName: 'Award Result';
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      [
        'innovation',
        'translation-potential',
        'analytical-performance',
        'public-inspiration',
      ]
    > &
      Schema.Attribute.Required;
    first: Schema.Attribute.Relation<'oneToOne', 'api::team.team'>;
    second: Schema.Attribute.Relation<'oneToOne', 'api::team.team'>;
    third: Schema.Attribute.Relation<'oneToOne', 'api::team.team'>;
  };
}

export interface ArchiveOrgGroup extends Struct.ComponentSchema {
  collectionName: 'components_archive_org_groups';
  info: {
    displayName: 'Org Group';
  };
  attributes: {
    members: Schema.Attribute.Component<'archive.org-member', true>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface ArchiveOrgMember extends Struct.ComponentSchema {
  collectionName: 'components_archive_org_members';
  info: {
    displayName: 'Org Member';
  };
  attributes: {
    link: Schema.Attribute.String;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    photo: Schema.Attribute.Media<'images'>;
    role: Schema.Attribute.String;
  };
}

export interface BlocksArchiveHub extends Struct.ComponentSchema {
  collectionName: 'components_blocks_archive_hubs';
  info: {
    displayName: 'Archive Hub';
  };
  attributes: {
    description: Schema.Attribute.Text;
    label: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface BlocksCardList extends Struct.ComponentSchema {
  collectionName: 'components_blocks_card_lists';
  info: {
    displayName: 'Card List';
  };
  attributes: {
    cards: Schema.Attribute.Component<'shared.card', true>;
    layout: Schema.Attribute.Enumeration<['grid', 'numbered']> &
      Schema.Attribute.DefaultTo<'grid'>;
    title: Schema.Attribute.String;
  };
}

export interface BlocksCta extends Struct.ComponentSchema {
  collectionName: 'components_blocks_ctas';
  info: {
    displayName: 'Cta';
  };
  attributes: {
    buttonText: Schema.Attribute.String;
    description: Schema.Attribute.Text;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String;
  };
}

export interface BlocksFeature extends Struct.ComponentSchema {
  collectionName: 'components_blocks_features';
  info: {
    displayName: 'Feature';
  };
  attributes: {
    body: Schema.Attribute.Blocks;
    callout: Schema.Attribute.Text;
    image: Schema.Attribute.Media<'images'>;
    link: Schema.Attribute.Component<'shared.link', false>;
    reverse: Schema.Attribute.Boolean;
    tagline: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface BlocksImage extends Struct.ComponentSchema {
  collectionName: 'components_blocks_images';
  info: {
    displayName: 'Image';
  };
  attributes: {
    caption: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
  };
}

export interface BlocksLinkList extends Struct.ComponentSchema {
  collectionName: 'components_blocks_link_lists';
  info: {
    displayName: 'Link List';
  };
  attributes: {
    description: Schema.Attribute.Text;
    links: Schema.Attribute.Component<'shared.link', true>;
    title: Schema.Attribute.String;
  };
}

export interface BlocksLogoGrid extends Struct.ComponentSchema {
  collectionName: 'components_blocks_logo_grids';
  info: {
    displayName: 'Logo Grid';
  };
  attributes: {
    columns: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<4>;
    partners: Schema.Attribute.Relation<'oneToMany', 'api::partner.partner'>;
    title: Schema.Attribute.String;
  };
}

export interface BlocksPersonGrid extends Struct.ComponentSchema {
  collectionName: 'components_blocks_person_grids';
  info: {
    displayName: 'Person Grid';
  };
  attributes: {
    description: Schema.Attribute.Text;
    people: Schema.Attribute.Relation<'oneToMany', 'api::person.person'>;
    showAffiliation: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    showRole: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    size: Schema.Attribute.Enumeration<['sm', 'md', 'lg']> &
      Schema.Attribute.DefaultTo<'md'>;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface BlocksRichText extends Struct.ComponentSchema {
  collectionName: 'components_blocks_rich_texts';
  info: {
    displayName: 'Rich Text';
  };
  attributes: {
    body: Schema.Attribute.Blocks;
    variant: Schema.Attribute.Enumeration<['default', 'callout']> &
      Schema.Attribute.DefaultTo<'default'>;
  };
}

export interface BlocksSchedule extends Struct.ComponentSchema {
  collectionName: 'components_blocks_schedules';
  info: {
    displayName: 'Schedule';
  };
  attributes: {
    items: Schema.Attribute.Component<'shared.schedule-item', true>;
    title: Schema.Attribute.String;
  };
}

export interface BlocksSectionHeader extends Struct.ComponentSchema {
  collectionName: 'components_blocks_section_headers';
  info: {
    displayName: 'Section Header';
  };
  attributes: {
    description: Schema.Attribute.Text;
    label: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface BlocksTeamGrid extends Struct.ComponentSchema {
  collectionName: 'components_blocks_team_grids';
  info: {
    displayName: 'Team Grid';
  };
  attributes: {
    description: Schema.Attribute.Text;
    label: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface BlocksTimeline extends Struct.ComponentSchema {
  collectionName: 'components_blocks_timelines';
  info: {
    displayName: 'Timeline';
  };
  attributes: {
    description: Schema.Attribute.Text;
    label: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface BlocksVideo extends Struct.ComponentSchema {
  collectionName: 'components_blocks_videos';
  info: {
    displayName: 'Video';
  };
  attributes: {
    caption: Schema.Attribute.String;
    thumbnail: Schema.Attribute.Media<'images'>;
    videoUrl: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface BlocksWorldMap extends Struct.ComponentSchema {
  collectionName: 'components_blocks_world_maps';
  info: {
    displayName: 'World Map';
  };
  attributes: {
    title: Schema.Attribute.String;
  };
}

export interface HomeAbout extends Struct.ComponentSchema {
  collectionName: 'components_home_abouts';
  info: {
    displayName: 'About';
  };
  attributes: {
    description: Schema.Attribute.Text;
    images: Schema.Attribute.Media<'images', true>;
    label: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface HomeHero extends Struct.ComponentSchema {
  collectionName: 'components_home_heroes';
  info: {
    displayName: 'Hero';
  };
  attributes: {
    buttons: Schema.Attribute.Component<'shared.button', true>;
    poster: Schema.Attribute.Media<'images'>;
    subtitle: Schema.Attribute.Text;
    titleBefore: Schema.Attribute.String;
    titleHighlighted: Schema.Attribute.String;
    videoUrl: Schema.Attribute.String;
  };
}

export interface HomeHighSchools extends Struct.ComponentSchema {
  collectionName: 'components_home_high_schools';
  info: {
    displayName: 'High Schools';
  };
  attributes: {
    benefits: Schema.Attribute.Text;
    description: Schema.Attribute.Text;
    images: Schema.Attribute.Media<'images', true>;
    subtitle: Schema.Attribute.String;
    title: Schema.Attribute.String;
  };
}

export interface HomeMission extends Struct.ComponentSchema {
  collectionName: 'components_home_missions';
  info: {
    displayName: 'Mission';
  };
  attributes: {
    cards: Schema.Attribute.Component<'shared.card', true>;
    description: Schema.Attribute.Text;
    label: Schema.Attribute.String;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface HomeSymposium extends Struct.ComponentSchema {
  collectionName: 'components_home_symposiums';
  info: {
    displayName: 'Symposium';
  };
  attributes: {
    description: Schema.Attribute.Text;
    highlights: Schema.Attribute.Text;
    subtitle: Schema.Attribute.String;
    thumbnail: Schema.Attribute.Media<'images'>;
    title: Schema.Attribute.String;
    videoUrl: Schema.Attribute.String;
    websiteUrl: Schema.Attribute.String;
  };
}

export interface HomeTeamsSection extends Struct.ComponentSchema {
  collectionName: 'components_home_teams_sections';
  info: {
    displayName: 'Teams Section';
  };
  attributes: {
    description: Schema.Attribute.Text;
    label: Schema.Attribute.String;
    stats: Schema.Attribute.Component<'shared.stat', true>;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface HomeTheme extends Struct.ComponentSchema {
  collectionName: 'components_home_themes';
  info: {
    displayName: 'Theme';
  };
  attributes: {
    challenge: Schema.Attribute.Text;
    description: Schema.Attribute.Text;
    disease: Schema.Attribute.String;
    thumbnail: Schema.Attribute.Media<'images'>;
    title: Schema.Attribute.String;
    videoUrl: Schema.Attribute.String;
    year: Schema.Attribute.String;
  };
}

export interface NewsSection extends Struct.ComponentSchema {
  collectionName: 'components_news_sections';
  info: {
    displayName: 'News Section';
  };
  attributes: {
    body: Schema.Attribute.Blocks;
    highlight: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    image: Schema.Attribute.Media<'images'>;
    layout: Schema.Attribute.Enumeration<
      ['text', 'image', 'text-and-image', 'video']
    > &
      Schema.Attribute.DefaultTo<'text'>;
    title: Schema.Attribute.String;
    videoUrl: Schema.Attribute.String;
  };
}

export interface SharedAddress extends Struct.ComponentSchema {
  collectionName: 'components_shared_address';
  info: {
    displayName: 'Address';
  };
  attributes: {
    label: Schema.Attribute.String;
    lines: Schema.Attribute.Text;
  };
}

export interface SharedButton extends Struct.ComponentSchema {
  collectionName: 'components_shared_buttons';
  info: {
    displayName: 'Button';
  };
  attributes: {
    icon: Schema.Attribute.String;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String & Schema.Attribute.Required;
    variant: Schema.Attribute.Enumeration<['primary', 'glass']> &
      Schema.Attribute.DefaultTo<'primary'>;
  };
}

export interface SharedCard extends Struct.ComponentSchema {
  collectionName: 'components_shared_cards';
  info: {
    displayName: 'Card';
  };
  attributes: {
    color: Schema.Attribute.String;
    description: Schema.Attribute.Text;
    details: Schema.Attribute.Text;
    icon: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'>;
    subtitle: Schema.Attribute.String;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String;
  };
}

export interface SharedHero extends Struct.ComponentSchema {
  collectionName: 'components_shared_heroes';
  info: {
    displayName: 'Hero';
  };
  attributes: {
    badge: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'>;
    subtitle: Schema.Attribute.Text;
    title: Schema.Attribute.Component<'shared.highlighted-text', false>;
  };
}

export interface SharedHighlightedText extends Struct.ComponentSchema {
  collectionName: 'components_shared_highlighted_texts';
  info: {
    displayName: 'Highlighted Text';
  };
  attributes: {
    highlight: Schema.Attribute.String;
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_links';
  info: {
    displayName: 'Link';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedNavChild extends Struct.ComponentSchema {
  collectionName: 'components_shared_nav_children';
  info: {
    displayName: 'Nav Child';
  };
  attributes: {
    badge: Schema.Attribute.String;
    external: Schema.Attribute.Boolean;
    icon: Schema.Attribute.String;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    to: Schema.Attribute.String;
  };
}

export interface SharedNavItem extends Struct.ComponentSchema {
  collectionName: 'components_shared_nav_items';
  info: {
    displayName: 'Nav Item';
  };
  attributes: {
    badge: Schema.Attribute.String;
    children: Schema.Attribute.Component<'shared.nav-child', true>;
    external: Schema.Attribute.Boolean;
    icon: Schema.Attribute.String;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    to: Schema.Attribute.String;
  };
}

export interface SharedScheduleItem extends Struct.ComponentSchema {
  collectionName: 'components_shared_schedule_items';
  info: {
    displayName: 'Schedule Item';
  };
  attributes: {
    description: Schema.Attribute.String;
    highlight: Schema.Attribute.Boolean;
    time: Schema.Attribute.String;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    displayName: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text;
    metaTitle: Schema.Attribute.String;
  };
}

export interface SharedSocialLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_social_links';
  info: {
    displayName: 'Social Link';
  };
  attributes: {
    href: Schema.Attribute.String;
    icon: Schema.Attribute.String;
    label: Schema.Attribute.String;
  };
}

export interface SharedStat extends Struct.ComponentSchema {
  collectionName: 'components_shared_stats';
  info: {
    displayName: 'Stat';
  };
  attributes: {
    label: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'archive.award-result': ArchiveAwardResult;
      'archive.org-group': ArchiveOrgGroup;
      'archive.org-member': ArchiveOrgMember;
      'blocks.archive-hub': BlocksArchiveHub;
      'blocks.card-list': BlocksCardList;
      'blocks.cta': BlocksCta;
      'blocks.feature': BlocksFeature;
      'blocks.image': BlocksImage;
      'blocks.link-list': BlocksLinkList;
      'blocks.logo-grid': BlocksLogoGrid;
      'blocks.person-grid': BlocksPersonGrid;
      'blocks.rich-text': BlocksRichText;
      'blocks.schedule': BlocksSchedule;
      'blocks.section-header': BlocksSectionHeader;
      'blocks.team-grid': BlocksTeamGrid;
      'blocks.timeline': BlocksTimeline;
      'blocks.video': BlocksVideo;
      'blocks.world-map': BlocksWorldMap;
      'home.about': HomeAbout;
      'home.hero': HomeHero;
      'home.high-schools': HomeHighSchools;
      'home.mission': HomeMission;
      'home.symposium': HomeSymposium;
      'home.teams-section': HomeTeamsSection;
      'home.theme': HomeTheme;
      'news.section': NewsSection;
      'shared.address': SharedAddress;
      'shared.button': SharedButton;
      'shared.card': SharedCard;
      'shared.hero': SharedHero;
      'shared.highlighted-text': SharedHighlightedText;
      'shared.link': SharedLink;
      'shared.nav-child': SharedNavChild;
      'shared.nav-item': SharedNavItem;
      'shared.schedule-item': SharedScheduleItem;
      'shared.seo': SharedSeo;
      'shared.social-link': SharedSocialLink;
      'shared.stat': SharedStat;
    }
  }
}
