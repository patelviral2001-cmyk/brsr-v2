import type { Config } from 'tailwindcss';

/**
 * Shareable Tailwind preset for the BRSR AI Platform.
 *
 * Consumer apps (apps/web, apps/supplier-portal) extend this via:
 *
 *   import { preset as brsrUiPreset } from '@brsr/ui/tailwind-preset';
 *   export default {
 *     presets: [brsrUiPreset],
 *     content: ['./src/**\/*.{ts,tsx}', '../../packages/ui/src/**\/*.{ts,tsx}'],
 *   } satisfies Config;
 *
 * Colors are wired to CSS variables (declared in src/styles.css) so themes can
 * be swapped at runtime without rebuilding Tailwind.
 */
export const preset = {
  // Consumers must add their own content globs; the preset only defines design tokens.
  content: [],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--brsr-border) / <alpha-value>)',
        input: 'hsl(var(--brsr-border) / <alpha-value>)',
        ring: 'hsl(var(--brsr-ring) / <alpha-value>)',
        background: 'hsl(var(--brsr-bg) / <alpha-value>)',
        foreground: 'hsl(var(--brsr-fg) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--brsr-primary) / <alpha-value>)',
          foreground: 'hsl(var(--brsr-primary-fg) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--brsr-muted) / <alpha-value>)',
          foreground: 'hsl(var(--brsr-muted-fg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--brsr-success) / <alpha-value>)',
          foreground: 'hsl(var(--brsr-primary-fg) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--brsr-warning) / <alpha-value>)',
          foreground: 'hsl(var(--brsr-fg) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--brsr-destructive) / <alpha-value>)',
          foreground: 'hsl(var(--brsr-primary-fg) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--brsr-radius)',
        md: 'calc(var(--brsr-radius) - 2px)',
        sm: 'calc(var(--brsr-radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;

export default preset;
