/**
 * Centralized error vocabulary for the BRSR platform.
 *
 * Why subclasses (rather than one error with a `code` field): the platform
 * surfaces errors at three layers — API (HTTP), workflow (audit log), and UI
 * (toast). Class identity lets each layer use `instanceof` for routing, while
 * the `code` field gives a stable string for ESG assurance trails that outlive
 * any one runtime.
 */

export interface BrsrErrorJson {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export class BrsrError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    // Restore prototype chain for `instanceof` across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): BrsrErrorJson {
    // Intentionally omit `stack` — assurance snapshots must not leak internals.
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export class TenantNotFoundError extends BrsrError {
  constructor(message = 'Tenant not found', details?: Record<string, unknown>) {
    super(message, 'TENANT_NOT_FOUND', 404, details);
  }
}

export class ScopeViolationError extends BrsrError {
  constructor(
    message = 'Entity is outside the caller scope',
    details?: Record<string, unknown>,
  ) {
    super(message, 'SCOPE_VIOLATION', 403, details);
  }
}

export class RlsViolationError extends BrsrError {
  constructor(
    message = 'Row-level security violation',
    details?: Record<string, unknown>,
  ) {
    super(message, 'RLS_VIOLATION', 403, details);
  }
}

export class EntityNodeNotFoundError extends BrsrError {
  constructor(
    message = 'Entity node not found',
    details?: Record<string, unknown>,
  ) {
    super(message, 'ENTITY_NODE_NOT_FOUND', 404, details);
  }
}

export class FormulaError extends BrsrError {
  constructor(message = 'Formula error', details?: Record<string, unknown>) {
    super(message, 'FORMULA_ERROR', 422, details);
  }
}

export class UnitConversionError extends BrsrError {
  constructor(
    message = 'Unit conversion error',
    details?: Record<string, unknown>,
  ) {
    super(message, 'UNIT_CONVERSION_ERROR', 422, details);
  }
}

export class GwpError extends BrsrError {
  constructor(message = 'GWP lookup error', details?: Record<string, unknown>) {
    super(message, 'GWP_ERROR', 422, details);
  }
}

export class InvalidLtreePathError extends BrsrError {
  constructor(
    message = 'Invalid ltree path',
    details?: Record<string, unknown>,
  ) {
    super(message, 'INVALID_LTREE_PATH', 422, details);
  }
}

export class MetricLockedError extends BrsrError {
  constructor(
    message = 'Metric is locked',
    details?: Record<string, unknown>,
  ) {
    super(message, 'METRIC_LOCKED', 409, details);
  }
}

export class WorkflowTransitionError extends BrsrError {
  constructor(
    message = 'Invalid workflow transition',
    details?: Record<string, unknown>,
  ) {
    super(message, 'WORKFLOW_TRANSITION_ERROR', 409, details);
  }
}

export class AssuranceSnapshotImmutableError extends BrsrError {
  constructor(
    message = 'Assurance snapshot is immutable',
    details?: Record<string, unknown>,
  ) {
    super(message, 'ASSURANCE_SNAPSHOT_IMMUTABLE', 409, details);
  }
}

export class DocumentClassifierLowConfidenceError extends BrsrError {
  constructor(
    message = 'Document classifier confidence is below threshold',
    details?: Record<string, unknown>,
  ) {
    super(message, 'DOCUMENT_CLASSIFIER_LOW_CONFIDENCE', 422, details);
  }
}

export class ExtractionFieldNotFoundError extends BrsrError {
  constructor(
    message = 'Extraction field not found',
    details?: Record<string, unknown>,
  ) {
    super(message, 'EXTRACTION_FIELD_NOT_FOUND', 404, details);
  }
}

export class DuplicateMetricEventError extends BrsrError {
  constructor(
    message = 'Duplicate metric event',
    details?: Record<string, unknown>,
  ) {
    super(message, 'DUPLICATE_METRIC_EVENT', 409, details);
  }
}

export class SupplierInviteExpiredError extends BrsrError {
  constructor(
    message = 'Supplier invite has expired',
    details?: Record<string, unknown>,
  ) {
    super(message, 'SUPPLIER_INVITE_EXPIRED', 410, details);
  }
}

export function isBrsrError(e: unknown): e is BrsrError {
  return e instanceof BrsrError;
}
