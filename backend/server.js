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
const fs = require('fs');

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

app.use(express.json({ limit: '20mb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  credentials: true,
}));

/** Utilities **/

async function ensureSchema() {

  // Bootstrap schema on brand-new databases (e.g., a fresh Render Postgres)
  // so the service can start and login works without manual psql steps.
  try {
    const chk = await pool.query(`SELECT to_regclass('public.users') AS tbl`);
    const hasUsersTable = !!(chk.rows && chk.rows[0] && chk.rows[0].tbl);
    if (!hasUsersTable) {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const ddl = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(ddl);
    }
  } catch (e) {
    console.error('ensureSchema bootstrap failed:', e);
  }

  // Ensure tp_content columns exist for legacy databases
  await pool.query(`
    ALTER TABLE tp_content
      ADD COLUMN IF NOT EXISTS last_updated_by_user_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `).catch(()=>{});

  // Lightweight, idempotent DDL to keep Render deployments working
  // NOTE: these use .catch() so a single failure doesn't abort the rest of schema setup
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ended_by_user_id INTEGER`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS submitter_role TEXT NOT NULL DEFAULT 'deputy'`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS lower_submitter_role TEXT DEFAULT 'collaborator_2'`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE tp_content ADD COLUMN IF NOT EXISTS original_submitter_role TEXT DEFAULT NULL`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE tp_content ADD COLUMN IF NOT EXISTS return_target_role TEXT DEFAULT NULL`).catch(e => console.error('DDL warn:', e.message));
  await pool.query(`ALTER TABLE tp_content ADD COLUMN IF NOT EXISTS last_content_edited_at TIMESTAMPTZ DEFAULT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE tp_content ADD COLUMN IF NOT EXISTS last_content_edited_by_user_id INTEGER REFERENCES users(id) DEFAULT NULL`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS section_return_requests (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL,
    country_id INTEGER NOT NULL,
    section_id INTEGER NOT NULL,
    requested_by_user_id INTEGER REFERENCES users(id),
    requested_by_name TEXT NOT NULL,
    requested_by_role TEXT NOT NULL,
    directed_to_role TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});

  // Ensure enum value exists for minister approvals (legacy DBs)
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'approved_by_minister'`).catch(async ()=>{
    // Fallback for older Postgres that may not support IF NOT EXISTS
    try {
      const has = await pool.query(`SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid WHERE t.typname='tp_section_status' AND e.enumlabel='approved_by_minister'`);
      if (!has.rowCount) {
        await pool.query(`ALTER TYPE tp_section_status ADD VALUE 'approved_by_minister'`);
      }
    } catch (_) {}
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS country_assignments (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      country_id INTEGER REFERENCES countries(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, country_id)
    )
  `);

  // Document status: avoid enum mismatch and keep audit columns consistent
  await pool.query(`ALTER TABLE document_status ADD COLUMN IF NOT EXISTS last_updated_by_user_id INTEGER`).catch(()=>{});
  await pool.query(`ALTER TABLE document_status ADD COLUMN IF NOT EXISTS deputy_comment TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE document_status ALTER COLUMN status TYPE TEXT USING status::text`).catch(()=>{});

  // Curator tier statuses
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'submitted_to_collaborator_3'`).catch(()=>{});
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'returned_by_collaborator_3'`).catch(()=>{});
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'approved_by_collaborator_3'`).catch(()=>{});

  // Deputy/minister pipeline statuses (needed for return and approve-all-sections routes)
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'approved_by_deputy'`).catch(()=>{});
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'submitted_to_deputy'`).catch(()=>{});
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'returned_by_deputy'`).catch(()=>{});
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'submitted_to_minister'`).catch(()=>{});
  await pool.query(`ALTER TYPE tp_section_status ADD VALUE IF NOT EXISTS 'returned_by_minister'`).catch(()=>{});

  // Migrate legacy 'chairman' role to 'deputy': reassign users and remove the stale row.
  // We cannot rename the row directly because 'deputy' already exists (unique constraint),
  // so instead we point every user whose role_id is the old 'chairman' row at the 'deputy' row.
  await pool.query(`
    UPDATE users
    SET role_id = (SELECT id FROM roles WHERE key = 'deputy')
    WHERE role_id = (SELECT id FROM roles WHERE key = 'chairman')
  `).catch(()=>{});
  await pool.query(`DELETE FROM roles WHERE key = 'chairman'`).catch(()=>{});

  // Section audit history
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tp_section_history (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      country_id INTEGER NOT NULL,
      section_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      note TEXT,
      acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tsh_lookup ON tp_section_history(event_id, section_id, acted_at)`).catch(()=>{});

  // Section-level comments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tp_section_comments (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      country_id  INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      author_name TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      anchor_id   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(()=>{});
  await pool.query(`ALTER TABLE tp_section_comments ADD COLUMN IF NOT EXISTS anchor_id TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE tp_section_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES tp_section_comments(id) ON DELETE CASCADE`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tsc_lookup ON tp_section_comments(event_id, country_id, section_id)`).catch(()=>{});
}

async function ensureRolesExist() {
  const roles = [
    ['admin','Admin'],
    ['minister','Minister'],
    ['deputy','Deputy'],
    ['supervisor','Supervisor'],
    ['protocol','Protocol'],
    ['super_collaborator','Super-collaborator'],
    ['collaborator','Collaborator'],
    ['collaborator_3','Curator'],
    ['collaborator_2','Head Collaborator'],
    ['collaborator_1','Collaborator I'],
    ['viewer','Viewer'],
  ];
  for (const [key,label] of roles){
    await pool.query(
      `INSERT INTO roles(key,label) VALUES($1,$2) ON CONFLICT (key) DO NOTHING`,
      [key,label]
    );
  }
}

function extractJsonArrayFromSeed(seedContent, constName) {
  // Extract a JSON-compatible array literal from seed.js like:
  // const COUNTRIES = [ ... ];
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;`);
  const m = seedContent.match(re);
  if (!m) return null;
  const arrLiteral = m[1];
  try {
    return JSON.parse(arrLiteral);
  } catch {
    return null;
  }
}

async function ensureBaseData() {
  // Populate core reference data (sections + countries) on a fresh DB.
  // This is intentionally idempotent and safe to run on every boot.
  try {
    // Sections
    const secCount = await queryOne(`SELECT COUNT(*)::int AS n FROM sections`, []);
    if ((secCount?.n || 0) === 0) {
      const DEFAULT_SECTIONS = [
        ['international_relations', 'International Relations', 10],
        ['economic_relations', 'Economic Relations', 20],
        ['investment', 'Investment', 30],
        ['tourism', 'Tourism', 40],
        ['transport', 'Transport', 50],
        ['energy', 'Energy', 60],
        ['communications_it_post', 'Communications, Information Technology and Post', 70],
        ['innovation', 'Innovation', 80],
      ];
      for (const [key, label, orderIndex] of DEFAULT_SECTIONS) {
        await pool.query(
          `INSERT INTO sections (key, label, order_index, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,TRUE,NOW(),NOW())
           ON CONFLICT (key) DO UPDATE SET
             label = EXCLUDED.label,
             order_index = EXCLUDED.order_index,
             is_active = TRUE,
             updated_at = NOW()`,
          [key, label, orderIndex]
        );
      }
      console.log('Base seed: inserted default sections.');
    }

    // Countries
    const cCount = await queryOne(`SELECT COUNT(*)::int AS n FROM countries`, []);
    if ((cCount?.n || 0) === 0) {
      const seedPath = path.join(__dirname, 'seed.js');
      const seedContent = fs.readFileSync(seedPath, 'utf8');
      const countries = extractJsonArrayFromSeed(seedContent, 'COUNTRIES') || [];
      if (!countries.length) {
        console.warn('Base seed: could not extract COUNTRIES from seed.js; skipping countries insert.');
      } else {
        for (const [name_en, code] of countries) {
          await pool.query(
            `INSERT INTO countries (name_en, code, is_active, created_at, updated_at)
             VALUES ($1,$2,TRUE,NOW(),NOW())
             ON CONFLICT (code) DO UPDATE SET
               name_en = EXCLUDED.name_en,
               is_active = TRUE,
               updated_at = NOW()`,
            [name_en, code]
          );
        }
        console.log(`Base seed: inserted ${countries.length} countries.`);
      }
    }
  } catch (e) {
    console.error('ensureBaseData failed:', e);
  }
}

async function ensureInitialAdmin() {
  const password = process.env.INIT_ADMIN_PASSWORD;
  const fullName = process.env.INIT_ADMIN_NAME || 'Admin';
  const username = process.env.INIT_ADMIN_USERNAME;
  const email = process.env.INIT_ADMIN_EMAIL || (username ? `${username}@example.com` : null);

  // Create the first admin only if we have at least username + password.
  if (!username || !password) return;

  try {
    const countRow = await queryOne(`SELECT COUNT(*)::int AS n FROM users`, []);
    if ((countRow?.n || 0) > 0) return;

    const roleRow = await queryOne(`SELECT id FROM roles WHERE key='admin'`, []);
    if (!roleRow?.id) {
      console.error('Cannot init admin: roles table missing admin role.');
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, role_id, is_active)
       VALUES ($1,$2,$3,$4,$5,TRUE)`,
      [username, hash, fullName, email, roleRow.id]
    );
    console.log('Initial admin user created:', username);
  } catch (e) {
    console.error('ensureInitialAdmin failed:', e);
  }
}

