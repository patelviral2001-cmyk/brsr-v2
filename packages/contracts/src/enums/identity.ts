export const IdpType = {
  OKTA: 'OKTA',
  AZURE_AD: 'AZURE_AD',
  GOOGLE: 'GOOGLE',
  SAML: 'SAML',
  OIDC: 'OIDC',
  PASSWORD: 'PASSWORD',
} as const;
export type IdpType = (typeof IdpType)[keyof typeof IdpType];
export const idpTypeValues = (): readonly IdpType[] =>
  Object.values(IdpType) as readonly IdpType[];

export const CopilotMessageRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
  TOOL: 'TOOL',
} as const;
export type CopilotMessageRole =
  (typeof CopilotMessageRole)[keyof typeof CopilotMessageRole];
export const copilotMessageRoleValues = (): readonly CopilotMessageRole[] =>
  Object.values(CopilotMessageRole) as readonly CopilotMessageRole[];
