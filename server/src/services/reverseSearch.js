const axios = require('axios');

const TINEYE_API_URL = 'https://api.tineye.com/rest/search/';
const TINEYE_API_KEY = process.env.TINEYE_API_KEY;
const GOOGLE_VISION_CREDENTIALS_PATH = process.env.GOOGLE_VISION_CREDENTIALS_PATH;

/**
 * Search TinEye for visually similar images on the web.
 * @param {string} imageUrl - Public URL of the image to search
 * @returns {Promise<Array<{url: string, domain: string, score: number, crawlDate: string}>>}
 */
async function searchTinEye(imageUrl) {
  if (!TINEYE_API_KEY) {
    console.warn('[ReverseSearch] TinEye API key not configured');
    return [];
  }

  try {
    const response = await axios.get(TINEYE_API_URL, {
      params: {
        image_url: imageUrl,
        limit: 50,
        sort: 'score',
        order: 'desc',
      },
      headers: {
        'x-api-key': TINEYE_API_KEY,
      },
      timeout: 30000,
    });

    const results = response.data?.results?.matches || [];
    return results.map(match => ({
      url: match.backlinks?.[0]?.url || match.image_url,
      domain: match.domain,
      score: match.score,
      crawlDate: match.crawl_date,
      imageUrl: match.image_url,
      width: match.width,
      height: match.height,
      externalId: `tineye:${match.image_url}`,
    }));
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[ReverseSearch] TinEye rate limit exceeded');
    } else {
      console.error('[ReverseSearch] TinEye search failed:', err.message);
    }
    return [];
  }
}

/**
 * Search Google Cloud Vision Web Detection for matching images.
 * @param {Buffer} imageBuffer - Image file buffer
 * @returns {Promise<Array<{url: string, domain: string, score: number, pageUrl: string}>>}
 */
async function searchGoogleVision(imageBuffer) {
  if (!GOOGLE_VISION_CREDENTIALS_PATH) {
    console.warn('[ReverseSearch] Google Vision credentials not configured');
    return [];
  }

  try {
    const { ImageAnnotatorClient } = require('@google-cloud/vision');
    const client = new ImageAnnotatorClient({
      keyFilename: GOOGLE_VISION_CREDENTIALS_PATH,
    });

    const [result] = await client.webDetection({
      image: { content: imageBuffer.toString('base64') },
    });

    const webDetection = result.webDetection;
    if (!webDetection) return [];

    const matches = [];

    // Full matches — exact image found on these pages
    if (webDetection.fullMatchingImages) {
      for (const img of webDetection.fullMatchingImages) {
        matches.push({
          url: img.url,
          domain: new URL(img.url).hostname,
          score: 0.95,
          matchLevel: 'full',
          externalId: `gvision:full:${img.url}`,
        });
      }
    }

    // Partial matches — cropped or modified versions
    if (webDetection.partialMatchingImages) {
      for (const img of webDetection.partialMatchingImages) {
        matches.push({
          url: img.url,
          domain: new URL(img.url).hostname,
          score: 0.75,
          matchLevel: 'partial',
          externalId: `gvision:partial:${img.url}`,
        });
      }
    }

    // Pages with matching images
    if (webDetection.pagesWithMatchingImages) {
      for (const page of webDetection.pagesWithMatchingImages) {
        if (!matches.some(m => m.url === page.url)) {
          matches.push({
            url: page.url,
            domain: new URL(page.url).hostname,
            score: 0.70,
            matchLevel: 'page',
            pageTitle: page.pageTitle,
            externalId: `gvision:page:${page.url}`,
          });
        }
      }
    }

    return matches;
  } catch (err) {
    console.error('[ReverseSearch] Google Vision search failed:', err.message);
    return [];
  }
}

/**
 * Orchestrate external reverse image searches across multiple engines.
 * Deduplicates results by URL domain.
 * @param {Object} stamp - Stamp record with originalFileUrl
 * @param {Buffer|null} imageBuffer - Optional image buffer for Google Vision
 * @returns {Promise<Array>} Combined, deduplicated results
 */
async function performExternalScan(stamp, imageBuffer = null) {
  const searches = [];

  // TinEye uses URL-based search
  if (stamp.originalFileUrl && TINEYE_API_KEY) {
    searches.push(
      searchTinEye(stamp.originalFileUrl).then(results =>
        results.map(r => ({ ...r, engine: 'tineye' }))
      )
    );
  }

  // Google Vision uses image buffer
  if (imageBuffer && GOOGLE_VISION_CREDENTIALS_PATH) {
    searches.push(
      searchGoogleVision(imageBuffer).then(results =>
        results.map(r => ({ ...r, engine: 'google_vision' }))
      )
    );
  }

  if (searches.length === 0) {
    return [];
  }

  const allResults = (await Promise.allSettled(searches))
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // Deduplicate by externalId
  const seen = new Set();
  const deduped = [];
  for (const result of allResults) {
    if (!seen.has(result.externalId)) {
      seen.add(result.externalId);
      deduped.push(result);
    }
  }

  // Filter out ProofStamp's own domains
  const ownDomains = ['proofstamp.io', 'localhost', 'cloudinary.com', 'res.cloudinary.com'];
  const filtered = deduped.filter(r =>
    !ownDomains.some(d => r.domain?.includes(d))
  );

  // Sort by score descending
  filtered.sort((a, b) => (b.score || 0) - (a.score || 0));

  return filtered;
}

module.exports = {
  searchTinEye,
  searchGoogleVision,
  performExternalScan,
};
