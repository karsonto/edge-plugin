export interface CaptureVisibleTabOptions {
  windowId?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface CaptureVisibleTabResult {
  dataUrl: string;
  mimeType: string;
}

export async function captureVisibleTab(
  options: CaptureVisibleTabOptions = {}
): Promise<CaptureVisibleTabResult> {
  const format = options.format === 'jpeg' ? 'jpeg' : 'png';
  const quality = typeof options.quality === 'number' ? options.quality : undefined;
  const captureOptions = {
    format,
    ...(quality !== undefined ? { quality } : {}),
  };

  const dataUrl =
    typeof options.windowId === 'number'
      ? await chrome.tabs.captureVisibleTab(options.windowId, captureOptions)
      : await chrome.tabs.captureVisibleTab(captureOptions);

  return {
    dataUrl,
    mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
  };
}
