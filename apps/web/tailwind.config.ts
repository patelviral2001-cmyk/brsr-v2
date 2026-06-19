import type { Config } from "tailwindcss";

// THE ESG — design tokens
// Ink (text), Paper (surfaces), Lime (brand accent), Semantic (status).
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1280px" } },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "JetBrains Mono", "monospace"],
      },
      spacing: {
        // 4px scale (already in Tailwind); explicit aliases for design language
        "space-1": "4px",  "space-2": "8px",  "space-3": "12px", "space-4": "16px",
        "space-6": "24px", "space-8": "32px", "space-12": "48px","space-16": "64px",
      },
      colors: {
        // Tokens
        ink: {
          900: "#0B1220",  // headings
          700: "#1F2A3B",  // body
          500: "#566379",  // secondary
          300: "#A6B0C2",  // disabled, dividers
        },
        paper: {
          50: "#FAFAF6",   // app background (warm)
          0:  "#FFFFFF",
        },
        lime: {
          50:  "#F2FBD1",
          100: "#E4F7A3",
          300: "#C4ED4D",
          500: "#A8E10C",  // ⭐ brand accent
          600: "#8DC008",
          700: "#6F9606",
          900: "#3B520A",
        },
        navy: {
          900: "#0B1220",
        },
        // Semantic
        success: { DEFAULT: "#1FAA70", 50: "#E6F7EF" },
        warning: { DEFAULT: "#E0A93B", 50: "#FBF1DA" },
        danger:  { DEFAULT: "#D24545", 50: "#FBE4E4" },
        info:    { DEFAULT: "#3B7DE0", 50: "#DEEAF8" },
        // Pillar tints
        pillar: {
          E:    "#E8F4EC", "E-fg": "#1A6B3E",
          S:    "#EBF0FA", "S-fg": "#2554A0",
          G:    "#F4ECE8", "G-fg": "#854A2E",
        },

        // shadcn / Radix bridge: keep HSL CSS vars but map to tokens
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary:    { DEFAULT: "hsl(var(--primary))",    foreground: "hsl(var(--primary-foreground))" },
        secondary:  { DEFAULT: "hsl(var(--secondary))",  foreground: "hsl(var(--secondary-foreground))" },
        destructive:{ DEFAULT: "hsl(var(--destructive))",foreground: "hsl(var(--destructive-foreground))" },
        muted:      { DEFAULT: "hsl(var(--muted))",      foreground: "hsl(var(--muted-foreground))" },
        accent:     { DEFAULT: "hsl(var(--accent))",     foreground: "hsl(var(--accent-foreground))" },
        popover:    { DEFAULT: "hsl(var(--popover))",    foreground: "hsl(var(--popover-foreground))" },
        card:       { DEFAULT: "hsl(var(--card))",       foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(11 18 32 / 0.06), 0 1px 3px 0 rgb(11 18 32 / 0.08)",
        elevated: "0 4px 12px -2px rgb(11 18 32 / 0.10), 0 0 0 1px rgb(11 18 32 / 0.04)",
        "glow-lime": "0 0 0 3px rgb(168 225 12 / 0.20), 0 4px 14px 0 rgb(168 225 12 / 0.20)",
        "inner-soft": "inset 0 1px 2px 0 rgb(11 18 32 / 0.06)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-in-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.25s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
