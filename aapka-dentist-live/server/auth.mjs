import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_MS = 8 * 60 * 60 * 1000;
const COOKIE = 'aapka_staff_session';
const sessions = new Map();
const attempts = new Map();

export function makePasswordHash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  const [algorithm, saltText, keyText] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !saltText || !keyText) return false;
  try {
    const expected = Buffer.from(keyText, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

function cookieValue(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : '';
}

export function createAuth({ email, passwordHash }) {
  const configured = Boolean(email && passwordHash?.startsWith('scrypt$'));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return {
    configured,
    async login(req, emailInput, password) {
      const now = Date.now(), ip = req.socket.remoteAddress || 'unknown';
      for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
      let record = attempts.get(ip);
      if (!record || record.until < now) record = { count: 0, until: now + 15 * 60 * 1000 };
      if (record.count >= 5) return { ok: false, status: 429, error: 'Too many sign-in attempts. Wait 15 minutes and try again.' };
      record.count++;
      attempts.set(ip, record);
      if (!configured) return { ok: false, status: 503, error: 'Staff sign-in has not been configured by the clinic owner.' };
      const emailOk = String(emailInput || '').trim().toLowerCase() === email.trim().toLowerCase();
      const passwordOk = verifyPassword(String(password || ''), passwordHash);
      if (!emailOk || !passwordOk) return { ok: false, status: 401, error: 'Email or password is incorrect.' };
      attempts.delete(ip);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { email: email.trim(), expires: now + SESSION_MS });
      return { ok: true, email: email.trim(), cookie: `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}` };
    },
    staff(req) {
      const token = cookieValue(req), session = sessions.get(token);
      if (!session) return null;
      if (session.expires <= Date.now()) { sessions.delete(token); return null; }
      session.expires = Date.now() + SESSION_MS;
      return { email: session.email, role: 'receptionist' };
    },
    logout(req) {
      sessions.delete(cookieValue(req));
      return `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
    }
  };
}
