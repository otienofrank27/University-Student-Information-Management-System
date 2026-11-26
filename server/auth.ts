import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export interface AuthUser {
  userId: number;
  username: string;
  fullName: string;
  email: string;
  department: string;
  hasRecoveryPin?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

const STANDARD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const EXTENDED_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ID_MAX_FAILURES = 5;
const LOGIN_IP_MAX_FAILURES = 20;
const RESET_ID_MAX_FAILURES = 5;
const RESET_IP_MAX_FAILURES = 15;
const SIGNUP_IP_MAX_ATTEMPTS = 12;

const SESSION_SIGNING_KEY = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

// Constant-time guard used when an identifier does not match any user record
const DUMMY_SCRYPT_HASH = hashPassword('usims-constant-time-verification-guard');

function hashToken(rawToken: string): string {
  return crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(rawToken).digest('hex');
}

function getClientIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.slice(0, 80);
}

function getDeviceLabel(req: Request): string {
  const ua = req.get('user-agent') || '';
  if (!ua) return 'Browser Session';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('curl/')) browser = 'CLI Client';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function checkLockout(keys: string[]): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let maxRetry = 0;

  for (const key of keys) {
    const row = db
      .prepare('SELECT locked_until FROM auth_attempts WHERE attempt_key = ?')
      .get(key) as { locked_until: number } | undefined;
    if (row && row.locked_until > now) {
      const remaining = Math.ceil((row.locked_until - now) / 1000);
      if (remaining > maxRetry) {
        maxRetry = remaining;
      }
    }
  }

  return {
    locked: maxRetry > 0,
    retryAfterSeconds: maxRetry,
  };
}

function recordFailure(
  key: string,
  maxFailures: number,
  baseLockMs: number,
  escalatedLockMs?: number
): { locked: boolean; retryAfterSeconds: number; failures: number } {
  const now = Date.now();
  const row = db
    .prepare(
      'SELECT failures, first_failure_at, locked_until FROM auth_attempts WHERE attempt_key = ?'
    )
    .get(key) as
    | { failures: number; first_failure_at: number; locked_until: number }
    | undefined;

  let failures = 1;
  let firstFailureAt = now;
  let lockedUntil = 0;

  if (row) {
    const windowExpired =
      now - row.first_failure_at > ATTEMPT_WINDOW_MS && row.locked_until <= now;
    if (!windowExpired) {
      failures = row.failures + 1;
      firstFailureAt = row.first_failure_at;
      lockedUntil = row.locked_until;
    }
  }

  if (failures >= maxFailures) {
    const lockDuration =
      escalatedLockMs && failures >= maxFailures + 3 ? escalatedLockMs : baseLockMs;
    lockedUntil = Math.max(lockedUntil, now + lockDuration);
  }

  db.prepare(`
    INSERT INTO auth_attempts (attempt_key, failures, first_failure_at, locked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      failures = excluded.failures,
      first_failure_at = excluded.first_failure_at,
      locked_until = excluded.locked_until
  `).run(key, failures, firstFailureAt, lockedUntil);

  const retryAfterSeconds =
    lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;

  return {
    locked: retryAfterSeconds > 0,
    retryAfterSeconds,
    failures,
  };
}

function clearFailures(keys: string[]): void {
  const stmt = db.prepare('DELETE FROM auth_attempts WHERE attempt_key = ?');
  for (const key of keys) {
    stmt.run(key);
  }
}

function createSession(
  userId: number,
  options: { rememberExtended?: boolean; deviceLabel?: string } = {}
): string {
  const now = Date.now();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlMs = options.rememberExtended ? EXTENDED_SESSION_TTL_MS : STANDARD_SESSION_TTL_MS;
  const expiresAt = now + ttlMs;
  const deviceLabel = options.deviceLabel || 'Browser Session';

  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
  db.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_active_at, device_label)
    VALUES (?, ?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt, now, deviceLabel);

  return rawToken;
}

