import { FilterPattern } from 'vite';
import { Config as SvgoConfig } from 'svgo';

export interface InputConfig {
  pattern?: string;
  baseDir?: string;
  prefix?: string;
  getSymbolId?: (config: Omit<ResolvedInputConfig, 'symbolId'>) => string;
  removeAttrs?: string[];
  svgo?: SvgoConfig | false;
}

export interface ResolvedInputConfig extends Required<InputConfig> {
  symbolId: string;
  matchPath: string;
  filePath: string;
}

export type SvgMap = Map<string, ResolvedInputConfig>;

export interface StripUnusedConfig {
  enabled?: boolean;
  srcInclude?: FilterPattern;
  srcExclude?: FilterPattern;
}

export interface PluginConfig {
  outputDir: string;
  input?: InputConfig | InputConfig[];
  stripUnused?: boolean | StripUnusedConfig;
  typesFileName?: string;
  spriteFileName?: string;
  gitignore?: boolean;
}