async function resolveCountryIdForEvent(eventId){
  const row = await queryOne(`SELECT country_id FROM events WHERE id=$1`, [eventId]);
  return row ? row.country_id : null;
}

async function recordHistory({ eventId, countryId, sectionId, action, fromStatus, toStatus, userId, userName, userRole, note }) {
  await pool.query(
    `INSERT INTO tp_section_history (event_id, country_id, section_id, action, from_status, to_status, user_id, user_name, user_role, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [eventId, countryId, sectionId, action, fromStatus||null, toStatus, userId||null, userName||null, userRole||null, note||null]
  ).catch(e => console.error('recordHistory failed', e.message));
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


function isSectionPipelineRole(roleKey) {
  return ['collaborator_1','collaborator_2','collaborator_3','collaborator','super_collaborator'].includes(normalizeRoleKey(roleKey));
}

function nextSectionSubmitStatus(roleKey) {
  const rk = normalizeRoleKey(roleKey);
  if (rk === 'collaborator_1') return 'submitted_to_collaborator_2';
  if (rk === 'collaborator_2') return 'submitted_to_collaborator_3';
  if (rk === 'collaborator_3') return 'submitted_to_collaborator';
  if (rk === 'collaborator') return 'submitted_to_super_collaborator';
  if (rk === 'super_collaborator') return 'submitted_to_supervisor';
  return null;
}

function returnSectionStatus(roleKey) {
  const rk = normalizeRoleKey(roleKey);
  if (rk === 'collaborator_2') return 'returned_by_collaborator_2';
  if (rk === 'collaborator_3') return 'returned_by_collaborator_3';
  if (rk === 'collaborator') return 'returned_by_collaborator';
  if (rk === 'super_collaborator') return 'returned_by_super_collaborator';
  if (rk === 'supervisor') return 'returned_by_supervisor';
  if (rk === 'deputy') return 'returned_by_deputy';
  if (rk === 'minister') return 'returned_by_minister';
  return 'returned';
}

function approveSectionStatus(roleKey) {
  const rk = normalizeRoleKey(roleKey);
  if (rk === 'super_collaborator') return 'approved_by_super_collaborator';
  if (rk === 'supervisor') return 'approved_by_supervisor';
  if (rk === 'deputy') return 'approved_by_deputy';
  if (rk === 'minister') return 'approved_by_minister';
  return null;
}

function decisionStatusesForRole(roleKey) {
  const rk = normalizeRoleKey(roleKey);
  if (rk === 'collaborator_2') return ['submitted_to_collaborator_2', 'returned_by_collaborator_2'];
  if (rk === 'collaborator_3') return ['submitted_to_collaborator_3', 'returned_by_collaborator_3'];
  if (rk === 'collaborator') return ['submitted_to_collaborator', 'returned_by_collaborator', 'approved_by_collaborator_2', 'approved_by_collaborator_3'];
  if (rk === 'super_collaborator') return [
    'submitted_to_super_collaborator', 'returned_by_super_collaborator', 'approved_by_collaborator',
    // Skip the Collaborator stage entirely
    'submitted_to_collaborator', 'returned_by_collaborator', 'approved_by_collaborator_3',
    // Skip Head Collaborator and Curator stages — bypass the entire lower pipeline
    'submitted_to_collaborator_2', 'returned_by_collaborator_2', 'approved_by_collaborator_2',
    'submitted_to_collaborator_3', 'returned_by_collaborator_3',
  ];
  if (rk === 'supervisor') return ['submitted_to_supervisor', 'returned_by_supervisor', 'approved_by_super_collaborator'];
  if (rk === 'deputy') return ['submitted_to_deputy', 'returned_by_deputy', 'approved_by_supervisor'];
  if (rk === 'minister') return ['submitted_to_minister', 'returned_by_minister'];
  if (rk === 'admin') return [
    'submitted_to_collaborator_2', 'returned_by_collaborator_2',
    'submitted_to_collaborator_3', 'returned_by_collaborator_3',
    'submitted_to_collaborator', 'returned_by_collaborator',
    'submitted_to_super_collaborator', 'returned_by_super_collaborator',
    'submitted_to_supervisor', 'returned_by_supervisor',
    'submitted_to_deputy', 'returned_by_deputy',
    'submitted_to_minister', 'returned_by_minister'
  ];
  return [];
}

// Determines which role currently holds the section (i.e. whose turn it is to act).
function currentHolderRole(status, returnTargetRole, originalSubmitterRole, lowerSubmitterRole) {
  const s = String(status || 'draft').toLowerCase();
  const skipCurator = String(lowerSubmitterRole || 'collaborator_2').toLowerCase() !== 'collaborator_3';
  if (s === 'draft' || s === 'in_progress') return normalizeRoleKey(originalSubmitterRole || 'collaborator_1');
  if (s.startsWith('returned_')) return normalizeRoleKey(returnTargetRole || originalSubmitterRole || 'collaborator_1');
  const directMap = {
    submitted_to_collaborator_2: 'collaborator_2',
    submitted_to_collaborator_3: 'collaborator_3',
    submitted_to_collaborator:   'collaborator',
    submitted_to_super_collaborator: 'super_collaborator',
    submitted_to_supervisor: 'supervisor',
    submitted_to_deputy:   'deputy',
    submitted_to_minister:   'minister',
  };
  if (directMap[s]) return directMap[s];
  if (s === 'approved_by_collaborator_2') return skipCurator ? 'collaborator' : 'collaborator_3';
  if (s === 'approved_by_collaborator_3') return 'collaborator';
  if (s === 'approved_by_collaborator')   return 'super_collaborator';
  if (s === 'approved_by_super_collaborator') return 'supervisor';
  if (s === 'approved_by_supervisor') return 'deputy';
  if (s === 'approved_by_deputy')   return 'minister';
  return normalizeRoleKey(originalSubmitterRole || 'collaborator_1');
}

async function getCurrentSectionStatus(eventId, countryId, sectionId) {
  const row = await queryOne(
    `SELECT status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );
  return String(row?.status || 'draft').toLowerCase();
}


async function userCanSeeEvent(user, event){
  const roleKey = normalizeRoleKey(user.role_key);
  // Upper-pipeline visibility: Deputy and Minister only see events that need them
  const submitterRole = String(event.submitter_role || 'deputy').toLowerCase();
  if (roleKey === 'deputy' && submitterRole === 'supervisor') return false;
  if (roleKey === 'minister' && submitterRole !== 'minister') return false;
  // Lower-pipeline visibility: Curator only sees events where Curator is in the pipeline
  const lowerSubmitterRole = String(event.lower_submitter_role || 'collaborator_2').toLowerCase();
  if (roleKey === 'collaborator_3' && lowerSubmitterRole !== 'collaborator_3') return false;

  if (!isSectionPipelineRole(roleKey)) return true;

  const countries = await getAssignedCountryIds(user.id);
  if (!countries.includes(Number(event.country_id))) return false;

  const sections = await getAssignedSectionIds(user.id);
  return await eventHasAnyRequiredSection(event.id, sections);
}

async function assertUserCanAccessEventSection(user, eventId, sectionId){
  const roleKey = normalizeRoleKey(user.role_key);
  if (!isSectionPipelineRole(roleKey)) return true;

  const event = await queryOne(`SELECT id, country_id FROM events WHERE id=$1`, [eventId]);
  if (!event) return false;

  const countries = await getAssignedCountryIds(user.id);
  if (!countries.includes(Number(event.country_id))) return false;

  const sections = await getAssignedSectionIds(user.id);
  const required = await queryOne(
    `SELECT 1 AS ok FROM event_required_sections WHERE event_id=$1 AND section_id=$2`,
    [eventId, sectionId]
  );
  if (!required) return false;

  if (['collaborator','super_collaborator'].includes(roleKey)) return true;
  if (!sections.includes(Number(sectionId))) return false;
  return true;
}


/**
 * Strip track-changes markup from HTML content.
 * - Removes <del ...>...</del> entirely (deleted text should not appear)
 * - Unwraps <ins ...>...</ins> keeping inner content (accepted insertions)
 * - Removes format-change spans (data-tc-fmt-id)
 * - Removes comment anchors (.gcp-cmt-anchor)
 */
