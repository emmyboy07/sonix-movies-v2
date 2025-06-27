import express from 'express';
import fetch from 'node-fetch';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';
const isFriendEnabled = true;

function cleanTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 🎬 MOVIE + TV DOWNLOAD ROUTE
app.get('/get-movie-links', async (req, res) => {
  const { tmdbId, header } = req.query;
  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  if (!tmdbId) {
    return res.status(400).json({ success: false, heading, message: '"tmdbId" parameter is required' });
  }

  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({ success: false, heading, message: 'Access denied: 02movie is currently disabled' });
  }

  // 📺 TV Show Handler
  if (tmdbId.includes('/')) {
    const [tvId, season, episode] = tmdbId.split('/');
    try {
      const tvRes = await fetch(`https://sonix-movies-v4-delta.vercel.app/cosmic/${tvId}/${season}/${episode}`);
      const tvData = await tvRes.json();

      return res.status(200).json({
        heading,
        success: true,
        title: tvData.title,
        name: tvData.name,
        streams: tvData.streams || [],
      });
    } catch (err) {
      return res.status(500).json({ success: false, heading, message: 'TV fetch failed', error: err.message });
    }
  }

  // 🎬 Movie Handler
  try {
    const tmdbResp = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const tmdbData = await tmdbResp.json();
    const imdbId = tmdbData.imdb_id;
    const title = tmdbData.title;

    if (!imdbId || !title) {
      return res.status(404).json({ success: false, heading, message: 'Movie not found on TMDb' });
    }

    const cleanedTitle = cleanTitle(title);
    const searchRes = await fetch(`https://sonix-movies-v1.vercel.app/api/search?query=${encodeURIComponent(cleanedTitle)}`);
    const searchData = await searchRes.json();
    const matched = searchData?.results?.data?.find((m) => m.id === imdbId);

    if (!matched) throw new Error('No match on Sonix');

    const infoRes = await fetch(`https://clipsave-movies-api.onrender.com/v1/movies/info?link=${encodeURIComponent(matched.link)}&id=${imdbId}`);
    const infoData = await infoRes.json();

    if (!infoData.success || !infoData.data) throw new Error('No info on Clipsave');

    const qualities = infoData.data.qualities || [];
    const cleanQualities = await Promise.all(
      qualities.map(async (q) => {
        const dlRes = await fetch(`https://clipsave-movies-api.onrender.com/v1/movies/download-links?link=${encodeURIComponent(q.link)}`);
        const dlData = await dlRes.json();
        return {
          quality: q.quality,
          name: q.name,
          size: q.size,
          links: {
            first: dlData?.data?.[0]?.downloadLink || null,
            second: dlData?.data?.[1]?.downloadLink || null,
            third: dlData?.data?.[2]?.downloadLink || null,
          },
        };
      })
    );

    return res.status(200).json({ heading, success: true, qualities: cleanQualities });
  } catch (err) {
    try {
      const fallbackRes = await fetch(`https://sonix-movies-v4-delta.vercel.app/cosmic/${tmdbId}`);
      const fallbackData = await fallbackRes.json();

      if (!fallbackData || !fallbackData.streams?.length) {
        throw new Error('Cosmic fallback failed');
      }

      return res.status(200).json({
        heading,
        success: true,
        name: fallbackData.name,
        title: fallbackData.title || 'Untitled',
        size: fallbackData.size || null,
        streams: fallbackData.streams,
      });
    } catch (fallbackErr) {
      return res.status(500).json({ success: false, heading, message: 'All sources failed', error: fallbackErr.message });
    }
  }
});

// 🎥 /watch route for video playback
app.get('/watch', async (req, res) => {
  const { type, id } = req.query;
  let title = 'Untitled';
  let imdbId = null;

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
      return res.status(404).json({ error: 'No HLS (m3u8) source found.' });
    }

    if (type === 'movie') {
      const tmdbRes = await axios.get(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US`);
      imdbId = tmdbRes.data.imdb_id;
      title = tmdbRes.data.title || 'Untitled';
    } else if (type === 'tv') {
      const parts = id.split('/');
      const seriesId = parts[0];
      let seasonNumber, episodeNumber;

      if (parts.length === 3) {
        [, seasonNumber, episodeNumber] = parts;
      }

      const externalRes = await axios.get(`https://api.themoviedb.org/3/tv/${seriesId}/external_ids?api_key=${TMDB_API_KEY}`);
      imdbId = externalRes.data.imdb_id;

      if (seasonNumber && episodeNumber) {
        const epRes = await axios.get(`https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${TMDB_API_KEY}&language=en-US`);
        const showRes = await axios.get(`https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=en-US`);
        title = `${showRes.data.name || 'Series'} - S${seasonNumber}E${episodeNumber}: ${epRes.data.name || 'Episode'}`;
      } else {
        const showRes = await axios.get(`https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}&language=en-US`);
        title = showRes.data.name || 'Untitled';
      }
    }

    res.json({
      videoUrl,
      videoSources,
      title,
      imdbId,
      tmdbId: id,
    });

    console.log(`🎬 Playing: ${title}`);
    console.log(`🔗 Video URL: ${videoUrl}`);

  } catch (err) {
    console.error(`[WATCH] Error:`, err.message);
    res.status(500).send('Failed to fetch HLS video source.');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

export default app; // ✅ for Vercel compatibility
