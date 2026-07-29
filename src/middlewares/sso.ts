import crypto from 'crypto';
import type { Core } from '@strapi/strapi';

const REFRESH_COOKIE_NAME = 'strapi_admin_refresh';
const SUPER_ADMIN_CODE = 'strapi-super-admin';
const SSO_PATH = '/admin-sso';

const EMAIL_PATTERN = /^[a-z0-9!#$&'*+\/=?^_`{|}~.-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();

const secretMatches = (given: string, expected: string) =>
  given.length > 0 && crypto.timingSafeEqual(sha256(given), sha256(expected));

const isPlausibleEmail = (value: string) => value.length <= 254 && EMAIL_PATTERN.test(value);

const koaTrustsProxy = (strapi: Core.Strapi) => Boolean(strapi.config.get('server.proxy.koa'));

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const isLoopbackRequest = (ctx: any) => {
  const remote = String(ctx.socket?.remoteAddress ?? '').replace(/^::ffff:/, '');
  const host = String(ctx.hostname ?? '').toLowerCase();
  return LOOPBACK_HOSTS.has(host) && (remote === '127.0.0.1' || remote === '::1');
};

const splitName = (displayName: string, email: string) => {
  const display = displayName.trim();
  if (display && !display.includes('@') && /\s/.test(display)) {
    const parts = display.split(/\s+/);
    return { firstname: parts[0], lastname: parts.slice(1).join(' ') || undefined };
  }

  const local = email.split('@')[0];
  const parts = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return { firstname: parts[0] || local, lastname: parts.slice(1).join(' ') || undefined };
};

const buildRefreshCookieOptions = (strapi: Core.Strapi, secureRequest: boolean) => {
  const configuredSecure = strapi.config.get('admin.auth.cookie.secure');
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: typeof configuredSecure === 'boolean' ? configuredSecure : isProduction && secureRequest,
    overwrite: true,
    domain: (strapi.config.get('admin.auth.cookie.domain') ||
      strapi.config.get('admin.auth.domain')) as string | undefined,
    path: strapi.config.get('admin.auth.cookie.path', '/admin') as string,
    sameSite: (strapi.config.get('admin.auth.cookie.sameSite') ?? 'lax') as 'lax',
  };
};

