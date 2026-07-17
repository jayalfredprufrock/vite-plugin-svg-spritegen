![npm](https://img.shields.io/npm/v/vite-plugin-svg-spritegen?style=flat)
![GitHub](https://img.shields.io/github/license/jayalfredprufrock/vite-plugin-svg-spritegen?style=flat)
![npm](https://img.shields.io/npm/dy/vite-plugin-svg-spritegen?style=flat)

# vite-plugin-svg-spritegen

## Installation

v2.x is Vite 8+ only. Use v1.x for Vite 5-7

```bash
npm install -D vite-plugin-svg-spritegen
```

## Usage

```typescript
// vite.config.js
import { svgSpritegen } from 'vite-plugin-svg-spritegen';

export default {
  plugins: [
    svgSpritegen({
      input: [
        {
          baseDir: 'src/assets/icons',
        },
        {
          baseDir: 'node_modules/lucide-static/icons',
          removeAttrs: ['class', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        },
      ],
      outputDir: 'src/assets/icons',
    }),
  ],
};
```

### Generated Files

The plugin writes two files to `outputDir`:

- `sprite.svg` — the generated spritesheet. This is a build artifact, so the plugin adds it to a `.gitignore` inside `outputDir` (disable this with `gitignore: false`).
- `types.ts` — the `IconName` type and `iconNames` array, always generated from the **full** set of source SVGs (`stripUnused` never affects it). **Commit this file** so typechecking works on a fresh clone without running a build first. It regenerates automatically on every dev-server start and build, so it can't drift for long.

> **Upgrading from v2.0.1 or earlier?** Previous versions added `types.ts` to the generated `.gitignore`. The plugin removes that stale entry the next time it runs — after that, `git add` your `types.ts` to start tracking it.

### Example Icon Component

```jsx
import spriteHref from '~/assets/icons/sprite.svg';
import type { FC, SVGProps } from 'react';
import type { IconName } from '~/assets/icons/types';

export const IconBase: FC<SVGProps<SVGSVGElement> & { icon: IconName }> = ({ icon, ...props }) => {
    return (
        <svg {...props}>
            <use href={`${spriteHref}#${icon}`} />
        </svg>
    );
};
```

### Usage Example

```jsx
<Icon icon="plus" />
```

### Stripping Unused Icons

By default the plugin scans your source files during `build` and drops any icons that
aren't referenced, keeping the emitted `sprite.svg` small. Configure this via `stripUnused`:

```typescript
svgSpritegen({
  outputDir: 'src/assets/icons',
  stripUnused: {
    // Set false to include every source SVG in the sprite.
    enabled: true,
    // A RegExp (or string) with a named capture group `icon`. Every match is checked
    // against the real icon set, so unrelated strings are ignored automatically.
    matchPattern: /['"`](?<icon>[^'"`\r\n]+?)['"`]/g,
    // Which files to scan / skip (node_modules is always excluded). These are matched by
    // rolldown's native glob engine, which supports `*`, `**`, and `[...]` character classes
    // but NOT extglobs like `?(x)`, `@(a|b)`, `+(...)` — list each extension explicitly.
    srcInclude: [
      '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx',
      '**/*.mjs', '**/*.cjs', '**/*.mts', '**/*.cts',
      '**/*.md', '**/*.mdx',
    ],
    srcExclude: [],
    // Icon ids to always keep, even if they aren't detected in source.
    whitelist: [],
  },
});
```

The default `matchPattern` treats **any quoted string** (`"star"`, `'star'`, or
`` `star` ``) as a possible icon reference. Because each candidate is validated against the
generated icon set before being kept, over-matching is harmless — this catches icon names
wherever they appear (component props, object/record values, ternaries, arrays) rather than
only `icon="..."` assignments. Provide your own `matchPattern` (with an `icon` named group)
to narrow this if needed, and use `whitelist` for icons chosen in ways static analysis can't
see (e.g. names built from runtime data).
