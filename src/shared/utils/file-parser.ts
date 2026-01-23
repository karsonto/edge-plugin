/**
 * 文件解析器
 * 支持解析 pptx, docx, txt, pdf 文件
 */

import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// 设置 PDF.js worker (使用本地文件)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  pdfjsWorker,
  import.meta.url
).toString();

export interface ParsedFile {
  id: string;
  name: string;
  type: string;
  content: string;
  size: number;
  pageCount?: number;
  parsedAt: number;
}

export const SUPPORTED_EXTENSIONS = ['txt', 'pptx', 'docx', 'pdf'];
export const LEGACY_EXTENSIONS = ['ppt', 'doc'];

/**
 * 检查文件是否支持
 */
export function isFileSupported(file: File): { supported: boolean; isLegacy: boolean; ext: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    return { supported: true, isLegacy: false, ext };
  }
  
  if (LEGACY_EXTENSIONS.includes(ext)) {
    return { supported: false, isLegacy: true, ext };
  }
  
  return { supported: false, isLegacy: false, ext };
}

/**
 * 解析文件主入口
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const { supported, isLegacy, ext } = isFileSupported(file);
  
  if (!supported) {
    if (isLegacy) {
      throw new Error(`不支持旧版 .${ext} 格式，请转换为 .${ext}x 格式后重试`);
    }
    throw new Error(`不支持的文件格式: .${ext}，支持的格式: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }
  
  let content: string;
  let pageCount: number | undefined;
  
  switch (ext) {
    case 'txt':
      content = await parseTxt(file);
      break;
    case 'pptx': {
      const result = await parsePPTX(file);
      content = result.content;
      pageCount = result.slideCount;
      break;
    }
    case 'docx':
      content = await parseDOCX(file);
      break;
    case 'pdf': {
      const result = await parsePDF(file);
      content = result.content;
      pageCount = result.pageCount;
      break;
    }
    default:
      throw new Error(`未知的文件格式: .${ext}`);
  }
  
  return {
    id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    type: ext,
    content,
    size: file.size,
    pageCount,
    parsedAt: Date.now(),
  };
}

/**
 * 解析 TXT 文件
 */
async function parseTxt(file: File): Promise<string> {
  return file.text();
}

/**
 * 解析 PPTX 文件
 * .pptx 是 ZIP 格式，内含 ppt/slides/slide*.xml
 */
async function parsePPTX(file: File): Promise<{ content: string; slideCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const slides: { num: number; text: string }[] = [];
  
  // 遍历所有 slide 文件
  for (const [path, entry] of Object.entries(zip.files)) {
    const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match && !entry.dir) {
      const xml = await entry.async('string');
      const text = extractTextFromXML(xml, 'a:t');
      if (text.trim()) {
        slides.push({ num: parseInt(match[1]), text: text.trim() });
      }
    }
  }
  
  // 按幻灯片编号排序
  slides.sort((a, b) => a.num - b.num);
  
  // 格式化输出
  const content = slides
    .map((s, i) => `[幻灯片 ${i + 1}]\n${s.text}`)
    .join('\n\n');
  
  return { content: content || '(无文本内容)', slideCount: slides.length };
}

/**
 * 解析 DOCX 文件
 * .docx 是 ZIP 格式，内含 word/document.xml
 */
async function parseDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('无法读取 Word 文档内容');
  }
  
  const xml = await docFile.async('string');
  const text = extractTextFromXML(xml, 'w:t');
  
  return text.trim() || '(无文本内容)';
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(file: File): Promise<{ content: string; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const texts: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();
    
    if (pageText) {
      texts.push(`[第 ${i} 页]\n${pageText}`);
    }
  }
  
  return {
    content: texts.join('\n\n') || '(无文本内容)',
    pageCount: pdf.numPages,
  };
}

/**
 * 从 XML 中提取指定标签的文本内容
 */
function extractTextFromXML(xml: string, tagName: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const nodes = doc.getElementsByTagName(tagName);
  const texts: string[] = [];
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.textContent?.trim()) {
      texts.push(node.textContent.trim());
    }
  }
  
  // 用空格连接，保持段落
  return texts.join(' ');
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