function stripTrackChanges(html) {
  if (!html) return '';
  let s = html;
  // Remove <del data-tc-id="...">...</del> (may be nested, run twice)
  for (let i = 0; i < 3; i++) {
    s = s.replace(/<del\b[^>]*data-tc-id[^>]*>[\s\S]*?<\/del>/gi, '');
  }
  // Unwrap <ins data-tc-id="...">content</ins> → content
  s = s.replace(/<ins\b[^>]*data-tc-id[^>]*>([\s\S]*?)<\/ins>/gi, '$1');
  // Remove format-change spans
  s = s.replace(/<span\b[^>]*data-tc-fmt-id[^>]*>([\s\S]*?)<\/span>/gi, '$1');
  // Remove comment anchors
  s = s.replace(/<span\b[^>]*class="[^"]*gcp-cmt-anchor[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  return s;
}

function normalizeRoleKey(roleKey) {
  const k0 = String(roleKey || '').trim().toLowerCase();
  const k = k0.replace(/-/g, '_');
  return k;
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

  // Normalize deputy display role to deputy key
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
  const commentCol = set.has('deputy_comment') ? 'deputy_comment'
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
  // Create a minimal empty row — do NOT set last_updated_by_user_id or last_updated_at
  // so the editor can correctly show "No updates yet" for untouched sections.
  await pool.query(
    `INSERT INTO tp_content (event_id, country_id, section_id, html_content, status, status_comment)
     VALUES ($1,$2,$3,'','draft',NULL)
     ON CONFLICT (event_id, country_id, section_id) DO NOTHING`,
    [eventId, countryId, sectionId]
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
    submitterRole: event.submitter_role,
    lowerSubmitterRole: event.lower_submitter_role || 'collaborator_2',
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
  if (!isSectionPipelineRole(finalRole)) {
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
  if (!isSectionPipelineRole(rk)) return res.status(400).json({ error: 'Only collaborator pipeline roles can be assigned to sections' });

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
  if (!isSectionPipelineRole(roleKey)) {
    return res.status(400).json({ error: 'Assignments are allowed only for collaborator pipeline roles' });
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
  if (!isSectionPipelineRole(roleKey)) return res.json([]);

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
  if (!isSectionPipelineRole(roleKey)) return res.json([]);

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

  if (isSectionPipelineRole(roleKey)) {
    const countries = await getAssignedCountryIds(req.user.id);
    const sections = await getAssignedSectionIds(req.user.id);
    if (!countries.length || !sections.length) return res.json([]);

    where.push(`e.country_id = ANY($${idx++}::int[])`); vals.push(countries);
    where.push(`EXISTS (SELECT 1 FROM event_required_sections ers WHERE ers.event_id=e.id AND ers.section_id = ANY($${idx++}::int[]))`); vals.push(sections);
  }

  // Upper-pipeline visibility: Deputy and Minister only see events that need them
  if (roleKey === 'deputy') {
    where.push(`COALESCE(e.submitter_role,'deputy') <> 'supervisor'`);
  }
  if (roleKey === 'minister') {
    where.push(`COALESCE(e.submitter_role,'deputy') = 'minister'`);
  }
  // Lower-pipeline visibility: Curator only sees events where Curator is in the pipeline
  if (roleKey === 'collaborator_3') {
    where.push(`COALESCE(e.lower_submitter_role,'collaborator_2') = 'collaborator_3'`);
  }

  const rows = await queryAll(
    `
    SELECT e.id, e.country_id, c.name_en AS country_name_en, c.code AS country_code,
           e.title, e.occasion, e.submitter_role, e.lower_submitter_role, e.deadline_date, e.is_active, e.ended_at, e.created_at, e.updated_at
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

  if (isSectionPipelineRole(roleKey)) {
    const countries = await getAssignedCountryIds(req.user.id);
    const sections = await getAssignedSectionIds(req.user.id);
    if (!countries.length || !sections.length) return res.json([]);

    where.push(`e.country_id = ANY($${idx++}::int[])`); vals.push(countries);
    where.push(`EXISTS (SELECT 1 FROM event_required_sections ers WHERE ers.event_id=e.id AND ers.section_id = ANY($${idx++}::int[]))`); vals.push(sections);
  }

  // Upper-pipeline visibility: Deputy and Minister only see events that need them
  if (roleKey === 'deputy') {
    where.push(`COALESCE(e.submitter_role,'deputy') <> 'supervisor'`);
  }
  if (roleKey === 'minister') {
    where.push(`COALESCE(e.submitter_role,'deputy') = 'minister'`);
  }
  // Lower-pipeline visibility: Curator only sees events where Curator is in the pipeline
  if (roleKey === 'collaborator_3') {
    where.push(`COALESCE(e.lower_submitter_role,'collaborator_2') = 'collaborator_3'`);
  }

  const rows = await queryAll(
    `
    SELECT e.id, e.country_id, c.name_en AS country_name_en, c.code AS country_code,
           e.title, e.occasion, e.submitter_role, e.lower_submitter_role, e.deadline_date, e.ended_at
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
    // Document submission endpoint config (Supervisor / Deputy / Minister)
    submitter_role: event.submitter_role,
    submitterRole: event.submitter_role,
    deadline_date: event.deadline_date,
    is_active: event.is_active,
    ended_at: event.ended_at,
    required_sections: required
  });
  } catch (e) {
    console.error('GET /api/events/:id failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

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

    const roleKey = normalizeRoleKey(req.user.role_key);
    if (isSectionPipelineRole(roleKey)) {
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

// Return sections the *current user* is allowed to work on for a given event.
// This is the single source of truth for collaborator/super-collaborator dropdown filtering.
// GET /api/my/sections?event_id=123
app.get('/api/my/sections', authRequired, attachUser, async (req, res) => {
  try {
    const eventId = Number(req.query.event_id);
    if (!Number.isFinite(eventId) || eventId <= 0) return res.status(400).json({ error: 'event_id is required' });

    const roleKey = normalizeRoleKey(req.user?.role_key);

    // For non-pipeline roles, return all required sections. Lower pipeline roles only see their allowed sections.
    if (!isSectionPipelineRole(roleKey)) {
      const r = await pool.query(
        `
        SELECT s.id, s.label, s.order_index
        FROM event_required_sections ers
        JOIN sections s ON s.id = ers.section_id
        WHERE ers.event_id = $1
        ORDER BY s.order_index ASC, s.label ASC
        `,
        [eventId]
      );
      return res.json({ sections: r.rows });
    }

    // Collaborator/super-collaborator:
    // allowed sections = required sections for event ∩ section_assignments for user
    // plus a country guard (if the user has country assignments set, event.country_id must be one of them)
    const r = await pool.query(
      `
      WITH ev AS (
        SELECT id, country_id
        FROM events
        WHERE id = $1 AND is_active = TRUE
      ),
      required AS (
        SELECT section_id
        FROM event_required_sections
        WHERE event_id = $1
      ),
      assigned_sections AS (
        SELECT section_id
        FROM section_assignments
        WHERE user_id = $2
      ),
      assigned_countries AS (
        SELECT country_id
        FROM country_assignments
        WHERE user_id = $2
      )
      SELECT s.id, s.label, s.order_index
      FROM ev
      JOIN required rqs ON TRUE
      JOIN assigned_sections asg ON asg.section_id = rqs.section_id
      JOIN sections s ON s.id = rqs.section_id
      WHERE (
        NOT EXISTS (SELECT 1 FROM assigned_countries)
        OR ev.country_id IN (SELECT country_id FROM assigned_countries)
      )
      ORDER BY s.order_index ASC, s.label ASC
      `,
      [eventId, req.user.id]
    );

    return res.json({ sections: r.rows });
  } catch (e) {
    console.error('GET /api/my/sections failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Super-collaborators can also create/update events (they still cannot end events)
app.post('/api/events', requireRole('admin', 'deputy', 'minister', 'supervisor', 'protocol', 'super_collaborator', 'collaborator'), async (req, res) => {
  const { countryId, title, occasion, deadlineDate, requiredSectionIds, submitterRole, lowerSubmitterRole, language } = req.body || {};
  if (!countryId || !title) return res.status(400).json({ error: 'countryId and title required' });

  const normalizedSubmitterRole = ['supervisor','deputy','minister','super_collaborator'].includes(String(submitterRole||'').toLowerCase())
    ? String(submitterRole).toLowerCase()
    : 'deputy';
  const normalizedLowerSubmitterRole = String(lowerSubmitterRole||'').toLowerCase() === 'collaborator_3' ? 'collaborator_3' : 'collaborator_2';
  const normalizedLanguage = ['en','ka','ru'].includes(String(language||'').toLowerCase()) ? String(language).toLowerCase() : 'en';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ev = await client.query(
      `
      INSERT INTO events (country_id, title, occasion, submitter_role, lower_submitter_role, language, deadline_date, created_by_user_id, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
      RETURNING id
      `,
      [
        Number(countryId),
        String(title),
        occasion ? String(occasion) : null,
        normalizedSubmitterRole,
        normalizedLowerSubmitterRole,
        normalizedLanguage,
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

app.put('/api/events/:id', requireRole('admin', 'deputy', 'minister', 'supervisor', 'protocol', 'super_collaborator', 'collaborator'), async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid id' });

  const { countryId, title, occasion, deadlineDate, isActive, requiredSectionIds, submitterRole, lowerSubmitterRole, language } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields = [];
    const vals = [];
    let idx = 1;

    if (countryId !== undefined) { fields.push(`country_id=$${idx++}`); vals.push(Number(countryId)); }
    if (title !== undefined) { fields.push(`title=$${idx++}`); vals.push(String(title)); }
    if (occasion !== undefined) { fields.push(`occasion=$${idx++}`); vals.push(occasion ? String(occasion) : null); }
    if (submitterRole !== undefined) {
      const nsr = ['supervisor','deputy','minister','super_collaborator'].includes(String(submitterRole||'').toLowerCase())
        ? String(submitterRole).toLowerCase()
        : 'deputy';
      fields.push(`submitter_role=$${idx++}`);
      vals.push(nsr);
    }
    if (lowerSubmitterRole !== undefined) {
      const nlsr = String(lowerSubmitterRole||'').toLowerCase() === 'collaborator_3' ? 'collaborator_3' : 'collaborator_2';
      fields.push(`lower_submitter_role=$${idx++}`);
      vals.push(nlsr);
    }
    if (language !== undefined) {
      const nl = ['en','ka','ru'].includes(String(language||'').toLowerCase()) ? String(language).toLowerCase() : 'en';
      fields.push(`language=$${idx++}`);
      vals.push(nl);
    }
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
app.post('/api/events/:id/end', requireRole('admin','supervisor','deputy','protocol'), async (req, res) => {
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
  const isCollab = isSectionPipelineRole(roleKey);
  const isElevated = ['admin','supervisor','deputy','minister','protocol','viewer'].includes(roleKey);
  if (!isCollab && !isElevated) return res.status(403).json({ error: 'Forbidden' });

  // Pipeline roles may access assigned sections and, for collaborator/super-collaborator,
  // sections currently at their review stage so they can work like lower-level supervisors.
  if (isCollab) {
    let ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
    if (!ok && ['collaborator','super_collaborator'].includes(roleKey)) {
      const countryIdForAccess = await resolveCountryIdForEvent(eventId);
      if (countryIdForAccess) {
        const currentStatus = await getCurrentSectionStatus(eventId, countryIdForAccess, sectionId);
        ok = decisionStatusesForRole(roleKey).includes(currentStatus);
      }
    }
    // collaborator_2 / collaborator_3 may be section-assigned without country assignment;
    // allow access when section is assigned to them and status is draft or their decision status.
    if (!ok && ['collaborator_2','collaborator_3'].includes(roleKey)) {
      const countryIdForAccess = await resolveCountryIdForEvent(eventId);
      if (countryIdForAccess) {
        const currentStatus = await getCurrentSectionStatus(eventId, countryIdForAccess, sectionId);
        const assignedSections = await getAssignedSectionIds(req.user.id);
        const required = await queryOne(
          `SELECT 1 AS ok FROM event_required_sections WHERE event_id=$1 AND section_id=$2`,
          [eventId, sectionId]
        );
        ok = !!required && assignedSections.includes(Number(sectionId)) &&
             (currentStatus === 'draft' || decisionStatusesForRole(roleKey).includes(currentStatus));
      }
    }
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
    e.submitter_role AS document_submitter_role,
    c.name_en AS country_name,
    s.id AS section_id,
    s.label AS section_label,
    t.html_content,
    t.status,
    t.status_comment,
    t.return_target_role,
    t.original_submitter_role,
    t.last_updated_at,
    u.full_name AS last_updated_by,
    t.last_content_edited_at,
    ue.full_name AS last_content_edited_by
  FROM tp_content t
  JOIN events e ON e.id = t.event_id
  JOIN countries c ON c.id = t.country_id
  JOIN sections s ON s.id = t.section_id
  LEFT JOIN users u ON u.id = t.last_updated_by_user_id
  LEFT JOIN users ue ON ue.id = t.last_content_edited_by_user_id
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
  htmlContent: req.query.clean === '1' ? stripTrackChanges(row.html_content || '') : (row.html_content || ''),
  status: row.status || 'draft',
  statusComment: row.status_comment || null,
  returnTargetRole: row.return_target_role || null,
  originalSubmitterRole: row.original_submitter_role || null,
  documentSubmitterRole: row.document_submitter_role || 'deputy',
  lastUpdatedAt: row.last_updated_at,
  lastUpdatedBy: row.last_updated_by || null,
  lastContentEditedAt: row.last_content_edited_at || null,
  lastContentEditedBy: row.last_content_edited_by || null,
  stepNames: await (async () => {
    const snRes = await pool.query(
      `SELECT u.full_name, r.key AS role_key
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN country_assignments ca ON ca.user_id = u.id AND ca.country_id = $1
       JOIN section_assignments sa ON sa.user_id = u.id AND sa.section_id = $2
       WHERE u.is_active = true AND u.deleted_at IS NULL
         AND r.key IN ('collaborator_1','collaborator_2')`,
      [countryId, sectionId]
    );
    const sn = { collabI: null, collabII: null };
    for (const u of snRes.rows) {
      if (u.role_key === 'collaborator_1') sn.collabI = u.full_name;
      if (u.role_key === 'collaborator_2') sn.collabII = u.full_name;
    }
    return sn;
  })()
});
} catch (e) {
    console.error('GET /api/tp failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tp/save', authRequired, asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  const htmlContent = String(req.body?.htmlContent || '');

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  const isCollab = isSectionPipelineRole(roleKey);
  const canEdit = ['collaborator_1','collaborator_2','collaborator_3','collaborator','super_collaborator','supervisor','deputy','minister','admin'].includes(roleKey);
  if (!canEdit) return res.status(403).json({ error: 'Forbidden' });

  // Pipeline roles may edit assigned sections and, for collaborator/super-collaborator,
  // sections currently at their review stage so they can work like lower-level supervisors.
  if (isCollab) {
    let ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
    if (!ok && ['collaborator','super_collaborator'].includes(roleKey)) {
      const countryIdForAccess = await resolveCountryIdForEvent(eventId);
      if (countryIdForAccess) {
        const currentStatus = await getCurrentSectionStatus(eventId, countryIdForAccess, sectionId);
        ok = decisionStatusesForRole(roleKey).includes(currentStatus);
      }
    }
    if (!ok && ['collaborator_2','collaborator_3'].includes(roleKey)) {
      const countryIdForAccess = await resolveCountryIdForEvent(eventId);
      if (countryIdForAccess) {
        const currentStatus = await getCurrentSectionStatus(eventId, countryIdForAccess, sectionId);
        const assignedSections = await getAssignedSectionIds(req.user.id);
        const required = await queryOne(
          `SELECT 1 AS ok FROM event_required_sections WHERE event_id=$1 AND section_id=$2`,
          [eventId, sectionId]
        );
        ok = !!required && assignedSections.includes(Number(sectionId)) &&
             (currentStatus === 'draft' || decisionStatusesForRole(roleKey).includes(currentStatus));
      }
    }
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
  }


  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  // Save behavior:
  // - Pipeline roles keep the current workflow stage while editing.
  // - Elevated approvers save content only; they do not change stage on save.
  const currentStatusRow = await queryOne(`SELECT status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`, [eventId, countryId, sectionId]);
  const currentStatus = currentStatusRow?.status || 'draft';

  await pool.query(
    `
    UPDATE tp_content
    SET html_content=$4, last_updated_at=NOW(), last_updated_by_user_id=$5,
        last_content_edited_at=NOW(), last_content_edited_by_user_id=$5
    WHERE event_id=$1 AND country_id=$2 AND section_id=$3
    `,
    [eventId, countryId, sectionId, htmlContent, req.user.id]
  );

  await recordHistory({ eventId, countryId, sectionId, action: 'saved', fromStatus: currentStatus, toStatus: currentStatus,
    userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: roleKey });

  return res.json({ success:true });
}));

// Ask to Return — any user can request the current holder to return a section
app.post('/api/tp/ask-to-return', authRequired, async (req, res) => {
  try {
    const eventId  = Number(req.body?.eventId);
    const sectionId = Number(req.body?.sectionId);
    const note = String(req.body?.note || '').trim();
    if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
      return res.status(400).json({ error: 'eventId and sectionId required' });
    }
    const countryId = await resolveCountryIdForEvent(eventId);
    if (!countryId) return res.status(404).json({ error: 'Event not found' });

    const row = await queryOne(
      `SELECT status::text, return_target_role, original_submitter_role FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
      [eventId, countryId, sectionId]
    );
    const evMeta = await queryOne(`SELECT lower_submitter_role FROM events WHERE id=$1`, [eventId]);
    const lsr = String(evMeta?.lower_submitter_role || 'collaborator_2').toLowerCase();

    const holder = currentHolderRole(row?.status, row?.return_target_role, row?.original_submitter_role, lsr);
    const roleKey = normalizeRoleKey(req.user.role_key);
    if (holder === roleKey) {
      return res.status(400).json({ error: 'Section is already at your stage — use Return directly.' });
    }

    await pool.query(
      `INSERT INTO section_return_requests
         (event_id, country_id, section_id, requested_by_user_id, requested_by_name, requested_by_role, directed_to_role, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [eventId, countryId, sectionId, req.user.id, req.user.full_name || req.user.username, roleKey, holder, note || null]
    );
    await recordHistory({
      eventId, countryId, sectionId,
      action: 'asked_to_return',
      fromStatus: row?.status || null,
      toStatus: row?.status || null,
      userId: req.user.id,
      userName: req.user.full_name || req.user.username,
      userRole: roleKey,
      note: note || null,
    });
    return res.json({ success: true, directedToRole: holder });
  } catch (e) {
    console.error('ask-to-return error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tp/submit', authRequired, attachUser, asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  // null = not provided (dashboard submit — preserve existing content)
  // string = editor submit — update content
  const htmlContent = req.body?.htmlContent != null ? String(req.body.htmlContent) : null;

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (!isSectionPipelineRole(roleKey)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
  if (!ok && ['collaborator','super_collaborator'].includes(roleKey)) {
    const countryIdForAccess = await resolveCountryIdForEvent(eventId);
    if (countryIdForAccess) {
      const currentStatus = await getCurrentSectionStatus(eventId, countryIdForAccess, sectionId);
      ok = decisionStatusesForRole(roleKey).includes(currentStatus);
    }
  }
  if (!ok && ['collaborator_2','collaborator_3'].includes(roleKey)) {
    const countryIdForAccess = await resolveCountryIdForEvent(eventId);
    if (countryIdForAccess) {
      const currentStatus = await getCurrentSectionStatus(eventId, countryIdForAccess, sectionId);
      const assignedSections = await getAssignedSectionIds(req.user.id);
      const required = await queryOne(
        `SELECT 1 AS ok FROM event_required_sections WHERE event_id=$1 AND section_id=$2`,
        [eventId, sectionId]
      );
      ok = !!required && assignedSections.includes(Number(sectionId)) &&
           (currentStatus === 'draft' || decisionStatusesForRole(roleKey).includes(currentStatus));
    }
  }
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  let targetStatus = nextSectionSubmitStatus(roleKey);
  if (roleKey === 'collaborator_2') {
    const evMetaLsr = await queryOne(`SELECT lower_submitter_role FROM events WHERE id=$1`, [eventId]);
    const lsr = String(evMetaLsr?.lower_submitter_role || 'collaborator_2').toLowerCase();
    if (lsr !== 'collaborator_3') targetStatus = 'submitted_to_collaborator';
  }
  if (!targetStatus) return res.status(400).json({ error: 'Unsupported role for submit' });

  const fromStatusRow = await queryOne(`SELECT status::text AS status, original_submitter_role FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`, [eventId, countryId, sectionId]);
  const fromStatus = fromStatusRow?.status || 'draft';
  // Set original_submitter_role when starting a new round (from draft or any returned state)
  const isNewRound = fromStatus === 'draft' || fromStatus.startsWith('returned_by');

  if (isNewRound) {
    if (htmlContent !== null) {
      await pool.query(
        `UPDATE tp_content
         SET html_content=$4, last_updated_at=NOW(), last_updated_by_user_id=$5, status=$6, status_comment=NULL,
             original_submitter_role=$7, return_target_role=NULL,
             last_content_edited_at=NOW(), last_content_edited_by_user_id=$5
         WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
        [eventId, countryId, sectionId, htmlContent, req.user.id, targetStatus, roleKey]
      );
    } else {
      await pool.query(
        `UPDATE tp_content
         SET last_updated_at=NOW(), last_updated_by_user_id=$4, status=$5, status_comment=NULL,
             original_submitter_role=$6, return_target_role=NULL
         WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
        [eventId, countryId, sectionId, req.user.id, targetStatus, roleKey]
      );
    }
  } else {
    if (htmlContent !== null) {
      await pool.query(
        `UPDATE tp_content
         SET html_content=$4, last_updated_at=NOW(), last_updated_by_user_id=$5, status=$6, status_comment=NULL,
             last_content_edited_at=NOW(), last_content_edited_by_user_id=$5
         WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
        [eventId, countryId, sectionId, htmlContent, req.user.id, targetStatus]
      );
    } else {
      await pool.query(
        `UPDATE tp_content
         SET last_updated_at=NOW(), last_updated_by_user_id=$4, status=$5, status_comment=NULL
         WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
        [eventId, countryId, sectionId, req.user.id, targetStatus]
      );
    }
  }

  // Clear any pending return requests for this section now that it has been re-submitted
  await pool.query(
    `DELETE FROM section_return_requests WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );

  await recordHistory({ eventId, countryId, sectionId, action: 'submitted', fromStatus, toStatus: targetStatus,
    userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: roleKey });

  return res.json({ success:true, status: targetStatus });
}));

app.post('/api/tp/return', requireRole('collaborator_2','collaborator_3','collaborator','super_collaborator','supervisor','deputy','minister','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  const note = String((req.body?.note ?? req.body?.comment) || '');

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (isSectionPipelineRole(roleKey)) {
    const ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
  }

  const returnStatus = returnSectionStatus(roleKey);

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  const contentRow = await queryOne(
    `SELECT status::text AS status, original_submitter_role FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );
  const currentStatus = contentRow?.status || 'draft';
  const originalSubmitterRole = contentRow?.original_submitter_role || null;

  const allowedStatuses = decisionStatusesForRole(roleKey);
  // Allow return if section is in allowed statuses OR if this role is the return_target
  const retTargetRow = await queryOne(
    `SELECT return_target_role FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );
  const isReturnTarget = retTargetRow?.return_target_role === roleKey;
  // Upper-tier roles can return sections at any stage before their approval level.
  // If the role IS the document submitter (final approver), they can return from their own
  // approved state so they can still edit and re-approve after approving.
  let finalApproverRole = null;
  if ((roleKey === 'deputy' && currentStatus === 'approved_by_deputy') ||
      (roleKey === 'minister' && currentStatus === 'approved_by_minister')) {
    const evMetaRet = await queryOne(`SELECT submitter_role FROM events WHERE id=$1`, [eventId]);
    const evSubmitter = String(evMetaRet?.submitter_role || '').toLowerCase();
    if (evSubmitter === roleKey) finalApproverRole = roleKey;
  }
  const upperTierBeyond = {
    supervisor: ['approved_by_supervisor','submitted_to_deputy','returned_by_deputy',
      'approved_by_deputy','submitted_to_minister','returned_by_minister','approved_by_minister','approved','locked'],
    deputy:   [
      ...(finalApproverRole === 'deputy' ? [] : ['approved_by_deputy']),
      'submitted_to_minister','returned_by_minister',
      'approved_by_minister','approved','locked'
    ],
    minister:   [
      ...(finalApproverRole === 'minister' ? [] : ['approved_by_minister']),
      'approved','locked'
    ],
  };
  const upperTierPreReturn = upperTierBeyond[roleKey] && !upperTierBeyond[roleKey].includes(currentStatus);
  if (!upperTierPreReturn && allowedStatuses.length && !allowedStatuses.includes(currentStatus) && !isReturnTarget) {
    return res.status(400).json({ error: 'Section is not at your review stage' });
  }

  // Determine where to return: collab_2 always returns to collab_1; others return to original submitter
  let returnTarget;
  if (roleKey === 'collaborator_2') {
    returnTarget = 'collaborator_1';
  } else {
    returnTarget = originalSubmitterRole || 'collaborator_1';
  }

  await pool.query(
    `UPDATE tp_content
     SET status=$4, status_comment=$5, last_updated_at=NOW(), last_updated_by_user_id=$6, return_target_role=$7
     WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId, returnStatus, note, req.user.id, returnTarget]
  );

  await pool.query(
    `DELETE FROM section_return_requests WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );

  await recordHistory({ eventId, countryId, sectionId, action: 'returned', fromStatus: currentStatus, toStatus: returnStatus,
    userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: roleKey, note });

  return res.json({ success:true, status: returnStatus });
}));

app.post('/api/tp/approve-section', requireRole('super_collaborator','supervisor','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (isSectionPipelineRole(roleKey)) {
    const ok = await assertUserCanAccessEventSection(req.user, eventId, sectionId);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
  }
  const targetStatus = approveSectionStatus(roleKey);
  if (!targetStatus) return res.status(400).json({ error: 'Unsupported role for approve' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  const contentRowApp = await queryOne(
    `SELECT status::text AS status, original_submitter_role FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );
  const currentStatus = contentRowApp?.status || 'draft';
  const allowedStatuses = decisionStatusesForRole(roleKey);
  // super_collaborator can act as lowest: approve sections at draft state
  const canActAsLowest = roleKey === 'super_collaborator' && currentStatus === 'draft';
  // Supervisor can approve sections at any stage before their approval level
  const supervisorPreApproval = roleKey === 'supervisor' && !['approved_by_supervisor',
    'submitted_to_deputy','returned_by_deputy','approved_by_deputy',
    'submitted_to_minister','returned_by_minister','approved_by_minister','approved','locked',
  ].includes(currentStatus);
  // Deputy/minister can re-approve a section already at their approved state if they are the final approver
  let upperTierReApprove = false;
  if ((roleKey === 'deputy' && currentStatus === 'approved_by_deputy') ||
      (roleKey === 'minister' && currentStatus === 'approved_by_minister')) {
    const evMetaApprove = await queryOne(`SELECT submitter_role FROM events WHERE id=$1`, [eventId]);
    upperTierReApprove = String(evMetaApprove?.submitter_role || '').toLowerCase() === roleKey;
  }
  if (!supervisorPreApproval && !upperTierReApprove && allowedStatuses.length && !allowedStatuses.includes(currentStatus) && !canActAsLowest) {
    return res.status(400).json({ error: 'Section is not at your review stage' });
  }

  // Set original_submitter_role when acting outside the normal pipeline entry point
  const setOriginalRole = canActAsLowest ||
    (supervisorPreApproval && !contentRowApp?.original_submitter_role);
  if (setOriginalRole) {
    // Acting as lowest: set original_submitter_role
    await pool.query(
      `UPDATE tp_content
       SET status=$4, status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$5,
           original_submitter_role=$6, return_target_role=NULL
       WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
      [eventId, countryId, sectionId, targetStatus, req.user.id, roleKey]
    );
  } else {
    await pool.query(
      `UPDATE tp_content
       SET status=$4, status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$5
       WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
      [eventId, countryId, sectionId, targetStatus, req.user.id]
    );
  }

  await pool.query(
    `DELETE FROM section_return_requests WHERE event_id=$1 AND country_id=$2 AND section_id=$3`,
    [eventId, countryId, sectionId]
  );

  await recordHistory({ eventId, countryId, sectionId, action: 'approved', fromStatus: currentStatus, toStatus: targetStatus,
    userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: roleKey });

  return res.json({ success:true, status: targetStatus });
}));

app.post('/api/tp/approve-all-sections', requireRole('supervisor','deputy','minister','admin'), async (req, res) => {
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
    const roleKey = normalizeRoleKey(req.user.role_key);
    let sectionIds = required.map(r => Number(r.section_id)).filter(n => Number.isFinite(n));
    if (isSectionPipelineRole(roleKey)) {
      const assignedSectionIds = await getAssignedSectionIds(req.user.id);
      sectionIds = sectionIds.filter(id => assignedSectionIds.includes(id));
    }
    if (sectionIds.length === 0) return res.json({ success:true, approved: 0 });

    for (const sid of sectionIds) {
      await ensureTpRow(eventId, countryId, sid, req.user.id);
    }

    const targetStatus = approveSectionStatus(roleKey);
    if (!targetStatus) return res.status(400).json({ error: 'Unsupported role for bulk approve' });

    const allowedStatuses = decisionStatusesForRole(roleKey);
    // Fetch from-statuses before update so we can record accurate history
    const beforeRows = await queryAll(
      `SELECT section_id, status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=ANY($3::int[]) AND status=ANY($4::text[])`,
      [eventId, countryId, sectionIds, allowedStatuses]
    );
    const { rows } = await pool.query(
      `
      UPDATE tp_content
      SET status=$4, status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$5
      WHERE event_id=$1 AND country_id=$2 AND section_id = ANY($3::int[])
        AND status = ANY($6::text[])
      RETURNING section_id
      `,
      [eventId, countryId, sectionIds, targetStatus, req.user.id, allowedStatuses]
    );
    const updatedSet = new Set(rows.map(r => Number(r.section_id)));
    for (const br of beforeRows) {
      if (updatedSet.has(Number(br.section_id))) {
        await recordHistory({ eventId, countryId, sectionId: Number(br.section_id), action: 'approved',
          fromStatus: br.status, toStatus: targetStatus,
          userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: roleKey });
      }
    }

    return res.json({ success:true, approved: rows.length, status: targetStatus });
  } catch (e) {
    console.error('POST /api/tp/approve-all-sections failed', e);
    return res.status(500).json({ error: 'Server error' });
  }
});



app.post('/api/tp/submit-approved-to-collaborator-3', requireRole('collaborator_2','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  // Check event's lower_submitter_role to determine routing
  const evMetaBatch = await queryOne(`SELECT lower_submitter_role FROM events WHERE id=$1`, [eventId]);
  const batchLsr = String(evMetaBatch?.lower_submitter_role || 'collaborator_2').toLowerCase();
  const skipCurator = batchLsr !== 'collaborator_3';
  const targetBatchStatus = skipCurator ? 'submitted_to_collaborator' : 'submitted_to_collaborator_3';
  const eligibleStatuses = skipCurator
    ? ['approved_by_collaborator_2', 'returned_by_collaborator']
    : ['approved_by_collaborator_2', 'returned_by_collaborator_3'];

  let sectionIds = await queryAll(
    `SELECT section_id FROM event_required_sections WHERE event_id=$1 ORDER BY section_id ASC`,
    [eventId]
  );
  sectionIds = sectionIds.map(r => Number(r.section_id)).filter(Number.isFinite);

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'collaborator_2') {
    const assignedSectionIds = await getAssignedSectionIds(req.user.id);
    sectionIds = sectionIds.filter(id => assignedSectionIds.includes(id));
  }
  if (!sectionIds.length) return res.json({ success:true, submitted: 0 });

  for (const sid of sectionIds) {
    await ensureTpRow(eventId, countryId, sid, req.user.id);
  }

  const eligibleStatusSql = eligibleStatuses.map(s => `'${s}'`).join(',');
  const beforeRows3 = await queryAll(
    `SELECT section_id, status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=ANY($3::int[]) AND (status IN (${eligibleStatusSql}) OR return_target_role='collaborator_2')`,
    [eventId, countryId, sectionIds]
  );
  const { rows } = await pool.query(
    `
    UPDATE tp_content
    SET status=$5, status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4, return_target_role=NULL
    WHERE event_id=$1 AND country_id=$2 AND section_id = ANY($3::int[])
      AND (status IN (${eligibleStatusSql}) OR return_target_role='collaborator_2')
    RETURNING section_id
    `,
    [eventId, countryId, sectionIds, req.user.id, targetBatchStatus]
  );
  const updatedSet3 = new Set(rows.map(r => Number(r.section_id)));
  for (const br of beforeRows3) {
    if (updatedSet3.has(Number(br.section_id))) {
      await recordHistory({ eventId, countryId, sectionId: Number(br.section_id), action: 'submitted',
        fromStatus: br.status, toStatus: targetBatchStatus,
        userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: normalizeRoleKey(req.user.role_key) });
    }
  }

  return res.json({ success:true, submitted: rows.length, status: targetBatchStatus });
}));

app.post('/api/tp/submit-approved-to-collaborator', requireRole('collaborator_3','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  let sectionIds = await queryAll(
    `SELECT section_id FROM event_required_sections WHERE event_id=$1 ORDER BY section_id ASC`,
    [eventId]
  );
  sectionIds = sectionIds.map(r => Number(r.section_id)).filter(Number.isFinite);

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'collaborator_3') {
    const assignedSectionIds = await getAssignedSectionIds(req.user.id);
    sectionIds = sectionIds.filter(id => assignedSectionIds.includes(id));
  }
  if (!sectionIds.length) return res.json({ success:true, submitted: 0 });

  for (const sid of sectionIds) {
    await ensureTpRow(eventId, countryId, sid, req.user.id);
  }

  const beforeRowsC = await queryAll(
    `SELECT section_id, status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=ANY($3::int[]) AND (status IN ('approved_by_collaborator_3','returned_by_collaborator') OR return_target_role='collaborator_3')`,
    [eventId, countryId, sectionIds]
  );
  const { rows } = await pool.query(
    `
    UPDATE tp_content
    SET status='submitted_to_collaborator', status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4, return_target_role=NULL
    WHERE event_id=$1 AND country_id=$2 AND section_id = ANY($3::int[])
      AND (status IN ('approved_by_collaborator_3','returned_by_collaborator') OR return_target_role='collaborator_3')
    RETURNING section_id
    `,
    [eventId, countryId, sectionIds, req.user.id]
  );
  { const us = new Set(rows.map(r=>Number(r.section_id))); for (const br of beforeRowsC) { if (us.has(Number(br.section_id))) await recordHistory({ eventId, countryId, sectionId: Number(br.section_id), action:'submitted', fromStatus:br.status, toStatus:'submitted_to_collaborator', userId:req.user.id, userName:req.user.full_name||req.user.username, userRole:normalizeRoleKey(req.user.role_key) }); } }

  return res.json({ success:true, submitted: rows.length, status: 'submitted_to_collaborator' });
}));

app.post('/api/tp/submit-approved-to-super-collaborator', requireRole('collaborator','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ error: 'eventId required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  let sectionIds = await queryAll(
    `SELECT section_id FROM event_required_sections WHERE event_id=$1 ORDER BY section_id ASC`,
    [eventId]
  );
  sectionIds = sectionIds.map(r => Number(r.section_id)).filter(Number.isFinite);

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'collaborator') {
    const assignedSectionIds = await getAssignedSectionIds(req.user.id);
    sectionIds = sectionIds.filter(id => assignedSectionIds.includes(id));
  }
  if (!sectionIds.length) return res.json({ success:true, submitted: 0 });

  for (const sid of sectionIds) {
    await ensureTpRow(eventId, countryId, sid, req.user.id);
  }

  const beforeRowsSC = await queryAll(
    `SELECT section_id, status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=ANY($3::int[])
     AND (status IN ('submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator',
                     'approved_by_collaborator_2','approved_by_collaborator_3','returned_by_super_collaborator')
          OR return_target_role='collaborator')`,
    [eventId, countryId, sectionIds]
  );
  const { rows } = await pool.query(
    `
    UPDATE tp_content
    SET status='submitted_to_super_collaborator', status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4, return_target_role=NULL
    WHERE event_id=$1 AND country_id=$2 AND section_id = ANY($3::int[])
      AND (status IN ('submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator',
                      'approved_by_collaborator_2','approved_by_collaborator_3','returned_by_super_collaborator')
           OR return_target_role='collaborator')
    RETURNING section_id
    `,
    [eventId, countryId, sectionIds, req.user.id]
  );
  { const us = new Set(rows.map(r=>Number(r.section_id))); for (const br of beforeRowsSC) { if (us.has(Number(br.section_id))) await recordHistory({ eventId, countryId, sectionId: Number(br.section_id), action:'submitted', fromStatus:br.status, toStatus:'submitted_to_super_collaborator', userId:req.user.id, userName:req.user.full_name||req.user.username, userRole:normalizeRoleKey(req.user.role_key) }); } }

  return res.json({ success:true, submitted: rows.length, status: 'submitted_to_super_collaborator' });
}));

app.post('/api/tp/submit-approved-to-supervisor', requireRole('super_collaborator','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ error: 'eventId required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  let sectionIds = await queryAll(
    `SELECT section_id FROM event_required_sections WHERE event_id=$1 ORDER BY section_id ASC`,
    [eventId]
  );
  sectionIds = sectionIds.map(r => Number(r.section_id)).filter(Number.isFinite);

  const roleKey = normalizeRoleKey(req.user.role_key);
  if (roleKey === 'super_collaborator') {
    const assignedSectionIds = await getAssignedSectionIds(req.user.id);
    sectionIds = sectionIds.filter(id => assignedSectionIds.includes(id));
  }
  if (!sectionIds.length) return res.json({ success:true, submitted: 0 });

  for (const sid of sectionIds) {
    await ensureTpRow(eventId, countryId, sid, req.user.id);
  }

  const beforeRowsSup = await queryAll(
    `SELECT section_id, status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=ANY($3::int[]) AND (status IN ('approved_by_super_collaborator','returned_by_supervisor') OR return_target_role='super_collaborator')`,
    [eventId, countryId, sectionIds]
  );
  const { rows } = await pool.query(
    `
    UPDATE tp_content
    SET status='submitted_to_supervisor', status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4, return_target_role=NULL
    WHERE event_id=$1 AND country_id=$2 AND section_id = ANY($3::int[])
      AND (status IN ('approved_by_super_collaborator','returned_by_supervisor') OR return_target_role='super_collaborator')
    RETURNING section_id
    `,
    [eventId, countryId, sectionIds, req.user.id]
  );
  { const us = new Set(rows.map(r=>Number(r.section_id))); for (const br of beforeRowsSup) { if (us.has(Number(br.section_id))) await recordHistory({ eventId, countryId, sectionId: Number(br.section_id), action:'submitted', fromStatus:br.status, toStatus:'submitted_to_supervisor', userId:req.user.id, userName:req.user.full_name||req.user.username, userRole:normalizeRoleKey(req.user.role_key) }); } }

  return res.json({ success:true, submitted: rows.length, status: 'submitted_to_supervisor' });
}));

app.post('/api/tp/approve-section-deputy', requireRole('deputy','minister','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  const sectionId = Number(req.body?.sectionId);
  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'eventId and sectionId required' });
  }

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  await ensureDocumentStatus(eventId, countryId);
  await ensureTpRow(eventId, countryId, sectionId, req.user.id);

  const roleKey = normalizeRoleKey(req.user.role_key);
  const targetStatus = (roleKey === 'minister') ? 'approved_by_minister' : 'approved_by_deputy';

  const fromStatusRow2 = await queryOne(`SELECT status::text AS status FROM tp_content WHERE event_id=$1 AND country_id=$2 AND section_id=$3`, [eventId, countryId, sectionId]);
  const fromStatus2 = fromStatusRow2?.status || 'draft';

  await pool.query(
    `
    UPDATE tp_content
    SET status=$5, status_comment=NULL, last_updated_at=NOW(), last_updated_by_user_id=$4
    WHERE event_id=$1 AND country_id=$2 AND section_id=$3
    `,
    [eventId, countryId, sectionId, req.user.id, targetStatus]
  );

  await recordHistory({ eventId, countryId, sectionId, action: 'approved', fromStatus: fromStatus2, toStatus: targetStatus,
    userId: req.user.id, userName: req.user.full_name || req.user.username, userRole: roleKey });

  return res.json({ success:true });
}));

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
    deputyComment: row.deputy_comment,
    updatedAt: row.updated_at,
  });
});

