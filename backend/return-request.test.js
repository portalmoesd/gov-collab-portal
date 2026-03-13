'use strict';

/**
 * Tests for return-request notification lifecycle:
 *   - Notification should be cleared when super_collaborator approves a section
 *   - Notification should be cleared when super_collaborator returns a section
 *   - DELETE is idempotent (no crash when no request exists)
 *   - DELETE fires before history INSERT (ordering)
 */

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.JWT_SECRET = 'test_secret';

const jwt = require('jsonwebtoken');

// Mock pg BEFORE requiring the server so no real DB connection is made
const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery })),
}));

const request = require('supertest');
const app = require('./server');

const JWT_SECRET = 'test_secret';
const EVENT_ID = 1;
const SECTION_ID = 5;
const COUNTRY_ID = 10;
const USER_ID = 42;

function makeToken() {
  return `Bearer ${jwt.sign({ userId: USER_ID }, JWT_SECRET)}`;
}

/**
 * Smart query mock — inspects SQL and returns appropriate stub data.
 * @param {string} sectionStatus - current status returned for tp_content rows
 */
function buildQueryImpl(sectionStatus = 'submitted_to_super_collaborator') {
  return async (sql) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // attachUser: look up user by ID with role join
    if (s.includes('FROM users u') && s.includes('JOIN roles r')) {
      return {
        rows: [{
          id: USER_ID, is_active: true, deleted_at: null,
          role_key: 'super_collaborator', role_label: 'Super Collaborator',
          full_name: 'Test SC', username: 'test_sc',
        }],
      };
    }

    // event lookup (resolveCountryIdForEvent & assertUserCanAccessEventSection)
    if (s.includes('FROM events') && s.includes('WHERE') && s.includes('id=')) {
      return { rows: [{ id: EVENT_ID, country_id: COUNTRY_ID }] };
    }

    // getAssignedCountryIds
    if (s.includes('FROM country_assignments')) {
      return { rows: [{ country_id: COUNTRY_ID }] };
    }

    // event_required_sections access check
    if (s.includes('FROM event_required_sections WHERE event_id')) {
      return { rows: [{ ok: 1 }] };
    }

    // getDocumentStatusSchema (information_schema introspection)
    if (s.includes('information_schema.columns')) {
      return { rows: [{ column_name: 'country_id' }, { column_name: 'last_updated_at' }] };
    }

    // ensureDocumentStatus INSERT
    if (s.includes('INSERT INTO document_status')) {
      return { rows: [] };
    }

    // ensureTpRow INSERT
    if (s.startsWith('INSERT INTO tp_content')) {
      return { rows: [] };
    }

    // tp_content SELECT (status check, return_target_role check)
    if (s.includes('FROM tp_content WHERE')) {
      return {
        rows: [{
          status: sectionStatus,
          original_submitter_role: 'collaborator_1',
          return_target_role: null,
        }],
      };
    }

    // tp_content UPDATE (approve / return)
    if (s.startsWith('UPDATE tp_content')) {
      return { rows: [] };
    }

    // The key assertion target: DELETE return request
    if (s.startsWith('DELETE FROM section_return_requests')) {
      return { rows: [] };
    }

    // History INSERT
    if (s.includes('INSERT INTO tp_section_history')) {
      return { rows: [] };
    }

    return { rows: [] };
  };
}

// ─── approve-section ─────────────────────────────────────────────────────────

describe('POST /api/tp/approve-section', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears section_return_requests when section is approved', async () => {
    mockQuery.mockImplementation(buildQueryImpl());

    const res = await request(app)
      .post('/api/tp/approve-section')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleteCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM section_return_requests')
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual([EVENT_ID, COUNTRY_ID, SECTION_ID]);
  });

  it('clears return request even when none exists (DELETE is idempotent)', async () => {
    mockQuery.mockImplementation(buildQueryImpl());

    const res = await request(app)
      .post('/api/tp/approve-section')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(res.status).toBe(200);
    // DELETE should still be issued — DB handles the no-op gracefully
    const deleteCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM section_return_requests')
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it('issues DELETE before history INSERT', async () => {
    const order = [];
    mockQuery.mockImplementation(async (sql, params) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('DELETE FROM section_return_requests')) order.push('delete');
      if (s.includes('INSERT INTO tp_section_history')) order.push('history');
      return buildQueryImpl()(sql, params);
    });

    await request(app)
      .post('/api/tp/approve-section')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(order).toEqual(['delete', 'history']);
  });

  it('returns 400 when section is not at super_collaborator review stage', async () => {
    // 'approved_by_supervisor' is not in decisionStatusesForRole('super_collaborator')
    // and is not 'draft' (which would trigger canActAsLowest)
    mockQuery.mockImplementation(buildQueryImpl('approved_by_supervisor'));

    const res = await request(app)
      .post('/api/tp/approve-section')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not at your review stage/i);

    // No DELETE should fire on validation failure
    const deleteCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM section_return_requests')
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/tp/approve-section')
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(res.status).toBe(401);
  });
});

// ─── return ──────────────────────────────────────────────────────────────────

describe('POST /api/tp/return', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears section_return_requests when section is returned', async () => {
    mockQuery.mockImplementation(buildQueryImpl());

    const res = await request(app)
      .post('/api/tp/return')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID, note: 'Please revise' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleteCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM section_return_requests')
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual([EVENT_ID, COUNTRY_ID, SECTION_ID]);
  });

  it('issues DELETE before history INSERT', async () => {
    const order = [];
    mockQuery.mockImplementation(async (sql, params) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('DELETE FROM section_return_requests')) order.push('delete');
      if (s.includes('INSERT INTO tp_section_history')) order.push('history');
      return buildQueryImpl()(sql, params);
    });

    await request(app)
      .post('/api/tp/return')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(order).toEqual(['delete', 'history']);
  });

  it('returns 400 when section is not at super_collaborator review stage', async () => {
    mockQuery.mockImplementation(buildQueryImpl('approved_by_supervisor'));

    const res = await request(app)
      .post('/api/tp/return')
      .set('Authorization', makeToken())
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(res.status).toBe(400);

    const deleteCalls = mockQuery.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM section_return_requests')
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/tp/return')
      .send({ eventId: EVENT_ID, sectionId: SECTION_ID });

    expect(res.status).toBe(401);
  });
});
