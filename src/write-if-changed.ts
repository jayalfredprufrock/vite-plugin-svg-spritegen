import { promises as fs } from 'node:fs';

export const writeIfChanged = async (filePath: string, content?: string): Promise<void> => {
  try {
    const currentContent = await fs.readFile(filePath, 'utf8');

    if (content && currentContent !== content) {
      await fs.writeFile(filePath, content, 'utf8');
    }
  } catch (e) {
    await fs.writeFile(filePath, content ?? '', 'utf8');
  }
};
