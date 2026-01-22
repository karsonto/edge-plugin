/**
 * 媒体服务 - 截图和下载功能
 */

export interface ScreenshotOptions {
  screenshotType: 'visible' | 'fullpage';
  format: 'png' | 'jpeg';
  quality: number;
  download: boolean;
  filename: string;
  elementRect?: { x: number; y: number; width: number; height: number };
  pageInfo?: {
    scrollHeight: number;
    scrollWidth: number;
    viewportHeight: number;
    viewportWidth: number;
    currentScrollY: number;
    currentScrollX: number;
  };
}

export interface DownloadOptions {
  url?: string;
  content?: string;
  filename?: string;
  contentType?: string;
}

/**
 * 截取当前可见区域
 */
export async function captureVisibleTab(
  format: 'png' | 'jpeg' = 'png',
  quality: number = 90
): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      chrome.windows.WINDOW_ID_CURRENT,
      { 
        format, 
        quality: format === 'jpeg' ? quality : undefined 
      },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (dataUrl) {
          resolve(dataUrl);
        } else {
          reject(new Error('Failed to capture screenshot'));
        }
      }
    );
  });
}

/**
 * 截取全页面（滚动拼接）
 */
export async function captureFullPage(
  tabId: number,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 90,
  pageInfo?: ScreenshotOptions['pageInfo']
): Promise<string> {
  if (!pageInfo) {
    // 获取页面信息
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        currentScrollY: window.scrollY,
        currentScrollX: window.scrollX,
      }),
    });
    pageInfo = result as ScreenshotOptions['pageInfo'];
  }

  if (!pageInfo) {
    throw new Error('Failed to get page info');
  }

  const { scrollHeight, viewportHeight, currentScrollY } = pageInfo;
  
  // 如果页面高度小于等于视口高度，直接截取可见区域
  if (scrollHeight <= viewportHeight) {
    return captureVisibleTab(format, quality);
  }

  const screenshots: string[] = [];
  const scrollPositions: number[] = [];
  
  // 计算需要截取的位置
  let currentY = 0;
  while (currentY < scrollHeight) {
    scrollPositions.push(currentY);
    currentY += viewportHeight;
  }

  // 滚动并截取每一屏
  for (const scrollY of scrollPositions) {
    // 滚动到指定位置
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [scrollY],
    });
    
    // 等待渲染
    await new Promise(r => setTimeout(r, 150));
    
    // 截取当前可见区域
    const dataUrl = await captureVisibleTab(format, quality);
    screenshots.push(dataUrl);
  }

  // 恢复原始滚动位置
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => window.scrollTo(0, y),
    args: [currentScrollY],
  });

  // 如果只有一张截图，直接返回
  if (screenshots.length === 1) {
    return screenshots[0];
  }

  // 使用 OffscreenDocument 或在 service worker 中拼接图片
  // 由于 service worker 不支持 Canvas，我们使用一种简化方案：
  // 返回第一张截图，并附带说明
  // 完整的全页面截图需要 offscreen document 支持
  
  // 尝试拼接（使用 createImageBitmap）
  try {
    const stitchedDataUrl = await stitchImages(screenshots, pageInfo.viewportWidth, scrollHeight, viewportHeight, format, quality);
    return stitchedDataUrl;
  } catch (e) {
    console.warn('Failed to stitch images, returning first screenshot:', e);
    return screenshots[0];
  }
}

/**
 * 拼接图片（在 Service Worker 中使用 OffscreenCanvas）
 */
async function stitchImages(
  screenshots: string[],
  width: number,
  totalHeight: number,
  viewportHeight: number,
  format: 'png' | 'jpeg',
  quality: number
): Promise<string> {
  // 创建 OffscreenCanvas
  const canvas = new OffscreenCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 将每张截图绘制到画布上
  for (let i = 0; i < screenshots.length; i++) {
    const dataUrl = screenshots[i];
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    
    const y = i * viewportHeight;
    const drawHeight = Math.min(viewportHeight, totalHeight - y);
    
    ctx.drawImage(
      imageBitmap, 
      0, 0, width, drawHeight,  // source
      0, y, width, drawHeight   // destination
    );
    
    imageBitmap.close();
  }

  // 导出为 blob
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvas.convertToBlob({ type: mimeType, quality: quality / 100 });
  
  // 转换为 data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 执行截图
 */
export async function takeScreenshot(
  tabId: number,
  options: ScreenshotOptions
): Promise<{ ok: boolean; dataUrl?: string; downloaded?: boolean; filename?: string; error?: string }> {
  try {
    let dataUrl: string;
    
    if (options.screenshotType === 'fullpage') {
      dataUrl = await captureFullPage(tabId, options.format, options.quality, options.pageInfo);
    } else {
      dataUrl = await captureVisibleTab(options.format, options.quality);
    }
    
    const filename = `${options.filename}.${options.format}`;
    
    // 如果需要下载
    if (options.download) {
      await downloadDataUrl(dataUrl, filename);
      return { ok: true, dataUrl, downloaded: true, filename };
    }
    
    return { ok: true, dataUrl, downloaded: false, filename };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Screenshot failed' 
    };
  }
}

/**
 * 下载 data URL
 */
async function downloadDataUrl(dataUrl: string, filename: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId !== undefined) {
          resolve(downloadId);
        } else {
          reject(new Error('Download failed'));
        }
      }
    );
  });
}

/**
 * 下载文件
 */
export async function downloadFile(
  options: DownloadOptions
): Promise<{ ok: boolean; downloadId?: number; filename?: string; error?: string }> {
  try {
    let downloadUrl: string;
    let suggestedFilename = options.filename || `download_${Date.now()}`;

    if (options.url) {
      // 直接下载 URL
      downloadUrl = options.url;
      
      // 如果没有指定文件名，从 URL 提取
      if (!options.filename) {
        try {
          const urlParts = new URL(options.url).pathname.split('/');
          const lastPart = urlParts[urlParts.length - 1];
          if (lastPart && lastPart.includes('.')) {
            suggestedFilename = lastPart.split('?')[0];
          }
        } catch {}
      }
    } else if (options.content) {
      // 将文本内容转为 data URL
      const contentType = options.contentType || 'text/plain';
      const blob = new Blob([options.content], { type: contentType });
      
      // 使用 FileReader 转换为 data URL
      downloadUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to create data URL'));
        reader.readAsDataURL(blob);
      });
      
      // 根据内容类型设置默认扩展名
      if (!options.filename) {
        const extMap: Record<string, string> = {
          'text/plain': '.txt',
          'application/json': '.json',
          'text/csv': '.csv',
          'text/markdown': '.md',
          'text/html': '.html',
        };
        suggestedFilename += extMap[contentType] || '.txt';
      }
    } else {
      return { ok: false, error: 'Must provide url or content' };
    }

    // 执行下载
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download(
        {
          url: downloadUrl,
          filename: suggestedFilename,
          saveAs: false,
        },
        (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (id !== undefined) {
            resolve(id);
          } else {
            reject(new Error('Download failed'));
          }
        }
      );
    });

    return { ok: true, downloadId, filename: suggestedFilename };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Download failed' 
    };
  }
}
