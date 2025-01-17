import { readFileSync, writeFileSync } from 'node:fs';

export const writeIfChanged = (filePath: string, content?: string): boolean => {
  try {
    const currentContent = readFileSync(filePath, 'utf8');

    if (content && currentContent !== content) {
      writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (e) {
    writeFileSync(filePath, content ?? '', 'utf8');
    return true;
  }
};
