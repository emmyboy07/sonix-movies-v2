import axios from 'axios';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';
const isFriendEnabled = false;  // <-- Your friend access toggle

// Normalize title: lowercase, alphanumerics only
function cleanTitle(title) {
  return title
    .replace(/[\u2018\u2019]/g, "'")  // smart quotes to normal
    .replace(/[^a-zA-Z0-9]/g, '')    // remove special characters
    .toLowerCase()
    .trim();
}

// Get patterns like s01, season 1 etc.
function getSeasonPatterns(season) {
  const n = parseInt(season);
  const padded = n.toString().padStart(2, '0');
  return [
    `s${n}`,
    `s${padded}`,
    `season ${n}`,
    `season${padded}`,
    `s${n}e`,
    `s${padded}e`
  ];
}

// Convert downloadwella.com links to direct links
function convertToDirectWellaLink(downloadUrl) {
  if (!downloadUrl.startsWith('https://downloadwella.com')) return downloadUrl;

  const trimmed = downloadUrl.replace(/\.html$/, '');
  const relativePath = trimmed.replace('https://downloadwella.com/', '');
  
  const parts = relativePath.split('/');
  const fileName = parts[parts.length - 1];

  return `https://dweds6.downloadwella.com/d/tmwtyctdbwatc4c5exyqkxxjrnsiay4daby2mhk635oae5gcerqzv3uc7bhkzyqptxewhjt3/${fileName}`;
}

export default async function handler(req, res) {
  // Friend access control
  const { header } = req.query;
  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({
      success: false,
      heading,
      message: 'Access denied: 02movie is currently disabled'
    });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, season, episode } = req.query;

  if (!id || !season || !episode) {
    return res.status(400).json({ error: 'Missing TMDb id, season, or episode' });
  }

  try {
    // rest of your code unchanged...
    const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}`);
    const tmdbTitle = tmdbRes.data?.name || '';
    const normalizedTmdbTitle = cleanTitle(tmdbTitle);
    const seasonPatterns = getSeasonPatterns(season);
    const paddedSeason = parseInt(season).toString().padStart(2, '0');
    const searchTitle = `${tmdbTitle} S${paddedSeason}`;

    console.log(`🔍 TMDb title: ${tmdbTitle}`);
    console.log(`🔍 Searching Clipsave with title: "${searchTitle}"`);

    const searchUrl = `https://clipsave-movies-api.onrender.com/v1/series/search?query=${encodeURIComponent(searchTitle)}`;
    const clipsaveRes = await axios.get(searchUrl);
    const results = clipsaveRes.data?.data?.movies || [];

    console.log(`📺 Found ${results.length} results from ClipSave`);

    const looseMatches = results.filter(movie => {
      const cleaned = cleanTitle(movie.title);
      return cleaned.startsWith(normalizedTmdbTitle);
    });

    console.log(`🔍 Loose matches: ${looseMatches.length}`);

    const bestMatch = looseMatches.find(movie => {
      const rawTitle = movie.title.toLowerCase();
      return seasonPatterns.some(pattern => rawTitle.includes(pattern));
    });

    if (!bestMatch) {
      console.log(`❌ No best match found`);
      return res.status(404).json({
        tmdb_id: id,
        tmdb_title: tmdbTitle,
        search_query: searchTitle,
        error: 'No title starting with TMDb name and matching season found'
      });
    }

    console.log(`✅ Best Match: ${bestMatch.title}`);

    const detailUrl = `https://clipsave-movies-api.onrender.com/v1/series/details?link=${encodeURIComponent(bestMatch.link)}`;
    const detailRes = await axios.get(detailUrl);
    const episodes = detailRes.data?.data?.downloadDetails || [];

    console.log(`🎬 Found ${episodes.length} episodes in ${bestMatch.title}`);

    const episodeLabel = `episode ${parseInt(episode)}`;
    const foundEpisode = episodes.find(ep => ep.name.toLowerCase() === episodeLabel);

    if (!foundEpisode) {
      console.log(`❌ Episode "${episodeLabel}" not found`);
      return res.status(404).json({
        tmdb_id: id,
        tmdb_title: tmdbTitle,
        matched_title: bestMatch.title,
        season,
        episode,
        error: `Episode ${episode} not found`
      });
    }

    const finalDownload = convertToDirectWellaLink(foundEpisode.link);
    console.log(`📥 Found episode: ${foundEpisode.name}`);
    console.log(`🔗 Final Download: ${finalDownload}`);

    return res.json({
      tmdb_id: id,
      tmdb_title: tmdbTitle,
      matched_title: bestMatch.title,
      season,
      episode: foundEpisode.name,
      size: detailRes.data?.data?.size || 'N/A',
      quality: "480p",
      download: finalDownload
    });

  } catch (err) {
    console.error('❌ Error:', err.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
