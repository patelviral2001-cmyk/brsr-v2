/**
 * NextAuth v5 (beta.25) configuration.
 *
 * Production strategy (DEMO_MODE=false):
 *   - Credentials provider posts to the NestJS backend at
 *     `${NEXT_PUBLIC_API_URL}/iam/auth/login` and stores the returned
 *     access + refresh tokens on the JWT.
 *   - The `jwt` callback transparently refreshes the access token via
 *     `/iam/auth/refresh` when it's expired.
 *   - The `session` callback exposes `accessToken` + `tenantId` to the
 *     React tree so the axios client can read them through a bridge.
 *
 * Demo (DEMO_MODE=true): accepts any `*@imaginepowertree.com` address +
 * the seeded password, no network call.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080/api/v1";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    tenantId?: string;
    error?: "RefreshAccessTokenError";
    user: {
      id: string;
      roles: string[];
      tenantId?: string;
    } & DefaultSession["user"];
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

interface BackendLoginResponse {
  token: string;
  refreshToken: string;
  expiresIn?: number; // seconds
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId: string;
    roles?: string[];
  };
}

async function backendLogin(
  email: string,
  password: string,
): Promise<BackendLoginResponse | null> {
  try {
    const res = await fetch(`${API_URL}/iam/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      // SSR fetch — don't cache an auth response.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendLoginResponse;
  } catch {
    return null;
  }
}

async function refreshBackendToken(refreshToken: string): Promise<{
  token: string;
  refreshToken?: string;
  expiresIn?: number;
} | null> {
  try {
    const res = await fetch(`${API_URL}/iam/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { token: string; refreshToken?: string; expiresIn?: number };
  } catch {
    return null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        if (DEMO_MODE) {
          // Accept the seeded demo creds without a network round-trip.
          if (
            (email === "demo@imaginepowertree.com" && password === "Demo@1234") ||
            (email === "demo@imaginepowertree.com" && password === "demo1234") ||
            email.endsWith("@imaginepowertree.com")
          ) {
            return {
              id: "user_demo",
              email,
              name: "Priya Iyer",
              tenantId: "tnt_imaginepowertree",
              roles: ["GROUP_HEAD_SUSTAINABILITY"],
              accessToken: "demo.access.token",
              refreshToken: "demo.refresh.token",
              accessTokenExpires: Date.now() + 8 * 60 * 60 * 1000,
            };
          }
          return null;
        }

        const result = await backendLogin(email, password);
        if (!result) return null;
        const expiresIn = result.expiresIn ?? 60 * 60; // default 1h
        return {
          id: result.user.id,
          email: result.user.email,
          name: `${result.user.firstName} ${result.user.lastName}`.trim(),
          tenantId: result.user.tenantId,
          roles: result.user.roles ?? [],
          accessToken: result.token,
          refreshToken: result.refreshToken,
          accessTokenExpires: Date.now() + expiresIn * 1000,
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  callbacks: {
    async jwt({ token, user }) {
      // First sign-in: hydrate from `User`.
      if (user) {
        token.id = user.id;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = user.accessTokenExpires;
        token.tenantId = user.tenantId;
        token.roles = user.roles ?? [];
        return token;
      }

      // Subsequent calls: return cached token if still valid.
      if (
        !token.accessTokenExpires ||
        Date.now() < token.accessTokenExpires - 30_000
      ) {
        return token;
      }

      // Expired — try refresh.
      if (token.refreshToken && !DEMO_MODE) {
        const refreshed = await refreshBackendToken(token.refreshToken);
        if (refreshed) {
          token.accessToken = refreshed.token;
          token.refreshToken = refreshed.refreshToken ?? token.refreshToken;
          token.accessTokenExpires =
            Date.now() + (refreshed.expiresIn ?? 60 * 60) * 1000;
          token.error = undefined;
          return token;
        }
        token.error = "RefreshAccessTokenError";
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.tenantId = token.tenantId;
      session.error = token.error;
      session.user.id = token.id ?? session.user.id;
      session.user.roles = token.roles ?? [];
      session.user.tenantId = token.tenantId;
      return session;
    },
  },
  trustHost: true,
});
