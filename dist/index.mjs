import path from "node:path";
import { watch } from "chokidar";
import { normalizePath, createFilter } from "vite";
import fastGlob from "fast-glob";
import { promises } from "node:fs";
import { parse } from "node-html-parser";
import { optimize } from "svgo";
const buildSvgMap = async (inputConfigs) => {
  const svgMap = /* @__PURE__ */ new Map();
  for (const inputConfig of inputConfigs) {
    const { pattern, baseDir, getSymbolId } = inputConfig;
    const matchPaths = await fastGlob(pattern, { cwd: baseDir });
    for (const matchPath of matchPaths) {
      const resolvedInputConfig = {
        ...inputConfig,
        matchPath,
        filePath: path.join(baseDir, matchPath)
      };
      const symbolId = getSymbolId(resolvedInputConfig);
      if (svgMap.has(symbolId)) {
        console.log(
          `Duplicate SVG symbol id "${symbolId}. Symbol ids should be unique across all inputs."`
        );
        continue;
      }
      svgMap.set(symbolId, { ...resolvedInputConfig, symbolId });
    }
  }
  return svgMap;
};
const writeIfChanged = async (filePath, content) => {
  try {
    const currentContent = await promises.readFile(filePath, "utf8");
    if (content && currentContent !== content) {
      await promises.writeFile(filePath, content, "utf8");
    }
  } catch (e) {
    await promises.writeFile(filePath, content ?? "", "utf8");
  }
};
const writeTypes = async (filePath, svgMap) => {
  const iconNames = [...svgMap.keys()];
  const content = [
    "/* eslint-disable */",
    "",
    "// This file is autogenerated. Do not commit to source control.",
    "",
    "export type IconName = (typeof iconNames)[number];",
    "",
    "export const iconNames = [",
    ...iconNames.map((name) => `  '${name}',`),
    "] as const;",
    ""
  ].join("\n");
  await writeIfChanged(filePath, content);
};
const writeGitignore = async (filePath, spriteName, typesName) => {
  const content = ["# svg spritegen", spriteName, typesName].join("\n");
  try {
    const currentContent = await promises.readFile(filePath, "utf8");
    if (currentContent.includes(content)) {
      return;
    } else {
      await promises.writeFile(filePath, currentContent + "\n" + content, "utf8");
    }
  } catch (e) {
    await promises.writeFile(filePath, content, "utf8");
  }
};
const writeSprite = async (spritePath, svgMap) => {
  const symbols = [];
  const definitions = [];
  await Promise.all(
    [...svgMap.values()].map(async (inputConfig) => {
      const { svgo, removeAttrs, symbolId, filePath } = inputConfig;
      if (spritePath === filePath) return;
      let svgContent = await promises.readFile(filePath, "utf8");
      if (svgo !== false) {
        svgContent = optimize(svgContent, {
          ...svgo,
          plugins: [
            ...svgo.plugins ?? [],
            ...removeAttrs.length ? [
              {
                name: "removeAttrs",
                params: {
                  attrs: `(${removeAttrs.join("|")})`
                }
              }
            ] : []
          ]
        }).data;
      }
      const svg = parse(svgContent).querySelector("svg");
      if (!svg) {
        throw new Error(`SVG file at path "${filePath}" does not contain an svg tag.`);
      }
      svg.tagName = "symbol";
      svg.setAttribute("id", symbolId);
      svg.removeAttribute("xmlns");
      svg.removeAttribute("xmlns:xlink");
      svg.removeAttribute("version");
      const defs = svg.querySelector("defs");
      if (defs) {
        defs.childNodes.forEach((def) => definitions.push(def.toString()));
        svg.removeChild(defs);
      }
      symbols.push(svg.toString());
    })
  );
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">'
  ];
  if (definitions.length) {
    lines.push("  <defs>", ...definitions.map((d) => `    ${d}`), "  </defs>");
  }
  lines.push(...symbols.map((s) => `  ${s}`), "</svg>");
  const content = lines.join("\n");
  await writeIfChanged(spritePath, lines.join("\n"));
  return content;
};
const svgoDefault = {
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,
          convertColors: { currentColor: true }
        }
      }
    },
    "removeDimensions",
    {
      name: "removeAttrs",
      params: { attrs: "(stroke-width|stroke-linecap|stroke-linejoin|class)" }
    }
  ]
};
const inputConfigDefaults = {
  pattern: "**/*.svg",
  baseDir: "./",
  prefix: "",
  removeAttrs: [],
  svgo: svgoDefault,
  getSymbolId: (config) => config.prefix + config.matchPath.replace(/\.[^/.]+$/, "").replaceAll("/", "-").toLowerCase()
};
const stripUnusedDefaults = {
  enabled: true,
  srcInclude: "**/*.[jt]sx",
  srcExclude: []
};
function svgSpritegen(config) {
  const inputConfigs = Array.isArray(config.input) ? config.input : [config.input ?? inputConfigDefaults];
  const inputConfigsResolved = inputConfigs.map((inputConfig) => {
    const baseDir = path.resolve(process.cwd(), inputConfig.baseDir ?? inputConfigDefaults.baseDir);
    return {
      ...inputConfigDefaults,
      ...inputConfig,
      baseDir
    };
  });
  const stripUnusedResolved = { ...stripUnusedDefaults };
  if (typeof config.stripUnused === "object") {
    Object.assign(stripUnusedResolved, config.stripUnused);
  } else if (config.stripUnused === false) {
    stripUnusedResolved.enabled = false;
  }
  const outputPath = path.resolve(process.cwd(), config.outputDir);
  const spriteNameResolved = config.spriteFileName ?? "sprite.svg";
  const typesFilePath = normalizePath(path.join(outputPath, config.typesFileName ?? "types.ts"));
  const spriteFilePath = normalizePath(path.join(outputPath, spriteNameResolved));
  const gitignoreFilePath = normalizePath(path.join(outputPath, ".gitignore"));
  const { srcInclude, srcExclude } = stripUnusedResolved;
  const srcExcludeResolved = ["node_modules/**", srcExclude].flat().filter((e) => e !== null);
  const srcFilter = createFilter(srcInclude, srcExcludeResolved);
  let watcher;
  let allSvgFiles;
  const referencedSvgFiles = /* @__PURE__ */ new Map();
  let isBuild = false;
  return {
    name: "svg-spritegen",
    enforce: "post",
    configResolved(config2) {
      isBuild = config2.command === "build";
    },
    async buildStart() {
      allSvgFiles = await buildSvgMap(inputConfigsResolved);
      await writeTypes(typesFilePath, allSvgFiles);
      if (config.gitignore !== false) {
        await writeGitignore(gitignoreFilePath, "sprite.svg", "types.ts");
      }
      if (isBuild) {
        if (stripUnusedResolved.enabled) {
          await writeIfChanged(spriteFilePath);
        } else {
          await writeSprite(spriteFilePath, allSvgFiles);
        }
        return;
      }
      await writeSprite(spriteFilePath, allSvgFiles);
      const onWatch = (path2) => {
        if (path2 === spriteFilePath) return;
        buildSvgMap(inputConfigsResolved).then((newAllSvgFiles) => {
          writeSprite(spriteFilePath, newAllSvgFiles);
        });
      };
      const inputPaths = inputConfigsResolved.map((config2) => config2.baseDir);
      watcher = watch(inputPaths, { ignoreInitial: true }).on("add", onWatch).on("change", onWatch).on("unlink", onWatch);
    },
    moduleParsed(info) {
      var _a;
      if (!isBuild || !stripUnusedResolved.enabled || !srcFilter(info.id) || !info.code) return;
      const matches = info.code.matchAll(/(?:(?:name)|(?:iconName)|(?:icon)): "(?<icon>.+?)"/g);
      for (const match of matches) {
        const icon = (_a = match.groups) == null ? void 0 : _a.icon;
        if (!icon || referencedSvgFiles.has(icon)) continue;
        const svgPath = allSvgFiles.get(icon);
        if (!svgPath) continue;
        referencedSvgFiles.set(icon, svgPath);
      }
    },
    async generateBundle(_options, bundle) {
      if (stripUnusedResolved.enabled) {
        const spriteContent = await writeSprite(spriteFilePath, referencedSvgFiles);
        Object.values(bundle).forEach((file) => {
          if (file.type === "asset" && file.name === spriteNameResolved) {
            file.source = spriteContent;
          }
        });
      }
    },
    async closeBundle() {
      await (watcher == null ? void 0 : watcher.close());
    }
  };
}
export {
  svgSpritegen
};