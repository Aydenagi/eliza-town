import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  created?: Date;
}

export interface CoderFile {
  path?: string;
  name?: string;
  content?: string;
}

export interface CoderOutput {
  files?: CoderFile[];
}

const MAX_FILES_PER_TASK = 12;
const MAX_FILE_BYTES = 200 * 1024;

export function taskDir(taskId: number | string): string {
  return path.join(path.resolve(config.outputDir), `task_${taskId}`);
}

// Filenames must be a single path component, no subdirectories. This keeps them
// listable by listTaskFiles, downloadable through the single-segment :name route,
// and countable toward MAX_FILES_PER_TASK without a directory walk.
function assertSafeFilename(filename: string): void {
  if (path.isAbsolute(filename)) {
    throw new Error(`Refusing to write absolute path "${filename}". Use a bare filename, no directories.`);
  }
  if (filename.includes('/') || filename.includes('\\') || filename === '..' || filename === '.') {
    throw new Error(`Refusing to write "${filename}": only flat filenames are allowed, no subdirectories.`);
  }
}

export async function saveTaskFile(
  taskId: number | string,
  filename: string,
  content: string
): Promise<string> {
  assertSafeFilename(filename);

  const byteSize = Buffer.byteLength(content, 'utf-8');
  if (byteSize > MAX_FILE_BYTES) {
    throw new Error(
      `File "${filename}" is ${byteSize} bytes, over the ${MAX_FILE_BYTES} byte limit. Shorten the output.`
    );
  }

  const dir = taskDir(taskId);
  const existing = await listTaskFiles(taskId);
  const alreadyExists = existing.some((f) => f.name === filename);
  if (!alreadyExists && existing.length >= MAX_FILES_PER_TASK) {
    throw new Error(`Task already has ${MAX_FILES_PER_TASK} files, the maximum. Drop or merge a file.`);
  }

  const filepath = path.join(dir, filename);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, content, 'utf-8');
  return filepath;
}

export async function saveCoderOutput(taskId: number | string, output: string | CoderOutput): Promise<FileInfo[]> {
  const savedFiles: FileInfo[] = [];

  try {
    const parsed: CoderOutput = typeof output === 'string' ? JSON.parse(output) : output;
    if (parsed.files && Array.isArray(parsed.files)) {
      for (const file of parsed.files) {
        const filename = file.path || file.name || `file_${savedFiles.length + 1}`;
        const content = file.content || '';
        const filepath = await saveTaskFile(taskId, filename, content);
        savedFiles.push({ name: filename, path: filepath, size: Buffer.byteLength(content, 'utf-8') });
      }
      return savedFiles;
    }
  } catch {
    // Not JSON, fall through to raw output.
  }

  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  if (outputStr.length > 0) {
    const filepath = await saveTaskFile(taskId, 'output.txt', outputStr);
    savedFiles.push({ name: 'output.txt', path: filepath, size: Buffer.byteLength(outputStr, 'utf-8') });
  }

  return savedFiles;
}

export async function listTaskFiles(taskId: number | string): Promise<{ name: string; size: number }[]> {
  const dir = taskDir(taskId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const stat = await fs.stat(path.join(dir, entry.name));
          return { name: entry.name, size: stat.size };
        })
    );
    return files;
  } catch {
    return [];
  }
}

export async function readTaskFile(taskId: number | string, filename: string): Promise<Buffer> {
  assertSafeFilename(filename);
  return fs.readFile(path.join(taskDir(taskId), filename));
}
