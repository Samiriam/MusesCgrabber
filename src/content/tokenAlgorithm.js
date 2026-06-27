// Token Algorithm - Replicates the original musescore-downloader approach
// Extracts MuseScore's JavaScript and uses their own MD5 function to generate tokens

(function() {
  'use strict';

  var isTokenAlgorithmAvailable = false;
  var script = null;
  var sandbox = null;

  function getScriptStart(functionNumber) {
    return '(function (modules) {\n  var installedModules = {};\n\n  function __webpack_require__(moduleId) {\n    if (installedModules[moduleId]) {\n      return installedModules[moduleId].exports;\n    }\n    var module = installedModules[moduleId] = {\n      i: moduleId,\n      l: false,\n      exports: {}\n    };\n    modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);\n    module.l = true;\n    return module.exports;\n  }\n\n  __webpack_require__.m = modules;\n  __webpack_require__.c = installedModules;\n  return __webpack_require__(__webpack_require__.s = ' + functionNumber + ');\n})(';
  }

  function getScriptUrlFromDocument() {
    var links = document.querySelectorAll('link');
    for (var i = 0; i < links.length; i++) {
      if (/https:\/\/musescore\.com\/static\/public\/build\/[\w\/]+\/\d+\/\d+\.\w+\.js/.test(links[i].href)) {
        return links[i].href;
      }
    }
    return null;
  }

  function fetchScript(url) {
    return fetch(url).then(function(r) { return r.text(); });
  }

  function checkTokenAlgorithm() {
    var scriptUrl = getScriptUrlFromDocument();
    if (!scriptUrl) return Promise.resolve(false);

    var stored = null;
    try {
      stored = localStorage.getItem('sg_tokenAlgorithm');
      if (stored) stored = JSON.parse(stored);
    } catch (e) {}

    if (stored && stored.url === scriptUrl) {
      script = stored;
      isTokenAlgorithmAvailable = true;
      return Promise.resolve(true);
    }

    return updateTokenAlgorithm(scriptUrl);
  }

  function updateTokenAlgorithm(url) {
    return fetchScript(url).then(function(scriptText) {
      if (!scriptText) return false;

      // Extract randomToken
      var tokenMatch = scriptText.match(/"([\W\w]{1,50})"\)\.substr\(0, *4\)/);
      if (!tokenMatch) return false;
      var randomToken = tokenMatch[1];

      // Find function number with MD5
      var scriptParts = scriptText.split(/, *(\d+): *(?:function)*\([\w,]{1,8}\)(?: *=> *|)\{/);
      var functionNumber = null;
      for (var i = 0; i < scriptParts.length; i++) {
        if (scriptParts[i].indexOf('_digestsize') !== -1 && scriptParts[i].indexOf('_blocksize') !== -1) {
          functionNumber = scriptParts[i - 1];
          break;
        }
      }
      if (!functionNumber) return false;

      // Modify script to expose generateToken
      scriptText = scriptText.replace(/\(self\.[^}]*(?=\{(\d+):)/, getScriptStart(functionNumber));
      scriptText = scriptText.replace(/}}]\)/, '}})');
      scriptText = scriptText.replace(
        /_digestsize=(\d+),\w+\.exports=function\(/,
        function(match, a) { return '_digestsize=' + a + ',window.generateToken=function('; }
      );

      script = { url: url, script: scriptText, randomToken: randomToken };

      try {
        localStorage.setItem('sg_tokenAlgorithm', JSON.stringify(script));
      } catch (e) {}

      return true;
    });
  }

  function executeAlgorithm() {
    if (!script) return Promise.resolve(false);

    return new Promise(function(resolve) {
      var iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('sandbox.html');
      iframe.style.cssText = 'display:none;width:0;height:0;border:none;';
      document.body.appendChild(iframe);
      sandbox = iframe;

      iframe.onload = function() {
        var messageHandler = function(e) {
          if (typeof e.data === 'object' && e.data.msdExecuteScript !== undefined) {
            window.removeEventListener('message', messageHandler);
            resolve(e.data.msdExecuteScript);
          }
        };
        window.addEventListener('message', messageHandler);

        sandbox.contentWindow.postMessage({ executeScript: script }, '*');
      };
    });
  }

  function generateTokenInSandbox(id, type, index) {
    index = index || 0;
    if (!isTokenAlgorithmAvailable || !sandbox) return Promise.resolve(null);

    return new Promise(function(resolve) {
      var messageHandler = function(e) {
        if (typeof e.data === 'object' && e.data.msdGenerateToken !== undefined) {
          window.removeEventListener('message', messageHandler);
          resolve(e.data.msdGenerateToken);
        }
      };
      window.addEventListener('message', messageHandler);
      sandbox.contentWindow.postMessage({ generateToken: { id: id, type: type, index: index } }, '*');
    });
  }

  function getMediaUrlWithAlgorithm(scoreId, type, index, fetchApiUrlFn) {
    index = index || 0;
    if (!isTokenAlgorithmAvailable) return Promise.resolve(null);

    return generateTokenInSandbox(scoreId, type, index).then(function(token) {
      if (!token) return null;
      return fetchApiUrlFn(scoreId, token, type, index);
    });
  }

  // Initialize
  function init() {
    checkTokenAlgorithm().then(function(available) {
      if (available) {
        executeAlgorithm().then(function(executed) {
          isTokenAlgorithmAvailable = executed;
          console.log('[Score Grabber] Token algorithm available:', executed);
        });
      } else {
        console.log('[Score Grabber] Token algorithm not available');
      }
    });
  }

  if (window) {
    if (document.readyState === 'complete') {
      setTimeout(init, 1000);
    } else {
      window.addEventListener('load', function() { setTimeout(init, 1000); });
    }
  }

  // Expose API
  window.SG_TOKEN_ALGORITHM = {
    isAvailable: function() { return isTokenAlgorithmAvailable; },
    getMediaUrl: getMediaUrlWithAlgorithm
  };
})();
