// Version control
const SCRIPT_VERSION = "4.5.0";

// Configuration
const CONFIG = {
  buttonClass: 'bluesky-convert-btn',
  processingClass: 'bluesky-convert-processed',
  postSelectors: {
    feedItem: '[data-testid^="feedItem-by-"]',
    postPage: '[data-testid^="postThreadItem-by-"]'
  },
  actionBarSelector: '.css-175oi2r[style*="flex-direction: row; justify-content: space-between;"]'
};

// Utility functions
const util = {
  log: (message) => console.log(`[Bluesky Converter v${SCRIPT_VERSION}]: ${message}`),
  error: (message) => console.error(`[Bluesky Converter v${SCRIPT_VERSION}] ERROR: ${message}`),

  createSVGElement: (d) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.style.color = "rgb(120, 142, 165)";
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", d);
    
    svg.appendChild(path);
    return svg;
  },

  extractHlsUrl: (posterUrl) => {
    const match = posterUrl.match(/\/watch\/([^/]+\/[^/]+)\//);
    if (!match) return null;
    const [, videoPath] = match;
    return `https://video.bsky.app/watch/${videoPath}/360p/video.m3u8`;
  },

  fetchTsSegments: async (hlsUrl) => {
    try {
      const m3u8Response = await fetch(hlsUrl);
      if (!m3u8Response.ok) {
        throw new Error(`Failed to fetch m3u8: ${m3u8Response.status} ${m3u8Response.statusText}`);
      }
      const m3u8Content = await m3u8Response.text();
      util.log(`m3u8 content: ${m3u8Content}`);
  
      const tsUrls = m3u8Content
        .split('\n')
        .filter(line => line.includes('.ts'))
        .map(tsPath => new URL(tsPath.trim(), hlsUrl).href);
      util.log(`Found ${tsUrls.length} TS URLs`);
  
      let allSegmentsData = new Uint8Array();
      for (const [index, url] of tsUrls.entries()) {
        util.log(`Fetching TS chunk ${index + 1}/${tsUrls.length}: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch TS chunk: ${response.status} ${response.statusText}`);
        }
        const chunkData = new Uint8Array(await response.arrayBuffer());
        allSegmentsData = util.concatUint8Arrays(allSegmentsData, chunkData);
      }
      
      util.log(`Total concatenated data size: ${allSegmentsData.length} bytes`);
      return allSegmentsData;
    } catch (error) {
      util.error(`Error fetching TS segments: ${error.message}`);
      throw error;
    }
  },

  concatUint8Arrays: (a, b) => {
    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
  },

  downloadImage: (imageUrl, fileName) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "fetchAndDownloadImage",
        url: imageUrl,
        fileName: fileName
      }, response => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  },

  downloadAllImages: async (images) => {
    const results = [];
    for (const [index, img] of images.entries()) {
      const imageUrl = img.src;
      console.log({imageUrl})
      const fileName = `bluesky_image_${Date.now()}_${index + 1}.jpg`;
      try {
        const result = await util.downloadImage(imageUrl, fileName);
        results.push({ success: result.success, fileName });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }
};

// Button creation
function createConvertButton() {
  const button = document.createElement('div');
  button.className = `css-175oi2r r-1loqt21 r-1otgn73 ${CONFIG.buttonClass}`;
  button.setAttribute('aria-label', 'Convert to MP4 or Download Images');
  button.setAttribute('tabindex', '0');
  button.style.cssText = `
    gap: 4px;
    border-radius: 999px;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    padding: 5px;
    cursor: pointer;
    transition: background-color 0.2s ease;
  `;
  
  const svgPath = "M12 4a1 1 0 0 1 1 1v10.586l2.293-2.293a1 1 0 0 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L11 15.586V5a1 1 0 0 1 1-1zM5 20a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5z";
  
  const svg = util.createSVGElement(svgPath);
  
  button.appendChild(svg);

  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = 'rgba(120, 142, 165, 0.1)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = 'transparent';
  });

  return button;
}

// Button injection logic
function injectConvertButton(post) {
  if (post.classList.contains(CONFIG.processingClass)) return;

  const actionBar = post.querySelector(CONFIG.actionBarSelector);
  if (!actionBar) return;

  const video = findVideoInPost(post);
  const images = findImagesInPost(post);

  if (!video && images.length === 0) return;

  const convertButtonContainer = document.createElement('div');
  convertButtonContainer.className = 'css-175oi2r';
  convertButtonContainer.style.cssText = 'align-items: center;';

  const convertButton = createConvertButton();
  convertButton.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleConvertAndDownload(video, images);
  };

  convertButtonContainer.appendChild(convertButton);
  actionBar.appendChild(convertButtonContainer);
  post.classList.add(CONFIG.processingClass);
}

// Find video in a post
function findVideoInPost(post) {
  return post.querySelector('video[poster^="https://video.bsky.app/"]');
}

// Find images in a post
function findImagesInPost(post) {
  return Array.from(post.querySelectorAll('img[src^="https://cdn.bsky.app/img/feed_thumbnail/"]'));
}

// Handle convert and download
async function handleConvertAndDownload(video, images) {
  try {
    let message = '';

    if (video) {
      util.log('Converting video');
      const result = await handleConvertVideo(video);
      message += result.success ? 'Video conversion initiated. ' : `Video conversion failed: ${result.error}. `;
    }

    if (images.length > 0) {
      util.log(`Downloading ${images.length} images`);
      const imageResults = await util.downloadAllImages(images);
      const successfulImages = imageResults.filter(r => r.success).length;
      message += `Downloaded ${successfulImages}/${images.length} images. `;
    }

  } catch (error) {
    util.error(`Error in handleConvertAndDownload: ${error.message}`);
  }
}

// Convert video handler
async function handleConvertVideo(video) {
  try {
    const posterUrl = video.poster;
    util.log(`Poster URL: ${posterUrl}`);
    const hlsUrl = util.extractHlsUrl(posterUrl);

    if (!hlsUrl) {
      throw new Error('Could not construct HLS URL');
    }

    util.log(`Constructed HLS URL: ${hlsUrl}`);
    util.log(`Fetching TS segments from HLS: ${hlsUrl}`);
    const tsData = await util.fetchTsSegments(hlsUrl);
    
    util.log(`TS segments fetched, total size: ${tsData.byteLength} bytes`);

    if (tsData.byteLength === 0) {
      throw new Error('No data fetched from TS segments');
    }

    const fileName = `bluesky_video_${Date.now()}.ts`;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "convertTsToMp4", 
        fileName: fileName,
        fileData: Array.from(tsData)
      }, (response) => {
        if (response && response.success) {
          util.log("Conversion initiated successfully");
          resolve({ success: true });
        } else {
          util.error("Failed to initiate conversion");
          resolve({ success: false, error: 'Failed to initiate conversion' });
        }
      });
    });
  } catch (error) {
    util.error(`Error in handleConvertVideo: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main injection function
function injectConvertButtons() {
  const posts = document.querySelectorAll(`
    ${CONFIG.postSelectors.feedItem}:not(.${CONFIG.processingClass}),
    ${CONFIG.postSelectors.postPage}:not(.${CONFIG.processingClass})
  `);
  posts.forEach(injectConvertButton);
}

// MutationObserver setup
const observerConfig = { childList: true, subtree: true };
const observer = new MutationObserver((mutations) => {
  if (mutations.some(mutation => mutation.addedNodes.length)) {
    injectConvertButtons();
  }
});

// Initialize
function initialize() {
  util.log('Initializing');
  observer.observe(document.body, observerConfig);
  injectConvertButtons();
}

// Start the script
initialize();