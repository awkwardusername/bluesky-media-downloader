chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "convertTsToMp4") {
        console.log('HEREVID')
      createOffscreenDocument().then(() => {
        chrome.runtime.sendMessage({
          target: "offscreen",
          action: "convertTsToMp4",
          fileName: message.fileName,
          fileData: message.fileData
        });
        sendResponse({success: true});
      }).catch((error) => {
        console.error("Failed to create offscreen document:", error);
        sendResponse({success: false});
      });
      return true;  // Indicates we will send a response asynchronously
    } else if (message.action === "fetchAndDownloadImage") {
        console.log('HEREIMG')
      fetchAndDownload(message.url, message.fileName)
        .then(downloadId => {
          sendResponse({success: true, downloadId: downloadId});
        })
        .catch(error => {
          sendResponse({error: error.message});
        });
      return true; // Indicates that the response is sent asynchronously
    }
  });
  
  async function createOffscreenDocument() {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('html/offscreen.html'),
      reasons: ['WORKERS'],
      justification: 'Convert .ts files to .mp4 using FFmpeg WASM'
    });
  }
  
  async function fetchAndDownload(url, fileName) {
    try {
  
      return new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: url,  // Use the original URL directly
          filename: fileName,
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to fetch and download: ${error.message}`);
    }
  }