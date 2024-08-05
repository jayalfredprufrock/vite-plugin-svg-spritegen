import { promises as fs } from 'node:fs';
import { HTMLElement, parse } from 'node-html-parser';
import { optimize } from 'svgo';
import { writeIfChanged } from './write-if-changed';
import type { SvgMap } from './types';

export const writeSprite = async (spritePath: string, svgMap: SvgMap): Promise<string> => {
  const symbols: string[] = [];
  const definitions: string[] = [];

  await Promise.all(
    [...svgMap.values()].map(async inputConfig => {
      const { svgo, removeAttrs, symbolId, filePath } = inputConfig;

      if (spritePath === filePath) return;

      let svgContent = await fs.readFile(filePath, 'utf8');

      if (svgo !== false) {
        svgContent = optimize(svgContent, {
          ...svgo,
          plugins: [
            ...(svgo.plugins ?? []),
            ...(removeAttrs.length
              ? [
                  {
                    name: 'removeAttrs',
                    params: {
                      attrs: `(${removeAttrs.join('|')})`,
                    },
                  } as const,
                ]
              : []),
          ],
        }).data;
      }

      const svg = parse(svgContent).querySelector('svg') as HTMLElement | null;
      if (!svg) {
        throw new Error(`SVG file at path "${filePath}" does not contain an svg tag.`);
      }

      svg.tagName = 'symbol';
      svg.setAttribute('id', symbolId);
      svg.removeAttribute('xmlns');
      svg.removeAttribute('xmlns:xlink');
      svg.removeAttribute('version');

      const defs = svg.querySelector('defs');

      if (defs) {
        defs.childNodes.forEach(def => definitions.push(def.toString()));
        svg.removeChild(defs);
      }

      symbols.push(svg.toString());
    }),
  );

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">',
  ];

  if (definitions.length) {
    lines.push('  <defs>', ...definitions.map(d => `    ${d}`), '  </defs>');
  }

  lines.push(...symbols.map(s => `  ${s}`), '</svg>');

  const content = lines.join('\n');

  await writeIfChanged(spritePath, lines.join('\n'));

  return content;
};
