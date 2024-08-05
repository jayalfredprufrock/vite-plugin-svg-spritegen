![npm](https://img.shields.io/npm/v/vite-plugin-svg-spritegen?style=flat)
![GitHub](https://img.shields.io/github/license/jayalfredprufrock/vite-plugin-svg-spritegen?style=flat)
![npm](https://img.shields.io/npm/dy/vite-plugin-svg-spritegen?style=flat) 

# vite-plugin-svg-spritegen


## Installation
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
                  removeAttrs: ['class', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']
              }
          ],
          outputDir: 'src/assets/icons' 
     })
  ],
};
```

### Example Icon Component

```jsx
import spriteHref from '~/assets/icons/sprite.svg';
import type { FC, SVGProps } from 'react';
import type { IconName } from '~/assets/icons/types';

export const IconBase: FC<SVGProps<SVGSVGElement> & { name: IconName }> = ({ name, ...props }) => {
    return (
        <svg {...props}>
            <use href={`${spriteHref}#${name}`} />
        </svg>
    );
};
```

### Usage Example

```jsx
<Icon name="plus" />
```