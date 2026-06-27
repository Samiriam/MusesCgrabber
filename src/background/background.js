// Service Worker de Fondo - Score Grabber

var tokenCache = {};

function isNewerVersion(current, latest) {
  var c = current.split('.').map(Number);
  var l = latest.split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function checkForUpdates() {
  return fetch('https://api.github.com/repos/ingui-n/musescore-downloader/releases/latest', {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  }).then(function(r) {
    if (!r.ok) throw new Error('Error de API');
    return r.json();
  }).then(function(release) {
    var latest = (release.tag_name || '0.0.0').replace('v', '');
    var available = isNewerVersion('1.0.0', latest);
    var info = {
      available: available,
      latestVersion: latest,
      releaseUrl: release.html_url,
      checkedAt: new Date().toISOString()
    };
    var obj = {};
    obj['extension_update_info'] = info;
    chrome.storage.local.set(obj);
    return info;
  }).catch(function(e) {
    return { available: false, error: e.message };
  });
}

chrome.webRequest.onSendHeaders.addListener(
  function(details) {
    if (details.url.indexOf('/api/jmuse') === -1) return;
    var headers = details.requestHeaders || [];
    var token = null;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].name.toLowerCase() === 'authorization') {
        token = headers[i].value;
        break;
      }
    }
    if (!token) return;
    try {
      var params = new URL(details.url).searchParams;
      var id = params.get('id');
      var type = params.get('type');
      var index = params.get('index') || '0';
      if (id && type) {
        var key = id + '_' + type + '_' + index;
        tokenCache[key] = token;
        var storageObj = {};
        storageObj[key] = token;
        chrome.storage.local.set(storageObj);
      }
    } catch (e) {}
  },
  { urls: ['https://musescore.com/api/jmuse*'] },
  ['requestHeaders']
);

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'GET_TOKEN') {
    var d = message.data;
    var key = d.id + '_' + d.type + '_' + (d.index || '0');
    if (tokenCache[key]) {
      sendResponse({ success: true, token: tokenCache[key] });
      return true;
    }
    var keys = {};
    keys[key] = null;
    chrome.storage.local.get(keys, function(result) {
      if (result[key]) {
        tokenCache[key] = result[key];
        sendResponse({ success: true, token: result[key] });
      } else {
        sendResponse({ success: false, token: null });
      }
    });
    return true;
  }
  if (message.type === 'CHECK_UPDATES') {
    checkForUpdates().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_UPDATE_INFO') {
    var updateKey = 'extension_update_info';
    var updateKeys = {};
    updateKeys[updateKey] = null;
    chrome.storage.local.get(updateKeys, function(result) {
      sendResponse({ success: true, updateInfo: result[updateKey] || null });
    });
    return true;
  }
  if (message.type === 'OPEN_UPDATE_URL') {
    var openKey = 'extension_update_info';
    var openKeys = {};
    openKeys[openKey] = null;
    chrome.storage.local.get(openKeys, function(result) {
      if (result[openKey] && result[openKey].releaseUrl) {
        chrome.tabs.create({ url: result[openKey].releaseUrl });
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

console.log('[Score Grabber] Fondo inicializado');

setTimeout(function() {
  checkForUpdates();
}, 5000);