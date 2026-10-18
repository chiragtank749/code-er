// Trusted return destination: from server configuration only, never from a request.
export function safeUrl(raw) {
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.username || u.password) return null;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return u;
}

// LAUNCHDECK_RETURN_URL is used only when its origin exactly matches LAUNCHDECK_PORTAL_URL.
export function resolveReturnUrl(portalRaw, returnRaw) {
  const portal = safeUrl(portalRaw);
  if (!portal) return null;
  const ret = safeUrl(returnRaw);
  if (ret && ret.origin === portal.origin) return ret.href;
  return portal.href;
}
