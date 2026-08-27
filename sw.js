/* Perfect Player offline shell: update this name whenever cached assets change. */
'use strict';

var CACHE_PREFIX = 'perfect-player-shell-';
var CACHE_NAME = CACHE_PREFIX + '20260827-new-career-system-reset-v16';
var SHELL = [
  './',
  './nba-perfect-player.html',
  './assets/css/fonts.css?v=20260826-performance-v1',
  './assets/css/perfect-player.css?v=20260826-era-headshots-v2',
  './assets/css/perfect-player-season-report.css?v=20260826-season-report-v1',
  './assets/css/perfect-player-premium.css?v=20260826-era-story-ui-v2',
  './assets/fonts/fredoka-latin.woff2',
  './assets/fonts/nunito-latin.woff2',
  './assets/fonts/nunito-italic-latin.woff2',
  './assets/data/perfect-player-pool-local.js?v=20260825-retirement-floor-v10',
  './assets/data/player-ages-local.js?v=20260824-age-local-v5',
  './assets/data/era-mode-data.js?v=20260825-era-v11',
  './assets/data/era-complete-rosters.js?v=20260825-era-v11',
  './assets/data/player-rating-calibration.js?v=20260826-rating-v2',
  './assets/data/era-presentation.js?v=20260826-era-presentation-v2',
  './assets/data/era-headshot-index.js?v=20260826-era-headshots-v1',
  './assets/data/historical/legend-team-rosters-local.js?v=20260824-legend-v4',
  './assets/data/perfect-player-pool.json?v=20260825-retirement-floor-v10',
  './assets/js/perfect-player-boot.js?v=20260827-systems-prologue-headshots-v8',
  './assets/js/current-player-ratings-2026.js?v=20260826-rating-v1',
  './assets/js/hupu/script-00-2678-58zyeprc-upload-1783508428855-12.js?v=20260827-verified-names-v1',
  './assets/js/hupu/script-01-2678-5hu3djrc-upload-1783494754597-12.js',
  './assets/js/hupu/script-02-2678-gd4jvxrc-upload-1783494754597-15.js',
  './assets/js/hupu/script-03-2678-456sfprc-upload-1783494754597-18.js',
  './assets/js/hupu/script-04-2678-mdo4zerc-upload-1783494754597-21.js',
  './assets/js/hupu/script-05-2678-qlg35lrc-upload-1783494754597-24.js',
  './assets/js/perfect-player-core.js?v=20260827-new-career-system-reset-v32',
  './assets/js/perfect-player-season-report.js?v=20260826-season-report-v2',
  './assets/js/perfect-player-mod-v4.js?v=20260827-systems-prologue-v17',
  './assets/js/perfect-player-era-mode.js?v=20260826-rating-v31',
  './assets/js/perfect-player-event-runtime.js?v=20260825-stamina-v7',
  './assets/js/perfect-player-poster.js?v=20260821-phase-a',
  './assets/js/perfect-player-hupu-extensions.js?v=20260826-rating-v16',
  './assets/js/perfect-player-skills.js?v=20260824-balance-v7',
  './assets/js/perfect-player-awards.js?v=20260823-allstar-v3',
  './assets/js/perfect-player-enhancements.js?v=20260826-legacy-sim-v15',
  './assets/js/perfect-player-event-library.js?v=20260825-stamina-v14',
  './assets/js/perfect-player-story-events.js?v=20260825-stamina-v14',
  './assets/js/perfect-player-era-story.js?v=20260827-prologue-v3',
  './assets/js/perfect-player-legend-challenge.js?v=20260824-legend-v12',
  './assets/js/perfect-player-allstar.js?v=20260824-double-points-mod-v1',
  './assets/js/perfect-player-live-court.js?v=20260824-era-positions-v7',
  './assets/js/perfect-player-live-sim.js?v=20260826-simulation-v17'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    // 离线壳是一个整体：任一必需资源失败都不安装半成品 SW。
    return cache.addAll(SHELL);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (key) {
      if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) return caches.delete(key);
    }));
  }).then(function () { return self.clients.claim(); }));
});

function makeCacheTracker() {
  var finish;
  var fail;
  var promise = new Promise(function (resolve, reject) { finish = resolve; fail = reject; });
  var done = false;
  return {
    promise:promise,
    finish:function () { if (!done) { done = true; finish(); } },
    follow:function (work) {
      if (done) return;
      Promise.resolve(work).then(this.finish, function (error) {
        if (!done) { done = true; fail(error); }
      });
    }
  };
}

function remember(cache, request, response, tracker) {
  if (!response || !response.ok || response.type === 'opaque') {
    tracker.finish();
    return response;
  }
  var copy = response.clone();
  tracker.follow(cache.put(request, copy));
  return response;
}

function networkFirst(cache, request, tracker) {
  return fetch(request).then(function (response) {
    return remember(cache, request, response, tracker);
  }).catch(function () {
    tracker.finish();
    return cache.match(request).then(function (cached) {
      return cached || cache.match('./nba-perfect-player.html');
    });
  });
}

function cacheFirst(cache, request, tracker) {
  return cache.match(request).then(function (cached) {
    if (cached) { tracker.finish(); return cached; }
    return cache.match(request, { ignoreSearch:true }).then(function (fallback) {
      if (fallback) { tracker.finish(); return fallback; }
      return fetch(request).then(function (response) {
        return remember(cache, request, response, tracker);
      }, function (error) {
        tracker.finish();
        throw error;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (request.mode === 'navigate') {
    var navTracker = makeCacheTracker();
    event.waitUntil(navTracker.promise);
    event.respondWith(caches.open(CACHE_NAME).then(function (cache) {
      return networkFirst(cache, request, navTracker);
    }).catch(function (error) {
      navTracker.finish();
      throw error;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  var staticAsset = ['style','script','font','image'].indexOf(request.destination) >= 0 || /\.(?:css|js|json|woff2|png|jpe?g|webp|svg)(?:$|\?)/i.test(url.pathname);
  if (staticAsset) {
    var assetTracker = makeCacheTracker();
    event.waitUntil(assetTracker.promise);
    event.respondWith(caches.open(CACHE_NAME).then(function (cache) {
      return cacheFirst(cache, request, assetTracker);
    }).catch(function (error) {
      assetTracker.finish();
      throw error;
    }));
  }
});
