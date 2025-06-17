// /pages/api/get-movie-links/[[...params]].js
import fetch from 'node-fetch';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';
const isFriendEnabled = false;

function cleanTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  const { params = [] } = req.query;
  const [tmdbId, season, episode] = params;
  const header = req.headers['header'] || req.query.header || '';
  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  if (!tmdbId) {
    return res.status(400).json({ success: false, message: '"tmdbId" is required in the path' });
  }

  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({ success: false, heading, message: 'Access denied: 02movie is currently disabled' });
  }

  try {
    // Fetch basic TMDb data
    const tmdbResp = await fetch(`https://api.themoviedb.org/3/find/${tmdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
    const tmdbShowResp = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const tmdbMovieResp = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);

    const isTV = tmdbShowResp.status === 200;
    const isMovie = tmdbMovieResp.status === 200;

    // 🟦 Handle TV Show
    if (isTV && season && episode) {
      const tvUrl = `https://sonix-movies-v4-delta.vercel.app/cosmic/${tmdbId}/${season}/${episode}`;
      const tvRes = await fetch(tvUrl);
      const tvData = await tvRes.json();

      return res.status(200).json({
        heading,
        success: true,
        type: 'tv',
        data: tvData
      });
    }

    // 🟥 Handle Movie
    if (isMovie) {
      const tmdbData = await tmdbMovieResp.json();
      const imdbId = tmdbData.imdb_id;
      const originalTitle = tmdbData.title;

      if (!imdbId) {
        return res.status(404).json({ success: false, heading, message: 'IMDb ID not found in TMDb movie data' });
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
        type: 'movie',
        qualities: cleanQualities
      });
    }

    return res.status(404).json({
      success: false,
      heading,
      message: 'TMDb ID not recognized as a movie or TV show, or missing season/episode'
    });

  } catch (err) {
    console.error('Handler Error:', err);
    return res.status(500).json({ success: false, heading, message: 'Server error', error: err.message });
  }
}
