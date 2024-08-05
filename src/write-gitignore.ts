import { promises as fs } from 'node:fs';

export const writeGitignore = async (
  filePath: string,
  spriteName: string,
  typesName: string,
): Promise<void> => {
  const content = ['# svg spritegen', spriteName, typesName].join('\n');

  try {
    const currentContent = await fs.readFile(filePath, 'utf8');

    if (currentContent.includes(content)) {
      return;
    } else {
      await fs.writeFile(filePath, currentContent + '\n' + content, 'utf8');
    }
  } catch (e) {
    await fs.writeFile(filePath, content, 'utf8');
  }
};
