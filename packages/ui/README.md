# @brsr/ui

Shared React component library for the BRSR AI Platform monorepo.

Consumed by:

- **`apps/web`** — internal admin / sustainability-manager portal
- **`apps/supplier-portal`** — external supplier disclosure UI

## Design philosophy

- **shadcn/ui conventions on top of Radix primitives.** Components are local React files (not a runtime UI framework), so apps can fork or override anything inline. Behaviour-heavy primitives (menus, popovers, dialogs) come from `@radix-ui/*`.
- **CVA-driven variants.** Each component declares its variants with `class-variance-authority` so styles compose cleanly and type-check at the call site.
- **Tree-shakeable.** All exports are named — there is no barrel re-export of unused side-effects. The only side-effect file is `styles.css`, which is declared in `sideEffects` so bundlers preserve it.
- **Token-driven theming.** Colors and radius come from CSS variables declared in `src/styles.css`, so dark mode (and per-tenant theming later) is a runtime class swap.

## Consuming the package

This is a **source-only workspace package** — there is no build step. Consumer apps (Next.js, Vite, etc.) transpile `src/` through their own pipeline via the `paths` mapping in `tsconfig.base.json`.

### 1. Wire up the Tailwind preset

In your app's `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import { preset as brsrUiPreset } from '@brsr/ui/tailwind-preset';

export default {
  presets: [brsrUiPreset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // scan @brsr/ui sources for class names
  ],
} satisfies Config;
```

### 2. Import the stylesheet once

In your root layout / entry file:

```ts
import '@brsr/ui/styles.css';
```

This loads `@tailwind base/components/utilities` plus the `:root` and `.dark` CSS-variable blocks that define the design tokens (primary teal, neutrals, success/warning/destructive, radius).

### 3. Use components

```tsx
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@brsr/ui';

export function EvidenceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope 1 emissions — Q4 2026</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Badge variant="success">Verified</Badge>
        <Button size="sm" variant="outline">View evidence</Button>
      </CardContent>
    </Card>
  );
}
```

## Components shipped

| Component | Variants | Notes |
| --- | --- | --- |
| `Button` | `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` × `sm`, `md`, `lg`, `icon` | Supports `asChild` for composition with `next/link` etc. |
| `Badge`  | `default`, `secondary`, `destructive`, `outline`, `success`, `warning` | `success` / `warning` exist because ESG dashboards live on traffic-light cues. |
| `Card`   | n/a | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. |

More components (Form, Dialog, Table, DataGrid, Tabs, Toast) land as the platform UIs demand them.

## Scripts

```bash
pnpm --filter @brsr/ui typecheck   # tsc --noEmit
pnpm --filter @brsr/ui lint        # eslint src
pnpm --filter @brsr/ui clean
```

## Utility export

`cn(...classes)` — `clsx + tailwind-merge`. Use it everywhere class strings are composed; it deduplicates conflicting Tailwind utilities (`p-2 p-4` → `p-4`).
