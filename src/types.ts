import { FilterPattern } from 'vite';
import { Config as SvgoConfig } from 'svgo';
import { PresetDefaultOverrides } from 'svgo/plugins/plugins-types';

export interface InputConfig {
  pattern?: string;
  baseDir?: string;
  prefix?: string;
  getSymbolId?: (config: Omit<ResolvedInputConfig, 'symbolId'>) => string;
  removeAttrs?: string[];
  svgoPlugins?: SvgoConfig['plugins'];
  svgoOverrides?: PresetDefaultOverrides;
  svgo?: SvgoConfig | false;
}

export type InputConfigWithDefaults = Required<Omit<InputConfig, 'svgoOverrides' | 'svgo'>> &
  Pick<InputConfig, 'svgoOverrides' | 'svgo'>;

export interface ResolvedInputConfig extends InputConfigWithDefaults {
  symbolId: string;
  matchPath: string;
  filePath: string;
  content: string;
}

export type SvgMap = Map<string, ResolvedInputConfig>;

export interface StripUnusedConfig {
  enabled?: boolean;
  matchPattern?: string | RegExp;
  srcInclude?: FilterPattern;
  srcExclude?: FilterPattern;
  whitelist?: string[];
}

export interface PluginConfig {
  outputDir: string;
  input?: InputConfig | InputConfig[];
  stripUnused?: boolean | StripUnusedConfig;
  typesFileName?: string;
  spriteFileName?: string;
  gitignore?: boolean;
}
