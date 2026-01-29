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
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  credentials: true,
}));

/** Utilities **/

function normalizeRoleKey(roleKey) {
  return String(roleKey || '').trim().toLowerCase();
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
    SELECT u.*, r.key AS role_key, r.label AS role_label
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    `,
    [req.auth.userId]
  );

  if (!user || !user.is_active) return res.status(401).json({ error: 'User inactive or not found' });

  req.user = user;
  next();
}

function requireRole(...allowed) {
  const allowedSet = new Set(allowed.map(normalizeRoleKey));
  return (req, res, next) => {
    const roleKey = normalizeRoleKey(req.user?.role_key);
    if (!allowedSet.has(roleKey)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

async function ensureDocumentStatus(eventId, countryId) {
  // Create row if missing
  await pool.query(
    `
    INSERT INTO document_status (event_id, country_id, status)
    VALUES ($1, $2, 'in_progress')
    ON CONFLICT (event_id, country_id) DO NOTHING
    `,
    [eventId, countryId]
  );
}

async function ensureTpRow(eventId, countryId, sectionId, userId) {
  await pool.query(
    `
    INSERT INTO tp_content (event_id, country_id, section_id, html_content, status, last_updated_by_user_id, last_updated_at)
    VALUES ($1, $2, $3, '', 'draft', $4, NOW())
    ON CONFLICT (event_id, country_id, section_id) DO NOTHING
    `,
    [eventId, countryId, sectionId, userId || null]
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
      SELECT t.section_id, t.status, t.status_comment, t.last_updated_at,
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

/** Protected routes (everything below) **/
app.use('/api', authRequired, attachUser);

/** 7.2 Users (Admin only) **/
app.get('/api/users', requireRole('admin'), async (req, res) => {
  const rows = await queryAll(
    `
    SELECT u.*, r.key AS role_key
    FROM users u
    JOIN roles r ON r.id = u.role_id
    ORDER BY u.id ASC
    `,
    []
  );
  return res.json(rows.map(pickUserPayload));
});

app.post('/api/users', requireRole('admin'), async (req, res) => {
  const { username, password, fullName, email, role, isActive } = req.body || {};
  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: 'username, password, fullName, role required' });
  }

  const roleRow = await queryOne(`SELECT id, key FROM roles WHERE key=$1`, [normalizeRoleKey(role)]);
  if (!roleRow) return res.status(400).json({ error: 'Invalid role' });

  const passwordHash = await bcrypt.hash(String(password), 10);

  const created = await queryOne(
    `
    INSERT INTO users (username, password_hash, full_name, email, role_id, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    RETURNING id
    `,
    [
      String(username),
      passwordHash,
      String(fullName),
      email ? String(email) : null,
      roleRow.id,
      (isActive === false) ? false : true
    ]
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
});

app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
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

  return res.json(pickUserPayload(out));
});

app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  await pool.query(`UPDATE users SET is_active=false, updated_at=NOW() WHERE id=$1`, [id]);
  return res.json({ ok: true });
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
app.get('/api/events', async (req, res) => {
  const { country_id, is_active } = req.query || {};

  const where = [];
  const vals = [];
  let idx = 1;

  if (country_id) { where.push(`e.country_id=$${idx++}`); vals.push(Number(country_id)); }
  if (is_active !== undefined) { where.push(`e.is_active=$${idx++}`); vals.push(String(is_active) === 'true'); }

  const rows = await queryAll(
    `
    SELECT e.id, e.country_id, c.name_en AS country_name_en, c.code AS country_code,
           e.title, e.occasion, e.deadline_date, e.is_active, e.created_at, e.updated_at
    FROM events e
    JOIN countries c ON c.id = e.country_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (e.deadline_date IS NULL) ASC, e.deadline_date ASC, e.id DESC
    `,
    vals
  );
  return res.json(rows);
});

app.get('/api/events/upcoming', async (req, res) => {
  const rows = await queryAll(
    `
    SELECT e.id, e.country_id, c.name_en AS country_name_en, c.code AS country_code,
           e.title, e.occasion, e.deadline_date
    FROM events e
    JOIN countries c ON c.id = e.country_id
    WHERE e.is_active = true
    ORDER BY (e.deadline_date IS NULL) ASC, e.deadline_date ASC, e.id DESC
    LIMIT 50
    `,
    []
  );
  return res.json(rows);
});

app.get('/api/events/:id', async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid id' });

  const countryId = req.query.country_id ? Number(req.query.country_id) : null;

  const event = await getEventWithSections(eventId, countryId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  return res.json(event);
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

/** 7.7 Talking Points Content **/

app.get('/api/tp', async (req, res) => {
  const eventId = Number(req.query.event_id);
  const countryId = Number(req.query.country_id);
  const sectionId = Number(req.query.section_id);

  if (!Number.isFinite(eventId) || !Number.isFinite(countryId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'event_id, country_id, section_id required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'protocol') return res.status(403).json({ error: 'Forbidden' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  const row = await queryOne(
    `
    SELECT t.*, s.label AS section_label, e.title AS event_title, c.name_en AS country_name,
           u.full_name AS last_updated_by
    FROM tp_content t
    JOIN sections s ON s.id = t.section_id
    JOIN events e ON e.id = t.event_id
    JOIN countries c ON c.id = t.country_id
    LEFT JOIN users u ON u.id = t.last_updated_by_user_id
    WHERE t.event_id=$1 AND t.country_id=$2 AND t.section_id=$3
    `,
    [eventId, countryId, sectionId]
  );

  return res.json({
    id: row.id,
    eventId: row.event_id,
    countryId: row.country_id,
    sectionId: row.section_id,
    sectionLabel: row.section_label,
    eventTitle: row.event_title,
    countryName: row.country_name,
    htmlContent: row.html_content,
    status: row.status,
    statusComment: row.status_comment,
    lastUpdatedAt: row.last_updated_at,
    lastUpdatedBy: row.last_updated_by,
  });
});

app.post('/api/tp/save', async (req, res) => {
  const { eventId, countryId, sectionId, htmlContent } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);
  const sid = Number(sectionId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid) || !Number.isFinite(sid)) {
    return res.status(400).json({ error: 'eventId, countryId, sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'protocol' || roleKey === 'viewer') return res.status(403).json({ error: 'Forbidden' });

  if (roleKey === 'collaborator' || roleKey === 'super_collaborator') {
    const assigned = await isCollaboratorAssignedToSection(req.user.id, sid);
    if (!assigned) return res.status(403).json({ error: 'Not assigned to this section' });
  }

  await ensureDocumentStatus(eid, cid);
  await ensureTpRow(eid, cid, sid, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET html_content=$1,
        last_updated_by_user_id=$2,
        last_updated_at=NOW()
    WHERE event_id=$3 AND country_id=$4 AND section_id=$5
    `,
    [String(htmlContent || ''), req.user.id, eid, cid, sid]
  );

  return res.json({ ok: true });
});

