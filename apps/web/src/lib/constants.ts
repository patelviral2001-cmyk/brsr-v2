export const APP_NAME = "THE ESG";
export const APP_TAGLINE = "AI Native Sustainability Operating System";
export const APP_VERSION = "1.0.0";

/** Backend base URL. In production: `https://your-domain.com/api/v1`. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

/** No demo mode — every call goes to the real backend. */
export const DEMO_MODE = false;
