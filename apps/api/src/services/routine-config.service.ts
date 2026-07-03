import { eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'

/** Persisted per-project routine binding used to fire cloud sessions. */
export async function saveRoutineConfig(projectId: string, fireUrl: string, token: string): Promise<void> {
  const db = getDbClient()
  const row = {
    projectId,
    fireUrl,
    tokenEncrypted: encryptSecret(token),
    updatedAt: new Date(),
  }
  await db
    .insert(schema.routineConfigs)
    .values(row)
    .onConflictDoUpdate({ target: schema.routineConfigs.projectId, set: row })
}

export async function getRoutineConfig(
  projectId: string
): Promise<{ fireUrl: string; token: string } | null> {
  try {
    const rows = await getDbClient()
      .select()
      .from(schema.routineConfigs)
      .where(eq(schema.routineConfigs.projectId, projectId))
      .limit(1)
    const r = rows[0]
    if (!r) return null
    return { fireUrl: r.fireUrl, token: decryptSecret(r.tokenEncrypted) }
  } catch {
    return null
  }
}

export async function deleteRoutineConfig(projectId: string): Promise<void> {
  try {
    await getDbClient().delete(schema.routineConfigs).where(eq(schema.routineConfigs.projectId, projectId))
  } catch {
    /* best effort */
  }
}
