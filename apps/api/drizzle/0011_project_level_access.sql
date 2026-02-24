-- Project-level access control migration
-- Adds project_members and project_invitations tables for granular project access

-- Enum for project member roles
CREATE TYPE project_member_role AS ENUM ('owner', 'editor', 'viewer');

-- project_members table
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role project_member_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_member_unique UNIQUE (project_id, user_id)
);

CREATE INDEX project_members_project_id_idx ON project_members(project_id);
CREATE INDEX project_members_user_id_idx ON project_members(user_id);

-- project_invitations table
CREATE TABLE project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role project_member_role NOT NULL DEFAULT 'editor',
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_invitations_project_id_idx ON project_invitations(project_id);
CREATE INDEX project_invitations_token_idx ON project_invitations(token);

-- Migration: existing project creators become owners
INSERT INTO project_members (project_id, user_id, role, invited_by, created_at)
SELECT id, user_id, 'owner', user_id, created_at FROM projects
ON CONFLICT DO NOTHING;
