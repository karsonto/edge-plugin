import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type {
  ExtractedPageDocument,
  PageContext,
  PageExtractionInfo,
  PageMetadata,
} from '@/shared/types';
import {
  countWords,
  estimateReadingTime,
  extractAllVisibleText,
  normalizeStructuredText,
} from '@/shared/utils/text-processor';
import { getPageMetadata, getSelectedText } from '@/shared/utils/dom-utils';

const EXTRACTION_VERSION = 'readability-turndown-v1';
const MIN_READABILITY_TEXT_LENGTH = 160;

interface ReadabilityDocumentResult {
  title: string;
  url: string;
  markdown: string;
  textContent: string;
  metadata: Partial<PageMetadata>;
}

function createTurndownService() {
  return new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
}

function sanitizeReadabilityClone(doc: Document): Document {
  const clone = doc.cloneNode(true) as Document;
  clone.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
  return clone;
}

function extractWithReadability(doc: Document, fallbackUrl?: string): ReadabilityDocumentResult | null {
  try {
    const cloned = sanitizeReadabilityClone(doc);
    const article = new Readability(cloned).parse();
    if (!article?.content || !article.textContent) {
      return null;
    }

    const textContent = normalizeStructuredText(article.textContent);
    if (textContent.length < MIN_READABILITY_TEXT_LENGTH) {
      return null;
    }

    const turndownService = createTurndownService();
    const markdown = normalizeStructuredText(turndownService.turndown(article.content));
    if (!markdown) {
      return null;
    }

    const pageMeta = getPageMetadata(doc);
    return {
      title: article.title || doc.title || '未命名页面',
      url: doc.location?.href || fallbackUrl || window.location.href,
      markdown,
      textContent,
      metadata: {
        author: article.byline || pageMeta.author,
        publishDate: article.publishedTime || pageMeta.publishDate,
        description: article.excerpt || pageMeta.description,
        language: article.lang || pageMeta.language,
        keywords: pageMeta.keywords,
      },
    };
  } catch (error) {
    console.warn('[Readability] 提取失败:', error);
    return null;
  }
}