app.post('/api/tp/submit', async (req, res) => {
  const { eventId, countryId, sectionId, htmlContent } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);
  const sid = Number(sectionId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid) || !Number.isFinite(sid)) {
    return res.status(400).json({ error: 'eventId, countryId, sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'protocol' || roleKey === 'viewer') return res.status(403).json({ error: 'Forbidden' });

  if (roleKey === 'collaborator' || roleKey === 'super_collaborator') {
    const assigned = await isCollaboratorAssignedToSection(req.user.id, sid);
    if (!assigned) return res.status(403).json({ error: 'Not assigned to this section' });
  }

  await ensureDocumentStatus(eid, cid);
  await ensureTpRow(eid, cid, sid, req.user.id);

  const content = (htmlContent === undefined) ? null : String(htmlContent);

  await pool.query(
    `
    UPDATE tp_content
    SET html_content = COALESCE($1, html_content),
        status='submitted',
        status_comment=NULL,
        last_updated_by_user_id=$2,
        last_updated_at=NOW()
    WHERE event_id=$3 AND country_id=$4 AND section_id=$5
    `,
    [content, req.user.id, eid, cid, sid]
  );

  return res.json({ ok: true });
});

app.post('/api/tp/return', requireRole('admin', 'supervisor', 'chairman'), async (req, res) => {
  const { eventId, countryId, sectionId, comment } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);
  const sid = Number(sectionId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid) || !Number.isFinite(sid)) {
    return res.status(400).json({ error: 'eventId, countryId, sectionId required' });
  }

  await ensureDocumentStatus(eid, cid);
  await ensureTpRow(eid, cid, sid, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET status='returned',
        status_comment=$1,
        last_updated_by_user_id=$2,
        last_updated_at=NOW()
    WHERE event_id=$3 AND country_id=$4 AND section_id=$5
    `,
    [comment ? String(comment) : null, req.user.id, eid, cid, sid]
  );

  return res.json({ ok: true });
});

app.post('/api/tp/approve-section', requireRole('admin', 'supervisor'), async (req, res) => {
  const { eventId, countryId, sectionId } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);
  const sid = Number(sectionId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid) || !Number.isFinite(sid)) {
    return res.status(400).json({ error: 'eventId, countryId, sectionId required' });
  }

  await ensureDocumentStatus(eid, cid);
  await ensureTpRow(eid, cid, sid, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET status='approved_by_supervisor',
        status_comment=NULL,
        last_updated_by_user_id=$1,
        last_updated_at=NOW()
    WHERE event_id=$2 AND country_id=$3 AND section_id=$4
    `,
    [req.user.id, eid, cid, sid]
  );

  return res.json({ ok: true });
});

