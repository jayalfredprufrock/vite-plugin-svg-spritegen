import path from 'node:path';
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
  srcInclude: '**/*.[jt]sx',
  srcExclude: [],
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
  let allSvgFiles: SvgMap;
  const referencedSvgFiles: SvgMap = new Map();
  let isBuild = false;

  return {
    name: 'svg-spritegen',
    enforce: 'post',

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    async buildStart() {
      allSvgFiles = await buildSvgMap(inputConfigsResolved);
      await writeTypes(typesFilePath, allSvgFiles);

      if (config.gitignore !== false) {
        await writeGitignore(gitignoreFilePath, 'sprite.svg', 'types.ts');
      }

      if (isBuild) {
        if (stripUnusedResolved.enabled) {
          // creates an empty sprite file if none exists
          await writeIfChanged(spriteFilePath);
        } else {
          await writeSprite(spriteFilePath, allSvgFiles);
        }
        return;
      }

      await writeSprite(spriteFilePath, allSvgFiles);

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
      const matches = info.code.matchAll(/(?:(?:name)|(?:iconName)|(?:icon)): "(?<icon>.+?)"/g);
      for (const match of matches) {
        const icon = match.groups?.icon;

        if (!icon || referencedSvgFiles.has(icon)) continue;

        const svgPath = allSvgFiles.get(icon);
        if (!svgPath) continue;

        referencedSvgFiles.set(icon, svgPath);
      }
    },

    async generateBundle(_options, bundle) {
      if (stripUnusedResolved.enabled) {
        const spriteContent = await writeSprite(spriteFilePath, referencedSvgFiles);

        // need to replace the source code in the generated sprite file
        // since it was parsed before we wrote the content
        Object.values(bundle).forEach(file => {
          if (file.type === 'asset' && file.name === spriteNameResolved) {
            file.source = spriteContent;
          }
        });
      }
    },

    async closeBundle() {
      await watcher?.close();
    },
  };
}
