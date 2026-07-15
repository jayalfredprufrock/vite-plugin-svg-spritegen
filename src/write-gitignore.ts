import { promises as fs } from 'node:fs';

const SECTION_HEADER = '# svg spritegen';

export const writeGitignore = async (filePath: string, spriteName: string): Promise<void> => {
  const section = [SECTION_HEADER, spriteName].join('\n');

  let currentContent: string | undefined;
  try {
    currentContent = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    await fs.writeFile(filePath, section + '\n', 'utf8');
    return;
  }

  // Replace any existing "# svg spritegen" section rather than appending, so entries
  // written by older versions (which also ignored the types file) get cleaned up.
  const kept: string[] = [];
  let inSection = false;
  for (const line of currentContent.split('\n')) {
    if (line.trim() === SECTION_HEADER) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (line.trim() !== '' && !line.startsWith('#')) continue;
      inSection = false;
    }
    kept.push(line);
  }

  const preserved = kept.join('\n').trim();
  const newContent = (preserved ? preserved + '\n\n' : '') + section + '\n';

  if (newContent !== currentContent) {
    await fs.writeFile(filePath, newContent, 'utf8');
  }
};