const renderBridgePage = (accessToken: string, deviceId: string, adminPath: string) => {
  const escape = (value: string) => JSON.stringify(value).replace(/</g, '\\u003C');
  const tokenLiteral = escape(JSON.stringify(accessToken));
  const deviceIdLiteral = escape(deviceId);
  const pathLiteral = escape(adminPath);

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing in…</title></head>
<body>
<p>Signing in…</p>
<script>
localStorage.setItem('jwtToken', ${tokenLiteral});
localStorage.setItem('isLoggedIn', 'true');
localStorage.setItem('strapi.admin.deviceId', ${deviceIdLiteral});
location.replace(${pathLiteral});
</script>
</body>
</html>`;
};

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  const enabled = process.env.SSO_ENABLED === 'true';
  const proxySecret = process.env.SSO_PROXY_SECRET ?? '';
  const allowedDomain = (process.env.SSO_ALLOWED_DOMAIN ?? '').trim().toLowerCase();
  const defaultRoleName = process.env.SSO_DEFAULT_ROLE || 'Editor';

  if (enabled && !proxySecret) {
    strapi.log.error('[sso] SSO_ENABLED=true but SSO_PROXY_SECRET is empty — SSO bridge stays disabled');
  }

  const untrustedProxy = enabled && !koaTrustsProxy(strapi);

  if (untrustedProxy) {
    strapi.log.error(
      '[sso] SSO_ENABLED=true but IS_PROXIED is not set — X-Forwarded-Proto is untrusted, ' +
        'the session cookie would be issued without the Secure flag. SSO bridge stays disabled ' +
        'for every request that does not come from loopback'
    );
  }

  const active = enabled && proxySecret.length > 0;

  return async (ctx: any, next: () => Promise<void>) => {
    if (!active || (untrustedProxy && !isLoopbackRequest(ctx))) {
      return next();
    }

    const adminPath = strapi.config.get('admin.path', '/admin') as string;
    const isBridge = ctx.path === SSO_PATH;
    const isAdminEntry = ctx.method === 'GET' && (ctx.path === adminPath || ctx.path === `${adminPath}/`);

    if (!isBridge && !isAdminEntry) {
      return next();
    }

    const headerSecret = ctx.get('x-proxy-secret');
    const trusted = secretMatches(headerSecret, proxySecret);
    const email = ctx.get('x-auth-request-email').trim().toLowerCase();

    if (isAdminEntry) {
      if (!trusted || !email || ctx.cookies.get(REFRESH_COOKIE_NAME)) {
        return next();
      }
      ctx.set('Cache-Control', 'no-store');
      return ctx.redirect(SSO_PATH);
    }

    ctx.set('Cache-Control', 'no-store');
    ctx.set('Referrer-Policy', 'no-referrer');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );

    if (!trusted) {
      strapi.log.warn(`[sso] rejected: bad or missing x-proxy-secret (ip=${ctx.ip})`);
      ctx.status = 403;
      ctx.body = 'Forbidden';
      return;
    }

    if (ctx.method !== 'GET') {
      ctx.status = 405;
      ctx.body = 'Method Not Allowed';
      return;
    }

    if (!email) {
      strapi.log.warn(`[sso] rejected: missing x-auth-request-email (ip=${ctx.ip})`);
      ctx.status = 400;
      ctx.body = 'Missing authenticated email';
      return;
    }

    if (!isPlausibleEmail(email)) {
      strapi.log.warn(`[sso] rejected: malformed x-auth-request-email ${JSON.stringify(email)} (ip=${ctx.ip})`);
      ctx.status = 403;
      ctx.body = 'Forbidden';
      return;
    }

    if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
      strapi.log.warn(`[sso] rejected: ${email} is outside allowed domain ${allowedDomain}`);
      ctx.status = 403;
      ctx.body = 'Forbidden';
      return;
    }

    try {
      const userService = strapi.service('admin::user') as any;

      const denyExistingUser = (candidate: any) => {
        if (String(candidate.email ?? '').trim().toLowerCase() !== email) {
          strapi.log.warn(
            `[sso] rejected: ${email} did not exactly match the resolved account ${candidate.email} (ip=${ctx.ip})`
          );
          ctx.status = 403;
          ctx.body = 'Forbidden';
          return true;
        }

        if ((candidate.roles ?? []).some((role: any) => role?.code === SUPER_ADMIN_CODE)) {
          strapi.log.warn(
            `[sso] rejected: ${email} holds Super Admin — Super Admins must use password login at ${adminPath}/auth/login`
          );
          ctx.status = 403;
          ctx.body = 'Super Admin accounts must sign in with a password';
          return true;
        }

        if (!candidate.isActive) {
          strapi.log.warn(`[sso] rejected: ${email} exists but is deactivated`);
          ctx.status = 403;
          ctx.body = 'Account disabled';
          return true;
        }

        return false;
      };

      let user = await userService.findOneByEmail(email, ['roles']);

      if (user && denyExistingUser(user)) {
        return;
      }

      if (!user) {
        const role = await strapi.db.query('admin::role').findOne({
          where: { $or: [{ name: defaultRoleName }, { code: defaultRoleName }] },
        });

        if (!role) {
          strapi.log.error(`[sso] rejected: SSO_DEFAULT_ROLE "${defaultRoleName}" does not exist`);
          ctx.status = 403;
          ctx.body = 'Forbidden';
          return;
        }

        if (role.code === SUPER_ADMIN_CODE) {
          strapi.log.error('[sso] rejected: SSO_DEFAULT_ROLE resolves to Super Admin, refusing to auto-provision');
          ctx.status = 403;
          ctx.body = 'Forbidden';
          return;
        }

        const displayName = ctx.get('x-auth-request-preferred-username') || ctx.get('x-auth-request-user');
        const { firstname, lastname } = splitName(displayName, email);

        try {
          user = await userService.create({
            email,
            firstname,
            lastname,
            isActive: true,
            roles: [role.id],
            password: crypto.randomBytes(32).toString('base64'),
            registrationToken: null,
          });
          strapi.log.info(`[sso] provisioned admin user ${email} with role ${role.name}`);
        } catch (error) {
          user = await userService.findOneByEmail(email, ['roles']);

          if (!user) {
            throw error;
          }

          strapi.log.warn(
            `[sso] provisioning ${email} failed (${(error as Error).message}) but the account now exists — reusing it`
          );

          if (denyExistingUser(user)) {
            return;
          }
        }
      }

      const sessionManager = strapi.sessionManager;
      if (!sessionManager) {
        strapi.log.error('[sso] session manager unavailable');
        ctx.status = 500;
        ctx.body = 'Internal Server Error';
        return;
      }

      const deviceId = crypto.randomUUID();
      await sessionManager('admin').invalidateRefreshToken(String(user.id));
      const { token: refreshToken } = await sessionManager('admin').generateRefreshToken(
        String(user.id),
        deviceId,
        { type: 'session' }
      );
      ctx.cookies.set(REFRESH_COOKIE_NAME, refreshToken, buildRefreshCookieOptions(strapi, ctx.request.secure));

      const accessResult = await sessionManager('admin').generateAccessToken(refreshToken);
      if ('error' in accessResult) {
        strapi.log.error('[sso] failed to mint access token');
        ctx.status = 500;
        ctx.body = 'Internal Server Error';
        return;
      }

      strapi.log.info(`[sso] login success for ${email} (id=${user.id})`);
      ctx.status = 200;
      ctx.type = 'html';
      ctx.body = renderBridgePage(accessResult.token, deviceId, adminPath);
    } catch (error) {
      strapi.log.error(`[sso] login failed for ${email}: ${(error as Error).message}`);
      ctx.status = 500;
      ctx.body = 'Internal Server Error';
    }
  };
};
