import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'auditMetadata';

export interface AuditMetadata {
  entity: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'submit' | 'approve' | 'reject' | 'lock' | string;
  /** Optional dotted path on request body or params to identify the entity id. */
  entityIdPath?: string;
}

/**
 * Marks a handler for audit logging. The {@link AuditInterceptor} reads this
 * metadata and writes an AuditLog row after the handler returns successfully.
 */
export const Audit = (meta: AuditMetadata): MethodDecorator => SetMetadata(AUDIT_KEY, meta);
