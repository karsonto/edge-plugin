declare module '@mozilla/readability' {
  export interface ReadabilityParseResult {
    title: string;
    byline: string | null;
    dir: string | null;
    lang: string | null;
    content: string;
    textContent: string;
    length: number;
    excerpt: string | null;
    siteName: string | null;
    publishedTime?: string | null;
  }

  export class Readability {
    constructor(
      doc: Document,
      options?: {
        debug?: boolean;
        maxElemsToParse?: number;
        nbTopCandidates?: number;
        charThreshold?: number;
        classesToPreserve?: string[];
        keepClasses?: boolean;
        disableJSONLD?: boolean;
        serializer?: (el: Element) => string;
      }
    );

    parse(): ReadabilityParseResult | null;
  }
}

declare module 'turndown' {
  export interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
    emDelimiter?: '_' | '*';
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    br?: string;
    blankReplacement?: (content: string, node: Node, options: TurndownOptions) => string;
    keepReplacement?: (content: string, node: Node, options: TurndownOptions) => string;
    defaultReplacement?: (content: string, node: Node, options: TurndownOptions) => string;
  }

  export default class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(input: string | Node): string;
    keep(filter: string | string[] | ((node: Node) => boolean)): this;
    remove(filter: string | string[] | ((node: Node) => boolean)): this;
    use(plugin: unknown): this;
    addRule(
      key: string,
      rule: {
        filter: string | string[] | ((node: Node, options: TurndownOptions) => boolean);
        replacement: (content: string, node: Node, options: TurndownOptions) => string;
      }
    ): this;
  }
}
