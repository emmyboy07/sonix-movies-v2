import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';

function cleanTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

app.get('/search', async (req, res) => {
  const { tmdbId } = req.query;
  if (!tmdbId) {
    return res.status(400).json({ success: false, message: '"tmdbId" parameter is required' });
  }

  try {
    // 1. Fetch TMDb data
    const tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const tmdbResp = await fetch(tmdbUrl);
    if (!tmdbResp.ok) {
      return res.status(500).json({ success: false, message: 'Failed to fetch TMDb data' });
    }
    const tmdbData = await tmdbResp.json();

    const imdbId = tmdbData.imdb_id;
    const originalTitle = tmdbData.title;
    if (!imdbId) {
      return res.status(404).json({ success: false, message: 'IMDb ID not found in TMDb data' });
    }

    // 2. Clean title for searching Sonix API
    const cleanedTitle = cleanTitle(originalTitle);

    // 3. Search Sonix API for movies
    const sonixUrl = `https://sonix-movies-v1.vercel.app/api/search?query=${encodeURIComponent(cleanedTitle)}`;
    const sonixResp = await fetch(sonixUrl);
    if (!sonixResp.ok) {
      return res.status(500).json({ success: false, message: 'Failed to fetch Sonix API data' });
    }
    const sonixData = await sonixResp.json();
    const movies = sonixData?.results?.data || [];

    // 4. Find movie matching IMDb ID
    const matchedMovie = movies.find((m) => m.id === imdbId);
    if (!matchedMovie) {
      return res.status(404).json({ success: false, message: 'No matching movie found on Sonix API' });
    }

    // 5. Fetch detailed movie info from Clipsave
    const infoUrl = `https://clipsave-movies-api.onrender.com/v1/movies/info?link=${encodeURIComponent(matchedMovie.link)}&id=${imdbId}`;
    const infoResp = await fetch(infoUrl);
    if (!infoResp.ok) {
      return res.status(500).json({ success: false, message: 'Failed to fetch detailed movie info' });
    }
    const infoData = await infoResp.json();
    if (!infoData.success || !infoData.data) {
      return res.status(404).json({ success: false, message: 'Detailed movie info not found or unsuccessful' });
    }

    // 6. Extract and clean qualities with download links
    const qualities = infoData.data.qualities || [];
    const cleanQualities = await Promise.all(
      qualities.map(async (quality) => {
        try {
          const dlLinkUrl = `https://clipsave-movies-api.onrender.com/v1/movies/download-links?link=${encodeURIComponent(quality.link)}`;
          const dlResp = await fetch(dlLinkUrl);
          if (!dlResp.ok) throw new Error('Download link API failed');
          const dlData = await dlResp.json();
          const firstDownloadLink = dlData?.data?.[0]?.downloadLink || null;

          return {
            quality: quality.quality,
            name: quality.name,
            size: quality.size,
            downloadLink: firstDownloadLink
          };
        } catch {
          return {
            quality: quality.quality,
            name: quality.name,
            size: quality.size,
            downloadLink: null
          };
        }
      })
    );

    // 7. Return clean response with heading
    return res.json({
      heading: 'SONiX MOVIES LTD',
      success: true,
      qualities: cleanQualities
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
