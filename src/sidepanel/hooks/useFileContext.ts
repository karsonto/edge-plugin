/**
 * 文件上下文管理 Hook
 * 管理通过拖拽上传的文件内容
 */

import { create } from 'zustand';
import { parseFile, isFileSupported, type ParsedFile } from '@/shared/utils/file-parser';

interface FileContextStore {
  files: ParsedFile[];
  isProcessing: boolean;
  error: string | null;
  
  addFiles: (fileList: FileList | File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  
  // 获取合并后的文件内容
  getCombinedContent: () => string;
}

export const useFileContext = create<FileContextStore>((set, get) => ({
  files: [],
  isProcessing: false,
  error: null,
  
  addFiles: async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    
    if (files.length === 0) return;
    
    set({ isProcessing: true, error: null });
    
    const errors: string[] = [];
    const parsed: ParsedFile[] = [];
    
    for (const file of files) {
      try {
        const { supported, isLegacy, ext } = isFileSupported(file);
        
        if (!supported) {
          if (isLegacy) {
            errors.push(`${file.name}: 不支持旧版 .${ext} 格式，请转换为 .${ext}x`);
          } else {
            errors.push(`${file.name}: 不支持的格式 .${ext}`);
          }
          continue;
        }
        
        console.log(`[FileContext] 解析文件: ${file.name}`);
        const result = await parseFile(file);
        parsed.push(result);
        console.log(`[FileContext] 解析成功: ${file.name}, 内容长度: ${result.content.length}`);
        
      } catch (err) {
        const msg = err instanceof Error ? err.message : '解析失败';
        errors.push(`${file.name}: ${msg}`);
        console.error(`[FileContext] 解析失败: ${file.name}`, err);
      }
    }
    
    set(state => ({
      files: [...state.files, ...parsed],
      isProcessing: false,
      error: errors.length > 0 ? errors.join('\n') : null,
    }));
  },
  
  removeFile: (id: string) => {
    set(state => ({
      files: state.files.filter(f => f.id !== id),
      error: null,
    }));
  },
  
  clearFiles: () => {
    set({ files: [], error: null });
  },
  
  getCombinedContent: () => {
    const { files } = get();
    
    if (files.length === 0) return '';
    
    return files
      .map(f => {
        const header = f.pageCount 
          ? `[文件: ${f.name} (${f.pageCount} 页)]`
          : `[文件: ${f.name}]`;
        return `${header}\n${f.content}`;
      })
      .join('\n\n---\n\n');
  },
}));
