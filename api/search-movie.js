import fetch from 'node-fetch';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c'; // Hardcoded TMDb API key

function cleanTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function handler(req, res) {
  const { tmdbId } = req.query;
  if (!tmdbId) {
    console.error('[ERROR] tmdbId query parameter missing');
    return res.status(400).json({ success: false, message: 'tmdbId query parameter is required' });
  }

  try {
    console.log(`[INFO] Received search request with tmdbId=${tmdbId}`);

    const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    console.log(`[INFO] Fetching TMDb data from: ${tmdbUrl}`);
    const tmdbRes = await fetch(tmdbUrl);
    if (!tmdbRes.ok) {
      throw new Error(`TMDb API error: ${tmdbRes.status} ${tmdbRes.statusText}`);
    }
    const tmdbData = await tmdbRes.json();

    const imdbId = tmdbData.imdb_id;
    const originalTitle = tmdbData.title || '';
    if (!imdbId) {
      throw new Error('IMDb ID not found in TMDb response');
    }
    console.log(`[INFO] TMDb returned IMDb ID: ${imdbId}, Title: "${originalTitle}"`);

    const cleanedTitle = cleanTitle(originalTitle);
    console.log(`[INFO] Cleaned title for search: "${cleanedTitle}"`);

    const sonixSearchUrl = `https://sonix-movies-v1.vercel.app/api/search?query=${encodeURIComponent(cleanedTitle)}`;
    console.log(`[INFO] Searching Sonix API with URL: ${sonixSearchUrl}`);

    const sonixRes = await fetch(sonixSearchUrl);
    if (!sonixRes.ok) {
      throw new Error(`Sonix API error: ${sonixRes.status} ${sonixRes.statusText}`);
    }
    const sonixData = await sonixRes.json();

    console.log('[INFO] Full Sonix API response:', JSON.stringify(sonixData).slice(0, 500) + '...');

    const results = Array.isArray(sonixData.results?.data) ? sonixData.results.data : [];

    console.log(`[INFO] Sonix API returned ${results.length} results`);

    const matchedMovie = results.find(movie => movie.id === imdbId);

    if (matchedMovie) {
      console.log('[INFO] Found matching movie based on IMDb ID');
      return res.status(200).json({ success: true, movie: matchedMovie });
    } else {
      console.warn('[WARN] No matched movie found based on IMDb ID');
      return res.status(404).json({ success: false, message: 'No matched movie found based on IMDb ID', results });
    }
  } catch (error) {
    console.error('[ERROR] Server error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
}
