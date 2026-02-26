const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

const turndownService = new TurndownService();
const AXIOS_CONFIG = { timeout: 10000 };

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

    const $ = cheerio.load(response.data);

    // Remove script/style tags
    $('script, style, nav, footer, header').remove();

    const html = $('body').html();
    if (!html) return null;

    const markdown = turndownService.turndown(html);
    return markdown.substring(0, 10000); // Limit to 10k chars
  } catch (err) {
    console.error("Scrape Error:", err.message);
    return null;
  }
}

module.exports = {
  searchDuckDuckGo,
  fetchWikipedia,
  scrapeUrl
};
