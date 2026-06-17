export const SupplierStatus = {
  INVITED: 'INVITED',
  ENGAGED: 'ENGAGED',
  RESPONDED: 'RESPONDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type SupplierStatus =
  (typeof SupplierStatus)[keyof typeof SupplierStatus];
export const supplierStatusValues = (): readonly SupplierStatus[] =>
  Object.values(SupplierStatus) as readonly SupplierStatus[];

export const SupplierResponseStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
} as const;
export type SupplierResponseStatus =
  (typeof SupplierResponseStatus)[keyof typeof SupplierResponseStatus];
export const supplierResponseStatusValues =
  (): readonly SupplierResponseStatus[] =>
    Object.values(SupplierResponseStatus) as readonly SupplierResponseStatus[];
