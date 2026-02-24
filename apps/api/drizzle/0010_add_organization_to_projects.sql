-- Add organization_id column to projects table
-- This migration links projects to organizations for team visibility

-- 1. First add the column as nullable
ALTER TABLE "projects" ADD COLUMN "organization_id" uuid;

-- 2. For each user with projects but no organization membership, create a "Personal" organization
DO $$
DECLARE
  user_record RECORD;
  new_org_id uuid;
BEGIN
  FOR user_record IN
    SELECT DISTINCT u.id, u.email
    FROM users u
    INNER JOIN projects p ON p.user_id = u.id
    WHERE NOT EXISTS (
      SELECT 1 FROM organization_members om WHERE om.user_id = u.id
    )
  LOOP
    -- Create Personal organization
    INSERT INTO organizations (id, name, slug, created_by)
    VALUES (
      gen_random_uuid(),
      'Personal',
      'personal-' || REPLACE(user_record.id::text, '-', ''),
      user_record.id
    )
    RETURNING id INTO new_org_id;

    -- Add user as owner
    INSERT INTO organization_members (id, organization_id, user_id, role)
    VALUES (gen_random_uuid(), new_org_id, user_record.id, 'owner');

    -- Link projects to the new organization
    UPDATE projects SET organization_id = new_org_id WHERE user_id = user_record.id;
  END LOOP;

  -- For users already in organizations, link projects to their first organization
  UPDATE projects p
  SET organization_id = (
    SELECT om.organization_id
    FROM organization_members om
    WHERE om.user_id = p.user_id
    ORDER BY om.created_at
    LIMIT 1
  )
  WHERE p.organization_id IS NULL;
END $$;

-- 3. Make the column NOT NULL
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET NOT NULL;

-- 4. Add foreign key constraint
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- 5. Add index for organization-based queries
CREATE INDEX "projects_organization_id_idx" ON "projects" ("organization_id");