// Spec v2: document status endpoint
app.get('/api/tp/document-status', async (req, res) => {
  const eventId = Number(req.query.event_id);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'event_id required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  // Provide the event's chosen submitter role so the frontend can render the correct workflow steps.
  const evMeta = await queryOne(`SELECT submitter_role FROM events WHERE id=$1`, [eventId]);
  const submitterRole = String(evMeta?.submitter_role || 'deputy').toLowerCase();

  await ensureDocumentStatus(eventId, countryId);
  const row = await queryOne(`SELECT * FROM document_status WHERE event_id=$1 AND country_id=$2`, [eventId, countryId]);

  return res.json({
    eventId: row.event_id,
    status: row.status,
    deputyComment: row.deputy_comment,
    updatedAt: row.updated_at,
    submitterRole,
  });
});

// Spec v2: per-section status grid

app.get('/api/tp/status-grid', authRequired, async (req, res) => {
  try {
    const eventId = parseInt(req.query.event_id, 10);
    if (!eventId) return res.status(400).json({ error: 'event_id required' });

    const roleKey = normalizeRoleKey(req.user.role_key);

    // Resolve the event's country_id (tp_content is keyed by event_id + country_id + section_id)
    const countryId = await resolveCountryIdForEvent(eventId);
    if (!countryId) return res.status(404).json({ error: 'event not found' });

    const evMetaGrid = await queryOne(`SELECT lower_submitter_role, submitter_role FROM events WHERE id=$1`, [eventId]);
    const lowerSubmitterRole = String(evMetaGrid?.lower_submitter_role || 'collaborator_2').toLowerCase();
    const documentSubmitterRole = String(evMetaGrid?.submitter_role || 'deputy').toLowerCase();

    // Curator only participates when the event pipeline includes Curator
    if (roleKey === 'collaborator_3' && lowerSubmitterRole !== 'collaborator_3') {
      return res.json({ event_id: eventId, country_id: countryId, lowerSubmitterRole, sections: [] });
    }

    let q = `
      SELECT
        ers.section_id AS id,
        s.label,
        s.order_index,
        COALESCE(t.status::text, 'draft') AS status,
        t.status_comment,
        t.last_content_edited_at AS last_updated_at,
        ue.full_name AS last_updated_by,
        t.original_submitter_role,
        t.return_target_role
      FROM event_required_sections ers
      JOIN sections s ON s.id = ers.section_id
      LEFT JOIN tp_content t
        ON t.event_id = ers.event_id
       AND t.country_id = $2
       AND t.section_id = ers.section_id
      LEFT JOIN users ue ON ue.id = t.last_content_edited_by_user_id
      WHERE ers.event_id = $1
    `;
    const params = [eventId, countryId];
    let assignedSectionIds = [];
    if (isSectionPipelineRole(roleKey)) {
      assignedSectionIds = await getAssignedSectionIds(req.user.id);
      const shouldRestrictToAssigned = !['collaborator','super_collaborator'].includes(roleKey);
      if (shouldRestrictToAssigned) {
        if (!assignedSectionIds.length) {
          return res.json({ event_id: eventId, country_id: countryId, sections: [] });
        }
        q += ` AND ers.section_id = ANY($3::int[])`;
        params.push(assignedSectionIds);
      }
    }
    q += ` ORDER BY s.order_index ASC, s.id ASC`;
    const { rows } = await pool.query(q, params);
    const assignedSet = new Set((assignedSectionIds || []).map(Number));

    // Fetch names from history: a user's name appears on a step only after they've acted.
    const sectionIds = rows.map(r => Number(r.id));
    let stepNameRows = [];
    if (sectionIds.length) {
      const snRes = await pool.query(
        `SELECT DISTINCT ON (section_id, user_role)
           section_id, user_name AS full_name, user_role AS role_key
         FROM tp_section_history
         WHERE event_id = $1 AND section_id = ANY($2::int[])
           AND user_role IN ('collaborator_1','collaborator_2','collaborator_3','collaborator','super_collaborator')
         ORDER BY section_id, user_role, acted_at ASC`,
        [eventId, sectionIds]
      );
      stepNameRows = snRes.rows;
    }

    // Build per-section step-name map (null = not acted yet → show role label)
    const stepNames = {};
    sectionIds.forEach(id => {
      stepNames[id] = { collabI: null, collabII: null, collabIII: null, collaborator: null, superCollab: null };
    });
    for (const u of stepNameRows) {
      const sid = Number(u.section_id);
      if (stepNames[sid]) {
        if (u.role_key === 'collaborator_1')    stepNames[sid].collabI      = u.full_name;
        if (u.role_key === 'collaborator_2')    stepNames[sid].collabII     = u.full_name;
        if (u.role_key === 'collaborator_3')    stepNames[sid].collabIII    = u.full_name;
        if (u.role_key === 'collaborator')      stepNames[sid].collaborator = u.full_name;
        if (u.role_key === 'super_collaborator')stepNames[sid].superCollab  = u.full_name;
      }
    }

    // Fetch the latest pending "Ask to Return" request directed at the current user's role
    const returnRequestsBySection = {};
    if (sectionIds.length) {
      const rrRes = await pool.query(
        `SELECT DISTINCT ON (section_id)
           section_id, requested_by_name, requested_by_role, note, created_at
         FROM section_return_requests
         WHERE event_id=$1 AND section_id=ANY($2::int[])
         ORDER BY section_id, created_at DESC`,
        [eventId, sectionIds]
      );
      for (const r of rrRes.rows) {
        returnRequestsBySection[Number(r.section_id)] = {
          from: r.requested_by_name,
          fromRole: r.requested_by_role,
          note: r.note || '',
          at: r.created_at,
        };
      }
    }

    res.json({
      event_id: eventId,
      country_id: countryId,
      lowerSubmitterRole,
      documentSubmitterRole,
      sections: rows.map(r => ({
        sectionId: r.id,
        sectionLabel: r.label,
        status: r.status,
        statusComment: r.status_comment || null,
        lastUpdatedAt: r.last_updated_at,
        lastUpdatedBy: r.last_updated_by || null,
        isAssigned: assignedSet.has(Number(r.id)),
        lowerSubmitterRole,
        documentSubmitterRole,
        originalSubmitterRole: r.original_submitter_role || null,
        returnTargetRole: r.return_target_role || null,
        returnRequest: returnRequestsBySection[Number(r.id)] || null,
        stepNames: stepNames[Number(r.id)] || { collabI: null, collabII: null, collabIII: null, collaborator: null, superCollab: null },
      }))
    });
  } catch (e) {
    console.error('status-grid error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Section audit history
app.get('/api/tp/section-history', authRequired, async (req, res) => {
  try {
    const eventId = parseInt(req.query.event_id, 10);
    const sectionId = parseInt(req.query.section_id, 10);
    if (!eventId || !sectionId) return res.status(400).json({ error: 'event_id and section_id required' });
    const countryId = await resolveCountryIdForEvent(eventId);
    if (!countryId) return res.status(404).json({ error: 'Event not found' });
    const { rows } = await pool.query(
      `SELECT id, action, from_status, to_status, user_name, user_role, note, acted_at
       FROM tp_section_history
       WHERE event_id=$1 AND section_id=$2
       ORDER BY acted_at ASC`,
      [eventId, sectionId]
    );
    res.json({ history: rows });
  } catch (e) {
    console.error('section-history error', e);
    res.status(500).json({ error: 'server error' });
  }
});


app.post('/api/document/submit-to-supervisor', requireRole('deputy','admin'), asyncRoute(async (req, res) => {
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

app.post('/api/document/submit-to-deputy', requireRole('supervisor','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const evMeta = await queryOne(`SELECT submitter_role FROM events WHERE id=$1`, [eventId]);
  const submitterRole = String(evMeta?.submitter_role || 'deputy').toLowerCase();

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const schema = await getDocumentStatusSchema();
  await ensureDocumentStatus(eventId, countryId);

  const tsCol = schema.tsCol || 'updated_at';
  const byCol = schema.byCol || 'updated_by_user_id';

  // If the chosen submitter is Supervisor, we finalize at Supervisor stage.
  const nextStatus = submitterRole === 'supervisor' ? 'approved' : 'submitted_to_deputy';

  if (schema.hasCountryId) {
    await pool.query(
      `UPDATE document_status
       SET status='${nextStatus}', ${tsCol}=NOW(), ${byCol}=$3
       WHERE event_id=$1 AND country_id=$2`,
      [eventId, countryId, req.user.id]
    );
  } else {
    await pool.query(
      `UPDATE document_status
       SET status='${nextStatus}', ${tsCol}=NOW(), ${byCol}=$2
       WHERE event_id=$1`,
      [eventId, req.user.id]
    );
  }

  // Also transition individual section statuses so the deputy's approve-all-sections
  // can find them. Sections approved by supervisor need to move to submitted_to_deputy;
  // when finalizing at supervisor stage, move them to approved_by_supervisor (already there).
  if (nextStatus === 'submitted_to_deputy') {
    await pool.query(
      `UPDATE tp_content
       SET status='submitted_to_deputy', last_updated_at=NOW(), last_updated_by_user_id=$3
       WHERE event_id=$1 AND country_id=$2 AND status='approved_by_supervisor'`,
      [eventId, countryId, req.user.id]
    );
  }

  return res.json({ success:true });
}));

app.post('/api/document/approve', requireRole('deputy','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const evMeta = await queryOne(`SELECT submitter_role FROM events WHERE id=$1`, [eventId]);
  const submitterRole = String(evMeta?.submitter_role || 'deputy').toLowerCase();

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const schema = await getDocumentStatusSchema();
  await ensureDocumentStatus(eventId, countryId);

  const tsCol = schema.tsCol || 'updated_at';
  const byCol = schema.byCol || 'updated_by_user_id';

  // If the chosen submitter is Minister, Deputy only submits the document onward.
  const newStatus = submitterRole === 'minister' ? 'submitted_to_minister' : 'approved';

  if (schema.hasCountryId) {
    await pool.query(
      `UPDATE document_status
       SET status='${newStatus}', ${tsCol}=NOW(), ${byCol}=$3
       WHERE event_id=$1 AND country_id=$2`,
      [eventId, countryId, req.user.id]
    );
  } else {
    await pool.query(
      `UPDATE document_status
       SET status='${newStatus}', ${tsCol}=NOW(), ${byCol}=$2
       WHERE event_id=$1`,
      [eventId, req.user.id]
    );
  }
  return res.json({ success:true });
}));

app.post('/api/document/approve-minister', requireRole('minister','admin'), asyncRoute(async (req, res) => {
  const eventId = Number(req.body?.eventId);
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'eventId required' });

  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Event not found' });

  const evMeta = await queryOne(`SELECT submitter_role FROM events WHERE id=$1`, [eventId]);
  const submitterRole = String(evMeta?.submitter_role || 'deputy').toLowerCase();
  if (submitterRole !== 'minister') return res.status(400).json({ error: 'This event is not configured for Minister submission' });

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

app.post('/api/document/return', requireRole('deputy','minister','admin'), asyncRoute(async (req, res) => {
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

app.get('/api/library', requireRole('admin','deputy','minister','supervisor','super_collaborator','protocol'), async (req, res) => {
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

app.get('/api/library/document', requireRole('admin','deputy','minister','supervisor','super_collaborator','protocol'), async (req, res) => {
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
    SELECT status, deputy_comment, updated_at
    FROM document_status
    WHERE event_id=$1 AND country_id=$2
    `,
    [eventId, countryId]
  );

  return res.json({
    event,
    documentStatus: doc ? {
      status: doc.status,
      deputyComment: doc.deputy_comment,
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


/** File upload endpoints **/
const UPLOADS_DIR = path.join(__dirname, 'uploads');

app.get('/api/tp/files/download', authRequired, attachUser, async (req, res) => {
  try {
    const { event_id, section_id, filename } = req.query;
    if (!event_id || !section_id || !filename) return res.status(400).json({ error: 'Missing params' });
    const safeName = path.basename(String(filename));
    const filePath = path.join(UPLOADS_DIR, String(event_id), String(section_id), safeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ error: 'Download failed' });
  }
});

app.post('/api/tp/files/upload', authRequired, attachUser, async (req, res) => {
  try {
    const { eventId, sectionId, filename, mimeType, base64 } = req.body || {};
    if (!eventId || !sectionId || !filename || !base64) return res.status(400).json({ error: 'Missing fields' });
    // Sanitize filename
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const dir = path.join(UPLOADS_DIR, String(eventId), String(sectionId));
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(path.join(dir, safeName), buf);
    res.json({ ok: true, filename: safeName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/tp/files', authRequired, attachUser, async (req, res) => {
  try {
    const { event_id: eventId, section_id: sectionId } = req.query;
    if (!eventId || !sectionId) return res.status(400).json({ error: 'Missing event_id/section_id' });
    const dir = path.join(UPLOADS_DIR, String(eventId), String(sectionId));
    if (!fs.existsSync(dir)) return res.json({ files: [] });
    const files = fs.readdirSync(dir).map(filename => {
      const stat = fs.statSync(path.join(dir, filename));
      return { filename, size: stat.size };
    });
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ── Section Comments ──────────────────────────────────────────────────────────

app.get('/api/tp/comments', authRequired, attachUser, asyncRoute(async (req, res) => {
  const { event_id, section_id } = req.query;
  if (!event_id || !section_id) return res.status(400).json({ error: 'Missing event_id or section_id' });
  const countryId = await resolveCountryIdForEvent(event_id);
  if (!countryId) return res.status(404).json({ error: 'Country not found for event' });
  const isAdmin = normalizeRoleKey(req.user.role_key) === 'admin';
  const rows = await pool.query(
    `SELECT id, author_name, comment_text, anchor_id, created_at, parent_id,
            (user_id = $4) AS is_own
     FROM tp_section_comments
     WHERE event_id=$1 AND country_id=$2 AND section_id=$3
     ORDER BY COALESCE(parent_id, id), id ASC`,
    [event_id, countryId, section_id, req.user.id]
  );
  const comments = rows.rows.map(c => ({ ...c, can_delete: true }));
  res.json({ comments });
}));

app.post('/api/tp/comments', authRequired, attachUser, asyncRoute(async (req, res) => {
  const { eventId, sectionId, commentText, anchorId, parentId } = req.body || {};
  if (!eventId || !sectionId || !commentText?.trim())
    return res.status(400).json({ error: 'Missing required fields' });
  const countryId = await resolveCountryIdForEvent(eventId);
  if (!countryId) return res.status(404).json({ error: 'Country not found for event' });
  const authorName = req.user.full_name || req.user.username || 'Unknown';
  const row = await pool.query(
    `INSERT INTO tp_section_comments (event_id, country_id, section_id, user_id, author_name, comment_text, anchor_id, parent_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, author_name, comment_text, anchor_id, created_at, parent_id`,
    [eventId, countryId, sectionId, req.user.id, authorName, commentText.trim(), anchorId || null, parentId || null]
  );
  res.json({ comment: { ...row.rows[0], is_own: true, can_delete: true } });
}));

app.delete('/api/tp/comments/:id', authRequired, attachUser, asyncRoute(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const result = await pool.query(`DELETE FROM tp_section_comments WHERE id=$1`, [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Comment not found or not yours' });
  res.json({ ok: true });
}));

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

if (require.main === module) {
  (async () => {
    try {
      await ensureSchema();
      await ensureRolesExist();
      await ensureBaseData();
      await ensureInitialAdmin();
    } catch (err) {
      console.error('Startup ensureSchema/ensureRoles failed:', err);
    }

    app.listen(PORT, () => {
      console.log(`GOV COLLAB PORTAL API listening on port ${PORT}`);
    });
  })();
}

module.exports = app;
