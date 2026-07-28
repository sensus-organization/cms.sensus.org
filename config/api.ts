import type { Core } from '@strapi/strapi';

const config: Core.Config.Api = {
  rest: {
    maxLimit: 250,
  },
};

export default config;
