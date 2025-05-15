require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = 5000;

app.use(cors());

// Simple in-memory cache for lyrics by URL
const lyricsCache = new Map();

// Helper function to decode HTML entities
function decodeHtmlEntities(text) {
  return text.replace(/&#(\\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  }).replace(/"/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'");
}

// Endpoint to fetch lyrics page HTML and extract lyrics using cheerio with caching
app.get('/lyrics', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  if (lyricsCache.has(url)) {
    return res.json({ lyrics: lyricsCache.get(url) });
  }

  try {
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    let lyricsText = "";

    // Try to extract lyrics from data-lyrics-container divs
    $('div[data-lyrics-container="true"]').each((i, elem) => {
      const text = $(elem).text();
      lyricsText += text + '\\n';
    });

    // If no lyrics found, try div.lyrics
    if (lyricsText.trim() === "") {
      const lyricsDiv = $('div.lyrics').text();
      if (lyricsDiv) {
        lyricsText = lyricsDiv.trim();
      }
    }

    // If still no lyrics, try div.Lyrics__Container
    if (lyricsText.trim() === "") {
      $('div.Lyrics__Container').each((i, elem) => {
        const text = $(elem).text();
        lyricsText += text + '\\n';
      });
    }

    if (lyricsText.trim() === "") {
      return res.status(404).json({ error: 'Lyrics not found on the page' });
    }

    const decodedLyrics = decodeHtmlEntities(lyricsText.trim());
    lyricsCache.set(url, decodedLyrics);

    res.json({ lyrics: decodedLyrics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lyrics page' });
  }
});

// New /api/search endpoint integrated from api/search.js
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Missing query parameter 'q'" });
  }

  const GENIUS_API_KEY = process.env.GENIUS_API_KEY;
  if (!GENIUS_API_KEY) {
    console.error("Missing Genius API key in environment variables");
    return res.status(500).json({ error: "Missing Genius API key" });
  }

  try {
    const response = await axios.get("https://api.genius.com/search", {
      params: { q },
      headers: {
        Authorization: `Bearer ${GENIUS_API_KEY}`,
      },
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching search results:", {
      message: error.message,
      responseStatus: error.response ? error.response.status : null,
      responseData: error.response ? error.response.data : null,
      stack: error.stack,
    });
    if (error.response) {
      console.error("Full error response data:", error.response.data);
    }
    res.status(500).json({
      error: "Error fetching search results",
      details: error.response ? error.response.data : error.message,
    });
  }
});

// New /image-proxy endpoint to proxy external image requests and avoid CORS issues
app.get('/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await axios.get(url, { responseType: 'stream' });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.data.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
