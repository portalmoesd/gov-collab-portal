/**
 * GOV COLLAB PORTAL - Backend REST API (Node.js + Express + PostgreSQL)
 * Blueprint v2 (Definitive)
 *
 * This server is JSON-only (no HTML pages). All routes live under /api.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL env var.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render/Heroku style SSL
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

const app = express();

// Avoid 304/ETag issues for fetch() on API endpoints
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  credentials: true,
}));

/** Utilities **/

async function ensureSchema() {

  // Ensure tp_content columns exist for legacy databases
  await pool.query(`
    ALTER TABLE tp_content
      ADD COLUMN IF NOT EXISTS last_updated_by_user_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `).catch(()=>{});

  // Lightweight, idempotent DDL to keep Render deployments working
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ended_by_user_id INTEGER`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS country_assignments (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      country_id INTEGER REFERENCES countries(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, country_id)
    )
  `);

  // Document status: avoid enum mismatch and keep audit columns consistent
  await pool.query(`ALTER TABLE document_status ADD COLUMN IF NOT EXISTS last_updated_by_user_id INTEGER`).catch(()=>{});
  await pool.query(`ALTER TABLE document_status ADD COLUMN IF NOT EXISTS chairman_comment TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE document_status ALTER COLUMN status TYPE TEXT USING status::text`).catch(()=>{});
}

async function ensureRolesExist() {
  const roles = [
    ['admin','Admin'],
    ['minister','Minister'],
    ['chairman','Deputy'],
    ['supervisor','Supervisor'],
    ['protocol','Protocol'],
    ['super_collaborator','Super-collaborator'],
    ['collaborator','Collaborator'],
    ['viewer','Viewer'],
  ];
  for (const [key,label] of roles){
    await pool.query(
      `INSERT INTO roles(key,label) VALUES($1,$2) ON CONFLICT (key) DO NOTHING`,
      [key,label]
    );
  }
}

async function resolveCountryIdForEvent(eventId){
  const row = await queryOne(`SELECT country_id FROM events WHERE id=$1`, [eventId]);
  return row ? row.country_id : null;
}

async function getAssignedCountryIds(userId){
  const rows = await queryAll(`SELECT country_id FROM country_assignments WHERE user_id=$1`, [userId]);
  return rows.map(r => Number(r.country_id));
}

async function getAssignedSectionIds(userId){
  const rows = await queryAll(`SELECT section_id FROM section_assignments WHERE user_id=$1`, [userId]);
  return rows.map(r => Number(r.section_id));
}

async function eventHasAnyRequiredSection(eventId, sectionIds){
  if (!sectionIds?.length) return false;
  const row = await queryOne(
    `SELECT 1 AS ok FROM event_required_sections WHERE event_id=$1 AND section_id = ANY($2::int[]) LIMIT 1`,
    [eventId, sectionIds]
  );
  return !!row;
}

async function userCanSeeEvent(user, event){
  const roleKey = normalizeRoleKey(user.role_key);
  if (roleKey !== 'collaborator' && roleKey !== 'super_collaborator') return true;

  const countries = await getAssignedCountryIds(user.id);
  if (!countries.includes(Number(event.country_id))) return false;

  const sections = await getAssignedSectionIds(user.id);
  return await eventHasAnyRequiredSection(event.id, sections);
}

async function assertUserCanAccessEventSection(user, eventId, sectionId){
  const roleKey = normalizeRoleKey(user.role_key);
  if (roleKey !== 'collaborator' && roleKey !== 'super_collaborator') return true;

  const event = await queryOne(`SELECT id, country_id FROM events WHERE id=$1`, [eventId]);
  if (!event) return false;

  const countries = await getAssignedCountryIds(user.id);
  if (!countries.includes(Number(event.country_id))) return false;

  const sections = await getAssignedSectionIds(user.id);
  if (!sections.includes(Number(sectionId))) return false;

  const required = await queryOne(
    `SELECT 1 AS ok FROM event_required_sections WHERE event_id=$1 AND section_id=$2`,
    [eventId, sectionId]
  );
  return !!required;
}


function normalizeRoleKey(roleKey) {
  const k0 = String(roleKey || '').trim().toLowerCase();
  const k = k0.replace(/-/g, '_');
  return k === 'deputy' ? 'chairman' : k;
}

