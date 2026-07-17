import path from 'node:path';
import { FSWatcher, watch as watchDirs } from 'chokidar';
import { normalizePath } from 'vite';
import { buildSvgMap } from './build-svg-map';
import { writeTypes } from './write-types';
import { writeGitignore } from './write-gitignore';
import { buildSpriteContent, writeSprite } from './write-sprite';
import { writeIfChanged } from './write-if-changed';
import type { FilterPattern, Plugin } from 'vite';
import type { InputConfigWithDefaults, PluginConfig, StripUnusedConfig, SvgMap } from './types';

// Matches the contents of any single-quoted, double-quoted, or backtick string literal.
// Because every match is validated against the actual icon set before being kept (see the
// `transform` handler), this intentionally over-matches: it catches icon names wherever they
// appear — component props, object/record values, ternaries, arrays — not just `icon="..."`.
// Strings that don't correspond to a real icon are harmlessly ignored.
const defaultMatchPattern = /['"`](?<icon>[^'"`\r\n]+?)['"`]/g;

const inputConfigDefaults = {
  pattern: '**/*.svg',
  baseDir: './',
  prefix: '',
  removeAttrs: [],
  svgoPlugins: [],
  getSymbolId: config =>
    config.prefix +
    config.matchPath
      .replace(/\.[^/.]+$/, '')
      .replaceAll('/', '-')
      .toLowerCase(),
} satisfies InputConfigWithDefaults;

const stripUnusedDefaults = {
  enabled: true,
  matchPattern: defaultMatchPattern,
  srcInclude: ['**/*.[jt]sx', '**/*.md?(x)'],
  srcExclude: [],
  whitelist: [],
} satisfies Required<StripUnusedConfig>;

const SPRITE_VIRTUAL_ID = '\0virtual:svg-spritegen-sprite';
const SPRITE_URL_PLACEHOLDER = '__SVG_SPRITEGEN_SPRITE_URL_PLACEHOLDER__';

const toFilterArray = (p: FilterPattern): (string | RegExp)[] =>
  [p].flat().filter((x): x is string | RegExp => x != null);

export function svgSpritegen(config: PluginConfig): Plugin {
  const inputConfigs = Array.isArray(config.input)
    ? config.input
    : [config.input ?? inputConfigDefaults];
  const inputConfigsResolved = inputConfigs.map(inputConfig => {
    const baseDir = path.resolve(process.cwd(), inputConfig.baseDir ?? inputConfigDefaults.baseDir);
    return {
      ...inputConfigDefaults,
      ...inputConfig,
      baseDir,
    };
  });

  const stripUnusedResolved: Required<StripUnusedConfig> = { ...stripUnusedDefaults };
  if (typeof config.stripUnused === 'object') {
    Object.assign(stripUnusedResolved, config.stripUnused);
  } else if (config.stripUnused === false) {
    stripUnusedResolved.enabled = false;
  }

  const outputPath = path.resolve(process.cwd(), config.outputDir);
  const spriteNameResolved = config.spriteFileName ?? 'sprite.svg';
  const typesFilePath = normalizePath(path.join(outputPath, config.typesFileName ?? 'types.ts'));
  const spriteFilePath = normalizePath(path.join(outputPath, spriteNameResolved));
  const gitignoreFilePath = normalizePath(path.join(outputPath, '.gitignore'));

  const matchPatternRe = new RegExp(stripUnusedResolved.matchPattern, 'g');

  const idIncludes = toFilterArray(stripUnusedResolved.srcInclude);
  const idExcludes = ['**/node_modules/**', ...toFilterArray(stripUnusedResolved.srcExclude)];

  let watcher: FSWatcher | undefined;
  let allSvgs: SvgMap;
  const referencedSvgs: SvgMap = new Map();
  let isBuild = false;
  let viteBase = '/';
  let spriteRefId: string | undefined;

  return {
    name: 'svg-spritegen',
    enforce: 'pre',

    configResolved(config) {
      isBuild = config.command === 'build';
      viteBase = config.base ?? '/';
    },

    async buildStart() {
      allSvgs = await buildSvgMap(inputConfigsResolved);
      await writeTypes(typesFilePath, allSvgs);

      if (config.gitignore !== false) {
        await writeGitignore(gitignoreFilePath, spriteNameResolved);
      }

      if (isBuild) {
        // Ensure the sprite file exists so the user's import can be resolved on a fresh build.
        // The content is irrelevant — we redirect the import to a virtual id and emit the
        // real sprite as a build asset in buildEnd.
        writeIfChanged(spriteFilePath);
        return;
      }

      writeSprite(spriteFilePath, allSvgs);

      const onWatch = (changedPath: string) => {
        if (changedPath === spriteFilePath) return;
        buildSvgMap(inputConfigsResolved).then(newAllSvgFiles => {
          writeSprite(spriteFilePath, newAllSvgFiles);
        });
      };

      const inputPaths = inputConfigsResolved.map(c => c.baseDir);
      watcher = watchDirs(inputPaths, { ignoreInitial: true })
        .on('add', onWatch)
        .on('change', onWatch)
        .on('unlink', onWatch);
    },

    resolveId: {
      filter: { id: new RegExp(`${spriteNameResolved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) },
      async handler(source, importer) {
        if (!isBuild) return null;
        if (source === SPRITE_VIRTUAL_ID) return null;

        const resolved = await this.resolve(source, importer, { skipSelf: true });
        if (resolved && normalizePath(resolved.id) === spriteFilePath) {
          return SPRITE_VIRTUAL_ID;
        }
        return null;
      },
    },

    load(id) {
      if (id === SPRITE_VIRTUAL_ID) {
        return `export default ${JSON.stringify(SPRITE_URL_PLACEHOLDER)};`;
      }
      return null;
    },

    transform: {
      filter: {
        id: { include: idIncludes, exclude: idExcludes },
        code: matchPatternRe,
      },
      handler(code) {
        if (!isBuild || !stripUnusedResolved.enabled) return null;

        const matches = [...code.matchAll(matchPatternRe)].flatMap(
          ({ groups }) => groups?.icon ?? [],
        );

        for (const match of matches) {
          if (referencedSvgs.has(match)) continue;
          const svg = allSvgs.get(match);
          if (svg) referencedSvgs.set(match, svg);
        }

        return null;
      },
    },

    buildEnd() {
      if (!isBuild) return;

      for (const id of stripUnusedResolved.whitelist) {
        if (referencedSvgs.has(id)) continue;
        const svg = allSvgs.get(id);
        if (svg) referencedSvgs.set(id, svg);
      }

      const sourceMap = stripUnusedResolved.enabled ? referencedSvgs : allSvgs;

      spriteRefId = this.emitFile({
        type: 'asset',
        name: spriteNameResolved,
        source: buildSpriteContent(sourceMap, spriteFilePath),
      });
    },

    renderChunk: {
      filter: { code: SPRITE_URL_PLACEHOLDER },
      handler(code) {
        if (!spriteRefId) return null;

        const fileName = this.getFileName(spriteRefId);
        const baseSlash = viteBase.endsWith('/') ? viteBase : `${viteBase}/`;
        const url = `${baseSlash}${fileName}`;

        return code.replaceAll(SPRITE_URL_PLACEHOLDER, url);
      },
    },

    async closeBundle() {
      await watcher?.close();
    },
  };
}

export default svgSpritegen;
