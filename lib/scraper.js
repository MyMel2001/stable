const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
require("dotenv").config();

const turndownService = new TurndownService();
const AXIOS_CONFIG = { timeout: 10000 };

const LIBREY_INSTANCE = process.env.LIBREY_INSTANCE || "https://search.sparksammy.com";

async function searchDuckDuckGo(query) {
  try {
    // DDG Instant Answer API
    const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, AXIOS_CONFIG);
    if (response?.data?.AbstractText) {
      return String(response.data.AbstractText);
    }
    return null;
  } catch (err) {
    console.error("DDG Search Error:", err.message);
    return null;
  }
}

async function searchSparksammy(query) {
  try {
    const url = `${LIBREY_INSTANCE}/search.php?q=${encodeURIComponent(query)}&p=0&t=0`;
    const response = await axios.get(url, AXIOS_CONFIG);
    if (!response?.data) return [];

    const $ = cheerio.load(response.data);
    const results = [];

    $('.text-result-wrapper').each((i, el) => {
      if (i >= 5) return false;
      const h2 = $(el).find('h2');
      const a = h2.find('a');
      const span = $(el).find('span');

      const title = a.text().trim();
      const link = a.attr('href');
      const snippet = span.text().trim();

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    return results;
  } catch (err) {
    console.error("LibreY Search Error:", err.message);
    return [];
  }
}

async function fetchWikipedia(query) {
  try {
    const response = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, AXIOS_CONFIG);
    if (response?.data?.extract) {
      return String(response.data.extract);
    }
    return null;
  } catch (err) {
    // Try search if summary fails
    try {
      const searchRes = await axios.get(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`, AXIOS_CONFIG);
      if (searchRes?.data && Array.isArray(searchRes.data[1]) && searchRes.data[1][0]) {
        return await fetchWikipedia(searchRes.data[1][0]);
      }
    } catch (innerErr) {
      return null;
    }
    return null;
  }
}

async function scrapeUrl(url) {
  try {
    const response = await axios.get(url, {
      ...AXIOS_CONFIG,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });

    if (!response?.data) return null;

    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content) {
      // Fallback to basic cheerio scraping if readability fails
      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, header').remove();
      const html = $('body').html();
      if (!html) return null;
      const markdown = turndownService.turndown(html);
      return markdown.substring(0, 10000);
    }

    const markdown = turndownService.turndown(article.content);
    return `Title: ${article.title}\n\n${markdown}`.substring(0, 15000);
  } catch (err) {
    console.error("Scrape Error:", err.message);
    return null;
  }
}

module.exports = {
  searchDuckDuckGo,
  searchSparksammy,
  fetchWikipedia,
  scrapeUrl
};
