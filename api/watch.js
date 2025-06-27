import fetch from 'node-fetch';

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';
const isFriendEnabled = true;

export default async function handler(req, res) {
  const { type, id, header } = req.query;
  let title = 'Untitled';
  let imdbId = null;

  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  // 🔒 Restrict 02movie if disabled
  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({
      success: false,
      heading,
      message: 'Access denied: 02movie is currently disabled'
    });
  }

  if (!type || !id) {
    return res.status(400).json({
      success: false,
      heading,
      message: '"type" and "id" parameters are required'
    });
  }

  console.log(`[WATCH] Request: type=${type}, id=${id}`);

  try {
    let videoUrl = null;
    let videoSources = [];

    const encodedId = encodeURIComponent(id);
    const destination = `https://tom.autoembed.cc/api/getVideoSource?type=${type}&id=${encodedId}`;
    const passthroughUrl = `https://pass-through.arlen.icu/?destination=${encodeURIComponent(destination)}`;
    const response = await axios.get(passthroughUrl, {
      headers: {
        'x-origin': 'https://tom.autoembed.cc',
        'x-referer': 'https://tom.autoembed.cc'
      }
    });

    videoUrl = response.data.videoSource;

    if (videoUrl && videoUrl.endsWith('.m3u8')) {
      videoSources = [{ url: videoUrl, label: 'Auto', type: 'hls' }];
    } else {
      return res.status(404).json({
        success: false,
        heading,
        message: 'No HLS (.m3u8) video source found.'
      });
    }

    // 🎬 Handle TMDB metadata
    if (type === 'movie') {
      const tmdbRes = await axios.get(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      imdbId = tmdbRes.data.imdb_id;
      title = tmdbRes.data.title || tmdbRes.data.name || 'Untitled';
    } else if (type === 'tv') {
      const parts = id.split('/');
      const seriesId = parts[0];
      let seasonNumber, episodeNumber;

      if (parts.length === 3) {
        seasonNumber = parts[1];
        episodeNumber = parts[2];
      }

      const externalRes = await axios.get(
        `https://api.themoviedb.org/3/tv/${seriesId}/external_ids?api_key=${TMDB_API_KEY}`
      );
      imdbId = externalRes.data.imdb_id;

      if (seasonNumber && episodeNumber) {
        const epRes = await axios.get(
          `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        const showRes = await axios.get(
          `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        title = `${showRes.data.name || 'Series'} - S${seasonNumber}E${episodeNumber}: ${epRes.data.name || 'Episode'}`;
      } else {
        const showRes = await axios.get(
          `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        title = showRes.data.name || 'Untitled';
      }
    }

    console.log(`🎬 Playing: ${title}`);
    console.log(`🔗 Video URL: ${videoUrl}`);

    return res.status(200).json({
      success: true,
      heading,
      title,
      imdbId,
      tmdbId: id,
      videoUrl,
      videoSources
    });

  } catch (err) {
    console.error(`[WATCH] Error:`, err.message);
    return res.status(500).json({
      success: false,
      heading,
      message: 'Failed to fetch video source.',
      error: err.message
    });
  }
}
