// Script de Contenido - Score Grabber v11 (con generación de PDF)

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
    popupLog('Inicio. scoreId=' + scoreId, 'info');
  }

  function loadPdfMake() {
    if (typeof pdfMake !== 'undefined') {
      pdfMakeLoaded = true;
      popupLog('pdfmake ya cargado', 'success');
      return;
    }
    // Cargar pdfmake desde archivos locales de la extensión
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('pdfmake.min.js');
    script.onload = function() {
      popupLog('pdfmake.min.js cargado, verificando...', 'info');
      // Verificar inmediatamente si pdfMake está disponible
      if (typeof pdfMake !== 'undefined') {
        pdfMakeLoaded = true;
        popupLog('pdfmake listo (sin fuentes)', 'success');
      } else {
        // Cargar fuentes
        var vfsScript = document.createElement('script');
        vfsScript.src = chrome.runtime.getURL('vfs_fonts.js');
        vfsScript.onload = function() {
          pdfMakeLoaded = true;
          popupLog('pdfmake listo (con fuentes)', 'success');
        };
        document.head.appendChild(vfsScript);
      }
    };
    script.onerror = function() {
      popupLog('Error al cargar pdfmake', 'error');
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
              popupLog('Token capturado: ' + type + ' para ' + id, 'success');
            }
          } catch (e) {}
        }
      }
      return orig.apply(this, arguments);
    };
  }

  // ============ ALGORITMO DE TOKENS ============

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
    if (!url) { popupLog('No se encontró script de MuseScore', 'error'); return; }
    popupLog('Script encontrado: ' + url.substring(0, 60) + '...', 'info');
    fetch(url).then(function(r) { return r.text(); }).then(function(scriptText) {
      if (!scriptText) { popupLog('El script está vacío', 'error'); return; }
      popupLog('Script cargado, tamaño: ' + scriptText.length, 'info');
      var m = scriptText.match(/"([\W\w]{1,50})"\)\.substr\(0, *4\)/);
      if (!m) { popupLog('No se encontró randomToken', 'error'); return; }
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
      if (!fn) { popupLog('No se encontró función MD5', 'error'); return; }
      popupLog('Función MD5 encontrada: #' + fn, 'success');
      var start = '(function (modules) { var installedModules = {}; function __webpack_require__(m) { if (installedModules[m]) return installedModules[m].exports; var module = installedModules[m] = { i: m, l: false, exports: {} }; modules[m].call(module.exports, module, module.exports, __webpack_require__); module.l = true; return module.exports; } __webpack_require__.m = modules; __webpack_require__.c = installedModules; return __webpack_require__(__webpack_require__.s = ' + fn + '); })(';
      var s = scriptText.replace(/\(self\.[^}]*(?=\{(\d+):)/, start);
      s = s.replace(/}}]\)/, '}})');
      s = s.replace(/_digestsize=(\d+),\w+\.exports=function\(/,
        function(match, a) { return '_digestsize=' + a + ',window.generateToken=function('; });
      tokenScript = s;
      popupLog('Script modificado, preparando sandbox...', 'info');
      prepareSandbox();
    }).catch(function(e) { popupLog('Error al obtener script: ' + e.message, 'error'); });
  }

  function prepareSandbox() {
    var iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sandbox.html');
    iframe.style.cssText = 'display:none;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    sandboxFrame = iframe;
    iframe.onload = function() {
      popupLog('Sandbox cargado', 'info');
      var handler = function(e) {
        if (typeof e.data === 'object' && e.data.msdExecuteScript !== undefined) {
          window.removeEventListener('message', handler);
          var success = e.data.msdExecuteScript;
          tokenReady = success;
          if (success) { popupLog('¡Algoritmo de tokens listo!', 'success'); }
          else { popupLog('Algoritmo de tokens FALLÓ', 'error'); tokenError = 'La ejecución del script devolvió false'; }
        }
      };
      window.addEventListener('message', handler);
      sandboxFrame.contentWindow.postMessage({ executeScript: { script: tokenScript, randomToken: randomToken } }, '*');
    };
    setTimeout(function() {
      if (!tokenReady) { popupLog('Timeout del sandbox', 'error'); tokenError = 'Timeout del sandbox'; }
    }, 15000);
  }

  function generateTokenWithAlgorithm(id, type, index) {
    index = index || 0;
    if (!tokenReady || !sandboxFrame) return Promise.resolve(null);
    popupLog('Generando token: ' + id + ' ' + type + ' ' + index, 'info');
    return new Promise(function(resolve) {
      var handler = function(e) {
        if (typeof e.data === 'object' && e.data.msdGenerateToken !== undefined) {
          window.removeEventListener('message', handler);
          clearTimeout(safety);
          var token = e.data.msdGenerateToken;
          if (token) { popupLog('Token: ' + token, 'success'); resolve(token); }
          else { popupLog('La generación de token devolvió null', 'error'); resolve(null); }
        }
      };
      window.addEventListener('message', handler);
      var safety = setTimeout(function() {
        window.removeEventListener('message', handler);
        popupLog('Timeout en generación de token', 'error');
        resolve(null);
      }, 2000);
      sandboxFrame.contentWindow.postMessage({ generateToken: { id: id, type: type, index: index } }, '*');
    });
  }

  // ============ OBTENCIÓN PRINCIPAL ============

  function fetchApiUrl(id, token, type, index) {
    var url = 'https://musescore.com/api/jmuse?id=' + id + '&index=' + index + '&type=' + type;
    popupLog('Llamando API: ' + url, 'info');
    popupLog('Token: ' + token, 'info');
    popupLog('Headers: { Authorization: ' + token + ' }', 'info');
    return fetch(url, {
      headers: { Authorization: token },
      referrer: window.location.href
    }).then(function(r) {
      popupLog('Respuesta API: ' + r.status + ' ' + r.statusText, r.ok ? 'success' : 'error');
      if (!r.ok) {
        return r.text().then(function(text) {
          popupLog('Cuerpo de error API: ' + text.substring(0, 200), 'error');
          return null;
        });
      }
      return r.json();
    }).then(function(d) {
      if (d && d.info && d.info.url) {
        popupLog('URL obtenida: ' + d.info.url.substring(0, 50) + '...', 'success');
        return d.info.url;
      }
      popupLog('No hay URL en respuesta API: ' + JSON.stringify(d), 'error');
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
      if (!r.ok) throw new Error('Descarga fallida: ' + r.status);
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

  // ============ GENERACIÓN DE PDF ============

  function getPageCount() {
    var pageCount = 0;
    
    // Método 1: Buscar patrón "X de Y páginas" (coincidencia exacta del original)
    try {
      var bodyHTML = document.body ? document.body.outerHTML : '';
      var pagesMatch = bodyHTML.match(/\d+ of (\d+) pages/);
      if (pagesMatch) {
        pageCount = Number(pagesMatch[1]);
        popupLog('Conteo de páginas desde "X of Y pages": ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Método 2: Buscar "Pages" en estructura HTML (coincidencia exacta del original)
    try {
      var pagesMatch2 = document.querySelector('body').outerHTML.match(/Pages<\/h3><\/th><td><div[\w ="]+>(\d+)/);
      if (pagesMatch2) {
        pageCount = Number(pagesMatch2[1]);
        popupLog('Conteo de páginas desde estructura Pages: ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Método 3: Contar divs en scroller (coincidencia exacta del original)
    try {
      var scroller = document.querySelector('#jmuse-scroller-component');
      if (scroller && scroller.firstChild && scroller.firstChild.classList && scroller.firstChild.classList[0]) {
        var className = scroller.firstChild.classList[0];
        pageCount = document.querySelectorAll('.' + className).length;
        popupLog('Conteo de páginas desde clase scroller "' + className + '": ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Método 4: Buscar window.UGAPP
    try {
      if (window.UGAPP && window.UGAPP.store && window.UGAPP.store.page && window.UGAPP.store.page.data) {
        var scoreData = window.UGAPP.store.page.data.score;
        if (scoreData && scoreData.pages_count) {
          pageCount = scoreData.pages_count;
          popupLog('Conteo de páginas desde UGAPP: ' + pageCount, 'info');
          if (pageCount > 0) return pageCount;
        }
      }
    } catch (e) {}
    
    // Método 5: Contar todas las imágenes con patrón score_
    try {
      var scoreImages = document.querySelectorAll('img[src*="score_"]');
      if (scoreImages.length > 0) {
        pageCount = scoreImages.length;
        popupLog('Conteo de páginas desde imágenes score: ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Método 6: Contar elementos link con tipo imagen
    try {
      var imageLinks = document.querySelectorAll('link[as="image"]');
      if (imageLinks.length > 0) {
        pageCount = imageLinks.length;
        popupLog('Conteo de páginas desde link[as="image"]: ' + pageCount, 'info');
        if (pageCount > 0) return pageCount;
      }
    } catch (e) {}
    
    // Valor por defecto
    if (pageCount === 0) {
      pageCount = 1;
      popupLog('No se pudo detectar conteo de páginas, usando valor por defecto: 1', 'warn');
    }
    
    return pageCount;
  }

  function fetchImageAsBase64(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('Error al obtener imagen');
      var contentType = r.headers.get('content-type');
      popupLog('Content-type de imagen: ' + contentType, 'info');
      return r.blob();
    }).then(function(blob) {
      popupLog('Tipo de blob imagen: ' + blob.type + ', tamaño: ' + blob.size, 'info');
      
      // Si es SVG, convertir a PNG usando canvas
      if (blob.type === 'image/svg+xml' || blob.type === 'image/svg') {
        popupLog('Convirtiendo SVG a PNG...', 'info');
        return svgToPng(blob);
      }
      
      // Si es PNG o JPEG, convertir directamente a data URL
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() {
          var result = reader.result;
          popupLog('Prefijo data URL de imagen: ' + result.substring(0, 50), 'info');
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
          popupLog('SVG convertido a PNG: ' + pngDataUrl.substring(0, 50), 'success');
          resolve(pngDataUrl);
        };
        img.onerror = function() {
          popupLog('Error al cargar SVG para conversión', 'error');
          reject(new Error('Error al cargar SVG'));
        };
        img.src = svgDataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(svgBlob);
    });
  }

  function downloadPdfWithPages(scoreId, fileName, cb) {
    popupLog('Verificando estado de pdfmake...', 'info');
    popupLog('pdfMakeLoaded=' + pdfMakeLoaded + ', pdfMake=' + (typeof pdfMake), 'info');
    
    if (typeof pdfMake === 'undefined' || !pdfMakeLoaded) {
      popupLog('pdfmake aún no cargado, esperando... (pdfMakeLoaded=' + pdfMakeLoaded + ', typeof pdfMake=' + (typeof pdfMake) + ')', 'warn');
      setTimeout(function() { downloadPdfWithPages(scoreId, fileName, cb); }, 500);
      return;
    }

    var pageCount = getPageCount();
    popupLog('Iniciando descarga PDF, páginas: ' + pageCount, 'info');

    // Intentar obtener URL de primera página directamente desde la página (no API)
    var firstPageUrl = null;
    
    // Método 1: Obtener desde link[as="image"]
    var imageLink = document.querySelector('link[as="image"]');
    if (imageLink && imageLink.href) {
      firstPageUrl = imageLink.href.split('@')[0];
      popupLog('Primera página desde link: ' + firstPageUrl.substring(0, 50), 'info');
    }
    
    // Método 2: Obtener desde img[src*="score_0"]
    if (!firstPageUrl) {
      var firstImg = document.querySelector('img[src*="score_0"]');
      if (firstImg && firstImg.src) {
        firstPageUrl = firstImg.src.split('@')[0];
        popupLog('Primera página desde img: ' + firstPageUrl.substring(0, 50), 'info');
      }
    }
    
    // Método 3: Obtener desde thumbnailUrl en JSON-LD
    if (!firstPageUrl && firstImage) {
      firstPageUrl = firstImage.split('@')[0];
      popupLog('Primera página desde thumbnail: ' + firstPageUrl.substring(0, 50), 'info');
    }
    
    if (!firstPageUrl) {
      cb({ success: false, error: 'No se pudo obtener URL de primera página' });
      return;
    }

    popupLog('URL de primera página obtenida, descargando todas las páginas con demoras...', 'info');

    // Descargar páginas secuencialmente con demoras para evitar CAPTCHA
    var allImages = [];
    
    function downloadPage(index) {
      if (index >= pageCount) {
        // Todas las páginas descargadas, generar PDF
        generatePdfFromImages(allImages, fileName, cb);
        return;
      }
      
      popupLog('Descargando página ' + (index + 1) + '/' + pageCount + '...', 'info');
      
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
          popupLog('Página ' + (index + 1) + ' descargada', 'success');
        } else {
          popupLog('Página ' + (index + 1) + ' falló (¿CAPTCHA?)', 'warn');
        }
        
        // Demora antes de siguiente página (2 segundos para evitar CAPTCHA)
        setTimeout(function() {
          downloadPage(index + 1);
        }, 2000);
      }).catch(function(e) {
        popupLog('Error en página ' + (index + 1) + ': ' + e.message, 'error');
        setTimeout(function() {
          downloadPage(index + 1);
        }, 2000);
      });
    }
    
    // Iniciar descarga de páginas
    downloadPage(0);
  }

  function generatePdfFromImages(images, fileName, cb) {
    popupLog('Descargadas ' + images.length + ' páginas', 'success');

    var validImages = images.filter(function(img) { return img !== null; });

    if (validImages.length === 0) {
      cb({ success: false, error: 'No se descargaron imágenes' });
      return;
    }

    popupLog('Generando PDF...', 'info');

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
        popupLog('¡PDF descargado exitosamente!', 'success');
        cb({ success: true, message: 'PDF descargado (' + validImages.length + ' páginas)' });
      });
    } catch (e) {
      popupLog('Error en generación PDF: ' + e.message, 'error');
      cb({ success: false, error: 'Falló generación PDF: ' + e.message });
    }
  }

  // ============ ACCIONES ============

  function handleAction(action, cb) {
    popupLog('Acción: ' + action, 'info');
    if (!scoreId) { cb({ success: false, error: 'No se detectó partitura' }); return; }

    // Enviar respuesta inmediata para evitar timeout de canal
    cb({ success: true, message: 'Procesando...' });

    // Luego ejecutar el trabajo de forma asíncrona
    setTimeout(function() {
      doAction(action);
    }, 100);
  }

  function doAction(action) {
    var fn = scoreComposer ? scoreComposer + ' - ' + scoreName : scoreName;

    if (action === 'downloadPdf') {
      downloadPdfWithPages(scoreId, fn, function(result) {
        popupLog('Resultado PDF: ' + JSON.stringify(result), result.success ? 'success' : 'error');
        // Enviar notificación al popup
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
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: false, error: 'No hay URL para ' + type } });
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
          chrome.runtime.sendMessage({ type: 'SG_RESULT', result: { success: ok, message: ok ? '¡Descargado!' : 'Descarga fallida' } });
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