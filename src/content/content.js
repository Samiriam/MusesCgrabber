// Content Script - Score Grabber v11 (with PDF generation)

(function() {
  'use strict';

  var scoreId = '';
  var scoreName = '';
  var scoreComposer = '';
  var firstImage = '';
  var isInitialized = false;
  var capturedTokens = {};
  var tokenScript = null;
  var randomToken = null;
  var sandboxFrame = null;
  var tokenReady = false;
  var tokenError = null;
  var logHistory = [];
  var pdfMakeLoaded = false;

  function popupLog(msg, type) {
    var time = new Date().toLocaleTimeString();
    var entry = { time: time, msg: msg, type: type || 'info' };
    logHistory.push(entry);
    if (logHistory.length > 50) logHistory = logHistory.slice(-50);
    try { chrome.storage.local.set({ sgLogHistory: logHistory }); } catch (e) {}
    try { chrome.runtime.sendMessage({ type: 'SG_LOG', msg: msg, logType: type || 'info' }); } catch (e) {}
    console.log('[SG] ' + msg);
  }

  function timeoutPromise(promise, ms) {
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function() { reject(new Error('timeout')); }, ms);
      promise.then(function(v) { clearTimeout(t); resolve(v); },
                   function(e) { clearTimeout(t); reject(e); });
    });
  }

  function init() {
    if (isInitialized) return;
    extractScoreInfo();
    setupMessageListener();
    setupTokenCapture();
    initTokenAlgorithm();
    loadPdfMake();
    isInitialized = true;
    popupLog('Init. scoreId=' + scoreId, 'info');
  }

  function loadPdfMake() {
    if (typeof pdfMake !== 'undefined') {
      pdfMakeLoaded = true;
      popupLog('pdfmake already loaded', 'success');
      return;
    }
    // Load pdfmake from local extension files
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('pdfmake.min.js');
    script.onload = function() {
      popupLog('pdfmake.min.js loaded, checking...', 'info');
      // Check immediately if pdfMake is available
      if (typeof pdfMake !== 'undefined') {
        pdfMakeLoaded = true;
        popupLog('pdfmake ready (no fonts)', 'success');
      } else {
        // Load fonts
        var vfsScript = document.createElement('script');
        vfsScript.src = chrome.runtime.getURL('vfs_fonts.js');
        vfsScript.onload = function() {
          pdfMakeLoaded = true;
          popupLog('pdfmake ready (with fonts)', 'success');
        };
        document.head.appendChild(vfsScript);
      }
    };
    script.onerror = function() {
      popupLog('Failed to load pdfmake', 'error');
    };
    document.head.appendChild(script);
  }

  function extractScoreInfo() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var obj = JSON.parse(scripts[i].textContent);
        if (obj && obj['@type'] === 'MusicComposition') {
          if (obj.thumbnailUrl) firstImage = obj.thumbnailUrl;
          if (obj.composer && obj.composer.name) scoreComposer = obj.composer.name.trim();
          if (obj.name) scoreName = obj.name.trim();
          if (obj.url) scoreId = obj.url.split('/').pop();
        }
      } catch (e) {}
    }
    if (!scoreId) {
      var m = document.querySelector('meta[property="al:android:url"]') ||
              document.querySelector('meta[property="al:ios:url"]') ||
              document.querySelector('meta[property="og:url"]');
      if (m && m.content) scoreId = m.content.split('/').pop();
    }
    if (!scoreName) {
      var t = document.querySelector('meta[property="og:title"]');
      if (t && t.content) scoreName = t.content.trim();
    }
    if (!scoreComposer) {
      var c = document.querySelector('meta[property="musescore:composer"]');
      if (c && c.content) scoreComposer = c.content.trim();
    }
    if (!firstImage) {
      var img = document.querySelector('img[src*="score_0"]');
      if (img) firstImage = img.src;
    }
  }

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      if (msg === 'isConnectionOk') { sendResponse(isInitialized); return true; }
      if (msg === 'isScorePage') { sendResponse(!!scoreId && Number(scoreId) > 0); return true; }
      if (msg === 'getScoreInfo') {
        sendResponse({ scoreId: scoreId, scoreName: scoreName, scoreComposer: scoreComposer, firstImage: firstImage });
        return true;
      }
      if (msg === 'getTokenStatus') {
        sendResponse({ tokenReady: tokenReady, hasRandomToken: !!randomToken, hasScript: !!tokenScript, tokenError: tokenError });
        return true;
      }
      if (msg === 'getDebugInfo') {
        sendResponse({
          tokenReady: tokenReady, hasRandomToken: !!randomToken, hasScript: !!tokenScript,
          tokenError: tokenError, capturedTokensCount: Object.keys(capturedTokens).length, scoreId: scoreId
        });
        return true;
      }
      if (typeof msg === 'string') {
        handleAction(msg, function(result) { sendResponse(result); });
        return true;
      }
    });
  }

  function setupTokenCapture() {
    var orig = window.fetch;
    window.fetch = function() {
      var url = arguments[0];
      var opts = arguments[1];
      if (typeof url === 'string' && url.indexOf('/api/jmuse') !== -1) {
        var auth = null;
        if (opts && opts.headers) auth = opts.headers.Authorization || opts.headers.authorization;
        if (auth) {
          try {
            var p = new URL(url, window.location.origin).searchParams;
            var id = p.get('id');
            var type = p.get('type');
            var index = p.get('index') || '0';
            if (id && type) {
              capturedTokens[id + '_' + type + '_' + index] = auth;
              popupLog('Captured token: ' + type + ' for ' + id, 'success');
            }
          } catch (e) {}
        }
      }
      return orig.apply(this, arguments);
    };
  }

  // ============ TOKEN ALGORITHM ============

  function getScriptUrlFromDocument() {
    var links = document.querySelectorAll('link');
    for (var i = 0; i < links.length; i++) {
      if (/https:\/\/musescore\.com\/static\/public\/build\/[\w\/]+\/\d+\/\d+\.\w+\.js/.test(links[i].href)) {
        return links[i].href;
      }
    }
    return null;
  }

  function initTokenAlgorithm() {
    var url = getScriptUrlFromDocument();
    if (!url) { popupLog('No MuseScore script found', 'error'); return; }
    popupLog('Found script: ' + url.substring(0, 60) + '...', 'info');
    fetch(url).then(function(r) { return r.text(); }).then(function(scriptText) {
      if (!scriptText) { popupLog('Script is empty', 'error'); return; }
      popupLog('Script loaded, size: ' + scriptText.length, 'info');
      var m = scriptText.match(/"([\W\w]{1,50})"\)\.substr\(0, *4\)/);
      if (!m) { popupLog('randomToken not found', 'error'); return; }
      randomToken = m[1];
      popupLog('randomToken: ' + randomToken, 'success');
      var parts = scriptText.split(/, *(\d+): *(?:function)*\([\w,]{1,8}\)(?: *=> *|)\{/);
      var fn = null;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf('_digestsize') !== -1 && parts[i].indexOf('_blocksize') !== -1) {
          fn = parts[i - 1];
          break;
        }
      }
      if (!fn) { popupLog('MD5 function not found', 'error'); return; }
      popupLog('MD5 function found: #' + fn, 'success');
      var start = '(function (modules) { var installedModules = {}; function __webpack_require__(m) { if (installedModules[m]) return installedModules[m].exports; var module = installedModules[m] = { i: m, l: false, exports: {} }; modules[m].call(module.exports, module, module.exports, __webpack_require__); module.l = true; return module.exports; } __webpack_require__.m = modules; __webpack_require__.c = installedModules; return __webpack_require__(__webpack_require__.s = ' + fn + '); })(';
      var s = scriptText.replace(/\(self\.[^}]*(?=\{(\d+):)/, start);
      s = s.replace(/}}]\)/, '}})');
      s = s.replace(/_digestsize=(\d+),\w+\.exports=function\(/,
        function(match, a) { return '_digestsize=' + a + ',window.generateToken=function('; });
      tokenScript = s;
      popupLog('Script modified, preparing sandbox...', 'info');
      prepareSandbox();
    }).catch(function(e) { popupLog('Script fetch error: ' + e.message, 'error'); });
  }

  function prepareSandbox() {
    var iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sandbox.html');
    iframe.style.cssText = 'display:none;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    sandboxFrame = iframe;
    iframe.onload = function() {
      popupLog('Sandbox loaded', 'info');
      var handler = function(e) {
        if (typeof e.data === 'object' && e.data.msdExecuteScript !== undefined) {
          window.removeEventListener('message', handler);
          var success = e.data.msdExecuteScript;
          tokenReady = success;
          if (success) { popupLog('Token algorithm ready!', 'success'); }
          else { popupLog('Token algorithm FAILED', 'error'); tokenError = 'Script execution returned false'; }
        }
      };
      window.addEventListener('message', handler);
      sandboxFrame.contentWindow.postMessage({ executeScript: { script: tokenScript, randomToken: randomToken } }, '*');
    };
    setTimeout(function() {
      if (!tokenReady) { popupLog('Sandbox timeout', 'error'); tokenError = 'Sandbox timeout'; }
    }, 15000);
  }

  function generateTokenWithAlgorithm(id, type, index) {
    index = index || 0;
    if (!tokenReady || !sandboxFrame) return Promise.resolve(null);
    popupLog('Generating token: ' + id + ' ' + type + ' ' + index, 'info');
    return new Promise(function(resolve) {
      var handler = function(e) {
        if (typeof e.data === 'object' && e.data.msdGenerateToken !== undefined) {
          window.removeEventListener('message', handler);
          clearTimeout(safety);
          var token = e.data.msdGenerateToken;
          if (token) { popupLog('Token: ' + token, 'success'); resolve(token); }
          else { popupLog('Token generation returned null', 'error'); resolve(null); }
        }
      };
      window.addEventListener('message', handler);
      var safety = setTimeout(function() {
        window.removeEventListener('message', handler);
        popupLog('Token generation timeout', 'error');
        resolve(null);
      }, 2000);
      sandboxFrame.contentWindow.postMessage({ generateToken: { id: id, type: type, index: index } }, '*');
    });
  }

  // ============ MAIN FETCH ============

  function fetchApiUrl(id, token, type, index) {
    var url = 'https://musescore.com/api/jmuse?id=' + id + '&index=' + index + '&type=' + type;
    popupLog('Calling API: ' + url, 'info');
    popupLog('Token: ' + token, 'info');
    popupLog('Headers: { Authorization: ' + token + ' }', 'info');
    return fetch(url, {
      headers: { Authorization: token },
      referrer: window.location.href
    }).then(function(r) {
      popupLog('API response: ' + r.status + ' ' + r.statusText, r.ok ? 'success' : 'error');
      if (!r.ok) {
        return r.text().then(function(text) {
          popupLog('API error body: ' + text.substring(0, 200), 'error');
          return null;
        });
      }
      return r.json();
    }).then(function(d) {
      if (d && d.info && d.info.url) {
        popupLog('Got URL: ' + d.info.url.substring(0, 50) + '...', 'success');
        return d.info.url;
      }
      popupLog('No URL in API response: ' + JSON.stringify(d), 'error');
      return null;
    });
  }

  function fetchMediaUrl(id, type, index) {
    index = index || 0;
    popupLog('fetchMediaUrl: ' + id + ' ' + type + ' ' + index, 'info');
    if (tokenReady) {
      return timeoutPromise(
        generateTokenWithAlgorithm(id, type, index).then(function(token) {
          if (token) return fetchApiUrl(id, token, type, index);
          return null;
        }),
        3000
      ).catch(function() { return null; });
    }
    return Promise.resolve(null);
  }

  function downloadFile(url, filename) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('Download failed: ' + r.status);
      return r.blob();
    }).then(function(blob) {
      var blobUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 1000);
      return true;
    });
  }

  // ============ PDF GENERATION ============

  function getPageCount() {
    var pageCount = 0;
    
    // Method 1: Look for "X of Y pages" pattern (exact match from original)
    try {
      var bodyHTML = document.body ? document.body.outerHTML : '';
      var pagesMatch = bodyHTML.match(/\d+ of (\d+) pages/);
      if (pagesMatch) {
        pageCount = Number(pagesMatch[1]);
        popupLog('Page count from "X of Y pages": ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Method 2: Look for "Pages" in HTML structure (exact match from original)
    try {
      var pagesMatch2 = document.querySelector('body').outerHTML.match(/Pages<\/h3><\/th><td><div[\w ="]+>(\d+)/);
      if (pagesMatch2) {
        pageCount = Number(pagesMatch2[1]);
        popupLog('Page count from Pages structure: ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Method 3: Count divs in scroller (exact match from original)
    try {
      var scroller = document.querySelector('#jmuse-scroller-component');
      if (scroller && scroller.firstChild && scroller.firstChild.classList && scroller.firstChild.classList[0]) {
        var className = scroller.firstChild.classList[0];
        pageCount = document.querySelectorAll('.' + className).length;
        popupLog('Page count from scroller class "' + className + '": ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Method 4: Look for window.UGAPP
    try {
      if (window.UGAPP && window.UGAPP.store && window.UGAPP.store.page && window.UGAPP.store.page.data) {
        var scoreData = window.UGAPP.store.page.data.score;
        if (scoreData && scoreData.pages_count) {
          pageCount = scoreData.pages_count;
          popupLog('Page count from UGAPP: ' + pageCount, 'info');
          if (pageCount > 0) return pageCount;
        }
      }
    } catch (e) {}
    
    // Method 5: Count all images with score_ pattern
    try {
      var scoreImages = document.querySelectorAll('img[src*="score_"]');
      if (scoreImages.length > 0) {
        pageCount = scoreImages.length;
        popupLog('Page count from score images: ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Method 6: Count link elements with image type
    try {
      var imageLinks = document.querySelectorAll('link[as="image"]');
      if (imageLinks.length > 0) {
        pageCount = imageLinks.length;
        popupLog('Page count from link[as="image"]: ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Default fallback
    if (pageCount === 0) {
      pageCount = 1;
      popupLog('Could not detect page count, using default: 1', 'warn');
    }
    
    return pageCount;
  }

  function fetchImageAsBase64(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('Failed to fetch image');
      var contentType = r.headers.get('content-type');
      popupLog('Image content-type: ' + contentType, 'info');
      return r.blob();
    }).then(function(blob) {
      popupLog('Image blob type: ' + blob.type + ', size: ' + blob.size, 'info');
      
      // If SVG, convert to PNG using canvas
      if (blob.type === 'image/svg+xml' || blob.type === 'image/svg') {
        popupLog('Converting SVG to PNG...', 'info');
        return svgToPng(blob);
      }
      
      // If PNG or JPEG, convert directly to data URL
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() {
          var result = reader.result;
          popupLog('Image data URL prefix: ' + result.substring(0, 50), 'info');
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    });
  }

  function svgToPng(svgBlob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function() {
        var svgDataUrl = reader.result;
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          var pngDataUrl = canvas.toDataURL('image/png');
          popupLog('SVG converted to PNG: ' + pngDataUrl.substring(0, 50), 'success');
          resolve(pngDataUrl);
        };
        img.onerror = function() {
          popupLog('Failed to load SVG for conversion', 'error');
          reject(new Error('SVG load failed'));
        };
        img.src = svgDataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(svgBlob);
    });
  }

  function downloadPdfWithPages(scoreId, fileName, cb) {
    popupLog('Checking pdfmake status...', 'info');
    popupLog('pdfMakeLoaded=' + pdfMakeLoaded + ', pdfMake=' + (typeof pdfMake), 'info');
    
    if (typeof pdfMake === 'undefined' || !pdfMakeLoaded) {
      popupLog('pdfmake not loaded yet, waiting... (pdfMakeLoaded=' + pdfMakeLoaded + ', typeof pdfMake=' + (typeof pdfMake) + ')', 'warn');
      setTimeout(function() { downloadPdfWithPages(scoreId, fileName, cb); }, 500);
      return;
    }

    var pageCount = getPageCount();
    popupLog('Starting PDF download, pages: ' + pageCount, 'info');

    // Try to get first page URL directly from page (not API)
    var firstPageUrl = null;
    
    // Method 1: Get from link[as="image"]
    var imageLink = document.querySelector('link[as="image"]');
    if (imageLink && imageLink.href) {
      firstPageUrl = imageLink.href.split('@')[0];
      popupLog('First page from link: ' + firstPageUrl.substring(0, 50), 'info');
    }
    
    // Method 2: Get from img[src*="score_0"]
    if (!firstPageUrl) {
      var firstImg = document.querySelector('img[src*="score_0"]');
      if (firstImg && firstImg.src) {
        firstPageUrl = firstImg.src.split('@')[0];
        popupLog('First page from img: ' + firstPageUrl.substring(0, 50), 'info');
      }
    }
    
    // Method 3: Get from thumbnailUrl in JSON-LD
    if (!firstPageUrl && firstImage) {
      firstPageUrl = firstImage.split('@')[0];
      popupLog('First page from thumbnail: ' + firstPageUrl.substring(0, 50), 'info');
    }
    
    if (!firstPageUrl) {
      cb({ success: false, error: 'Could not get first page URL' });
      return;
    }

    popupLog('First page URL obtained, downloading all pages with delays...', 'info');

    // Download pages sequentially with delays to avoid CAPTCHA
    var allImages = [];
    
    function downloadPage(index) {
      if (index >= pageCount) {
        // All pages downloaded, generate PDF
        generatePdfFromImages(allImages, fileName, cb);
        return;
      }
      
      popupLog('Downloading page ' + (index + 1) + '/' + pageCount + '...', 'info');
      
      var imagePromise;
      if (index === 0) {
        imagePromise = fetchImageAsBase64(firstPageUrl);
      } else {
        imagePromise = fetchMediaUrl(scoreId, 'img', index).then(function(url) {
          if (url) return fetchImageAsBase64(url);
          return null;
        });
      }
      
      imagePromise.then(function(img) {
        if (img) {
          allImages.push(img);
          popupLog('Page ' + (index + 1) + ' downloaded', 'success');
        } else {
          popupLog('Page ' + (index + 1) + ' failed (CAPTCHA?)', 'warn');
        }
        
        // Delay before next page (2 seconds to avoid CAPTCHA)
        setTimeout(function() {
          downloadPage(index + 1);
        }, 2000);
      }).catch(function(e) {
        popupLog('Page ' + (index + 1) + ' error: ' + e.message, 'error');
        setTimeout(function() {
          downloadPage(index + 1);
        }, 2000);
      });
    }
    
    // Start downloading pages
    downloadPage(0);
  }

  function generatePdfFromImages(images, fileName, cb) {
    popupLog('Downloaded ' + images.length + ' pages', 'success');

    var validImages = images.filter(function(img) { return img !== null; });

    if (validImages.length === 0) {
      cb({ success: false, error: 'No images downloaded' });
      return;
    }

    popupLog('Generating PDF...', 'info');

    var content = [];
    for (var j = 0; j < validImages.length; j++) {
      content.push({
        image: validImages[j],
        width: 595,
        margin: [0, 0, 0, 0]
      });
      if (j < validImages.length - 1) {
        content.push({ text: '', pageBreak: 'after' });
      }
    }

    var docDefinition = {
      content: content,
      pageSize: 'A4',
      pageMargins: [0, 0, 0, 0],
      info: {
        title: fileName,
        author: scoreComposer || 'Score Grabber'
      }
    };

    try {
      var pdfDoc = pdfMake.createPdf(docDefinition);
      pdfDoc.download(fileName + '.pdf', function() {
        popupLog('PDF downloaded successfully!', 'success');
        cb({ success: true, message: 'PDF downloaded (' + validImages.length + ' pages)' });
      });
    } catch (e) {
      popupLog('PDF generation error: ' + e.message, 'error');
      cb({ success: false, error: 'PDF generation failed: ' + e.message });
    }
  }

  // ============ ACTIONS ============

  function handleAction(action, cb) {
    popupLog('Action: ' + action, 'info');
    if (!scoreId) { cb({ success: false, error: 'No score detected' }); return; }

    // Send immediate response to prevent channel timeout
    cb({ success: true, message: 'Processing...' });

    // Then do the work asynchronously
    setTimeout(function() {
      doAction(action);
    }, 100);
  }

  function doAction(action) {
    var fn = scoreComposer ? scoreComposer + ' - ' + scoreName : scoreName;

    if (action === 'downloadPdf') {
      downloadPdfWithPages(scoreId, fn, function(result) {
        popupLog('PDF result: ' + JSON.stringify(result), result.success ? 'success' : 'error');
        // Send notification to popup
        try {
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: result });
        } catch (e) {}
      });
      return;
    }

    var type, ext;
    if (action === 'downloadMidi') { type = 'midi'; ext = '.mid'; }
    else if (action === 'downloadMp3') { type = 'mp3'; ext = '.mp3'; }
    else if (action === 'openSheet') { type = 'img'; ext = '.png'; }
    else { return; }

    var done = false;
    var safety = setTimeout(function() {
      if (!done) {
        done = true;
        try {
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: false, error: 'Timeout 30s' } });
        } catch (e) {}
      }
    }, 30000);

    fetchMediaUrl(scoreId, type, 0).then(function(url) {
      if (done) return;
      if (!url) {
        done = true;
        clearTimeout(safety);
        try {
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: false, error: 'No URL for ' + type } });
        } catch (e) {}
        return;
      }
      if (action === 'openSheet') {
        done = true;
        clearTimeout(safety);
        window.open(url, '_blank');
        try {
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: true } });
        } catch (e) {}
        return;
      }
      return downloadFile(url, fn + ext).then(function(ok) {
        if (done) return;
        done = true;
        clearTimeout(safety);
        try {
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: ok, message: ok ? 'Downloaded!' : 'Download failed' } });
        } catch (e) {}
      });
    }).catch(function(e) {
      if (done) return;
      done = true;
      clearTimeout(safety);
      try {
        chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: false, error: e.message || 'Error' } });
      } catch (e2) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 2000);
})();