export function authenticateMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in or create an account.' });
    return;
  }
  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare(`
      SELECT
        s.token_hash,
        s.expires_at,
        s.last_active_at,
        u.user_id,
        u.username,
        u.full_name,
        u.email,
        u.department,
        (u.recovery_hash IS NOT NULL) AS has_recovery_pin
      FROM auth_sessions s
      INNER JOIN app_users u ON s.user_id = u.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as
    | {
        token_hash: string;
        expires_at: number;
        last_active_at: number | null;
        user_id: number;
        username: string;
        full_name: string;
        email: string;
        department: string;
        has_recovery_pin: number;
      }
    | undefined;

  if (!session) {
    res.status(401).json({ error: 'Session not found or expired. Please sign in again.' });
    return;
  }

  const now = Date.now();
  if (now > session.expires_at) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }

  if (!session.last_active_at || now - session.last_active_at > 60_000) {
    db.prepare('UPDATE auth_sessions SET last_active_at = ? WHERE token_hash = ?').run(
      now,
      tokenHash
    );
  }

  req.user = {
    userId: session.user_id,
    username: session.username,
    fullName: session.full_name,
    email: session.email,
    department: session.department,
    hasRecoveryPin: Boolean(session.has_recovery_pin),
  };
  req.sessionToken = rawToken;
  next();
}

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/status', (_req, res) => {
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM app_users').get() as { cnt: number };
    res.json({ hasUsers: row.cnt > 0 });
  });

  app.post('/api/auth/signup', (req, res) => {
    const clientIp = getClientIp(req);
    const signupIpKey = `signup:ip:${clientIp}`;
    const lock = checkLockout([signupIpKey]);
    if (lock.locked) {
      res.setHeader('Retry-After', String(lock.retryAfterSeconds));
      res.status(429).json({
        error: `Too many account registration attempts from this connection. Please try again in ${formatDuration(lock.retryAfterSeconds)}.`,
        retryAfterSeconds: lock.retryAfterSeconds,
      });
      return;
    }

    const { fullName, username, email, department, password, recoveryPin } = req.body ?? {};

    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
      res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
      return;
    }
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
      res.status(400).json({
        error: 'Username must be 3–32 characters (letters, numbers, dots, underscores, or hyphens).',
      });
      return;
    }
    if (
      typeof email !== 'string' ||
      email.trim().length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      res.status(400).json({ error: 'Provide a valid email address.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      return;
    }

    let cleanRecoveryPin = '';
    if (recoveryPin !== undefined && recoveryPin !== null && recoveryPin !== '') {
      if (typeof recoveryPin !== 'string') {
        res.status(400).json({ error: 'Recovery PIN must be a valid text value.' });
        return;
      }
      cleanRecoveryPin = recoveryPin.trim();
      if (cleanRecoveryPin.length > 0 && (cleanRecoveryPin.length < 4 || cleanRecoveryPin.length > 24)) {
        res.status(400).json({ error: 'Recovery PIN must be between 4 and 24 characters.' });
        return;
      }
    }

    recordFailure(signupIpKey, SIGNUP_IP_MAX_ATTEMPTS, 15 * 60 * 1000);

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim();
    const cleanDept =
      typeof department === 'string' && department.trim()
        ? department.trim().slice(0, 100)
        : 'Academic Registry';

    try {
      const passwordHash = hashPassword(password);
      const recoveryHash = cleanRecoveryPin ? hashPassword(cleanRecoveryPin) : null;
      const inserted = db
        .prepare(`
          INSERT INTO app_users (username, full_name, email, department, password_hash, recovery_hash)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(cleanUsername, cleanFullName, cleanEmail, cleanDept, passwordHash, recoveryHash);

      const userId = Number(inserted.lastInsertRowid);
      const token = createSession(userId, { deviceLabel: getDeviceLabel(req) });

      res.status(201).json({
        token,
        user: {
          userId,
          username: cleanUsername,
          fullName: cleanFullName,
          email: cleanEmail,
          department: cleanDept,
          hasRecoveryPin: Boolean(recoveryHash),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE constraint failed: app_users.username')) {
        res.status(409).json({ error: 'That username is already taken.' });
        return;
      }
      if (msg.includes('UNIQUE constraint failed: app_users.email')) {
        res.status(409).json({ error: 'An account with that email address already exists.' });
        return;
      }
      res.status(400).json({ error: 'Unable to create account with the provided details.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password, rememberExtended } = req.body ?? {};
    if (
      typeof identifier !== 'string' ||
      typeof password !== 'string' ||
      !identifier.trim() ||
      !password ||
      identifier.trim().length > 120 ||
      password.length > 256
    ) {
      res.status(400).json({ error: 'Enter your username or email and password.' });
      return;
    }

    const cleanId = identifier.trim().toLowerCase();
    const clientIp = getClientIp(req);
    const idKey = `login:id:${cleanId}`;
    const ipKey = `login:ip:${clientIp}`;

    const preLock = checkLockout([idKey, ipKey]);
    if (preLock.locked) {
      res.setHeader('Retry-After', String(preLock.retryAfterSeconds));
      res.status(429).json({
        error: `Sign-in is temporarily locked due to repeated failed attempts. Try again in ${formatDuration(preLock.retryAfterSeconds)}.`,
        retryAfterSeconds: preLock.retryAfterSeconds,
      });
      return;
    }

    const userRow = db
      .prepare(`
        SELECT
          user_id,
          username,
          full_name,
          email,
          department,
          password_hash,
          (recovery_hash IS NOT NULL) AS has_recovery_pin
        FROM app_users
        WHERE LOWER(username) = ? OR LOWER(email) = ?
      `)
      .get(cleanId, cleanId) as
      | {
          user_id: number;
          username: string;
          full_name: string;
          email: string;
          department: string;
          password_hash: string;
          has_recovery_pin: number;
        }
      | undefined;

    const passwordValid = userRow
      ? verifyPassword(password, userRow.password_hash)
      : verifyPassword(password, DUMMY_SCRYPT_HASH) && false;

    if (!userRow || !passwordValid) {
      const idOutcome = recordFailure(
        idKey,
        LOGIN_ID_MAX_FAILURES,
        5 * 60 * 1000,
        15 * 60 * 1000
      );
      const ipOutcome = recordFailure(ipKey, LOGIN_IP_MAX_FAILURES, 15 * 60 * 1000);
      const retryAfterSeconds = Math.max(
        idOutcome.retryAfterSeconds,
        ipOutcome.retryAfterSeconds
      );

      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: `Too many failed sign-in attempts. For your security, sign-in is locked for ${formatDuration(retryAfterSeconds)}.`,
          retryAfterSeconds,
        });
        return;
      }

      const remaining = LOGIN_ID_MAX_FAILURES - idOutcome.failures;
      const hint =
        remaining > 0 && remaining <= 2
          ? ` (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout.)`
          : '';

      res.status(401).json({ error: `Invalid username/email or password.${hint}` });
      return;
    }

    clearFailures([
      idKey,
      `login:id:${userRow.username.toLowerCase()}`,
      `login:id:${userRow.email.toLowerCase()}`,
    ]);

    const token = createSession(userRow.user_id, {
      rememberExtended: Boolean(rememberExtended),
      deviceLabel: getDeviceLabel(req),
    });

    res.json({
      token,
      user: {
        userId: userRow.user_id,
        username: userRow.username,
        fullName: userRow.full_name,
        email: userRow.email,
        department: userRow.department,
        hasRecoveryPin: Boolean(userRow.has_recovery_pin),
      },
    });
  });

  app.post('/api/auth/forgot-password/verify', (req, res) => {
    const { identifier, recoveryPin } = req.body ?? {};
    if (
      typeof identifier !== 'string' ||
      typeof recoveryPin !== 'string' ||
      !identifier.trim() ||
      !recoveryPin.trim() ||
      identifier.trim().length > 120 ||
      recoveryPin.trim().length > 64
    ) {
      res.status(400).json({ error: 'Enter both your username/email and your Recovery PIN.' });
      return;
    }

    const cleanId = identifier.trim().toLowerCase();
    const cleanPin = recoveryPin.trim();
    const clientIp = getClientIp(req);
    const idKey = `reset:id:${cleanId}`;
    const ipKey = `reset:ip:${clientIp}`;

    const preLock = checkLockout([idKey, ipKey]);
    if (preLock.locked) {
      res.setHeader('Retry-After', String(preLock.retryAfterSeconds));
      res.status(429).json({
        error: `Password recovery is temporarily locked due to repeated failed attempts. Try again in ${formatDuration(preLock.retryAfterSeconds)}.`,
        retryAfterSeconds: preLock.retryAfterSeconds,
      });
      return;
    }

    const userRow = db
      .prepare(`
        SELECT user_id, username, full_name, email, recovery_hash
        FROM app_users
        WHERE LOWER(username) = ? OR LOWER(email) = ?
      `)
      .get(cleanId, cleanId) as
      | {
          user_id: number;
          username: string;
          full_name: string;
          email: string;
          recovery_hash: string | null;
        }
      | undefined;

    if (!userRow) {
      verifyPassword(cleanPin, DUMMY_SCRYPT_HASH);
      const idOutcome = recordFailure(idKey, RESET_ID_MAX_FAILURES, 15 * 60 * 1000);
      const ipOutcome = recordFailure(ipKey, RESET_IP_MAX_FAILURES, 15 * 60 * 1000);
      const retryAfterSeconds = Math.max(
        idOutcome.retryAfterSeconds,
        ipOutcome.retryAfterSeconds
      );
      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: `Too many failed recovery attempts. Please wait ${formatDuration(retryAfterSeconds)} before trying again.`,
          retryAfterSeconds,
        });
        return;
      }
      res.status(401).json({ error: 'The account identifier or Recovery PIN could not be verified.' });
      return;
    }

    if (!userRow.recovery_hash) {
      verifyPassword(cleanPin, DUMMY_SCRYPT_HASH);
      recordFailure(ipKey, RESET_IP_MAX_FAILURES, 15 * 60 * 1000);
      res.status(400).json({
        error:
          'No Recovery PIN is configured for this account. Sign in with your password and add a Recovery PIN under Settings > Security & Sessions.',
      });
      return;
    }

    if (!verifyPassword(cleanPin, userRow.recovery_hash)) {
      const idOutcome = recordFailure(idKey, RESET_ID_MAX_FAILURES, 15 * 60 * 1000);
      const ipOutcome = recordFailure(ipKey, RESET_IP_MAX_FAILURES, 15 * 60 * 1000);
      const retryAfterSeconds = Math.max(
        idOutcome.retryAfterSeconds,
        ipOutcome.retryAfterSeconds
      );
      if (retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: `Too many failed recovery attempts. Please wait ${formatDuration(retryAfterSeconds)} before trying again.`,
          retryAfterSeconds,
        });
        return;
      }
      res.status(401).json({ error: 'The account identifier or Recovery PIN could not be verified.' });
      return;
    }

    clearFailures([idKey]);

    const now = Date.now();
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashToken(rawResetToken);

    db.transaction(() => {
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?').run(
        userRow.user_id,
        now
      );
      db.prepare(`
        INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used, created_at)
        VALUES (?, ?, ?, 0, ?)
      `).run(resetTokenHash, userRow.user_id, now + RESET_TOKEN_TTL_MS, now);
    })();

    res.json({
      resetToken: rawResetToken,
      expiresInSeconds: Math.floor(RESET_TOKEN_TTL_MS / 1000),
      username: userRow.username,
      fullName: userRow.full_name,
    });
  });

  app.post('/api/auth/forgot-password/reset', (req, res) => {
    const { resetToken, newPassword } = req.body ?? {};
    if (typeof resetToken !== 'string' || !resetToken.trim()) {
      res.status(400).json({ error: 'Missing password reset verification token.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
      return;
    }

    const now = Date.now();
    const tokenHash = hashToken(resetToken.trim());
    const resetRow = db
      .prepare(`
        SELECT r.token_hash, r.user_id, r.expires_at, r.used, u.username, u.email
        FROM password_reset_tokens r
        INNER JOIN app_users u ON r.user_id = u.user_id
        WHERE r.token_hash = ?
      `)
      .get(tokenHash) as
      | {
          token_hash: string;
          user_id: number;
          expires_at: number;
          used: number;
          username: string;
          email: string;
        }
      | undefined;

    if (!resetRow || resetRow.used !== 0 || now > resetRow.expires_at) {
      res.status(400).json({
        error: 'This password reset session has expired or was already used. Please verify your Recovery PIN again.',
      });
      return;
    }

    const nextHash = hashPassword(newPassword);
    db.transaction(() => {
      db.prepare('UPDATE app_users SET password_hash = ? WHERE user_id = ?').run(
        nextHash,
        resetRow.user_id
      );
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?').run(
        resetRow.user_id
      );
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(resetRow.user_id);
    })();

    clearFailures([
      `login:id:${resetRow.username.toLowerCase()}`,
      `login:id:${resetRow.email.toLowerCase()}`,
      `reset:id:${resetRow.username.toLowerCase()}`,
      `reset:id:${resetRow.email.toLowerCase()}`,
    ]);

    res.json({
      message: 'Your password has been reset and previous sessions were signed out. You may now sign in.',
    });
  });

  app.post('/api/auth/logout', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    if (req.sessionToken) {
      db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(req.sessionToken));
    }
    res.json({ message: 'Signed out successfully.' });
  });

  app.get('/api/auth/me', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  app.put('/api/auth/profile', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const { fullName, username, email, department } = req.body ?? {};

    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
      res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
      return;
    }
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
      res.status(400).json({
        error: 'Username must be 3–32 characters (letters, numbers, dots, underscores, or hyphens).',
      });
      return;
    }
    if (
      typeof email !== 'string' ||
      email.trim().length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      res.status(400).json({ error: 'Provide a valid email address.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim();
    const cleanDept =
      typeof department === 'string' && department.trim()
        ? department.trim().slice(0, 100)
        : 'Academic Registry';

    try {
      db.prepare(`
        UPDATE app_users
        SET full_name = ?, username = ?, email = ?, department = ?
        WHERE user_id = ?
      `).run(cleanFullName, cleanUsername, cleanEmail, cleanDept, req.user.userId);

      res.json({
        user: {
          userId: req.user.userId,
          username: cleanUsername,
          fullName: cleanFullName,
          email: cleanEmail,
          department: cleanDept,
          hasRecoveryPin: req.user.hasRecoveryPin,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE constraint failed: app_users.username')) {
        res.status(409).json({ error: 'That username is already taken.' });
        return;
      }
      if (msg.includes('UNIQUE constraint failed: app_users.email')) {
        res.status(409).json({ error: 'An account with that email address already exists.' });
        return;
      }
      res.status(400).json({ error: 'Unable to update profile.' });
    }
  });

  app.put('/api/auth/password', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !currentPassword) {
      res.status(400).json({ error: 'Current password is required.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
      return;
    }

    const row = db
      .prepare('SELECT password_hash FROM app_users WHERE user_id = ?')
      .get(req.user.userId) as { password_hash: string } | undefined;

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    const currentTokenHash = req.sessionToken ? hashToken(req.sessionToken) : '';

    const revoked = db.transaction(() => {
      db.prepare('UPDATE app_users SET password_hash = ? WHERE user_id = ?').run(
        nextHash,
        req.user!.userId
      );
      if (currentTokenHash) {
        const info = db
          .prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?')
          .run(req.user!.userId, currentTokenHash);
        return info.changes;
      }
      return 0;
    })();

    res.json({
      message: 'Password updated successfully.',
      revokedOtherSessions: revoked,
    });
  });

  app.put('/api/auth/recovery-pin', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { currentPassword, recoveryPin } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !currentPassword) {
      res.status(400).json({ error: 'Current password is required to update your Recovery PIN.' });
      return;
    }
    if (
      typeof recoveryPin !== 'string' ||
      recoveryPin.trim().length < 4 ||
      recoveryPin.trim().length > 24
    ) {
      res.status(400).json({ error: 'Recovery PIN must be between 4 and 24 characters.' });
      return;
    }

    const row = db
      .prepare('SELECT password_hash FROM app_users WHERE user_id = ?')
      .get(req.user.userId) as { password_hash: string } | undefined;

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextRecoveryHash = hashPassword(recoveryPin.trim());
    db.prepare('UPDATE app_users SET recovery_hash = ? WHERE user_id = ?').run(
      nextRecoveryHash,
      req.user.userId
    );

    res.json({
      message: 'Recovery PIN saved. You can now use it for self-service password recovery.',
      hasRecoveryPin: true,
    });
  });

  app.get('/api/auth/sessions', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const now = Date.now();
    db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
    const currentHash = req.sessionToken ? hashToken(req.sessionToken) : '';
    const rows = db
      .prepare(`
        SELECT token_hash, expires_at, last_active_at, device_label, created_at
        FROM auth_sessions
        WHERE user_id = ? AND expires_at > ?
        ORDER BY COALESCE(last_active_at, 0) DESC, created_at DESC
      `)
      .all(req.user.userId, now) as Array<{
      token_hash: string;
      expires_at: number;
      last_active_at: number | null;
      device_label: string | null;
      created_at: string;
    }>;

    res.json({
      activeSessions: rows.length,
      sessions: rows.map((row) => ({
        deviceLabel: row.device_label || 'Browser Session',
        lastActiveAt: row.last_active_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        isCurrent: row.token_hash === currentHash,
      })),
    });
  });

  app.delete('/api/auth/sessions/others', authenticateMiddleware, (req: AuthenticatedRequest, res) => {
    if (!req.user || !req.sessionToken) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const currentHash = hashToken(req.sessionToken);
    const info = db
      .prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?')
      .run(req.user.userId, currentHash);
    res.json({
      revokedCount: info.changes,
      message:
        info.changes > 0
          ? `Signed out ${info.changes} other active session(s).`
          : 'No other active sessions were found.',
    });
  });
}
