// Popup script for Score Grabber - receives logs from content script

(function() {
  'use strict';

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var errorTextEl = document.getElementById('error-text');
  var contentEl = document.getElementById('content');
  var statusEl = document.getElementById('status');
  var statusTextEl = document.getElementById('status-text');
  var scoreTitleEl = document.getElementById('score-title');
  var scoreComposerEl = document.getElementById('score-composer');
  var scoreIdDisplayEl = document.getElementById('score-id-display');
  var debugPanel = document.getElementById('debug-panel');
  var debugLog = document.getElementById('debug-log');
  var btnDebug = document.getElementById('btn-debug');
  var btnClearLog = document.getElementById('btn-clear-log');
  var btnMidi = document.getElementById('btn-midi');
  var btnMp3 = document.getElementById('btn-mp3');
  var btnPdf = document.getElementById('btn-pdf');
  var btnSheet = document.getElementById('btn-sheet');
  var currentTab = null;
  var debugVisible = false;

  function addLog(msg, type) {
    var time = new Date().toLocaleTimeString();
    if (debugLog) {
      var line = document.createElement('div');
      line.className = 'log-line log-' + (type || 'info');
      line.textContent = '[' + time + '] ' + msg;
      debugLog.appendChild(line);
      debugLog.scrollTop = debugLog.scrollHeight;
    }
  }

  function showError(msg) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';
    if (errorTextEl) errorTextEl.textContent = msg;
    addLog('ERROR: ' + msg, 'error');
  }

  function showContent() {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
  }

  function showStatus(msg, isErr) {
    if (statusEl) statusEl.style.display = 'block';
    if (statusTextEl) {
      statusTextEl.textContent = msg;
      statusTextEl.style.color = isErr ? '#ff6b6b' : '#51cf66';
    }
    addLog('STATUS: ' + msg, isErr ? 'error' : 'success');
    setTimeout(function() { if (statusEl) statusEl.style.display = 'none'; }, 5000);
  }

  function sendMessage(msg, cb) {
    if (!currentTab || !currentTab.id) { cb(null); return; }
    addLog('→ ' + msg, 'send');
    chrome.tabs.sendMessage(currentTab.id, msg, function(response) {
      if (chrome.runtime.lastError) {
        addLog('← Error: ' + chrome.runtime.lastError.message, 'error');
        cb(null);
      } else {
        addLog('← Response', 'recv');
        cb(response);
      }
    });
  }

  function handleAction(action) {
    showStatus('Processing ' + action + '...');
    sendMessage(action, function(response) {
      if (response && response.success) {
        showStatus(response.message || 'Success!');
      } else {
        showStatus((response && response.error) || 'Failed', true);
      }
    });
  }

  // Load saved log history from storage
  function loadLogHistory() {
    chrome.storage.local.get('sgLogHistory', function(result) {
      if (result.sgLogHistory && Array.isArray(result.sgLogHistory)) {
        result.sgLogHistory.forEach(function(entry) {
          addLog('[INIT] ' + entry.msg, entry.type);
        });
      }
    });
  }
  
  // Listen for log messages from content script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message && message.type === 'SG_LOG') {
      addLog('[CS] ' + message.msg, message.logType);
    }
    if (message && message.type === 'SG_RESULT') {
      var result = message.result;
      if (result && result.success) {
        showStatus(result.message || 'Success!');
      } else {
        showStatus((result && result.error) || 'Failed', true);
      }
    }
  });

  function init() {
    addLog('=== Score Grabber Started ===', 'info');
    
    // Load saved log history first
    loadLogHistory();
    
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) {
        showError('No active tab');
        return;
      }
      currentTab = tabs[0];
      var url = currentTab.url || '';
      addLog('Tab URL: ' + url, 'info');

      if (url.indexOf('musescore.com') === -1) {
        showError('Not on MuseScore');
        return;
      }

      sendMessage('isConnectionOk', function(isReady) {
        if (!isReady) {
          showError('Content script not ready - refresh page');
          return;
        }
        addLog('Content script ready', 'success');

        sendMessage('getDebugInfo', function(info) {
          if (info) {
            addLog('Token ready: ' + info.tokenReady, info.tokenReady ? 'success' : 'error');
            addLog('Has randomToken: ' + info.hasRandomToken, info.hasRandomToken ? 'success' : 'error');
            addLog('Has script: ' + info.hasScript, info.hasScript ? 'success' : 'error');
            if (info.tokenError) {
              addLog('Token error: ' + info.tokenError, 'error');
            }
            addLog('Captured tokens: ' + info.capturedTokensCount, 'info');
          }

          sendMessage('isScorePage', function(isScore) {
            if (!isScore) {
              showError('No score detected');
              return;
            }
            addLog('Score page detected', 'success');

            sendMessage('getScoreInfo', function(scoreInfo) {
              if (scoreInfo) {
                if (scoreTitleEl) scoreTitleEl.textContent = scoreInfo.scoreName || 'Unknown';
                if (scoreComposerEl) scoreComposerEl.textContent = scoreInfo.scoreComposer || '';
                if (scoreIdDisplayEl) scoreIdDisplayEl.textContent = 'ID: ' + (scoreInfo.scoreId || 'none');
                addLog('Score: ' + scoreInfo.scoreName + ' (ID: ' + scoreInfo.scoreId + ')', 'info');
              }
              showContent();
            });
          });
        });
      });
    });
  }

  // Event listeners
  if (btnMidi) btnMidi.addEventListener('click', function() { handleAction('downloadMidi'); });
  if (btnMp3) btnMp3.addEventListener('click', function() { handleAction('downloadMp3'); });
  if (btnPdf) btnPdf.addEventListener('click', function() { handleAction('downloadPdf'); });
  if (btnSheet) btnSheet.addEventListener('click', function() { handleAction('openSheet'); });

  if (btnDebug) {
    btnDebug.addEventListener('click', function() {
      debugVisible = !debugVisible;
      if (debugPanel) {
        debugPanel.style.display = debugVisible ? 'block' : 'none';
      }
    });
  }

  if (btnClearLog) {
    btnClearLog.addEventListener('click', function() {
      if (debugLog) debugLog.innerHTML = '';
    });
  }

  init();
})();
