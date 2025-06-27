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

    // Fetch video source
    const response = await fetch(passthroughUrl, {
      headers: {
        'x-origin': 'https://tom.autoembed.cc',
        'x-referer': 'https://tom.autoembed.cc'
      }
    });

    if (!response.ok) {
      console.error(`[WATCH] Passthrough fetch failed: ${response.status}`);
      return res.status(502).json({
        success: false,
        heading,
        message: 'Failed to fetch video source (passthrough error).'
      });
    }

    const data = await response.json();
    videoUrl = data.videoSource;

    if (videoUrl && videoUrl.endsWith('.m3u8')) {
      videoSources = [{ url: videoUrl, label: 'Auto', type: 'hls' }];
    } else {
      console.error(`[WATCH] No HLS video source found. Data:`, data);
      return res.status(404).json({
        success: false,
        heading,
        message: 'No HLS (.m3u8) video source found.',
        data
      });
    }

    // 🎬 Handle TMDB metadata
    if (type === 'movie') {
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        imdbId = tmdbData.imdb_id;
        title = tmdbData.title || tmdbData.name || 'Untitled';
      }
    } else if (type === 'tv') {
      const parts = id.split('/');
      const seriesId = parts[0];
      let seasonNumber, episodeNumber;

      if (parts.length === 3) {
        seasonNumber = parts[1];
        episodeNumber = parts[2];
      }

      const externalRes = await fetch(
        `https://api.themoviedb.org/3/tv/${seriesId}/external_ids?api_key=${TMDB_API_KEY}`
      );
      if (externalRes.ok) {
        const externalData = await externalRes.json();
        imdbId = externalData.imdb_id;
      }

      if (seasonNumber && episodeNumber) {
        const epRes = await fetch(
          `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        const showRes = await fetch(
          `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        if (epRes.ok && showRes.ok) {
          const epData = await epRes.json();
          const showData = await showRes.json();
          title = `${showData.name || 'Series'} - S${seasonNumber}E${episodeNumber}: ${epData.name || 'Episode'}`;
        }
      } else {
        const showRes = await fetch(
          `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        if (showRes.ok) {
          const showData = await showRes.json();
          title = showData.name || 'Untitled';
        }
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
