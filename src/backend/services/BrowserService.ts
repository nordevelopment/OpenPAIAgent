/**
 * BrowserService.ts - Puppeteer browser management service
 * Handles headless Chrome actions for PDF rendering and dynamic scraping.
 * Author: Norayr Petrosyan
 */

import puppeteer, { Browser } from 'puppeteer';
import { validateAndResolveUrl } from '../utils/urlValidator.js';

export class BrowserService {
  private browser: Browser | null = null;

  /**
   * Get or launch the headless browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        headless: 'shell',
        args: [
          '--headless',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-local-storage',
          '--disable-file-system'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Close the browser instance if running
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Generate a PDF file from HTML content
   * @param htmlContent HTML content to render
   * @param outputPath Target file path to write the PDF to
   */
  async generatePdf(htmlContent: string, outputPath: string): Promise<void> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' as any });
      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          bottom: '15mm',
          left: '15mm',
          right: '15mm'
        }
      });
    } finally {
      await page.close();
    }
  }

  /**
   * Fetch fully rendered HTML content of a JS-rendered page
   * @param url URL to load
   * @returns Fully rendered HTML string
   */
  async fetchDynamicPage(url: string): Promise<string> {
    // Security: validate URL before navigating
    const validation = await validateAndResolveUrl(url);
    if (!validation.valid) {
      throw new Error(`URL blocked: ${validation.reason}`);
    }

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // Set user agent to simulate a standard desktop Chrome to prevent blocking
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });

      // Navigate to page
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait until body has some meaningful text (>1000 chars) to ensure SPAs are rendered
      await page.waitForFunction(() => {
        const text = document.body ? document.body.innerText.trim() : '';
        return text.length > 1000;
      }, { timeout: 10000 }).catch(() => {
        // Fallback: ignore timeout and proceed
      });

      // Extra short wait for visual stability
      await new Promise(resolve => setTimeout(resolve, 1500));

      const html = await page.content();
      return html;
    } finally {
      await page.close();
    }
  }
}

export const browserService = new BrowserService();
