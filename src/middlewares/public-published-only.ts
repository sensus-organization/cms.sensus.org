import type { Core } from '@strapi/strapi';

const decode = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
};

const middleware: Core.MiddlewareFactory = (_config, { strapi }) => {
  const prefix = `${String(strapi.config.get('api.rest.prefix', '/api')).replace(/\/+$/, '')}/`;
  const lowerPrefix = prefix.toLowerCase();

  return async (ctx, next) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return next();

    const path = decode(ctx.path).toLowerCase();
    if (!path.startsWith(lowerPrefix)) return next();

    const query: Record<string, unknown> = { ...ctx.query, status: 'published' };
    delete query._q;
    ctx.query = query;

    const applied = (ctx.query as Record<string, unknown>).status;
    if (applied !== 'published') {
      strapi.log.warn(`[security] refusing request: publication guard could not be applied to ${ctx.path}`);
      ctx.status = 400;
      ctx.body = 'Bad Request';
      return;
    }

    return next();
  };
};

export default middleware;
