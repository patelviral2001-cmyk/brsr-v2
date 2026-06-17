/**
 * Module augmentation for next-auth. Mirrors the runtime extensions
 * declared inside `src/lib/auth/config.ts` so any module that imports
 * `next-auth` (without importing the config file directly) still sees
 * `accessToken`, `tenantId`, etc. on Session / JWT / User.
 */
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    tenantId?: string;
    error?: "RefreshAccessTokenError";
    user: {
      id: string;
      roles: string[];
      tenantId?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    tenantId?: string;
    roles?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    tenantId?: string;
    roles?: string[];
    error?: "RefreshAccessTokenError";
  }
}
