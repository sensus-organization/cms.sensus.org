import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  upload: {
    config: {
      sizeLimit: 50 * 1024 * 1024,
      security: {
        allowedTypes: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'image/avif',
          'application/pdf',
        ],
      },
    },
  },
});

export default config;
