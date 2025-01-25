import path from 'node:path';
import { hash } from 'node:crypto';
import { FSWatcher, watch as watchDirs } from 'chokidar';
import { createFilter, normalizePath } from 'vite';
import { buildSvgMap } from './build-svg-map';
import { writeTypes } from './write-types';
import { writeGitignore } from './write-gitignore';
import { writeSprite } from './write-sprite';
import { writeIfChanged } from './write-if-changed';
import type { Config as SvgoConfig } from 'svgo';
import type { Plugin } from 'vite';
import type { InputConfig, PluginConfig, StripUnusedConfig, SvgMap } from './types';

const svgoDefault: SvgoConfig = {
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          convertColors: { currentColor: true },
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

const defaultMatchPattern = /((name)|(iconName)|(icon)):\s?"(?<icon>.+?)"/g;

const inputConfigDefaults = {
  pattern: '**/*.svg',
  baseDir: './',
  prefix: '',
  removeAttrs: [],
  svgo: svgoDefault,
  svgoPlugins: [],
  getSymbolId: config =>
    config.prefix +
    config.matchPath
      .replace(/\.[^/.]+$/, '')
      .replaceAll('/', '-')
      .toLowerCase(),
} satisfies Required<InputConfig>;

const stripUnusedDefaults = {
  enabled: true,
  matchPattern: defaultMatchPattern,
  srcInclude: ['**/*.[jt]sx', '**/*.md?(x)'],
  srcExclude: [],
  whitelist: [],
} satisfies Required<StripUnusedConfig>;

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

  const { srcInclude, srcExclude } = stripUnusedResolved;
  const srcExcludeResolved = ['node_modules/**', srcExclude].flat().filter(e => e !== null);
  const srcFilter = createFilter(srcInclude, srcExcludeResolved);

  let watcher: FSWatcher;
  let allSvgs: SvgMap;
  const referencedSvgs: SvgMap = new Map();
  let isBuild = false;

  let finalSpriteContent = '';

  return {
    name: 'svg-spritegen',
    enforce: 'post',

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    async buildStart() {
      allSvgs = await buildSvgMap(inputConfigsResolved);
      await writeTypes(typesFilePath, allSvgs);

      if (config.gitignore !== false) {
        await writeGitignore(gitignoreFilePath, 'sprite.svg', 'types.ts');
      }

      if (isBuild) {
        if (stripUnusedResolved.enabled) {
          // creates an empty sprite file if none exists
          writeIfChanged(spriteFilePath);
        } else {
          writeSprite(spriteFilePath, allSvgs);
        }
        return;
      }

      writeSprite(spriteFilePath, allSvgs);

      const onWatch = (path: string) => {
        if (path === spriteFilePath) return;
        buildSvgMap(inputConfigsResolved).then(newAllSvgFiles => {
          writeSprite(spriteFilePath, newAllSvgFiles);
        });
      };

      const inputPaths = inputConfigsResolved.map(config => config.baseDir);
      watcher = watchDirs(inputPaths, { ignoreInitial: true })
        .on('add', onWatch)
        .on('change', onWatch)
        .on('unlink', onWatch);
    },

    moduleParsed(info) {
      if (!isBuild || !stripUnusedResolved.enabled || !srcFilter(info.id) || !info.code) return;

      const matchPattern = new RegExp(stripUnusedResolved.matchPattern, 'g');

      const matches = [...info.code.matchAll(matchPattern)].flatMap(
        ({ groups }) => groups?.icon ?? [],
      );

      matches.push(...stripUnusedResolved.whitelist);

      for (const match of matches) {
        if (referencedSvgs.has(match)) continue;

        const svg = allSvgs.get(match);
        if (!svg) continue;

        referencedSvgs.set(match, svg);
      }
    },

    outputOptions(options) {
      if (!stripUnusedResolved.enabled) return null;

      finalSpriteContent = writeSprite(spriteFilePath, referencedSvgs);

      return {
        ...options,
        assetFileNames: asset => {
          const name =
            typeof options.assetFileNames === 'string'
              ? options.assetFileNames
              : (options.assetFileNames?.(asset) ?? 'assets/[name]-[hash][extname]');

          if (asset.names.includes(spriteNameResolved)) {
            return name.replace(
              '[hash]',
              hash('sha256', finalSpriteContent, 'hex').substring(0, 8),
            );
          } else {
            return name;
          }
        },
      };
    },

    async generateBundle(_options, bundle) {
      if (stripUnusedResolved.enabled) {
        // need to replace the source code in the generated sprite file
        // since it was parsed before we wrote the content
        Object.values(bundle).forEach(file => {
          if (file.type === 'asset' && file.names.includes(spriteNameResolved)) {
            file.source = finalSpriteContent;
          }
        });
      }
    },

    async closeBundle() {
      await watcher?.close();
    },
  };
}

export default svgSpritegen;
