import path from 'node:path';
import { promises as fs } from 'node:fs';
import fastGlob from 'fast-glob';
import type { InputConfig, SvgMap } from './types';

export const buildSvgMap = async (inputConfigs: Required<InputConfig>[]): Promise<SvgMap> => {
  const svgMap: SvgMap = new Map();

  await Promise.all(
    inputConfigs.map(async inputConfig => {
      const { pattern, baseDir, getSymbolId } = inputConfig;
      // todo perform sort here
      const matchedPaths = await fastGlob(pattern, { cwd: baseDir });
      const matchedPathsSorted = matchedPaths.sort((a, b) => a.localeCompare(b));
      await Promise.all(
        matchedPathsSorted.map(async matchPath => {
          const filePath = path.join(baseDir, matchPath);
          const content = await fs.readFile(filePath, 'utf8');

          const resolvedInputConfig = {
            ...inputConfig,
            content,
            matchPath,
            filePath,
          };

          const symbolId = getSymbolId(resolvedInputConfig);

          if (svgMap.has(symbolId)) {
            console.log(
              `Duplicate SVG symbol id "${symbolId}. Symbol ids should be unique across all inputs."`,
            );
            return;
          }

          svgMap.set(symbolId, { ...resolvedInputConfig, symbolId });
        }),
      );
    }),
  );

  return svgMap;
};