async function queryOne(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

async function queryAll(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

function pickUserPayload(row) {
  // Blueprint wants: { id, fullName, email, role }
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role_key,
    username: row.username,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Missing Bearer token' });

  try {
    const token = m[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload; // { userId, role }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function attachUser(req, res, next) {
  if (!req.auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = await queryOne(
    `
    SELECT u.*, u.deleted_at, r.key AS role_key, r.label AS role_label
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    `,
    [req.auth.userId]
  );

  if (!user || !user.is_active || user.deleted_at) return res.status(401).json({ error: 'User inactive or not found' });

  // Normalize deputy display role to chairman key
  user.role_key = normalizeRoleKey(user.role_key);

  req.user = user;
  next();
}


function asyncRoute(fn){
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireRole(...allowed) {
  const allowedSet = new Set(allowed.map(normalizeRoleKey));
  return (req, res, next) => {
    const roleKey = normalizeRoleKey(req.user?.role_key);
    if (!allowedSet.has(roleKey)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

let __docStatusSchemaCache = null;
async function getDocumentStatusSchema() {
  if (__docStatusSchemaCache) return __docStatusSchemaCache;

  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='document_status'`
  );
  const set = new Set(r.rows.map(x => x.column_name));

  const hasCountryId = set.has('country_id');
  const tsCol = set.has('last_updated_at') ? 'last_updated_at'
              : (set.has('updated_at') ? 'updated_at'
              : (set.has('last_updated_on') ? 'last_updated_on' : null));
  const byCol = set.has('last_updated_by_user_id') ? 'last_updated_by_user_id'
              : (set.has('updated_by_user_id') ? 'updated_by_user_id'
              : (set.has('updated_by') ? 'updated_by' : null));
  const commentCol = set.has('chairman_comment') ? 'chairman_comment'
                 : (set.has('comment') ? 'comment'
                 : (set.has('return_comment') ? 'return_comment' : null));

  __docStatusSchemaCache = { hasCountryId, tsCol, byCol, commentCol };
  return __docStatusSchemaCache;
}

async function ensureDocumentStatus(eventId, countryId) {
  const schema = await getDocumentStatusSchema();
  if (schema.hasCountryId) {
    await pool.query(
      `
      INSERT INTO document_status (event_id, country_id, status)
      VALUES ($1, $2, 'in_progress')
      ON CONFLICT DO NOTHING
      `,
      [eventId, countryId]
    );
  } else {
    await pool.query(
      `
      INSERT INTO document_status (event_id, status)
      VALUES ($1, 'in_progress')
      ON CONFLICT DO NOTHING
      `,
      [eventId]
    );
  }
}

async function ensureTpRow(eventId, countryId, sectionId, userId){
  // tp_content is unique on (event_id, country_id, section_id) in the deployed DB
  await pool.query(
    `INSERT INTO tp_content (event_id, country_id, section_id, html_content, status, status_comment, last_updated_by_user_id, last_updated_at)
     VALUES ($1,$2,$3,'','draft',NULL,$4,NOW())
     ON CONFLICT (event_id, country_id, section_id) DO NOTHING`,
    [eventId, countryId, sectionId, userId]
  );
}

async function isCollaboratorAssignedToSection(userId, sectionId) {
  const row = await queryOne(
    `SELECT 1 FROM section_assignments WHERE user_id=$1 AND section_id=$2`,
    [userId, sectionId]
  );
  return !!row;
}

async function getEventWithSections(eventId, countryIdForStatuses = null) {
  const event = await queryOne(
    `
    SELECT e.*, c.name_en AS country_name_en, c.code AS country_code
    FROM events e
    JOIN countries c ON c.id = e.country_id
    WHERE e.id = $1
    `,
    [eventId]
  );
  if (!event) return null;

  const requiredSections = await queryAll(
    `
    SELECT s.id, s.key, s.label, s.order_index
    FROM event_required_sections ers
    JOIN sections s ON s.id = ers.section_id
    WHERE ers.event_id = $1
    ORDER BY s.order_index ASC, s.id ASC
    `,
    [eventId]
  );

  let sectionStatuses = null;
  if (countryIdForStatuses) {
    // Ensure rows exist for required sections to make dashboard deterministic.
    await ensureDocumentStatus(eventId, countryIdForStatuses);
    for (const s of requiredSections) {
      await ensureTpRow(eventId, countryIdForStatuses, s.id, null);
    }

    sectionStatuses = await queryAll(
      `
      SELECT t.section_id, t.status, t.status_comment, t.last_updated_at AS last_updated_at,
             u.full_name AS last_updated_by
      FROM tp_content t
      LEFT JOIN users u ON u.id = t.last_updated_by_user_id
      WHERE t.event_id = $1 AND t.country_id = $2
      `,
      [eventId, countryIdForStatuses]
    );
  }

  return {
    id: event.id,
    countryId: event.country_id,
    countryName: event.country_name_en,
    countryCode: event.country_code,
    title: event.title,
    occasion: event.occasion,
    deadlineDate: event.deadline_date,
    isActive: event.is_active,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    requiredSections,
    sectionStatuses,
  };
}

/** 7.1 Authentication **/

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = await queryOne(
    `
    SELECT u.*, r.key AS role_key
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.username = $1
    `,
    [String(username)]
  );

  if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { userId: user.id, role: user.role_key },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role_key,
    }
  });
});

app.get('/api/auth/me', authRequired, attachUser, async (req, res) => {
  const u = req.user;
  return res.json({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    role: u.role_key,
    username: u.username,
  });
});

// Alias endpoints (Spec v2)
app.get('/api/me', authRequired, attachUser, async (req, res) => {
  return res.json({
    id: req.user.id,
    username: req.user.username,
    fullName: req.user.full_name,
    email: req.user.email,
    role: req.user.role_key,
  });
});

app.get('/api/roles', authRequired, attachUser, requireRole('admin'), async (req, res) => {
  const rows = await queryAll(`SELECT key, label FROM roles ORDER BY id`, []);
  return res.json(rows);
});


/** Protected routes (everything below) **/
app.use('/api', authRequired, attachUser);

/** 7.2 Users (Admin only) **/
app.get('/api/users', requireRole('admin'), async (req, res) => {
  const rows = await queryAll(
    `
    SELECT u.*, r.key AS role_key
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.deleted_at IS NULL
    ORDER BY u.id ASC
    `,
    []
  );
  return res.json(rows.map(pickUserPayload));
});

app.post('/api/users', requireRole('admin'), async (req, res) => {
  try {
    const { username, password, fullName, email, role, isActive } = req.body || {};
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'username, password, fullName, role required' });
    }

    const roleKey = normalizeRoleKey(role);
    const roleRow = await queryOne(`SELECT id, key FROM roles WHERE key=$1`, [roleKey]);
    if (!roleRow) return res.status(400).json({ error: 'Invalid role' });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const created = await queryOne(
      `
      INSERT INTO users (username, password_hash, full_name, email, role_id, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id
      `,
      [String(username).trim(), passwordHash, String(fullName).trim(), email ? String(email).trim() : null, roleRow.id, isActive !== false]
    );

    const out = await queryOne(
      `
      SELECT u.*, r.key AS role_key
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
      `,
      [created.id]
    );

    return res.status(201).json(pickUserPayload(out));
  } catch (e) {
    // Handle common Postgres errors safely (prevent process crash / 502 on Render)
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    if (e && e.code === '23502') {
      return res.status(400).json({ error: 'Missing required field' });
    }
    console.error('Create user failed:', e);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});


app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
  try {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const { username, password, fullName, email, role, isActive } = req.body || {};

  const fields = [];
  const values = [];
  let idx = 1;

  if (username !== undefined) { fields.push(`username=$${idx++}`); values.push(String(username)); }
  if (fullName !== undefined) { fields.push(`full_name=$${idx++}`); values.push(String(fullName)); }
  if (email !== undefined) { fields.push(`email=$${idx++}`); values.push(email ? String(email) : null); }
  if (isActive !== undefined) { fields.push(`is_active=$${idx++}`); values.push(Boolean(isActive)); }

  if (role !== undefined) {
    const roleRow = await queryOne(`SELECT id FROM roles WHERE key=$1`, [normalizeRoleKey(role)]);
    if (!roleRow) return res.status(400).json({ error: 'Invalid role' });
    fields.push(`role_id=$${idx++}`);
    values.push(roleRow.id);
  }

  if (password !== undefined && String(password).length > 0) {
    const passwordHash = await bcrypt.hash(String(password), 10);
    fields.push(`password_hash=$${idx++}`);
    values.push(passwordHash);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  fields.push(`updated_at=NOW()`);

  values.push(id);

  await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id=$${idx}`,
    values
  );

  const out = await queryOne(
    `
    SELECT u.*, r.key AS role_key
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    `,
    [id]
  );

  if (!out) return res.status(404).json({ error: 'User not found' });

  
  // If user's final role is not collaborator/super-collaborator, clear assignments (Spec v2)
  const finalRole = normalizeRoleKey(out.role_key);
  if (!['collaborator','super_collaborator'].includes(finalRole)) {
    await pool.query(`DELETE FROM section_assignments WHERE user_id=$1`, [id]);
    await pool.query(`DELETE FROM country_assignments WHERE user_id=$1`, [id]);
  }

  return res.json(pickUserPayload(out));
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
    console.error('User update failed:', e);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  try {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  // Clear assignments (only relevant for collaborator / super_collaborator)
  await pool.query(`DELETE FROM section_assignments WHERE user_id=$1`, [id]);
  await pool.query(`DELETE FROM country_assignments WHERE user_id=$1`, [id]);

  // Soft delete (preserve history)
  await pool.query(
    `UPDATE users
     SET is_active=false,
         deleted_at=NOW(),
         deleted_by_user_id=$2,
         updated_at=NOW()
     WHERE id=$1`,
    [id, req.user.id]
  );

  return res.json({ ok: true });
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
    console.error('User update failed:', e);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

/** 7.3 Sections **/
app.get('/api/sections', async (req, res) => {
  // Needed by Calendar, dashboards and editor. Mutations remain Admin-only.
  // If ?mine=1, return only sections assigned to the current user (for collaborator dropdown).
  const mine = String(req.query.mine || '') === '1';

  if (mine) {
    const rows = await queryAll(
      `
      SELECT s.id, s.key, s.label, s.order_index, s.is_active
      FROM section_assignments sa
      JOIN sections s ON s.id = sa.section_id
      WHERE sa.user_id = $1 AND s.is_active = true
      ORDER BY s.order_index ASC, s.id ASC
      `,
      [req.user.id]
    );
    return res.json(rows);
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  const includeInactive = roleKey === 'admin';

  const rows = await queryAll(
    `
    SELECT id, key, label, order_index, is_active, created_at, updated_at
    FROM sections
    WHERE ($1::boolean = true) OR (is_active = true)
    ORDER BY order_index ASC, id ASC
    `,
    [includeInactive]
  );
  return res.json(rows);
});

app.post('/api/sections', requireRole('admin'), async (req, res) => {
  const { key, label, orderIndex } = req.body || {};
  if (!key || !label) return res.status(400).json({ error: 'key and label required' });

  const row = await queryOne(
    `
    INSERT INTO sections (key, label, order_index, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, true, NOW(), NOW())
    RETURNING *
    `,
    [String(key), String(label), Number(orderIndex) || 0]
  );
  return res.status(201).json(row);
});

app.put('/api/sections/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const { key, label, orderIndex, isActive } = req.body || {};
  const fields = [];
  const values = [];
  let idx = 1;

  if (key !== undefined) { fields.push(`key=$${idx++}`); values.push(String(key)); }
  if (label !== undefined) { fields.push(`label=$${idx++}`); values.push(String(label)); }
  if (orderIndex !== undefined) { fields.push(`order_index=$${idx++}`); values.push(Number(orderIndex) || 0); }
  if (isActive !== undefined) { fields.push(`is_active=$${idx++}`); values.push(Boolean(isActive)); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  fields.push(`updated_at=NOW()`);

  values.push(id);
  await pool.query(`UPDATE sections SET ${fields.join(', ')} WHERE id=$${idx}`, values);

  const out = await queryOne(`SELECT * FROM sections WHERE id=$1`, [id]);
  if (!out) return res.status(404).json({ error: 'Section not found' });
  return res.json(out);
});

app.delete('/api/sections/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  await pool.query(`UPDATE sections SET is_active=false, updated_at=NOW() WHERE id=$1`, [id]);
  return res.json({ ok: true });
});

/** 7.4 Section Assignments (Admin only) **/
app.get('/api/section-assignments', requireRole('admin'), async (req, res) => {
  const rows = await queryAll(
    `
    SELECT sa.id,
           sa.user_id, u.username, u.full_name,
           sa.section_id, s.label AS section_label,
           sa.created_at
    FROM section_assignments sa
    JOIN users u ON u.id = sa.user_id
    JOIN sections s ON s.id = sa.section_id
    ORDER BY sa.id ASC
    `,
    []
  );
  return res.json(rows);
});

app.post('/api/section-assignments', requireRole('admin'), async (req, res) => {
  const { userId, sectionId } = req.body || {};
  const uid = Number(userId);
  const sid = Number(sectionId);
  if (!Number.isFinite(uid) || !Number.isFinite(sid)) return res.status(400).json({ error: 'userId and sectionId required' });

  // Enforce "Only collaborators should be in this table" by app logic (blueprint).
  const user = await queryOne(
    `SELECT u.id, r.key AS role_key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
    [uid]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  const rk = normalizeRoleKey(user.role_key);
  if (!(rk === "collaborator" || rk === "super_collaborator")) return res.status(400).json({ error: 'Only collaborators or super-collaborators can be assigned to sections' });

  const ins = await queryOne(
    `
    INSERT INTO section_assignments (user_id, section_id, created_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id, section_id) DO NOTHING
    RETURNING id
    `,
    [uid, sid]
  );

  // If it already existed, fetch its id
  const row = ins || await queryOne(
    `SELECT id FROM section_assignments WHERE user_id=$1 AND section_id=$2`,
    [uid, sid]
  );

  return res.status(201).json({ id: row.id });
});

app.delete('/api/section-assignments/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  await pool.query(`DELETE FROM section_assignments WHERE id=$1`, [id]);
  return res.json({ ok: true });
});
/** Spec v2: Admin assignment bulk endpoints **/

// Consolidated assignments API (sections + countries) for collaborators/super collaborators
app.get('/api/admin/assignments/:userId', requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });

  const sec = await pool.query(`SELECT section_id FROM section_assignments WHERE user_id=$1 ORDER BY section_id`, [userId]);
  const c = await pool.query(`SELECT country_id FROM country_assignments WHERE user_id=$1 ORDER BY country_id`, [userId]);

  return res.json({
    sectionIds: sec.rows.map(r => r.section_id),
    countryIds: c.rows.map(r => r.country_id),
  });
});

app.post('/api/admin/assignments', requireRole('admin'), async (req, res) => {
  const { userId, sectionIds = [], countryIds = [] } = req.body || {};
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Invalid userId' });

  // Only collaborators and super collaborators can have assignments
  const u = await pool.query(
    `SELECT r.key AS role_key
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id=$1 AND u.deleted_at IS NULL`,
    [uid]
  );
  const roleKey = u.rows[0]?.role_key;
  if (!(roleKey === 'collaborator' || roleKey === 'super_collaborator')) {
    return res.status(400).json({ error: 'Assignments are allowed only for collaborator and super_collaborator' });
  }

  const secIds = Array.isArray(sectionIds) ? sectionIds.map(Number).filter(Number.isFinite) : [];
  const cIds = Array.isArray(countryIds) ? countryIds.map(Number).filter(Number.isFinite) : [];

  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`DELETE FROM section_assignments WHERE user_id=$1`, [uid]);
    await client.query(`DELETE FROM country_assignments WHERE user_id=$1`, [uid]);

    for (const sid of secIds){
      await client.query(
        `INSERT INTO section_assignments(user_id, section_id) VALUES ($1,$2)
         ON CONFLICT (user_id, section_id) DO NOTHING`,
        [uid, sid]
      );
    }
    for (const cid of cIds){
      await client.query(
        `INSERT INTO country_assignments(user_id, country_id) VALUES ($1,$2)
         ON CONFLICT (user_id, country_id) DO NOTHING`,
        [uid, cid]
      );
    }

    await client.query('COMMIT');
    return res.json({ ok:true });
  }catch(e){
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Failed to save assignments' });
  }finally{
    client.release();
  }
});

app.get('/api/admin/assignments/sections', requireRole('admin'), async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'user_id required' });

  const roleRow = await queryOne(
    `SELECT r.key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
    [userId]
  );
  const roleKey = normalizeRoleKey(roleRow?.key);
  if (!['collaborator','super_collaborator'].includes(roleKey)) return res.json([]);

  const rows = await queryAll(`SELECT section_id FROM section_assignments WHERE user_id=$1 ORDER BY section_id`, [userId]);
  return res.json(rows.map(r => r.section_id));
});

app.put('/api/admin/assignments/sections', requireRole('admin'), async (req, res) => {
  const { userId, sectionIds } = req.body || {};
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });

  const roleRow = await queryOne(
    `SELECT r.key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
    [uid]
  );
  const roleKey = normalizeRoleKey(roleRow?.key);
  if (!['collaborator','super_collaborator'].includes(roleKey)) {
    await pool.query(`DELETE FROM section_assignments WHERE user_id=$1`, [uid]);
    return res.json({ success:true, cleared:true });
  }

  const ids = Array.isArray(sectionIds) ? sectionIds.map(Number).filter(Number.isFinite) : [];
  await pool.query(`DELETE FROM section_assignments WHERE user_id=$1`, [uid]);
  for (const sid of ids){
    await pool.query(
      `INSERT INTO section_assignments(user_id, section_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [uid, sid]
    );
  }
  return res.json({ success:true });
});

app.get('/api/admin/assignments/countries', requireRole('admin'), async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'user_id required' });

  const roleRow = await queryOne(
    `SELECT r.key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
    [userId]
  );
  const roleKey = normalizeRoleKey(roleRow?.key);
  if (!['collaborator','super_collaborator'].includes(roleKey)) return res.json([]);

  const rows = await queryAll(`SELECT country_id FROM country_assignments WHERE user_id=$1 ORDER BY country_id`, [userId]);
  return res.json(rows.map(r => r.country_id));
});

app.put('/api/admin/assignments/countries', requireRole('admin'), async (req, res) => {
  const { userId, countryIds } = req.body || {};
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });

  const roleRow = await queryOne(
    `SELECT r.key FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
    [uid]
  );
  const roleKey = normalizeRoleKey(roleRow?.key);
  if (!['collaborator','super_collaborator'].includes(roleKey)) {
    await pool.query(`DELETE FROM country_assignments WHERE user_id=$1`, [uid]);
    return res.json({ success:true, cleared:true });
  }

  const ids = Array.isArray(countryIds) ? countryIds.map(Number).filter(Number.isFinite) : [];
  await pool.query(`DELETE FROM country_assignments WHERE user_id=$1`, [uid]);
  for (const cid of ids){
    await pool.query(
      `INSERT INTO country_assignments(user_id, country_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [uid, cid]
    );
  }
  return res.json({ success:true });
});



/** 7.5 Countries **/
app.get('/api/countries', async (req, res) => {
  const rows = await queryAll(
    `
    SELECT id, name_en, code
    FROM countries
    WHERE is_active = true
    ORDER BY name_en ASC
    `,
    []
  );
  return res.json(rows);
});

/** 7.6 Events and Calendar **/
app.get('/api/events', authRequired, attachUser, async (req, res) => {
  const { country_id, is_active, include_ended } = req.query || {};
  const roleKey = normalizeRoleKey(req.user.role_key);

  const where = [];
  const vals = [];
  let idx = 1;

  if (country_id) { where.push(`e.country_id=$${idx++}`); vals.push(Number(country_id)); }
  if (is_active !== undefined) { where.push(`e.is_active=$${idx++}`); vals.push(String(is_active) === 'true'); }
  if (String(include_ended) !== '1') { where.push(`e.ended_at IS NULL`); }

  if (roleKey === 'collaborator' || roleKey === 'super_collaborator') {
    const countries = await getAssignedCountryIds(req.user.id);
    const sections = await getAssignedSectionIds(req.user.id);
    if (!countries.length || !sections.length) return res.json([]);

    where.push(`e.country_id = ANY($${idx++}::int[])`); vals.push(countries);
    where.push(`EXISTS (SELECT 1 FROM event_required_sections ers WHERE ers.event_id=e.id AND ers.section_id = ANY($${idx++}::int[]))`); vals.push(sections);
  }

  const rows = await queryAll(
    `
    SELECT e.id, e.country_id, c.name_en AS country_name_en, c.code AS country_code,
           e.title, e.occasion, e.deadline_date, e.is_active, e.ended_at, e.created_at, e.updated_at
    FROM events e
    JOIN countries c ON c.id = e.country_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY (e.deadline_date IS NULL) ASC, e.deadline_date ASC, e.id
    `,
    vals
  );
  return res.json(rows);
});

app.get('/api/events/upcoming', authRequired, attachUser, async (req, res) => {
  const roleKey = normalizeRoleKey(req.user.role_key);
  const includeEnded = String(req.query.include_ended) === '1';

  const where = [`e.is_active = true`];
  const vals = [];
  let idx = 1;

  if (!includeEnded) where.push(`e.ended_at IS NULL`);

  if (roleKey === 'collaborator' || roleKey === 'super_collaborator') {
    const countries = await getAssignedCountryIds(req.user.id);
    const sections = await getAssignedSectionIds(req.user.id);
    if (!countries.length || !sections.length) return res.json([]);

    where.push(`e.country_id = ANY($${idx++}::int[])`); vals.push(countries);
    where.push(`EXISTS (SELECT 1 FROM event_required_sections ers WHERE ers.event_id=e.id AND ers.section_id = ANY($${idx++}::int[]))`); vals.push(sections);
  }

  const rows = await queryAll(
    `
    SELECT e.id, e.country_id, c.name_en AS country_name_en, c.code AS country_code,
           e.title, e.occasion, e.deadline_date, e.ended_at
    FROM events e
    JOIN countries c ON c.id = e.country_id
    WHERE ${where.join(' AND ')}
    ORDER BY (e.deadline_date IS NULL) ASC, e.deadline_date ASC, e.id
    `,
    vals
  );
  return res.json(rows);
});

app.get('/api/events/:id', authRequired, attachUser, async (req, res) => {
  try {
  const eventId = Number(req.params.id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid id' });

  const event = await queryOne(
    `
    SELECT e.*, c.name_en AS country_name_en, c.code AS country_code
    FROM events e
    JOIN countries c ON c.id = e.country_id
    WHERE e.id = $1
    `,
    [eventId]
  );
  if (!event) return res.status(404).json({ error: 'Not found' });

  const canSee = await userCanSeeEvent(req.user, event);
  if (!canSee) return res.status(403).json({ error: 'Forbidden' });

  const required = await queryAll(
    `
    SELECT ers.section_id AS id, s.label, s.order_index
    FROM event_required_sections ers
    JOIN sections s ON s.id = ers.section_id
    WHERE ers.event_id=$1
    ORDER BY s.order_index ASC, s.id ASC
    `,
    [eventId]
  );

  return res.json({
    id: event.id,
    country_id: event.country_id,
    country_name_en: event.country_name_en,
    country_code: event.country_code,
    title: event.title,
    occasion: event.occasion,
    deadline_date: event.deadline_date,
    is_active: event.is_active,
    ended_at: event.ended_at,
    required_sections: required
  });
  } catch (e) {
    console.error('GET /api/events/:id failed', e);
    return res.status(500).json({ error: 'Server error' });

app.get('/api/events/:id/my-sections', authRequired, attachUser, async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid id' });

    const event = await queryOne(
      `SELECT e.*, c.name_en AS country_name_en, c.code AS country_code
       FROM events e
       JOIN countries c ON c.id = e.country_id
       WHERE e.id = $1`,
      [eventId]
    );
    if (!event) return res.status(404).json({ error: 'Not found' });

    const canSee = await userCanSeeEvent(req.user, event);
    if (!canSee) return res.status(403).json({ error: 'Forbidden' });

    const required = await queryAll(
      `SELECT ers.section_id AS id, s.label, s.order_index
       FROM event_required_sections ers
       JOIN sections s ON s.id = ers.section_id
       WHERE ers.event_id=$1
       ORDER BY s.order_index ASC, s.id ASC`,
      [eventId]
    );

    const role = String(req.user.role || '').toLowerCase();
    if (role === 'collaborator' || role === 'super_collaborator') {
      const assignedSectionIds = new Set((await getAssignedSectionIds(req.user.id)).map(Number));
      const filtered = required.filter(r => assignedSectionIds.has(Number(r.id)));
      return res.json({ required_sections: filtered });
    }

    return res.json({ required_sections: required });
  } catch (e) {
    console.error('GET /api/events/:id/my-sections failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

  }
});

app.post('/api/events', requireRole('admin', 'chairman', 'minister', 'supervisor', 'protocol'), async (req, res) => {
  const { countryId, title, occasion, deadlineDate, requiredSectionIds } = req.body || {};
  if (!countryId || !title) return res.status(400).json({ error: 'countryId and title required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ev = await client.query(
      `
      INSERT INTO events (country_id, title, occasion, deadline_date, created_by_user_id, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      RETURNING id
      `,
      [
        Number(countryId),
        String(title),
        occasion ? String(occasion) : null,
        deadlineDate ? String(deadlineDate) : null,
        req.user.id
      ]
    );
    const eventId = ev.rows[0].id;

    const sectionIds = Array.isArray(requiredSectionIds) ? requiredSectionIds.map(Number).filter(Number.isFinite) : [];
    for (const sid of sectionIds) {
      await client.query(
        `
        INSERT INTO event_required_sections (event_id, section_id, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id, section_id) DO NOTHING
        `,
        [eventId, sid]
      );
    }

    await client.query('COMMIT');

    const out = await getEventWithSections(eventId, null);
    return res.status(201).json(out);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Failed to create event' });
  } finally {
    client.release();
  }
});

app.put('/api/events/:id', requireRole('admin', 'chairman', 'minister', 'supervisor', 'protocol'), async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid id' });

  const { countryId, title, occasion, deadlineDate, isActive, requiredSectionIds } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields = [];
    const vals = [];
    let idx = 1;

    if (countryId !== undefined) { fields.push(`country_id=$${idx++}`); vals.push(Number(countryId)); }
    if (title !== undefined) { fields.push(`title=$${idx++}`); vals.push(String(title)); }
    if (occasion !== undefined) { fields.push(`occasion=$${idx++}`); vals.push(occasion ? String(occasion) : null); }
    if (deadlineDate !== undefined) { fields.push(`deadline_date=$${idx++}`); vals.push(deadlineDate ? String(deadlineDate) : null); }
    if (isActive !== undefined) { fields.push(`is_active=$${idx++}`); vals.push(Boolean(isActive)); }

    if (fields.length) {
      fields.push(`updated_at=NOW()`);
      vals.push(eventId);
      await client.query(`UPDATE events SET ${fields.join(', ')} WHERE id=$${idx}`, vals);
    }

    if (Array.isArray(requiredSectionIds)) {
      // Replace required sections
      await client.query(`DELETE FROM event_required_sections WHERE event_id=$1`, [eventId]);
      const sectionIds = requiredSectionIds.map(Number).filter(Number.isFinite);
      for (const sid of sectionIds) {
        await client.query(
          `
          INSERT INTO event_required_sections (event_id, section_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (event_id, section_id) DO NOTHING
          `,
          [eventId, sid]
        );
      }
    }

    await client.query('COMMIT');

    const out = await getEventWithSections(eventId, null);
    if (!out) return res.status(404).json({ error: 'Event not found' });
    return res.json(out);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Failed to update event' });
  } finally {
    client.release();
  }
});

// End Event (Spec v2)
app.post('/api/events/:id/end', requireRole('admin','supervisor','chairman','protocol'), async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid id' });

  await pool.query(
    `UPDATE events SET ended_at = NOW(), ended_by_user_id=$2, updated_at = NOW() WHERE id=$1`,
    [eventId, req.user.id]
  );
  return res.json({ success:true });
});


/** 7.7 Talking Points Content **/

app.get('/api/tp', authRequired, async (req, res) => {
  try {
  const eventId = Number(req.query.event_id);
  const sectionId = Number(req.query.section_id);

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'event_id, section_id required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  const isCollab = (roleKey === 'collaborator' || roleKey === 'super_collaborator');
  const isElevated = ['admin','supervisor','chairman','minister','protocol','viewer'].includes(roleKey);
  if (!isCollab && !isElevated) return res.status(403).json({ error: 'Forbidden' });

  // Collaborators may only access their assigned event/country + section.
  if (isCollab) {
    const ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  const row = await queryOne(
  `
  SELECT
    e.id AS event_id,
    e.title AS event_title,
    c.name_en AS country_name,
    s.id AS section_id,
    s.label AS section_label,
    t.html_content,
    t.status,
    t.status_comment,
    t.last_updated_at,
    u.full_name AS last_updated_by
  FROM tp_content t
  JOIN events e ON e.id = t.event_id
  JOIN countries c ON c.id = t.country_id
  JOIN sections s ON s.id = t.section_id
  LEFT JOIN users u ON u.id = t.last_updated_by_user_id
  WHERE t.event_id=$1 AND t.country_id=$2 AND t.section_id=$3
  `,
  [eventId, countryId, sectionId]
);

return res.json({
  eventId: row.event_id,
  sectionId: row.section_id,
  sectionLabel: row.section_label,
  eventTitle: row.event_title,
  countryName: row.country_name,
  htmlContent: row.html_content || '',
  status: row.status || 'draft',
  statusComment: row.status_comment || null,
  lastUpdatedAt: row.last_updated_at,
  lastUpdatedBy: row.last_updated_by || null
});
} catch (e) {
    console.error('GET /api/tp failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tp/save', authRequired, async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  const htmlContent = String(req.body?.htmlContent || '');

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  const isCollab = (roleKey === 'collaborator' || roleKey === 'super_collaborator');
  const canEdit = ['collaborator','super_collaborator','supervisor','chairman','admin'].includes(roleKey);
  if (!canEdit) return res.status(403).json({ error: 'Forbidden' });

  // Collaborators may only edit their assigned event/country + section.
  if (isCollab) {
    const ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  // Save behavior:
  // - Collaborator save always moves to 'draft'
  // - Supervisor/Deputy/Admin save does NOT change status (they use Approve/Return)
  if (isCollab) {
    await pool.query(
      `
      UPDATE tp_content
      SET html_content=$4, last_updated_at=NOW(), last_updated_by_user_id=$5, status='draft'
      WHERE event_id=$1 AND country_id=$2 AND section_id=$3
      `,
      [eventId, countryId, sectionId, htmlContent, req.user.id]
    );
  } else {
    await pool.query(
      `
      UPDATE tp_content
      SET html_content=$4, last_updated_at=NOW(), last_updated_by_user_id=$5
      WHERE event_id=$1 AND country_id=$2 AND section_id=$3
      `,
      [eventId, countryId, sectionId, htmlContent, req.user.id]
    );
  }

  return res.json({ success:true });
});

app.post('/api/tp/submit', async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  const htmlContent = String(req.body?.htmlContent || '');

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (!(roleKey === 'collaborator' || roleKey === 'super_collaborator')) {
    return res.status(403).json({ error: 'Forbidden' });
  }


  const ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET html_content=$4, last_updated_at=NOW(), last_updated_by_user_id=$5, status='submitted'
    WHERE event_id=$1 AND country_id=$2 AND section_id=$3
    `,
    [eventId, countryId, sectionId, htmlContent, req.user.id]
  );

  return res.json({ success:true });
});

app.post('/api/tp/return', requireRole('supervisor','chairman','admin'), async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  const note = String((req.body?.note ?? req.body?.comment) || '');

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET status='returned', status_comment=$4, last_updated_at=NOW(), last_updated_by_user_id=$5
    WHERE event_id=$1 AND country_id=$2 AND section_id=$3
    `,
    [eventId, countryId, sectionId, note, req.user.id]
  );

  return res.json({ success:true });
});

app.post('/api/tp/approve-section', requireRole('supervisor','admin'), async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET status='approved_by_supervisor', status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4
    WHERE event_id=$1 AND country_id=$2 AND section_id=$3
    `,
    [eventId, countryId, sectionId, req.user.id]
  );

  return res.json({ success:true });

app.post('/api/tp/approve-all-sections', requireRole('supervisor','chairman','admin'), async (req, res) => {
  try {
    const eventId = Number(req.body?.eventId);
    if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

    const countryId = await resolveCountryIdForEvent(eventId);
    if (!countryId) return res.status(404).json({ error: 'Event not found' });

    await ensureDocumentStatus(eventId, countryId);

    const required = await queryAll(
      `SELECT section_id FROM event_required_sections WHERE event_id=$1 ORDER BY section_id ASC`,
      [eventId]
    );
    const sectionIds = required.map(r => Number(r.section_id)).filter(n => Number.isFinite(n));
    if (sectionIds.length === 0) return res.json({ success:true, approved: 0 });

    // Ensure rows exist
    for (const sid of sectionIds) {
      await ensureTpRow(eventId, countryId, sid, req.user.id);
    }

    const role = String(req.user.role || '').toLowerCase();
    const targetStatus = (role === 'chairman') ? 'approved_by_chairman' : 'approved_by_supervisor';

    await pool.query(
      `
      UPDATE tp_content
      SET status=$4, status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$5
      WHERE event_id=$1 AND country_id=$2 AND section_id = ANY($3::int[])
      `,
      [eventId, countryId, sectionIds, targetStatus, req.user.id]
    );

    return res.json({ success:true, approved: sectionIds.length, status: targetStatus });
  } catch (e) {
    console.error('POST /api/tp/approve-all-sections failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

});

app.post('/api/tp/approve-section-chairman', requireRole('chairman','admin'), async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET status='approved_by_chairman', status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4
    WHERE event_id=$1 AND country_id=$2 AND section_id=$3
    `,
    [eventId, countryId, sectionId, req.user.id]
  );

  return res.json({ success:true });
});

/** 7.8 Document Status and Library **/

app.get('/api/document-status', async (req, res) => {
  const eventId = Number(req.query.event_id);
  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ error: 'event_id required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  const row = await queryOne(
    `SELECT * FROM document_status WHERE event_id=$1 AND country_id=$2`,
    [eventId, countryId]
  );

  return res.json({
    eventId: row.event_id,
    countryId: row.country_id,
    status: row.status,
    chairmanComment: row.chairman_comment,
    updatedAt: row.updated_at,
  });
});

// Spec v2: document status endpoint
app.get('/api/tp/document-status', async (req, res) => {
  const eventId = Number(req.query.event_id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'event_id required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  const row = await queryOne(`SELECT * FROM document_status WHERE event_id=$1 AND country_id=$2`, [eventId, countryId]);

  return res.json({
    eventId: row.event_id,
    status: row.status,
    chairmanComment: row.chairman_comment,
    updatedAt: row.updated_at,
  });
});

// Spec v2: per-section status grid

app.get('/api/tp/status-grid', authRequired, async (req, res) => {
  try {
    const eventId = parseInt(req.query.event_id, 10);
    if (!eventId) return res.status(400).json({ error: 'event_id required' });

    // Resolve the event's country_id (tp_content is keyed by event_id + country_id + section_id)
    const countryId = await resolveCountryIdForEvent(eventId);
    if (!countryId) return res.status(404).json({ error: 'event not found' });

    // Build status grid for required sections for this event
    const q = `
      SELECT
        ers.section_id AS id,
        s.label,
        s.order_index,
        COALESCE(t.status::text, 'draft') AS status,
        t.status_comment,
        t.last_updated_at,
        u.full_name AS last_updated_by
      FROM event_required_sections ers
      JOIN sections s ON s.id = ers.section_id
      LEFT JOIN tp_content t
        ON t.event_id = ers.event_id
       AND t.country_id = $2
       AND t.section_id = ers.section_id
      LEFT JOIN users u ON u.id = t.last_updated_by_user_id
      WHERE ers.event_id = $1
      ORDER BY s.order_index ASC, s.id ASC
    `;
    const { rows } = await pool.query(q, [eventId, countryId]);

    res.json({
      event_id: eventId,
      country_id: countryId,
      sections: rows.map(r => ({
        sectionId: r.id,
        sectionLabel: r.label,
        status: r.status,
        statusComment: r.status_comment || null,
        lastUpdatedAt: r.last_updated_at,
        lastUpdatedBy: r.last_updated_by || null,
      }))
    });
  } catch (e) {
    console.error('status-grid error', e);
    res.status(500).json({ error: 'server error' });
  }
});


app.post('/api/document/submit-to-supervisor', requireRole('chairman','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const schema = await getDocumentStatusSchema();
  await ensureDocumentStatus(eventId, countryId);

  const tsCol = schema.tsCol || 'updated_at';
  const byCol = schema.byCol || 'updated_by_user_id';

  if (schema.hasCountryId) {
    await pool.query(
      `UPDATE document_status
       SET status='submitted_to_supervisor', ${tsCol}=NOW(), ${byCol}=$3
       WHERE event_id=$1 AND country_id=$2`,
      [eventId, countryId, req.user.id]
    );
  } else {
    await pool.query(
      `UPDATE document_status
       SET status='submitted_to_supervisor', ${tsCol}=NOW(), ${byCol}=$2
       WHERE event_id=$1`,
      [eventId, req.user.id]
    );
  }
  return res.json({ success:true });
}));

app.post('/api/document/submit-to-chairman', requireRole('supervisor','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const schema = await getDocumentStatusSchema();
  await ensureDocumentStatus(eventId, countryId);

  const tsCol = schema.tsCol || 'updated_at';
  const byCol = schema.byCol || 'updated_by_user_id';

  if (schema.hasCountryId) {
    await pool.query(
      `UPDATE document_status
       SET status='submitted_to_chairman', ${tsCol}=NOW(), ${byCol}=$3
       WHERE event_id=$1 AND country_id=$2`,
      [eventId, countryId, req.user.id]
    );
  } else {
    await pool.query(
      `UPDATE document_status
       SET status='submitted_to_chairman', ${tsCol}=NOW(), ${byCol}=$2
       WHERE event_id=$1`,
      [eventId, req.user.id]
    );
  }
  return res.json({ success:true });
}));

app.post('/api/document/approve', requireRole('chairman','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const schema = await getDocumentStatusSchema();
  await ensureDocumentStatus(eventId, countryId);

  const tsCol = schema.tsCol || 'updated_at';
  const byCol = schema.byCol || 'updated_by_user_id';

  if (schema.hasCountryId) {
    await pool.query(
      `UPDATE document_status
       SET status='approved', ${tsCol}=NOW(), ${byCol}=$3
       WHERE event_id=$1 AND country_id=$2`,
      [eventId, countryId, req.user.id]
    );
  } else {
    await pool.query(
      `UPDATE document_status
       SET status='approved', ${tsCol}=NOW(), ${byCol}=$2
       WHERE event_id=$1`,
      [eventId, req.user.id]
    );
  }
  return res.json({ success:true });
}));

app.post('/api/document/return', requireRole('chairman','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const comment = (req.body?.comment ?? '').toString();
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const schema = await getDocumentStatusSchema();
  await ensureDocumentStatus(eventId, countryId);

  const tsCol = schema.tsCol || 'updated_at';
  const byCol = schema.byCol || 'updated_by_user_id';
  const commentCol = schema.commentCol;

  if (schema.hasCountryId) {
    if (commentCol) {
      await pool.query(
        `UPDATE document_status
         SET status='returned', ${commentCol}=$3, ${tsCol}=NOW(), ${byCol}=$4
         WHERE event_id=$1 AND country_id=$2`,
        [eventId, countryId, comment, req.user.id]
      );
    } else {
      await pool.query(
        `UPDATE document_status
         SET status='returned', ${tsCol}=NOW(), ${byCol}=$3
         WHERE event_id=$1 AND country_id=$2`,
        [eventId, countryId, req.user.id]
      );
    }
  } else {
    if (commentCol) {
      await pool.query(
        `UPDATE document_status
         SET status='returned', ${commentCol}=$2, ${tsCol}=NOW(), ${byCol}=$3
         WHERE event_id=$1`,
        [eventId, comment, req.user.id]
      );
    } else {
      await pool.query(
        `UPDATE document_status
         SET status='returned', ${tsCol}=NOW(), ${byCol}=$2
         WHERE event_id=$1`,
        [eventId, req.user.id]
      );
    }
  }
  return res.json({ success:true });
}));

app.get('/api/library', requireRole('admin','chairman','minister','supervisor','super_collaborator','protocol'), async (req, res) => {
  // List approved documents for a country
  const countryId = Number(req.query.country_id);
  if (!Number.isFinite(countryId)) return res.status(400).json({ error: 'country_id required' });

  const rows = await queryAll(
    `
    SELECT e.id AS event_id,
           e.title,
           e.deadline_date,
           ds.updated_at AS last_updated
    FROM document_status ds
    JOIN events e ON e.id = ds.event_id
    WHERE ds.country_id = $1 AND ds.status = 'approved'
    ORDER BY ds.updated_at DESC
    `,
    [countryId]
  );

  return res.json(rows);
});

app.get('/api/library/document', requireRole('admin','chairman','minister','supervisor','super_collaborator','protocol'), async (req, res) => {
  const eventId = Number(req.query.event_id);
  const countryId = Number(req.query.country_id);
  if (!Number.isFinite(eventId) || !Number.isFinite(countryId)) return res.status(400).json({ error: 'event_id and country_id required' });

  const event = await getEventWithSections(eventId, null);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Always include required sections in order, with content (even if empty).
  await ensureDocumentStatus(eventId, countryId);
  for (const s of event.requiredSections) {
    await ensureTpRow(eventId, countryId, s.id, null);
  }

  const sections = await queryAll(
    `
    SELECT s.id AS section_id, s.label AS section_label, s.order_index,
           t.html_content, t.status, t.last_updated_at AS last_updated_at
    FROM event_required_sections ers
    JOIN sections s ON s.id = ers.section_id
    LEFT JOIN tp_content t
      ON t.event_id = ers.event_id AND t.section_id = ers.section_id AND t.country_id = $2
    WHERE ers.event_id = $1
    ORDER BY s.order_index ASC, s.id ASC
    `,
    [eventId, countryId]
  );

  const doc = await queryOne(
    `
    SELECT status, chairman_comment, updated_at
    FROM document_status
    WHERE event_id=$1 AND country_id=$2
    `,
    [eventId, countryId]
  );

  return res.json({
    event,
    documentStatus: doc ? {
      status: doc.status,
      chairmanComment: doc.chairman_comment,
      updatedAt: doc.updated_at
    } : null,
    sections: sections.map(r => ({
      sectionId: r.section_id,
      sectionLabel: r.section_label,
      orderIndex: r.order_index,
      htmlContent: r.html_content || '',
      status: r.status || 'draft',
      lastUpdatedAt: r.last_updated_at
    }))
  });
});


/** Static frontend (served from backend/public for Render) **/
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// SPA-style fallback: send login.html for any non-API route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

/** Error handler */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

(async () => {
  try {
    await ensureSchema();
    await ensureRolesExist();
  } catch (err) {
    console.error('Startup ensureSchema/ensureRoles failed:', err);
  }

  app.listen(PORT, () => {
    console.log(`GOV COLLAB PORTAL API listening on port ${PORT}`);
  });
})();
