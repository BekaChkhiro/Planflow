import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function runMigration() {
  if (!process.env['DATABASE_URL']) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sql = neon(process.env['DATABASE_URL'])

  console.log('Running migration: 0010_add_organization_to_projects.sql')
  console.log('---')

  try {
    // Step 1: Add the column as nullable
    console.log('Step 1: Adding organization_id column...')
    await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "organization_id" uuid`

    // Step 2: Migrate existing data using PL/pgSQL block
    console.log('Step 2: Migrating existing projects to organizations...')
    await sql`
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
          INSERT INTO organizations (id, name, slug, created_by)
          VALUES (
            gen_random_uuid(),
            'Personal',
            'personal-' || REPLACE(user_record.id::text, '-', ''),
            user_record.id
          )
          RETURNING id INTO new_org_id;

          INSERT INTO organization_members (id, organization_id, user_id, role)
          VALUES (gen_random_uuid(), new_org_id, user_record.id, 'owner');

          UPDATE projects SET organization_id = new_org_id WHERE user_id = user_record.id;
        END LOOP;

        UPDATE projects p
        SET organization_id = (
          SELECT om.organization_id
          FROM organization_members om
          WHERE om.user_id = p.user_id
          ORDER BY om.created_at
          LIMIT 1
        )
        WHERE p.organization_id IS NULL;
      END $$
    `

    // Step 3: Make column NOT NULL
    console.log('Step 3: Setting organization_id as NOT NULL...')
    await sql`ALTER TABLE "projects" ALTER COLUMN "organization_id" SET NOT NULL`

    // Step 4: Add foreign key constraint (if not exists)
    console.log('Step 4: Adding foreign key constraint...')
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'projects_organization_id_organizations_id_fk'
        ) THEN
          ALTER TABLE "projects"
            ADD CONSTRAINT "projects_organization_id_organizations_id_fk"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
        END IF;
      END $$
    `

    // Step 5: Add index (if not exists)
    console.log('Step 5: Creating index...')
    await sql`CREATE INDEX IF NOT EXISTS "projects_organization_id_idx" ON "projects" ("organization_id")`

    console.log('---')
    console.log('Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
