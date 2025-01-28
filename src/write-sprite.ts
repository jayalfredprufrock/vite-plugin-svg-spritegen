import { HTMLElement, parse } from 'node-html-parser';
import { optimize } from 'svgo';
import { writeIfChanged } from './write-if-changed';
import type { Config as SvgoConfig } from 'svgo';
import type { SvgMap } from './types';

export const writeSprite = (spritePath: string, svgMap: SvgMap): string => {
  const symbols: string[] = [];
  const definitions: string[] = [];

  const svgSorted = [...svgMap]
    .sort((a, b) => String(a[0]).localeCompare(b[0]))
    .map(([_, svg]) => svg);

  for (const svg of svgSorted) {
    if (spritePath === svg.filePath) continue;

    let content = svg.content;

    if (svg.svgo !== false) {
      const svgoDefault: SvgoConfig = {
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                removeViewBox: false,
                mergePaths: false,
                convertColors: { currentColor: true },
                ...svg.svgoOverrides,
              },
            },
          },
          'removeDimensions',
          {
            name: 'removeAttrs',
            params: { attrs: '(stroke-width|stroke-linecap|stroke-linejoin|class)' },
          },
        ],
      };

      svg.svgo = svg.svgo ?? svgoDefault;

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

    const svgEl = parse(content).querySelector('svg') as HTMLElement | null;
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
