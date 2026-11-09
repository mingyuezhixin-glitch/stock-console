/* 投资控制台 Service Worker
   策略：
   - 页面本体（index.html / 导航请求）：network-first，拿不到用缓存。
     这样更新了 index.html 下次访问能拿到新版，断网时用旧版打开界面。
   - 图标 / manifest：cache-first，几乎不变，省流量。
   - 行情接口（qt.gtimg.cn 等跨域请求）：完全不拦截，交给浏览器。
     行情必须实时，缓存没意义。

   为什么要这个：手机上「加到主屏」后，如果断网或信号差，
   至少能打开界面看到上次的持仓和档位，不至于一片空白。 */

var CACHE = 'stock-console-v13';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 单个失败不能让整个安装失败
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 跨域（行情接口）一率放行，不进缓存
  if (url.origin !== self.location.origin) return;

  var isDoc = req.mode === 'navigate' ||
              (req.headers.get('accept') || '').indexOf('text/html') >= 0 ||
              /\/$|\.html$/.test(url.pathname);

  if (isDoc) {
    // network-first
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  // 其余同域静态资源：cache-first
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
