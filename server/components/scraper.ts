import puppeteer, { Browser, Page } from 'puppeteer';
import { SCRAPER_MAX_PAGES } from '../../constants';

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

export class DocumentationScraper {
  private browser: Browser | null = null;
  private visitedUrls: Set<string> = new Set();

  constructor() {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-images'
        ]
      });
    }
    return this.browser;
  }

  public async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.visitedUrls.clear();
  }

  private cleanupContent(content: string): string {
    if (!content || content.trim().length === 0) {
      return '';
    }

    return content
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async optimizePage(page: Page): Promise<void> {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });
  }


  private async extractContentFromPage(page: Page): Promise<{ title: string; content: string }> {
    await page.waitForSelector('body', { timeout: 10000 });

    const result = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() ||
                   document.querySelector('title')?.textContent?.trim() ||
                   'Untitled';

      // Remove navigation and non-content elements
      const unwantedSelectors = [
        'nav', 'footer', 'header', 'script', 'style',
        '.search', '.nav', '.menu', 'button'
      ];

      unwantedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Get main content area
      const contentArea = document.querySelector('main') || 
                         document.querySelector('article') || 
                         document.querySelector('#content-area') ||
                         document.body;

      // Extract text from meaningful elements
      const meaningfulElements = contentArea.querySelectorAll(
        'h1, h2, h3, h4, h5, h6, p, li'
      );

      const textParts: string[] = [];
      meaningfulElements.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 10) {
          textParts.push(text);
        }
      });

      return {
        title,
        content: textParts.join('\n\n')
      };
    });

    return { 
      title: result.title, 
      content: this.cleanupContent(result.content) 
    };
  }

  public async scrapeSinglePage(url: string): Promise<ScrapedPage | null> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      if (process.env.DEBUG) {
        console.log(`Scraping single page: ${url}`);
      }

      // Optimize page for speed
      await this.optimizePage(page);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2', // Wait until network is mostly idle
        timeout: 15000 
      });
      
      const { title, content } = await this.extractContentFromPage(page);

      if (content.length < 50) {
        if (process.env.DEBUG) {
          console.log(`Skipping ${url} - content too short (${content.length} chars)`);
        }
        return null;
      }
      return { url, title, content };

    } catch (error: any) {
      console.error(`Error scraping single page ${url}:`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  private async extractLinksFromPage(page: Page, baseUrl: string): Promise<string[]> {
    const domain = new URL(baseUrl).hostname;
    
    return await page.evaluate((domain) => {
      const links: string[] = [];
      const linkElements = document.querySelectorAll('a[href]');
      
      linkElements.forEach(element => {
        const href = element.getAttribute('href');
        if (!href) return;

        try {
          let absoluteUrl: string;
          if (href.startsWith('http')) {
            absoluteUrl = href;
          } else if (href.startsWith('/')) {
            absoluteUrl = `https://${domain}${href}`;
          } else if (!href.startsWith('#')) {
            absoluteUrl = new URL(href, window.location.href).toString();
          } else {
            return;
          }

          if (absoluteUrl.includes(domain) && 
              absoluteUrl.includes('/docs/') && 
              !absoluteUrl.includes('#') &&
              !absoluteUrl.includes('?')
          ) {
            links.push(absoluteUrl);
          }
        } catch (e) {
          // Skip invalid URLs
        }
      });
      
      return [...new Set(links)]; // Remove duplicates
    }, domain);
  }

  private async scrapePagesConcurrently(
    urls: string[], 
    maxConcurrency: number = 3,
    onProgress?: (current: number, total: number, title: string) => void
  ): Promise<ScrapedPage[]> {
    const results: ScrapedPage[] = [];
    const browser = await this.getBrowser();
    
    // Process URLs in batches to avoid overwhelming the server
    for (let i = 0; i < urls.length; i += maxConcurrency) {
      const batch = urls.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (url) => {
        if (this.visitedUrls.has(url)) return null;
        this.visitedUrls.add(url);

        const page = await browser.newPage();
        try {
          await this.optimizePage(page);
          
          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 15000 
          });
          
          const { title, content } = await this.extractContentFromPage(page);
          
          if (content.length < 50) {
            if (process.env.DEBUG) {
              console.log(`Skipping ${url} - content too short (${content.length} chars)`);
            }
            return null;
          }
          
          if (process.env.DEBUG) {
            console.log(`Scraped [${results.length + 1}/${SCRAPER_MAX_PAGES}]: ${title}`);
          }
          onProgress?.(results.length + 1, SCRAPER_MAX_PAGES, title);
          
          return { url, title, content };
          
        } catch (error: any) {
          console.error(`Error scraping ${url}:`, error.message);
          return null;
        } finally {
          await page.close();
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Add successful results
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });

      // Stop if we've reached the limit
      if (results.length >= SCRAPER_MAX_PAGES) {
        break;
      }

      // Small delay between batches to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  public async scrapeDocumentation(
    url: string,
    onProgress?: (current: number, total: number, title: string) => void,
  ): Promise<ScrapedPage[]> {
    if (process.env.DEBUG) {
      console.log(`Starting to scrape documentation from: ${url} using Puppeteer`);
    }

    this.visitedUrls.clear();
    
    const browser = await this.getBrowser();
    const allUrls = new Set<string>([url]);
    
    try {
      // First, get links from the initial page
      const initialPage = await browser.newPage();
      await this.optimizePage(initialPage);
      
      await initialPage.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 15000 
      });
      
      const initialLinks = await this.extractLinksFromPage(initialPage, url);
      initialLinks.forEach(link => allUrls.add(link));
      
      await initialPage.close();

      // Convert to array and limit to max pages
      const urlsToScrape = Array.from(allUrls).slice(0, SCRAPER_MAX_PAGES);

      if (process.env.DEBUG) {
        console.log(`Found ${urlsToScrape.length} URLs to scrape`);
      }

      // Scrape all pages concurrently with smart batching
      const pages = await this.scrapePagesConcurrently(
        urlsToScrape, 
        3, // Max 3 concurrent pages
        onProgress
      );

      if (process.env.DEBUG) {
        console.log(`\nScraping complete! Successfully scraped ${pages.length} unique pages`);
      }

      return pages;

    } catch (error: any) {
      console.error('Error during Puppeteer scraping:', error.message);
      throw error;
    }
  }
}
