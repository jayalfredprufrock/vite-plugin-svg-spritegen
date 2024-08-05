import path from 'node:path';
import fastGlob from 'fast-glob';
import type { InputConfig, SvgMap } from './types';

export const buildSvgMap = async (inputConfigs: Required<InputConfig>[]): Promise<SvgMap> => {
  const svgMap: SvgMap = new Map();

  for (const inputConfig of inputConfigs) {
    const { pattern, baseDir, getSymbolId } = inputConfig;

    const matchPaths = await fastGlob(pattern, { cwd: baseDir });
    for (const matchPath of matchPaths) {
      const resolvedInputConfig = {
        ...inputConfig,
        matchPath,
        filePath: path.join(baseDir, matchPath),
      };

      const symbolId = getSymbolId(resolvedInputConfig);

      if (svgMap.has(symbolId)) {
        console.log(
          `Duplicate SVG symbol id "${symbolId}. Symbol ids should be unique across all inputs."`,
        );
        continue;
      }

      svgMap.set(symbolId, { ...resolvedInputConfig, symbolId });
    }
  }
  return svgMap;
};
