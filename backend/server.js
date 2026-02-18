-- GOV COLLAB PORTAL schema.sql
-- Blueprint v2 (Definitive). Implements: roles, users, sections, section_assignments, countries,
-- events, event_required_sections, tp_content, document_status.

BEGIN;

-- Extensions (safe if already installed)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  CREATE TYPE tp_section_status AS ENUM ('draft', 'submitted', 'returned', 'approved_by_supervisor', 'approved_by_chairman');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id            SERIAL PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  email          TEXT,
  role_id        INTEGER NOT NULL REFERENCES roles(id),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Sections
CREATE TABLE IF NOT EXISTS sections (
  id            SERIAL PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_is_active ON sections(is_active);
CREATE INDEX IF NOT EXISTS idx_sections_order_index ON sections(order_index);

-- Section assignments (collaborator -> section), global (NOT per country)
CREATE TABLE IF NOT EXISTS section_assignments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_section_assignments_user_section UNIQUE (user_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_section_assignments_user_id ON section_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_section_assignments_section_id ON section_assignments(section_id);

-- Countries
CREATE TABLE IF NOT EXISTS countries (
  id          SERIAL PRIMARY KEY,
  name_en     TEXT NOT NULL,
  code        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_countries_code UNIQUE (code),
  CONSTRAINT uq_countries_name_en UNIQUE (name_en)
);

CREATE INDEX IF NOT EXISTS idx_countries_is_active ON countries(is_active);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id                  SERIAL PRIMARY KEY,
  country_id          INTEGER NOT NULL REFERENCES countries(id),
  title               TEXT NOT NULL,
  occasion            TEXT,
  deadline_date       DATE,
  created_by_user_id  INTEGER REFERENCES users(id),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_country_id ON events(country_id);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON events(is_active);
CREATE INDEX IF NOT EXISTS idx_events_deadline_date ON events(deadline_date);

-- Required sections per event
CREATE TABLE IF NOT EXISTS event_required_sections (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section_id  INTEGER NOT NULL REFERENCES sections(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_event_required_sections UNIQUE (event_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_event_required_sections_event_id ON event_required_sections(event_id);
CREATE INDEX IF NOT EXISTS idx_event_required_sections_section_id ON event_required_sections(section_id);

-- Talking Points content per event + country + section
CREATE TABLE IF NOT EXISTS tp_content (
  id                       SERIAL PRIMARY KEY,
  event_id                 INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  country_id               INTEGER NOT NULL REFERENCES countries(id),
  section_id               INTEGER NOT NULL REFERENCES sections(id),
  html_content             TEXT NOT NULL DEFAULT '',
  status                   tp_section_status NOT NULL DEFAULT 'draft',
  status_comment           TEXT, -- used for "returned with comment" (per blueprint workflow)
  last_updated_by_user_id  INTEGER REFERENCES users(id),
  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tp_content_event_country_section UNIQUE (event_id, country_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_content_event_id ON tp_content(event_id);
CREATE INDEX IF NOT EXISTS idx_tp_content_country_id ON tp_content(country_id);
CREATE INDEX IF NOT EXISTS idx_tp_content_section_id ON tp_content(section_id);
CREATE INDEX IF NOT EXISTS idx_tp_content_status ON tp_content(status);

-- Document-level status per event + country
CREATE TABLE IF NOT EXISTS document_status (
  id               SERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  country_id        INTEGER NOT NULL REFERENCES countries(id),
  status            TEXT NOT NULL DEFAULT 'in_progress',
  chairman_comment  TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_document_status_event_country UNIQUE (event_id, country_id)
);

CREATE INDEX IF NOT EXISTS idx_document_status_event_id ON document_status(event_id);
CREATE INDEX IF NOT EXISTS idx_document_status_country_id ON document_status(country_id);
CREATE INDEX IF NOT EXISTS idx_document_status_status ON document_status(status);

COMMIT;


-- === Spec v2 additions ===

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ended_by_user_id INTEGER;

CREATE TABLE IF NOT EXISTS country_assignments (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    country_id INTEGER REFERENCES countries(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, country_id)
);
