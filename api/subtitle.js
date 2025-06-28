import axios from 'axios';
import cheerio from 'cheerio';

const BASE_URL = 'https://yifysubtitles.ch';
const TMDB_API_KEY = '1e2d76e7c45818ed61645cb647981e5c';
const isFriendEnabled = true;

const popularLanguages = [
  'English', 'Spanish', 'French', 'Portuguese', 'Arabic',
  'German', 'Hindi', 'Italian', 'Russian', 'Turkish',
  'Indonesian', 'Chinese', 'Japanese', 'Korean',
];

async function getImdbIdFromTmdb(tmdbId) {
  try {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const { data } = await axios.get(url);
    return data.imdb_id;
  } catch (err) {
    console.error('❌ TMDb lookup failed:', err.message);
    return null;
  }
}

async function getSubtitlesFromImdb(imdbId) {
  const movieUrl = `${BASE_URL}/movie-imdb/${imdbId}`;
  const subtitles = [];
  const seenLanguages = new Set();

  try {
    const { data: movieHtml } = await axios.get(movieUrl);
    const $ = cheerio.load(movieHtml);
    const subtitleRows = $('table tbody tr');

    for (let i = 0; i < subtitleRows.length; i++) {
      if (subtitles.length >= 8) break;

      const row = subtitleRows.eq(i);
      const language = row.find('td:nth-child(2)').text().trim();
      const linkRel = row.find('td:nth-child(3) a').attr('href');

      if (!linkRel || seenLanguages.has(language)) continue;
      if (!popularLanguages.includes(language)) continue;

      const detailLink = `${BASE_URL}${linkRel}`;

      try {
        const { data: detailHtml } = await axios.get(detailLink);
        const $detail = cheerio.load(detailHtml);
        const downloadPath = $detail('a[href^="/subtitle/"]').attr('href');
        const downloadLink = downloadPath ? `${BASE_URL}${downloadPath}` : null;

        if (downloadLink) {
          subtitles.push({ language, download: downloadLink });
          seenLanguages.add(language);
        }
      } catch (err) {
        console.error(`❌ Failed detail fetch: ${detailLink}`);
      }
    }

    // Ensure English exists
    if (!seenLanguages.has('English')) {
      const englishRow = subtitleRows.filter((_, el) =>
        $(el).find('td:nth-child(2)').text().trim() === 'English'
      ).first();

      if (englishRow.length) {
        const linkRel = englishRow.find('td:nth-child(3) a').attr('href');
        if (linkRel) {
          const detailLink = `${BASE_URL}${linkRel}`;
          const { data: detailHtml } = await axios.get(detailLink);
          const $detail = cheerio.load(detailHtml);
          const downloadPath = $detail('a[href^="/subtitle/"]').attr('href');
          const downloadLink = downloadPath ? `${BASE_URL}${downloadPath}` : null;

          if (downloadLink) {
            subtitles.unshift({
              language: 'English',
              download: downloadLink,
            });
            seenLanguages.add('English');
          }
        }
      }
    }

    return subtitles.slice(0, 8);
  } catch (err) {
    console.error('❌ Subtitle page fetch error:', err.message);
    return [];
  }
}

// 🔁 Export handler for Vercel
export default async function handler(req, res) {
  const { tmdbId, header } = req.query;
  const heading = header === '02movie' ? '02MOVIE' : 'SONiX MOVIES LTD';

  if (!tmdbId) {
    return res.status(400).json({ success: false, heading, error: 'Invalid or missing TMDb ID' });
  }

  // ❌ Restrict 02movie if disabled
  if (header === '02movie' && !isFriendEnabled) {
    return res.status(403).json({ success: false, heading, message: 'Access denied: 02movie is currently disabled' });
  }

  const imdbId = await getImdbIdFromTmdb(tmdbId);
  if (!imdbId) {
    return res.status(404).json({ success: false, heading, error: 'IMDb ID not found for this TMDb ID' });
  }

  const subtitles = await getSubtitlesFromImdb(imdbId);

  res.status(200).json({
    success: true,
    heading,
    tmdbId,
    imdbId,
    subtitleCount: subtitles.length,
    subtitles,
  });
}
