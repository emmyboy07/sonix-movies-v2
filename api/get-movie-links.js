import fetch from 'node-fetch';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';

// ✅ Toggle your friend's access ON/OFF
const isFriendEnabled = true; // set false to block 02movie

function cleanTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function handler(req, res) {
  const { tmdbId, header } = req.query;

  if (!tmdbId) {
    return res.status(400).json({ success: false, message: '"tmdbId" parameter is required' });
  }

  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  // ❌ Block 02movie requests if switch is OFF
  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({
      success: false,
      heading,
      message: 'Access denied: 02movie is currently disabled',
    });
  }

  // 📺 TV Show Logic
  const isTvShow = tmdbId.includes('/');
  if (isTvShow) {
    const [tvId, season, episode] = tmdbId.split('/');

    try {
      const tvResp = await fetch(`https://sonix-movies-v4-delta.vercel.app/cosmic/${tvId}/${season}/${episode}`);
      const tvData = await tvResp.json();

      const {
        title,
        success,
        name,
        streams = []
      } = tvData;

      return res.status(200).json({
        heading,
        success: true,
        title,
        name,
        streams
      });

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

  // 🎬 Movie Logic
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

    const qualities = infoData.data.qualities || [];

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
      qualities: cleanQualities
    });

  } catch (err) {
    console.error('Movie Fetch Error:', err);
    return res.status(500).json({ success: false, heading, message: 'Server error', error: err.message });
  }
}
