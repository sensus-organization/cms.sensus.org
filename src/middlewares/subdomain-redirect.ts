import type { Core } from '@strapi/strapi';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ALLOWED_STATUSES = new Set([301, 302, 307, 308]);

const normalizeHostname = (value: string) => value.trim().toLowerCase().replace(/\.$/, '');

const appendPath = (destination: URL, requestPath: string) => {
  const base = destination.pathname.replace(/\/$/, '');
  const suffix = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  destination.pathname = `${base}${suffix}` || '/';
};

const appendQuery = (destination: URL, querystring: string) => {
  for (const [key, value] of new URLSearchParams(querystring)) {
    destination.searchParams.append(key, value);
  }
};

const middleware: Core.MiddlewareFactory = (_config, { strapi }) => {
  const baseDomain = normalizeHostname(process.env.REDIRECT_BASE_DOMAIN || 'sensus.org');
  const reservedHosts = new Set(
    (process.env.REDIRECT_RESERVED_HOSTS || `cms.${baseDomain}`)
      .split(',')
      .map(normalizeHostname)
      .filter(Boolean)
  );

  const redirectHost = (hostname: string) => {
    const suffix = `.${baseDomain}`;
    if (!hostname.endsWith(suffix) || reservedHosts.has(hostname)) return false;
    return HOST_LABEL.test(hostname.slice(0, -suffix.length));
  };

  return async (ctx: any, next: () => Promise<void>) => {
    const hostname = normalizeHostname(String(ctx.hostname || ''));
    if (!redirectHost(hostname)) return next();

    ctx.set(NO_CACHE_HEADERS);

    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      ctx.set('Allow', 'GET, HEAD');
      ctx.status = 405;
      ctx.body = 'Method Not Allowed';
      return;
    }

    const rule = await strapi.db.query('api::subdomain-redirect.subdomain-redirect').findOne({
      where: { hostname, publishedAt: { $notNull: true } },
      select: ['destination', 'redirectStatus', 'preservePath', 'preserveQuery'],
    });

    if (!rule) {
      ctx.status = 404;
      ctx.body = 'Not Found';
      return;
    }

    let destination: URL;
    try {
      destination = new URL(String(rule.destination));
      if (destination.protocol !== 'https:' || destination.username || destination.password) {
        throw new Error('destination must be an HTTPS URL without credentials');
      }
    } catch (error) {
      strapi.log.error(
        `[redirect] invalid destination for ${hostname}: ${(error as Error).message}`
      );
      ctx.status = 500;
      ctx.body = 'Redirect Misconfigured';
      return;
    }

    if (rule.preservePath) appendPath(destination, ctx.path);
    if (rule.preserveQuery && ctx.querystring) appendQuery(destination, ctx.querystring);

    const status = Number(rule.redirectStatus);
    ctx.status = ALLOWED_STATUSES.has(status) ? status : 302;
    ctx.set('Location', destination.toString());
    ctx.body = null;
  };
};

export default middleware;