app.post('/api/tp/approve-section-chairman', requireRole('admin', 'chairman'), async (req, res) => {
  const { eventId, countryId, sectionId } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);
  const sid = Number(sectionId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid) || !Number.isFinite(sid)) {
    return res.status(400).json({ error: 'eventId, countryId, sectionId required' });
  }

  await ensureDocumentStatus(eid, cid);
  await ensureTpRow(eid, cid, sid, req.user.id);

  await pool.query(
    `
    UPDATE tp_content
    SET status='approved_by_chairman',
        status_comment=NULL,
        last_updated_by_user_id=$1,
        last_updated_at=NOW()
    WHERE event_id=$2 AND country_id=$3 AND section_id=$4
    `,
    [req.user.id, eid, cid, sid]
  );

  return res.json({ ok: true });
});

/** 7.8 Document Status and Library **/

app.get('/api/document-status', async (req, res) => {
  const eventId = Number(req.query.event_id);
  const countryId = Number(req.query.country_id);
  if (!Number.isFinite(eventId) || !Number.isFinite(countryId)) {
    return res.status(400).json({ error: 'event_id and country_id required' });
  }

  await ensureDocumentStatus(eventId, countryId);
  const row = await queryOne(
    `
    SELECT * FROM document_status WHERE event_id=$1 AND country_id=$2
    `,
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

app.post('/api/document/submit-to-chairman', requireRole('admin', 'supervisor'), async (req, res) => {
  const { eventId, countryId } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid)) return res.status(400).json({ error: 'eventId and countryId required' });

  await ensureDocumentStatus(eid, cid);

  await pool.query(
    `
    UPDATE document_status
    SET status='submitted_to_chairman',
        updated_at=NOW()
    WHERE event_id=$1 AND country_id=$2
    `,
    [eid, cid]
  );

  return res.json({ ok: true });
});

app.post('/api/document/approve', requireRole('admin', 'chairman'), async (req, res) => {
  const { eventId, countryId } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid)) return res.status(400).json({ error: 'eventId and countryId required' });

  await ensureDocumentStatus(eid, cid);

  // Mark document approved
  await pool.query(
    `
    UPDATE document_status
    SET status='approved',
        chairman_comment=NULL,
        updated_at=NOW()
    WHERE event_id=$1 AND country_id=$2
    `,
    [eid, cid]
  );

  // Optionally, stamp all required sections as approved_by_chairman for consistency.
  await pool.query(
    `
    UPDATE tp_content
    SET status='approved_by_chairman',
        status_comment=NULL,
        last_updated_by_user_id=$1,
        last_updated_at=NOW()
    WHERE event_id=$2 AND country_id=$3
    `,
    [req.user.id, eid, cid]
  );

  return res.json({ ok: true });
});

app.post('/api/document/return', requireRole('admin', 'chairman'), async (req, res) => {
  const { eventId, countryId, comment } = req.body || {};
  const eid = Number(eventId);
  const cid = Number(countryId);

  if (!Number.isFinite(eid) || !Number.isFinite(cid)) return res.status(400).json({ error: 'eventId and countryId required' });

  await ensureDocumentStatus(eid, cid);

  await pool.query(
    `
    UPDATE document_status
    SET status='returned',
        chairman_comment=$1,
        updated_at=NOW()
    WHERE event_id=$2 AND country_id=$3
    `,
    [comment ? String(comment) : null, eid, cid]
  );

  return res.json({ ok: true });
});

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
           t.html_content, t.status, t.last_updated_at
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

app.listen(PORT, () => {
  console.log(`GOV COLLAB PORTAL API listening on port ${PORT}`);
});