function extractShadowDomText(root: ShadowRoot): string {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement;
      const text = (node.nodeValue || '').trim();
      if (!parent || !text) {
        return NodeFilter.FILTER_REJECT;
      }

      const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
      if (style?.display === 'none' || style?.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const chunks: string[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = (current.nodeValue || '').trim();
    if (text) {
      chunks.push(text);
    }
    current = walker.nextNode();
  }

  root.querySelectorAll('*').forEach((el) => {
    const shadowHost = el as Element & { shadowRoot?: ShadowRoot | null };
    if (shadowHost.shadowRoot) {
      const nestedText = extractShadowDomText(shadowHost.shadowRoot);
      if (nestedText) {
        chunks.push(nestedText);
      }
    }
  });

  return normalizeStructuredText(chunks.join('\n'));
}

function extractShadowDomSupplement(): string {
  const chunks: string[] = [];
  document.querySelectorAll('*').forEach((el) => {
    const host = el as Element & { shadowRoot?: ShadowRoot | null };
    if (!host.shadowRoot) {
      return;
    }
    const text = extractShadowDomText(host.shadowRoot);
    if (text) {
      chunks.push(text);
    }
  });
  return normalizeStructuredText(chunks.join('\n\n'));
}

function getSameOriginIframeDocuments(): Array<{ doc: Document; url: string; title: string }> {
  const iframes = Array.from(document.querySelectorAll('iframe'));
  const docs: Array<{ doc: Document; url: string; title: string }> = [];

  iframes.forEach((iframe, index) => {
    try {
      const childDoc = iframe.contentDocument;
      if (!childDoc) {
        return;
      }
      docs.push({
        doc: childDoc,
        url: childDoc.location?.href || iframe.src || `iframe://${index}`,
        title: childDoc.title || iframe.name || `iframe-${index + 1}`,
      });
    } catch (error) {
      console.warn('[Readability] 跳过跨域 iframe:', iframe.src || iframe.name || index);
    }
  });

  return docs;
}

function buildSupplementDocument(content: string, order: number): ExtractedPageDocument | null {
  const normalized = normalizeStructuredText(content);
  if (!normalized) {
    return null;
  }

  return {
    id: 'supplement-visible-text',
    title: '页面补充内容',
    url: window.location.href,
    role: 'supplement',
    sourceType: 'shadow-dom',
    format: 'text',
    order,
    content: normalized,
  };
}

function buildIframeFallbackDocument(
  id: string,
  title: string,
  url: string,
  order: number,
  content: string
): ExtractedPageDocument | null {
  const normalized = normalizeStructuredText(content);
  if (!normalized) {
    return null;
  }

  return {
    id,
    title,
    url,
    role: 'iframe',
    sourceType: 'iframe',
    format: 'text',
    order,
    content: normalized,
  };
}

function buildSelectionDocument(content: string, order: number): ExtractedPageDocument | null {
  const normalized = normalizeStructuredText(content);
  if (!normalized) {
    return null;
  }

  return {
    id: 'selection',
    title: '用户选中文本',
    url: window.location.href,
    role: 'selected',
    sourceType: 'selection',
    format: 'text',
    order,
    content: normalized,
  };
}

function toExtractedDocument(
  id: string,
  role: ExtractedPageDocument['role'],
  sourceType: ExtractedPageDocument['sourceType'],
  order: number,
  result: ReadabilityDocumentResult
): ExtractedPageDocument {
  return {
    id,
    title: result.title,
    url: result.url,
    role,
    sourceType,
    format: 'markdown',
    order,
    content: result.markdown,
  };
}

function mergeDocuments(documents: ExtractedPageDocument[]): string {
  return documents
    .sort((a, b) => a.order - b.order)
    .map((doc) => {
      const header = doc.title ? `## ${doc.title}` : '';
      return [header, doc.content].filter(Boolean).join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

export function extractReadabilityPageContext(): PageContext {
  const selection = getSelectedText();
  const documents: ExtractedPageDocument[] = [];
  const mainResult = extractWithReadability(document, window.location.href);

  if (selection) {
    const selectionDoc = buildSelectionDocument(selection, 0);
    if (selectionDoc) {
      documents.push(selectionDoc);
    }
  }

  let aggregateMetadata: Partial<PageMetadata> = {};
  let fallbackTitle = document.title;

  if (mainResult) {
    documents.push(toExtractedDocument('main-document', 'main', 'main-document', 10, mainResult));
    aggregateMetadata = { ...aggregateMetadata, ...mainResult.metadata };
    fallbackTitle = mainResult.title || fallbackTitle;
  }

  getSameOriginIframeDocuments().forEach(({ doc, url, title }, index) => {
    const order = 20 + index;
    const docId = `iframe-${index + 1}`;
    const iframeResult = extractWithReadability(doc, url);
    if (iframeResult) {
      documents.push(toExtractedDocument(
        docId,
        'iframe',
        'iframe',
        order,
        {
          ...iframeResult,
          title: iframeResult.title || title,
        }
      ));
      return;
    }

    const iframeVisibleText = extractAllVisibleText(doc);
    const fallbackDoc = buildIframeFallbackDocument(
      docId,
      title,
      url,
      order,
      iframeVisibleText
    );
    if (fallbackDoc) {
      documents.push(fallbackDoc);
    }
  });

  const supplementContent = extractShadowDomSupplement();
  const supplementDoc = buildSupplementDocument(supplementContent, 100);
  if (supplementDoc) {
    documents.push(supplementDoc);
  }

  if (!documents.length) {
    const fallbackContent = normalizeStructuredText(extractAllVisibleText(document));
    const metadata = getPageMetadata(document);
    return {
      title: document.title,
      url: window.location.href,
      content: fallbackContent,
      selectedText: selection || undefined,
      metadata: {
        ...metadata,
        wordCount: countWords(fallbackContent),
        readingTime: estimateReadingTime(fallbackContent),
      },
      timestamp: Date.now(),
      extraction: {
        strategy: 'readability',
        outputFormat: 'text',
        version: EXTRACTION_VERSION,
        fusionMethod: 'single',
      },
      documents: fallbackContent
        ? [{
            id: 'fallback-visible-text',
            title: document.title,
            url: window.location.href,
            role: 'supplement',
            sourceType: 'visible-text',
            format: 'text',
            order: 0,
            content: fallbackContent,
          }]
        : undefined,
    };
  }

  const mergedContent = mergeDocuments(documents);
  const finalMetadata = {
    ...getPageMetadata(document),
    ...aggregateMetadata,
    wordCount: countWords(mergedContent),
    readingTime: estimateReadingTime(mergedContent),
  };

  const extraction: PageExtractionInfo = {
    strategy: 'readability',
    outputFormat: 'markdown',
    version: EXTRACTION_VERSION,
    fusionMethod: documents.length > 1 ? 'readability-merge' : 'single',
  };

  return {
    title: fallbackTitle || document.title,
    url: window.location.href,
    content: mergedContent,
    selectedText: selection || undefined,
    metadata: finalMetadata,
    timestamp: Date.now(),
    documents,
    extraction,
  };
}
