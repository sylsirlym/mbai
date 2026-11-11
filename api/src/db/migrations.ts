// Ordered schema migrations. Append new entries; never edit an applied one.
export const migrations: { id: string; sql: string }[] = [
  {
    id: '001_initial',
    sql: `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A tree is a workspace: everyone in it can see its lines, admins see restricted fields.
CREATE TABLE trees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tree_members (
  tree_id uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  PRIMARY KEY (tree_id, user_id)
);

CREATE TABLE persons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id        uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  first_name     text NOT NULL,
  other_names    text NOT NULL DEFAULT '',
  sex            text NOT NULL CHECK (sex IN ('M','F','U')),
  clan           text,
  birth_date     date,
  birth_year     int,
  birth_place    text,
  death_date     date,
  death_year     int,
  is_deceased    boolean NOT NULL DEFAULT false,
  is_placeholder boolean NOT NULL DEFAULT false, -- "Unknown wife" etc.
  notes          text,
  birth_house_id uuid, -- the house this person was born into (FK added below)
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persons_tree_idx ON persons(tree_id);
CREATE INDEX persons_name_idx ON persons(tree_id, lower(first_name));

-- A household exists because its head married. One per man.
CREATE TABLE households (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id        uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  head_person_id uuid NOT NULL UNIQUE REFERENCES persons(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- A house is one wife's place in a household. sponsor_house_id is set when a wife married her in.
CREATE TABLE houses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id          uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  household_id     uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  wife_person_id   uuid NOT NULL REFERENCES persons(id),
  sponsor_house_id uuid REFERENCES houses(id),
  label            text NOT NULL,
  marriage_form    text NOT NULL CHECK (marriage_form IN ('customary','civil','religious')),
  started_on       date,
  place            text,
  ended_on         date,
  end_reason       text CHECK (end_reason IN ('divorce','death','other')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, label),
  CHECK (sponsor_house_id IS NULL OR marriage_form = 'customary'),
  CHECK (sponsor_house_id IS NULL OR sponsor_house_id <> id)
);
CREATE INDEX houses_household_idx ON houses(household_id);
CREATE INDEX houses_wife_idx ON houses(wife_person_id);

ALTER TABLE persons ADD CONSTRAINT persons_birth_house_fk
  FOREIGN KEY (birth_house_id) REFERENCES houses(id) ON DELETE SET NULL;

-- Biological and adoptive links only. Social belonging comes from birth_house_id.
CREATE TABLE parent_links (
  child_id   uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  parent_id  uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relation   text NOT NULL CHECK (relation IN ('biological','adoptive')),
  restricted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (child_id, parent_id, relation),
  CHECK (child_id <> parent_id)
);
CREATE INDEX parent_links_parent_idx ON parent_links(parent_id);
`,
  },
];
