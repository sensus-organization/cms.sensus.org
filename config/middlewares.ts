import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => [
  'strapi::logger',
  'strapi::errors',
  'global::sso',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: env.array('FRONTEND_URL', ['http://localhost:3000']),
      credentials: false,
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'global::public-published-only',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
