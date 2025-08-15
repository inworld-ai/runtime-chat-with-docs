import axios from 'axios';
import * as cheerio from 'cheerio';

import { SCRAPER_MAX_PAGES } from '../../constants';

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

export class DocumentationScraper {
  private visitedUrls: Set<string> = new Set();
  private readonly CONCURRENT_LIMIT = 5;
  private readonly REQUEST_TIMEOUT = 5000;

  private async fetchPageWithLinks(
    url: string,
  ): Promise<{ page: ScrapedPage | null; links: string[] }> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: this.REQUEST_TIMEOUT,
      });

      const $ = cheerio.load(response.data);
      const domain = new URL(url).hostname;

      // Remove unwanted elements (but keep some for link extraction first)
      const originalHtml = $.html();

      // Extract title
      const title = (
        $('h1').first().text() ||
        $('title').text() ||
        'Untitled'
      ).trim();

      // Extract content
      const content = this.extractDocumentationText($);

      // Extract links from the original DOM (before cleanup)
      const originalDoc = cheerio.load(originalHtml);
      const links: string[] = [];
      originalDoc('a[href]').each((_: number, element: any) => {
        const href = originalDoc(element).attr('href');
        if (href) {
          try {
            let absoluteUrl: string;
            if (href.startsWith('http')) {
              absoluteUrl = href;
            } else if (href.startsWith('/')) {
              absoluteUrl = `https://${domain}${href}`;
            } else if (!href.startsWith('#')) {
              absoluteUrl = new URL(href, url).toString();
            } else {
              return;
            }

            if (
              absoluteUrl.includes(domain) &&
              !this.visitedUrls.has(absoluteUrl) &&
              absoluteUrl.includes('/docs/') && // Only follow documentation links
              !absoluteUrl.includes('/login') && // Skip login redirects
              !absoluteUrl.includes('redirect=') // Skip redirect URLs
            ) {
              links.push(absoluteUrl);
            }
          } catch (_e) {
            // Skip invalid URLs
          }
        }
      });

      // Debug content extraction
      if (process.env.DEBUG) {
        console.log(
          `[DEBUG] ${url}: title="${title}", content length=${content.length}`,
        );
        if (content.length > 0) {
          console.log(
            `[DEBUG] Content preview: ${content.substring(0, 200)}...`,
          );
        }
      }

      // Check content length - be more lenient for API docs
      if (content.length < 50) {
        if (process.env.DEBUG) {
          console.log(
            `Skipping ${url} - content too short (${content.length} chars)`,
          );
        }
        return { page: null, links };
      }

      return {
        page: { url, title, content },
        links,
      };
    } catch (error: any) {
      console.error(`Error fetching ${url}: ${error.message}`);
      return { page: null, links: [] };
    }
  }

  private extractDocumentationText($: any): string {
    // Remove only truly unwanted elements - be much less aggressive
    $('script, style').remove(); // Keep nav elements, they might have content!

    // Remove only specific Mintlify UI elements that are definitely not content
    $('[data-testid="copy-code-button"]').remove();
    $('#navigation-items, #table-of-contents-layout').remove(); // Remove only TOC, not all nav

    // Focus on main content area - prioritize .mdx-content
    let contentArea = $('.mdx-content');
    if (contentArea.length === 0) {
      // Fallback to other content containers
      contentArea = $('main, article, [role="main"], .content, #content');
    }
    if (contentArea.length === 0) {
      contentArea = $('body'); // Last resort
    }

    const textElements: string[] = [];
    const processedElements = new Set();

    // Extract text from ALL semantic elements - be much more inclusive
    contentArea
      .find(
        'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, div, span, section, article, code, pre',
      )
      .each((_: number, element: any) => {
        const $el = $(element);

        // Skip if already processed
        if (processedElements.has(element)) {
          return;
        }

        // Skip if parent is already processed (avoid duplicates)
        if (
          $el
            .parents()
            .toArray()
            .some((parent: any) => processedElements.has(parent))
        ) {
          return;
        }

        const text = $el.text().trim();

        // Skip code blocks but be much more lenient with everything else
        if (
          text.length > 5 &&
          !this.isCodeBlock($el) &&
          !this.isObviousUIText(text)
        ) {
          textElements.push(text);
          processedElements.add(element);
        }
      });

    // Join and clean up the extracted text
    return this.cleanupText(textElements.join('\n'));
  }

  private isCodeBlock($element: any): boolean {
    // Method 1: Check HTML tags
    const tagName = $element.prop('tagName')?.toLowerCase();
    if (tagName === 'pre' || tagName === 'code') return true;

    // Method 2: Check CSS classes for code indicators
    const classes = $element.attr('class') || '';
    const codeClassPatterns = [
      'language-',
      'lang-',
      'highlight',
      'hljs',
      'code',
      'codehilite',
      'sourceCode',
      'prism',
      'syntax',
      'brush:',
      'crayon-',
      'EnlighterJS',
      'copy',
      'clipboard',
      'code-block',
      'shiki', // Mintlify uses Shiki for syntax highlighting
      'codeblock',
    ];
    if (codeClassPatterns.some((pattern) => classes.includes(pattern)))
      return true;

    // Method 3: Check if inside pre/code elements or Mintlify code blocks
    if (
      $element.parents(
        'pre, code, .highlight, .code, .language-, .code-block, .shiki',
      ).length > 0
    )
      return true;

    // Method 4: Check data attributes
    const dataLang =
      $element.attr('data-lang') || $element.attr('data-language');
    if (dataLang) return true;

    // Method 5: Check if it's a copy button or code-related UI
    const testId = $element.attr('data-testid');
    if (testId && testId.includes('copy')) return true;

    return false;
  }

  private isObviousUIText(text: string): boolean {
    // Only filter out very obvious UI/navigation text - be much more permissive
    const uiPatterns = [
      /^Search\.\.\./i,
      /^⌘K$/i,
      /^Copy$/i,
      /^Copy page$/i,
      /^Log In$/i,
      /^Get started$/i,
      /^bash$/i,
      /^typescript$/i,
      /^\.env$/i,
      /^Powered by Mintlify$/i,
      /^home page$/i,
      /^Inworld AI Documentation$/i,
      /^On this page$/i,
      /^Table of contents$/i,
      /^Skip to/i,
    ];

    // Only skip if it's very clearly UI text (exact matches mostly)
    return uiPatterns.some((pattern) => pattern.test(text.trim()));
  }

  private cleanupText(text: string): string {
    return (
      text
        // Remove large code blocks (they flood knowledge with code)
        .replace(/```[\s\S]*?```/g, '[CODE_BLOCK_REMOVED]')
        // Keep short inline code - it's often important API names
        // .replace(/`[^`\n]+`/g, '')  // Keep inline code like `NodeFactory`
        // Fix spacing issues
        .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
        .replace(/([.!?])([A-Z])/g, '$1 $2')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim()
      // Don't truncate - let knowledge manager handle chunking!
    );
  }

  private async crawlLinks(
    baseUrl: string,
    maxPages: number = SCRAPER_MAX_PAGES,
    onProgress?: (current: number, total: number, title: string) => void,
  ): Promise<ScrapedPage[]> {
    const pages: ScrapedPage[] = [];
    const toCrawl = [baseUrl];

    while (toCrawl.length > 0 && pages.length < maxPages) {
      // Take a batch of URLs to process concurrently
      const batch = toCrawl.splice(0, this.CONCURRENT_LIMIT);
      const remainingSlots = maxPages - pages.length;
      const urlsToProcess = batch.slice(0, remainingSlots);

      // Mark URLs as visited before processing to avoid duplicates
      urlsToProcess.forEach((url) => this.visitedUrls.add(url));

      // Process batch concurrently
      const results = await Promise.allSettled(
        urlsToProcess.map((url) => this.fetchPageWithLinks(url)),
      );

      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { page, links } = result.value;

          if (page) {
            pages.push(page);
            if (process.env.DEBUG) {
              console.log(
                `Scraped [${pages.length}/${maxPages}]: ${page.title}`,
              );
            }
            onProgress?.(pages.length, maxPages, page.title);
          }

          // Add new links to crawl queue (avoid duplicates)
          for (const link of links) {
            if (!this.visitedUrls.has(link) && !toCrawl.includes(link)) {
              toCrawl.push(link);
            }
          }
        }
      }
    }

    return pages;
  }

  public async scrapeDocumentation(
    url: string,
    onProgress?: (current: number, total: number, title: string) => void,
  ): Promise<ScrapedPage[]> {
    this.visitedUrls.clear();

    if (process.env.DEBUG) {
      console.log(`Starting to scrape documentation from: ${url}`);
    }

    // Simple crawling approach
    const pages = await this.crawlLinks(url, SCRAPER_MAX_PAGES, onProgress);

    if (process.env.DEBUG) {
      console.log(
        `\n Scraping complete! Successfully scraped ${pages.length} pages`,
      );
    }
    return pages;
  }
}
