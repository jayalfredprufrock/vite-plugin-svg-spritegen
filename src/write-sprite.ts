import { HTMLElement, parse } from 'node-html-parser';
import { optimize } from 'svgo';
import { writeIfChanged } from './write-if-changed';
import type { SvgMap } from './types';

export const writeSprite = (spritePath: string, svgMap: SvgMap): string => {
  const symbols: string[] = [];
  const definitions: string[] = [];

  for (const svg of svgMap.values()) {
    if (spritePath === svg.filePath) continue;

    let content = svg.content;

    if (svg.svgo !== false) {
      content = optimize(content, {
        ...svg.svgo,
        plugins: [
          ...(svg.svgo.plugins ?? []),
          ...(svg.removeAttrs.length
            ? [
                {
                  name: 'removeAttrs',
                  params: {
                    attrs: `(${svg.removeAttrs.join('|')})`,
                  },
                } as const,
              ]
            : []),
          ...svg.svgoPlugins,
        ],
      }).data;
    }

    const svgEl = parse(svg.content).querySelector('svg') as HTMLElement | null;
    if (!svgEl) {
      throw new Error(`SVG file at path "${svg.filePath}" does not contain an svg tag.`);
    }

    svgEl.tagName = 'symbol';
    svgEl.setAttribute('id', svg.symbolId);
    svgEl.removeAttribute('xmlns');
    svgEl.removeAttribute('xmlns:xlink');
    svgEl.removeAttribute('version');

    const defs = svgEl.querySelector('defs');

    if (defs) {
      defs.childNodes.forEach(def => definitions.push(def.toString()));
      svgEl.removeChild(defs);
    }

    symbols.push(svgEl.toString());
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">',
  ];

  if (definitions.length) {
    lines.push('  <defs>', ...definitions.map(d => `    ${d}`), '  </defs>');
  }

  lines.push(...symbols.map(s => `  ${s}`), '</svg>');

  const content = lines.join('\n');

  writeIfChanged(spritePath, content);

  return content;
};
