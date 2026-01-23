import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const storageDir = path.join(os.homedir(), '.有声绘本智能体');
const historyFile = path.join(storageDir, 'history.json');
const booksDir = path.join(storageDir, 'books');

// 确保目录存在
async function ensureDirectories() {
  try {
    await fs.mkdir(storageDir, { recursive: true });
    await fs.mkdir(booksDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create storage directories:', error);
  }
}

ensureDirectories();

export function handleStorageIPC() {
  ipcMain.handle('storage:getHistory', async () => {
    try {
      const data = await fs.readFile(historyFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle('storage:saveHistory', async (_event, history: any[]) => {
    try {
      await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save history:', error);
      return false;
    }
  });

  ipcMain.handle('storage:getBook', async (_event, id: string) => {
    try {
      const bookFile = path.join(booksDir, `${id}.json`);
      const data = await fs.readFile(bookFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  });

  ipcMain.handle('storage:saveBook', async (_event, book: any) => {
    try {
      const bookFile = path.join(booksDir, `${book.id}.json`);
      await fs.writeFile(bookFile, JSON.stringify(book, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save book:', error);
      return false;
    }
  });
}
