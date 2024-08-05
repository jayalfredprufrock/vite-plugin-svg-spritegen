![npm](https://img.shields.io/npm/v/vite-plugin-svg-spritegen?style=flat)
![GitHub](https://img.shields.io/github/license/jayalfredprufrock/vite-plugin-svg-spritegen?style=flat)
![npm](https://img.shields.io/npm/dy/vite-plugin-svg-spritegen?style=flat) 

# vite-plugin-svg-spritegen


## Installation
```bash
npm install -D vite-plugin-svg-spritegen
```

## Usage
```javascript
// vite.config.js
import { iconsSpritesheet } from 'vite-plugin-svg-spritegen';

export default {
  plugins: [
     iconsSpritesheet({
      // Defaults to false, should it generate TS types for you
      withTypes: true,
      // The path to the icon directory
      inputDir: "icons",
      // Output path for the generated spritesheet and types
      outputDir: "public/icons",
      // Output path for the generated type file, defaults to types.ts in outputDir
      typesOutputFile: "app/icons.ts",
      // The name of the generated spritesheet, defaults to sprite.svg
      fileName: "icon.svg",
      // The cwd, defaults to process.cwd()
      cwd: process.cwd(),
      // Callback function that is called when the script is generating the icon name
      // This is useful if you want to modify the icon name before it is written to the file
      iconNameTransformer: (iconName) => iconName
    }),
  ],
};
```

Example component file:

```jsx
import spriteHref from "~/path/sprite.svg"
import type { SVGProps } from "react"
import type { IconName } from "~/path/types.ts"

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: IconName
}) {
  return (
    <svg {...props}>
      <use href={`${spriteHref}#${name}`} />
    </svg>
  )
}
```

Component usage:

```jsx
<Icon name="plus" />
```