import { db, schema } from '../db/index.js';

export type AuditEntry = {
  organizationId: string;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(entry: AuditEntry) {
  await db.insert(schema.auditLog).values({
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId ?? null,
    metadata: entry.metadata ?? {},
  });
}
