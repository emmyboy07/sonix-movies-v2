import fetch from 'node-fetch';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';

function cleanTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function handler(req, res) {
  const { tmdbId } = req.query;
  if (!tmdbId) {
    return res.status(400).json({ success: false, message: '"tmdbId" parameter is required' });
  }

  try {
    // 1. Fetch TMDb data
    const tmdbResp = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const tmdbData = await tmdbResp.json();
    const imdbId = tmdbData.imdb_id;
    const originalTitle = tmdbData.title;
    if (!imdbId) return res.status(404).json({ success: false, message: 'IMDb ID not found' });

    // 2. Clean title
    const cleanedTitle = cleanTitle(originalTitle);
    const sonixResp = await fetch(`https://sonix-movies-v1.vercel.app/api/search?query=${encodeURIComponent(cleanedTitle)}`);
    const sonixData = await sonixResp.json();
    const movies = sonixData?.results?.data || [];
    const matchedMovie = movies.find((m) => m.id === imdbId);
    if (!matchedMovie) return res.status(404).json({ success: false, message: 'No matching movie found on Sonix API' });

    // 3. Get detailed info from Clipsave
    const infoResp = await fetch(`https://clipsave-movies-api.onrender.com/v1/movies/info?link=${encodeURIComponent(matchedMovie.link)}&id=${imdbId}`);
    const infoData = await infoResp.json();
    if (!infoData.success || !infoData.data) {
      return res.status(404).json({ success: false, message: 'Movie info not found' });
    }

    // 4. Get 3rd download link per quality (fallback to 2nd)
    const qualities = infoData.data.qualities || [];
    const cleanQualities = await Promise.all(
      qualities.map(async (quality) => {
        const dlResp = await fetch(`https://clipsave-movies-api.onrender.com/v1/movies/download-links?link=${encodeURIComponent(quality.link)}`);
        const dlData = await dlResp.json();

        // Use 3rd link, fallback to 2nd
        const thirdOrSecondLink = dlData?.data?.[2]?.downloadLink || dlData?.data?.[1]?.downloadLink || null;

        return {
          quality: quality.quality,
          name: quality.name,
          size: quality.size,
          downloadLink: thirdOrSecondLink
        };
      })
    );

    // Return response
    return res.status(200).json({
      heading: 'SONiX MOVIES LTD',
      success: true,
      qualities: cleanQualities
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}
