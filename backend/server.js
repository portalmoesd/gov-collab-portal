/**
 * GOV COLLAB PORTAL - Backend REST API (Node.js + Express + PostgreSQL)
 * Blueprint v2 (Definitive)
 *
 * This server serves both the API under /api and (optionally) static frontend files from backend/public.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!DATABASE_URL) {
  console.warn('[WARN] DATABASE_URL is not set. The server will fail when it tries to query the database.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render/Heroku style SSL
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  credentials: true,
}));

// ✅ Serve frontend (static files) from backend/public
// Put your login.html, styles.css, js/ folder, etc. inside backend/public/
app.use(express.static(path.join(__dirname, 'public')));

/** Utilities **/

function normalizeRoleKey(roleKey) {
  return String(roleKey || '').trim().toLowerCase();
}

async function queryOne(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

async function queryMany(text, params) {
  const res = await pool.query(text, params);
  return res.rows || [];
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid/expired token' });
  }
}

function requireRole(...allowedRoleKeys) {
  const allowed = new Set(allowedRoleKeys.map(normalizeRoleKey));
  return (req, res, next) => {
    const rk = normalizeRoleKey(req.user?.role_key);
    if (!allowed.has(rk)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

function requireAnyRole(allowedSet) {
  return (req, res, next) => {
    const rk = normalizeRoleKey(req.user?.role_key);
    if (!allowedSet.has(rk)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

const ROLE = {
  ADMIN: 'admin',
  CHAIRMAN: 'chairman',
  SUPERVISOR: 'supervisor',
  COLLABORATOR: 'collaborator',
  VIEWER: 'viewer',
  PROTOCOL: 'protocol',
};

const ANY_STAFF = new Set([ROLE.ADMIN, ROLE.CHAIRMAN, ROLE.SUPERVISOR, ROLE.COLLABORATOR, ROLE.PROTOCOL, ROLE.VIEWER]);

async function getUserByUsername(username) {
  return queryOne(
    `SELECT u.id, u.username, u.full_name, u.password_hash, u.is_active, r.role_key
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.username) = LOWER($1)`,
    [username]
  );
}

async function getUserById(userId) {
  return queryOne(
    `SELECT u.id, u.username, u.full_name, u.is_active, r.role_key
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [userId]
  );
}

async function getRoleIdByKey(roleKey) {
  const row = await queryOne(`SELECT id FROM roles WHERE role_key = $1`, [normalizeRoleKey(roleKey)]);
  return row?.id || null;
}

async function logAudit({ actor_user_id, action, entity_type, entity_id, details_json }) {
  try {
    await pool.query(
      `INSERT INTO audit_log(actor_user_id, action, entity_type, entity_id, details_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [actor_user_id || null, action, entity_type, entity_id || null, details_json || null]
    );
  } catch (e) {
    // non-fatal
    console.warn('[WARN] audit_log insert failed:', e.message);
  }
}

/** Health */
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 as ok');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Auth */
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username/password' });

  try {
    const user = await getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(403).json({ error: 'User is inactive' });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      {
        user_id: user.id,
        username: user.username,
        full_name: user.full_name,
        role_key: user.role_key,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    await logAudit({
      actor_user_id: user.id,
      action: 'LOGIN',
      entity_type: 'user',
      entity_id: user.id,
      details_json: { username: user.username }
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role_key: user.role_key,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Reference data */
app.get('/api/roles', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  try {
    const rows = await queryMany(`SELECT id, role_key, role_name FROM roles ORDER BY role_name ASC`, []);
    res.json({ roles: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sections', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  try {
    const rows = await queryMany(`SELECT id, section_key, section_name FROM sections ORDER BY sort_order ASC`, []);
    res.json({ sections: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/countries', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  try {
    const rows = await queryMany(`SELECT id, country_code, country_name FROM countries ORDER BY country_name ASC`, []);
    res.json({ countries: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Users (Admin) */
app.get('/api/admin/users', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  try {
    const rows = await queryMany(
      `SELECT u.id, u.username, u.full_name, u.is_active,
              r.role_key, r.role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.id DESC`,
      []
    );
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/users', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  const { username, full_name, password, role_key, is_active } = req.body || {};
  if (!username || !full_name || !password || !role_key) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const roleId = await getRoleIdByKey(role_key);
    if (!roleId) return res.status(400).json({ error: 'Invalid role_key' });

    const password_hash = await bcrypt.hash(String(password), 10);

    const row = await queryOne(
      `INSERT INTO users (username, full_name, password_hash, role_id, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, is_active`,
      [username, full_name, password_hash, roleId, is_active !== false]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'CREATE_USER',
      entity_type: 'user',
      entity_id: row.id,
      details_json: { username, role_key }
    });

    res.status(201).json({ user: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  const userId = Number(req.params.id);
  const { full_name, password, role_key, is_active } = req.body || {};

  try {
    const existing = await queryOne(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    let roleId = null;
    if (role_key) {
      roleId = await getRoleIdByKey(role_key);
      if (!roleId) return res.status(400).json({ error: 'Invalid role_key' });
    }

    let password_hash = null;
    if (password) {
      password_hash = await bcrypt.hash(String(password), 10);
    }

    const row = await queryOne(
      `UPDATE users
       SET full_name = COALESCE($2, full_name),
           password_hash = COALESCE($3, password_hash),
           role_id = COALESCE($4, role_id),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, full_name, is_active`,
      [userId, full_name || null, password_hash || null, roleId || null, typeof is_active === 'boolean' ? is_active : null]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'UPDATE_USER',
      entity_type: 'user',
      entity_id: userId,
      details_json: { full_name, role_key, is_active: typeof is_active === 'boolean' ? is_active : undefined, password_changed: !!password }
    });

    res.json({ user: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Section assignments (Admin) */
app.get('/api/admin/assignments', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  try {
    const rows = await queryMany(
      `SELECT sa.id, sa.user_id, u.username, u.full_name,
              sa.section_id, s.section_key, s.section_name
       FROM section_assignments sa
       JOIN users u ON u.id = sa.user_id
       JOIN sections s ON s.id = sa.section_id
       ORDER BY sa.id DESC`,
      []
    );
    res.json({ assignments: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/assignments', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  const { user_id, section_id } = req.body || {};
  if (!user_id || !section_id) return res.status(400).json({ error: 'Missing user_id/section_id' });

  try {
    const row = await queryOne(
      `INSERT INTO section_assignments (user_id, section_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, section_id) DO NOTHING
       RETURNING id, user_id, section_id`,
      [Number(user_id), Number(section_id)]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'ASSIGN_SECTION',
      entity_type: 'section_assignment',
      entity_id: row?.id || null,
      details_json: { user_id, section_id }
    });

    res.status(201).json({ assignment: row || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/assignments/:id', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const row = await queryOne(`DELETE FROM section_assignments WHERE id = $1 RETURNING id`, [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'REMOVE_SECTION_ASSIGNMENT',
      entity_type: 'section_assignment',
      entity_id: id,
      details_json: {}
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Events */
app.get('/api/events', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  const { country_id, status } = req.query || {};
  try {
    const params = [];
    const where = [];

    if (country_id) {
      params.push(Number(country_id));
      where.push(`e.country_id = $${params.length}`);
    }
    if (status) {
      params.push(String(status));
      where.push(`e.status = $${params.length}`);
    }

    const sql = `
      SELECT e.id, e.title, e.meeting_date, e.status,
             e.country_id, c.country_name,
             e.created_by_user_id, u.username AS created_by_username,
             e.created_at, e.updated_at
      FROM events e
      JOIN countries c ON c.id = e.country_id
      JOIN users u ON u.id = e.created_by_user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.meeting_date DESC, e.id DESC
    `;

    const rows = await queryMany(sql, params);
    res.json({ events: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', requireAuth, requireAnyRole(new Set([ROLE.ADMIN, ROLE.CHAIRMAN, ROLE.SUPERVISOR, ROLE.PROTOCOL])), async (req, res) => {
  const { title, meeting_date, country_id } = req.body || {};
  if (!title || !meeting_date || !country_id) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const row = await queryOne(
      `INSERT INTO events (title, meeting_date, country_id, status, created_by_user_id)
       VALUES ($1, $2, $3, 'DRAFT', $4)
       RETURNING id, title, meeting_date, status, country_id, created_by_user_id, created_at`,
      [String(title), String(meeting_date), Number(country_id), req.user.user_id]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'CREATE_EVENT',
      entity_type: 'event',
      entity_id: row.id,
      details_json: { title, meeting_date, country_id }
    });

    res.status(201).json({ event: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/events/:id', requireAuth, requireAnyRole(new Set([ROLE.ADMIN, ROLE.CHAIRMAN, ROLE.SUPERVISOR, ROLE.PROTOCOL])), async (req, res) => {
  const id = Number(req.params.id);
  const { title, meeting_date, country_id, status } = req.body || {};

  try {
    const existing = await queryOne(`SELECT id FROM events WHERE id = $1`, [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const row = await queryOne(
      `UPDATE events
       SET title = COALESCE($2, title),
           meeting_date = COALESCE($3, meeting_date),
           country_id = COALESCE($4, country_id),
           status = COALESCE($5, status),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, meeting_date, status, country_id, updated_at`,
      [id, title || null, meeting_date || null, country_id ? Number(country_id) : null, status || null]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'UPDATE_EVENT',
      entity_type: 'event',
      entity_id: id,
      details_json: { title, meeting_date, country_id, status }
    });

    res.json({ event: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Documents (Talking Points / Info Doc / etc) */
app.get('/api/events/:eventId/docs', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  const eventId = Number(req.params.eventId);
  try {
    const rows = await queryMany(
      `SELECT d.id, d.event_id, d.section_id, s.section_key, s.section_name,
              d.doc_type, d.status, d.content_html, d.updated_at,
              d.created_by_user_id, u.username AS created_by_username
       FROM documents d
       JOIN sections s ON s.id = d.section_id
       JOIN users u ON u.id = d.created_by_user_id
       WHERE d.event_id = $1
       ORDER BY s.sort_order ASC, d.doc_type ASC`,
      [eventId]
    );
    res.json({ documents: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events/:eventId/docs', requireAuth, requireAnyRole(new Set([ROLE.ADMIN, ROLE.SUPERVISOR, ROLE.COLLABORATOR, ROLE.PROTOCOL, ROLE.CHAIRMAN])), async (req, res) => {
  const eventId = Number(req.params.eventId);
  const { section_id, doc_type, content_html, status } = req.body || {};

  if (!section_id || !doc_type) return res.status(400).json({ error: 'Missing section_id/doc_type' });

  try {
    const row = await queryOne(
      `INSERT INTO documents (event_id, section_id, doc_type, content_html, status, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, section_id, doc_type)
       DO UPDATE SET content_html = EXCLUDED.content_html,
                     status = COALESCE(EXCLUDED.status, documents.status),
                     updated_at = NOW()
       RETURNING id, event_id, section_id, doc_type, status, updated_at`,
      [
        eventId,
        Number(section_id),
        String(doc_type),
        content_html || '',
        status || 'DRAFT',
        req.user.user_id
      ]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'UPSERT_DOCUMENT',
      entity_type: 'document',
      entity_id: row.id,
      details_json: { event_id: eventId, section_id, doc_type, status: row.status }
    });

    res.status(201).json({ document: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Library */
app.get('/api/library', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  const { country_id } = req.query || {};
  try {
    const params = [];
    const where = [`d.status = 'APPROVED'`];

    if (country_id) {
      params.push(Number(country_id));
      where.push(`e.country_id = $${params.length}`);
    }

    const rows = await queryMany(
      `SELECT d.id, d.doc_type, d.section_id, s.section_name,
              d.event_id, e.title AS event_title, e.meeting_date, c.country_name,
              d.updated_at
       FROM documents d
       JOIN events e ON e.id = d.event_id
       JOIN countries c ON c.id = e.country_id
       JOIN sections s ON s.id = d.section_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.meeting_date DESC, s.sort_order ASC, d.doc_type ASC`,
      params
    );

    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Calendar Events */
app.get('/api/calendar', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  try {
    const rows = await queryMany(
      `SELECT id, title, start_ts, end_ts, location, description, created_by_user_id, created_at
       FROM calendar_events
       ORDER BY start_ts ASC`,
      []
    );
    res.json({ calendar_events: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/calendar', requireAuth, requireAnyRole(new Set([ROLE.ADMIN, ROLE.PROTOCOL, ROLE.SUPERVISOR, ROLE.CHAIRMAN])), async (req, res) => {
  const { title, start_ts, end_ts, location, description } = req.body || {};
  if (!title || !start_ts) return res.status(400).json({ error: 'Missing title/start_ts' });

  try {
    const row = await queryOne(
      `INSERT INTO calendar_events (title, start_ts, end_ts, location, description, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, start_ts, end_ts, location, description, created_at`,
      [String(title), String(start_ts), end_ts ? String(end_ts) : null, location || null, description || null, req.user.user_id]
    );

    await logAudit({
      actor_user_id: req.user.user_id,
      action: 'CREATE_CALENDAR_EVENT',
      entity_type: 'calendar_event',
      entity_id: row.id,
      details_json: { title, start_ts, end_ts }
    });

    res.status(201).json({ calendar_event: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Stats */
app.get('/api/stats/overview', requireAuth, requireAnyRole(ANY_STAFF), async (req, res) => {
  try {
    const [eventsCount, docsCount, approvedCount] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS n FROM events`, []),
      queryOne(`SELECT COUNT(*)::int AS n FROM documents`, []),
      queryOne(`SELECT COUNT(*)::int AS n FROM documents WHERE status='APPROVED'`, []),
    ]);

    res.json({
      events_total: eventsCount?.n || 0,
      documents_total: docsCount?.n || 0,
      documents_approved: approvedCount?.n || 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Audit log (Admin) */
app.get('/api/admin/audit', requireAuth, requireRole(ROLE.ADMIN), async (req, res) => {
  try {
    const rows = await queryMany(
      `SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details_json,
              u.username AS actor_username, u.full_name AS actor_full_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.id DESC
       LIMIT 500`,
      []
    );
    res.json({ audit: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Not found handler for API */
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/** Start */
app.listen(PORT, () => {
  console.log(`GOV COLLAB PORTAL API listening on port ${PORT}`);
});

