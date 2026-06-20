// ============================================================
// Lightweight User-Agent -> human-readable device string.
// Deliberately not a full UA-parsing library (ua-parser-js etc.)
// — this only needs to produce "Chrome on Windows" style output
// for a notification email, not perfect device fingerprinting.
// ============================================================
export function describeDevice(userAgent = '') {
  if (!userAgent) return 'Unknown device';

  let browser = 'Unknown browser';
  if (/edg\//i.test(userAgent)) browser = 'Edge';
  else if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/safari\//i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) browser = 'Opera';

  let os = 'Unknown OS';
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
  else if (/mac os x/i.test(userAgent)) os = 'macOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  return `${browser} on ${os}`;
}

// Extracts a best-effort client IP from the request, accounting for
// Render's reverse proxy setting X-Forwarded-For. Since app.set('trust
// proxy', 1) is already configured in server.js, req.ip handles this
// correctly — this helper just makes the call site read clearly.
export function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'Unknown IP';
}
