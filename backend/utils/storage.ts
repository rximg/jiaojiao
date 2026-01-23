import { promises as fs } from 'fs';
import path from 'path';
import type { Book } from '../../src/types/types';

export async function saveBook(book: Book, outputPath: string): Promise<void> {
  const bookDir = path.join(outputPath, 'books', book.id);
  await fs.mkdir(bookDir, { recursive: true });

  // 保存绘本元数据
  const bookJsonPath = path.join(bookDir, 'book.json');
  await fs.writeFile(bookJsonPath, JSON.stringify(book, null, 2), 'utf-8');

  // 创建图片和音频目录
  const imagesDir = path.join(bookDir, 'images');
  const audiosDir = path.join(bookDir, 'audios');
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(audiosDir, { recursive: true });
}

export async function loadBook(
  bookId: string,
  outputPath: string
): Promise<Book | null> {
  try {
    const bookJsonPath = path.join(outputPath, 'books', bookId, 'book.json');
    const data = await fs.readFile(bookJsonPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}
