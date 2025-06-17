// api/get-movie-links.js
import fetch from 'node-fetch';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';

// ✅ Toggle your friend's access ON/OFF
const isFriendEnabled = false;

function cleanTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupSubtitles(subtitles = []) {
  const grouped = {};
  const seen = new Set();

  subtitles.forEach((sub) => {
    const lang = sub.language || 'Unknown';
    const key = `${lang}-${sub.subtitleName}-${sub.url}`;

    if (seen.has(key)) return;
    seen.add(key);

    if (!grouped[lang]) grouped[lang] = [];

    grouped[lang].push({
      name: sub.subtitleName,
      url: sub.url
    });
  });

  return grouped;
}

export default async function handler(req, res) {
  let { tmdbId, header } = req.query;

  if (!tmdbId) {
    return res.status(400).json({
      success: false,
      message: '"tmdbId" parameter is required'
    });
  }

  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  // ❌ Block 02movie requests if switch is OFF
  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({
      success: false,
      heading,
      message: 'Access denied: 02movie is currently disabled'
    });
  }

  // 📺 TV Show
  const isTvShow = tmdbId.includes('/');
  if (isTvShow) {
    const [tvId, season, episode] = tmdbId.split('/');

    try {
      const tvResp = await fetch(`https://sonix-movies-v4-delta.vercel.app/cosmic/${tvId}/${season}/${episode}`);
      const tvData = await tvResp.json();

      return res.status(200).json(tvData);
    } catch (err) {
      console.error('TV Fetch Error:', err);
      return res.status(500).json({
        success: false,
        heading,
        message: 'TV episode fetch failed',
        error: err.message
      });
    }
  }

  // 🎬 Movie logic
  try {
    const tmdbResp = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const tmdbData = await tmdbResp.json();
    const imdbId = tmdbData.imdb_id;
    const originalTitle = tmdbData.title;

    if (!imdbId) {
      return res.status(404).json({ success: false, heading, message: 'IMDb ID not found in TMDb data' });
    }

    const cleanedTitle = cleanTitle(originalTitle);

    const sonixResp = await fetch(`https://sonix-movies-v1.vercel.app/api/search?query=${encodeURIComponent(cleanedTitle)}`);
    const sonixData = await sonixResp.json();
    const movies = sonixData?.results?.data || [];

    const matchedMovie = movies.find((m) => m.id === imdbId);
    if (!matchedMovie) {
      return res.status(404).json({ success: false, heading, message: 'No matching movie found on Sonix API' });
    }

    const infoResp = await fetch(`https://clipsave-movies-api.onrender.com/v1/movies/info?link=${encodeURIComponent(matchedMovie.link)}&id=${imdbId}`);
    const infoData = await infoResp.json();

    if (!infoData.success || !infoData.data) {
      return res.status(404).json({ success: false, heading, message: 'Movie info not found on Clipsave API' });
    }

    const { qualities = [], subtitles = [] } = infoData.data;

    const cleanQualities = await Promise.all(
      qualities.map(async (quality) => {
        const dlResp = await fetch(`https://clipsave-movies-api.onrender.com/v1/movies/download-links?link=${encodeURIComponent(quality.link)}`);
        const dlData = await dlResp.json();

        return {
          quality: quality.quality,
          name: quality.name,
          size: quality.size,
          links: {
            first: dlData?.data?.[0]?.downloadLink || null,
            second: dlData?.data?.[1]?.downloadLink || null,
            third: dlData?.data?.[2]?.downloadLink || null
          }
        };
      })
    );

    return res.status(200).json({
      heading,
      success: true,
      title: originalTitle,
      qualities: cleanQualities,
      subtitles: groupSubtitles(subtitles)
    });

  } catch (err) {
    console.error('Movie Fetch Error:', err);
    return res.status(500).json({
      success: false,
      heading,
      message: 'Server error',
      error: err.message
    });
  }
}
