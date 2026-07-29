/* ============================================================
   题海 · Practice — 应用逻辑
   纯前端 / 零依赖 / localStorage 持久化
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 存储键 ---------------- */
  var LS = {
    bank: 'tihai.bank.v1',
    wrong: 'tihai.wrong.v1',
    stats: 'tihai.stats.v1',
    theme: 'tihai.theme.v1',
    history: 'tihai.history.v1',
    fav: 'tihai.fav.v1',
    notes: 'tihai.notes.v1',
    init: 'tihai.init.v1',
    officialSig: 'tihai.officialSig.v1'
  };

  /* ---------------- 工具：指纹与比对 ---------------- */
  function normText(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function computeOfficialSig(qs) {
    var s = (qs || []).map(function (q) {
      // 媒体标记一并计入签名：用户给某题新增/删除内嵌图、选项图、音频，都会改变签名，
      // 从而阻止「静默自动同步」把它覆盖掉（否则只改了图、没改文字时签名不变，会被官方更新悄悄替换）
      var media = ((q.questionImages && q.questionImages.length) ? 'Q' : '') +
                  ((q.optionImages && q.optionImages.length) ? 'O' : '') +
                  ((q.audioMediaId || q.audioData) ? 'A' : '') +
                  ((q.imageMediaId || q.imageData) ? 'I' : '');
      return normText(q.question) + '|' + q.answer + '|' + ((q.options || []).join(',')) + '|' + media;
    }).join('||');
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return 'v' + (h >>> 0).toString(36) + '-' + (qs ? qs.length : 0);
  }
  function officialUrl() { return 'set1.json?_=' + Date.now(); }

  /* 官方媒体内存缓存：同步/导入时已经下载过 _media，直接复用，避免重复拉 6MB */
  var lastOfficialMedia = null;
  // 取媒体值的稳健链路：IndexedDB → 内存缓存 → 云端懒加载（有网即可放，离线回退 IDB）
  function getMediaValue(mediaId) {
    if (mediaId && MediaStore.available()) {
      return MediaStore.get(mediaId).then(function (val) {
        if (val) return val;
        return resolveMediaFromCloud(mediaId);
      });
    }
    return resolveMediaFromCloud(mediaId);
  }
  // 按文件名从部署目录的 media/ 拉取外链媒体（音频走独立 mp3，按需加载，避免整题库内联 10MB 导致加载/导出卡死）
  function fetchMediaByPath(name) {
    return fetch('media/' + name)
      .then(function (r) {
        var ct = (r.headers && r.headers.get ? r.headers.get('content-type') : '') || '';
        // 缺失文件时服务器可能返回 200 + HTML fallback，必须按类型过滤，避免把网页当音频解码
        if (!r.ok || !/audio|octet-stream/.test(ct)) return null;
        return r.blob();
      })
      .then(function (b) { return b ? blobToDataURL(b) : null; })
      .catch(function () { return null; });
  }
  // 兜底：从整个 set1.json（含 _media）取出某媒体。仅在内存/外链均无时调用，避免高频拉取大文件。
  function fetchWholeBankMedia(mediaId) {
    return fetch(officialUrl())
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var p = JSON.parse(t);
        lastOfficialMedia = p._media || {};
        var v = lastOfficialMedia[mediaId] || null;
        if (v && MediaStore.available()) MediaStore.put(mediaId, v).catch(function () {});
        return v;
      })
      .catch(function () { return null; });
  }
  function resolveMediaFromCloud(mediaId) {
    if (!mediaId) return Promise.resolve(null);
    if (lastOfficialMedia && lastOfficialMedia[mediaId]) {
      var v = lastOfficialMedia[mediaId];
      if (MediaStore.available()) MediaStore.put(mediaId, v).catch(function () {}); // 顺手补回 IDB，便于离线
      return Promise.resolve(v);
    }
    // 音频优先走外链 mp3（轻量、按需），缺失再回退整题库拉取
    if (/aud/i.test(mediaId)) {
      return fetchMediaByPath(mediaId + '.mp3')
        .then(function (v) {
          if (v) { if (MediaStore.available()) MediaStore.put(mediaId, v).catch(function () {}); return v; }
          return fetchWholeBankMedia(mediaId);
        });
    }
    return fetchWholeBankMedia(mediaId);
  }

  /* ---------------- 示例题库 ---------------- */
  function buildSampleBank() {
    var raw = [
      // 音乐常识
      ['被称为“西方音乐之父”的巴洛克时期作曲家是？', ['乔治·弗里德里希·亨德尔', '约翰·塞巴斯蒂安·巴赫', '安东尼奥·维瓦尔第', '克劳迪奥·蒙特威尔第'], 1, 'J.S. 巴赫被尊为“西方音乐之父”，是巴洛克音乐的集大成者。', '音乐常识', '简单'],
      ['贝多芬的《第五交响曲》又常被称为？', ['田园交响曲', '命运交响曲', '英雄交响曲', '合唱交响曲'], 1, '《第五交响曲》(Op.67) 以开篇“命运动机”著称，俗称《命运》。', '音乐常识', '简单'],
      ['标准钢琴共有多少个琴键？', ['61', '76', '88', '108'], 2, '标准钢琴为 88 键（52 白键 + 36 黑键）。', '音乐常识', '简单'],
      ['中国民族乐器“二胡”属于以下哪一类？', ['吹管乐器', '拉弦乐器', '弹拨乐器', '打击乐器'], 1, '二胡为两根弦的拉弦乐器，用马尾弓擦奏。', '音乐常识', '简单'],
      ['《义勇军进行曲》的作曲者是？', ['冼星海', '聂耳', '贺绿汀', '黄自'], 1, '由田汉作词、聂耳作曲，现为中华人民共和国国歌。', '音乐常识', '简单'],
      ['歌剧《图兰朵》的作曲家是？', ['朱塞佩·威尔第', '贾科莫·普契尼', '焦阿基诺·罗西尼', '乔治·比才'], 1, '《图兰朵》是普契尼未完成的歌剧，含著名咏叹调《今夜无人入睡》。', '音乐常识', '中等'],
      ['维也纳古典乐派三大代表人物不包括下列哪位？', ['弗朗茨·海顿', '沃尔夫冈·阿玛多伊斯·莫扎特', '路德维希·凡·贝多芬', '弗雷德里克·肖邦'], 3, '古典三杰为海顿、莫扎特、贝多芬；肖邦属浪漫乐派。', '音乐常识', '中等'],
      ['“摇滚乐”(Rock and Roll) 最早兴起于哪个国家？', ['英国', '美国', '法国', '巴西'], 1, '摇滚乐 20 世纪 50 年代起源于美国，受节奏布鲁斯影响。', '音乐常识', '中等'],
      ['交响乐团中通常担任旋律主奏、坐在最前排左侧的弦乐声部是？', ['大提琴声部', '中提琴声部', '第一小提琴声部', '低音提琴声部'], 2, '第一小提琴常奏主旋律，首席（Concertmaster）坐于前排左。', '音乐常识', '中等'],
      ['中国戏曲“京剧”的四大行当是？', ['吹拉弹唱', '生旦净丑', '琴棋书画', '诗词歌赋'], 1, '京剧四大行当为生、旦、净、丑。', '音乐常识', '简单'],

      // 基本乐理
      ['在五线谱中，中央 C（middle C）通常记在？', ['第一线', '下加一线', '第三间', '第四线'], 1, '中央 C 位于高音谱表下加一线（或低音谱表上加一线）。', '基本乐理', '简单'],
      ['一个全音符的时值等于几个四分音符？', ['2', '3', '4', '8'], 2, '全音符 = 4 个四分音符（2 个二分 = 4 个四分）。', '基本乐理', '简单'],
      ['C 自然大调的主音是？', ['C', 'G', 'F', 'A'], 0, '大调以主音命名，C 大调主音即 C。', '基本乐理', '简单'],
      ['自然大调音阶的全、半音排列结构是？', ['全半全全半全全', '全全半全全全半', '半全全全半全全', '全全全半全全半'], 1, '大调音阶结构为：全 全 半 全 全 全 半。', '基本乐理', '中等'],
      ['一个八度（octave）包含多少个半音？', ['7', '8', '12', '24'], 2, '八度内包含 12 个等程半音（十二平均律）。', '基本乐理', '中等'],
      ['拍号 3/4 的含义是？', ['每小节 4 拍，以三分音符为一拍', '每小节 3 拍，以四分音符为一拍', '每小节 3/4 拍', '以八分音符为一拍，共 3 拍'], 1, '分子为每小节拍数，分母为单位拍音符（4=四分音符）。', '基本乐理', '简单'],
      ['增四度音程与减五度音程的关系是？', ['完全相同、无法区分', '互为同音异名的等音程', '毫无关系', '一个是协和音程、一个是不协和音程'], 1, '增四度与减五度音数相同、音响相等，互为等音程。', '基本乐理', '中等'],
      ['在 C 大调中，属音（第 V 级）是？', ['F', 'G', 'D', 'E'], 1, 'C 大调音阶为 C D E F G A B，第 V 级为 G。', '基本乐理', '简单'],
      ['力度记号 “piano” 表示？', ['强', '弱', '渐强', '中强'], 1, 'piano（p）意为“弱”；forte（f）为“强”。', '基本乐理', '简单'],
      ['三和弦由几个音按三度叠置构成？', ['2', '3', '4', '5'], 1, '三和弦由根音、三音、五音三个音构成。', '基本乐理', '简单'],
      ['还原记号（♮）的作用是？', ['将音升高半音', '将音降低半音', '取消之前的升、降记号', '延长该音时值'], 2, '还原记号用于抵消前面的升号或降号。', '基本乐理', '简单'],
      ['两个音之间最小的常规音高距离单位是？', ['全音', '半音', '四分音', '八度'], 1, '半音是十二平均律中的最小音高单位。', '基本乐理', '简单'],

      // 听力（听觉训练 / 概念）
      ['标准音 A4 的振动频率是？', ['220 Hz', '440 Hz', '880 Hz', '432 Hz'], 1, '国际标准音高 A4 = 440 Hz。', '听力', '简单'],
      ['纯八度音程中，两个音的频率之比是？', ['1:1', '2:1', '3:2', '1.5:1'], 1, '高八度音频率为低音的 2 倍，即 2:1。', '听力', '中等'],
      ['在听辨中，大三度相比小三度，其音响色彩通常更？', ['暗淡', '明亮', '嘈杂', '无明显差别'], 1, '大三度（4 个半音）比小三度（3 个半音）更明亮协和。', '听力', '中等'],
      ['人耳通常能够听到的声音频率范围大约是？', ['2–200 Hz', '20–20,000 Hz', '200–2,000 Hz', '1–10 Hz'], 1, '普通人耳可听范围约为 20 Hz 至 20 kHz。', '听力', '简单'],
      ['属七和弦（V7）相比大三和弦，在听觉上更？', ['更稳定', '不稳定、有解决倾向', '完全相同', '更柔和'], 1, '属七含减五度，音响紧张，需解决到主和弦。', '听力', '中等'],
      ['使用固定唱名法时，音名 G 永远唱作？', ['Do', 'Re', 'Mi', 'Sol'], 3, '固定唱名法中 C=Do，故 G=Sol。', '听力', '简单'],
      ['下列自然音程中，通常被认为“完全协和”的是？', ['大二度', '纯一度与纯八度', '增四度', '小七度'], 1, '纯一度、纯八度、纯五度、纯四度为完全协和音程。', '听力', '中等'],
      ['在 4/4 拍中，附点四分音符的时值等于？', ['一拍', '一拍半', '两拍', '半拍'], 1, '附点使原时值延长一半，四分音符附点 = 1.5 拍。', '听力', '简单'],
      ['判断一段旋律的“调式”主要依据？', ['速度快慢', '主音与音阶结构', '使用什么乐器', '歌词内容'], 1, '调式由主音及音阶的音程结构共同决定。', '听力', '中等'],
      ['听到两个音“相差一个八度”，它们的关系是？', ['频率完全相同', '频率成倍数关系', '音名完全相同', '毫无关联'], 1, '八度即频率比为 2:1 的整数倍关系。', '听力', '简单']
    ];
    return raw.map(function (r, i) {
      return {
        id: 's' + (i + 1),
        question: r[0],
        options: r[1],
        answer: r[2],
        explanation: r[3],
        category: r[4],
        difficulty: r[5]
      };
    });
  }

  /* ---------------- 状态 ---------------- */
  var state = {
    bank: [],
    wrong: {},     // id -> {count, first, last, mastered}
    stats: { done: 0 },
    theme: null,
    history: [],   // {ts, mode, total, correct, accuracy}
    favorites: {}, // id -> true
    notes: {}      // id -> string
  };

  var session = null;     // 当前练习会话
  var lastSessionWrong = []; // 上一练习轮次的错题列表（题目对象引用），供「重刷本次错题」使用
  var mediaUrls = [];     // 练习页当前题加载出的 object URL，需及时回收
  function revokeMediaUrls() {
    mediaUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    mediaUrls = [];
  }
  var setupMode = 'normal';
  var selectedCount = 10;
  var selectedCat = '全部';
  var selectedSet = '全部'; // 套题筛选：'全部' 或 '第一套'…'第十套'，用于整套练习选择
  var selectedTime = 0;   // 每题限时（秒），0 表示不限时
  var listenTime = 0;     // 听力计时（秒）：仅听力题，播放音频后开始倒计时，0 表示关闭
  var weakFirst = false;  // 错题专项：优先薄弱点

  /* ---------------- 工具函数 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function genId(str) {
    var h = 0, s = String(str || '');
    for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return 'u' + Math.abs(h).toString(36) + Date.now().toString(36).slice(-4);
  }
  // 每道题的稳定唯一内部标识（与业务 id 解耦）。业务 id（如 set1-mc-01）可能在不同来源重复，
  // 用 _uid 做删除/编辑的精确锚点，杜绝「同 id 的重复副本被连带删除 → 删一道丢多道」。
  function genUid() {
    return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function ensureUid(q) { if (q && !q._uid) q._uid = genUid(); return q; }
  function normText(t) { return String(t || '').trim().replace(/\s+/g, ''); }
  function letterToIndex(ans) {
    if (typeof ans === 'number') return ans;
    var s = String(ans).trim().toUpperCase();
    if (/^[A-Z]$/.test(s)) return s.charCodeAt(0) - 65;
    var n = parseInt(s, 10);
    return isNaN(n) ? -1 : n;
  }
  // 答案解析：支持序号、字母、或选项原文
  function resolveAnswer(ans, opts) {
    if (typeof ans === 'number') return (ans >= 0 && ans < opts.length) ? ans : 0;
    var s = String(ans).trim();
    for (var i = 0; i < opts.length; i++) { if (opts[i] === s) return i; }
    if (/^[A-Za-z]$/.test(s)) { var idx = s.toUpperCase().charCodeAt(0) - 65; return (idx >= 0 && idx < opts.length) ? idx : 0; }
    var n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0 && n < opts.length) return n;
    return 0;
  }
  var toastTimer = null;
  function toast(msg, type) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2400);
  }

  // 自定义确认弹窗，返回 Promise<boolean>（避免原生 confirm 在 iframe/PWA 下被拦截）
  function confirmDialog(message) {
    return new Promise(function (resolve) {
      var overlay = $('#confirmOverlay'), txt = $('#confirmText');
      var done = false;
      txt.textContent = message;
      overlay.hidden = false;
      function cleanup() {
        overlay.hidden = true;
        $('#confirmOk').removeEventListener('click', onOk);
        $('#confirmCancel').removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
      }
      function onOk() { if (done) return; done = true; cleanup(); resolve(true); }
      function onCancel() { if (done) return; done = true; cleanup(); resolve(false); }
      function onKey(e) { if (e.key === 'Escape') onCancel(); else if (e.key === 'Enter') onOk(); }
      $('#confirmOk').addEventListener('click', onOk);
      $('#confirmCancel').addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ---------------- 媒体存储 (IndexedDB) ---------------- */
  // 题目图片/音频较大，放在 IndexedDB，题库本身只保存 mediaId 引用（轻量、可进 localStorage）。
  var MediaStore = (function () {
    var NAME = 'tihai-media-db', STORE = 'blobs', dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        if (!('indexedDB' in window) || !window.indexedDB) { rej(new Error('no-idb')); return; }
        var r = indexedDB.open(NAME, 1);
        r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error || new Error('open fail')); };
      });
      return dbp;
    }
    function put(id, blob) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(blob, id);
          tx.oncomplete = function () { res(); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    }
    function get(id) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(STORE, 'readonly');
          var rq = tx.objectStore(STORE).get(id);
          rq.onsuccess = function () { res(rq.result || null); };
          rq.onerror = function () { rej(rq.error); };
        });
      });
    }
    function del(id) {
      return open().then(function (db) {
        return new Promise(function (res) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = function () { res(); };
          tx.onerror = function () { res(); };
        });
      });
    }
    function all() {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var out = {};
          var tx = db.transaction(STORE, 'readonly');
          var rq = tx.objectStore(STORE).openCursor();
          rq.onsuccess = function () {
            var c = rq.result;
            if (c) { out[c.key] = c.value; c.continue(); } else { res(out); }
          };
          rq.onerror = function () { rej(rq.error); };
        });
      });
    }
    function putAll(map) {
      var ids = Object.keys(map || {});
      if (!ids.length) return Promise.resolve();
      if (!available()) return Promise.resolve();
      return open().then(function (db) {
        // 逐条写入，单条失败不连累其他条目（避免整事务回滚导致音频全丢）
        return Promise.all(ids.map(function (k) {
          return new Promise(function (res) {
            try {
              var tx = db.transaction(STORE, 'readwrite');
              tx.objectStore(STORE).put(map[k], k);
              tx.oncomplete = function () { res(); };
              tx.onerror = function () { res(); };
              tx.onabort = function () { res(); };
            } catch (e) { res(); }
          });
        }));
      }).catch(function () { /* IDB 不可用时忽略，播放走云端回退 */ });
    }
    function clear() {
      if (!available()) return Promise.resolve();
      return open().then(function (db) {
        return new Promise(function (res) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = function () { res(); };
          tx.onerror = function () { res(); };
        });
      });
    }
    function available() { return ('indexedDB' in window) && !!window.indexedDB; }
    return { put: put, get: get, del: del, all: all, putAll: putAll, clear: clear, available: available };
  })();

  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  // 上传图片时压缩：把任意图片绘制到 canvas 做等比下采样，再编码为紧凑的 data URL。
  // 关键修复：手机（尤其 iOS Safari）无法渲染超大的 data: URI，导致"部分题目图片在手机上不显示"，
  // 故在落库前把尺寸压到 maxDim 以内、体积压到数百 KB，既能在手机端稳定显示，也避免撑爆本地存储。
  function processImageFile(file, maxDim, quality) {
    maxDim = maxDim || 1280; quality = quality || 0.80;
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image') !== 0) { reject(new Error('not image')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w || 1, h || 1));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
          canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
          var isPng = (file.type === 'image/png') || /\.png$/i.test(file.name || '');
          resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode fail')); };
      img.src = url;
    });
  }
  // 把已存在的 data URL 重新绘制压缩（用于"压缩 / 修复图片"一键修复手机不显示的问题）
  function recompressDataUrl(dataUrl, maxDim, quality) {
    maxDim = maxDim || 1440; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w || 1, h || 1));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
          canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
          var isPng = dataUrl.indexOf('data:image/png') === 0;
          resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('decode')); };
      img.src = dataUrl;
    });
  }
  // 一键压缩所有已存储的图片（仅处理 >300KB 的，避免无谓重写）。压缩后手机端即可正常显示。
  // silent=true 时静默执行、不弹提示，并返回 {fixed,total}，供「启动自动修复」调用。
  function recompressAllMedia(silent) {
    if (!MediaStore.available()) { if (!silent) toast('当前浏览器不支持本地媒体存储', 'bad'); return Promise.resolve({ fixed: 0, total: 0 }); }
    return MediaStore.all().then(function (all) {
      var ids = Object.keys(all);
      if (!ids.length) { if (!silent) toast('没有需要处理的图片', 'ok'); return { fixed: 0, total: 0 }; }
      var todo = ids.filter(function (id) {
        var v = all[id];
        return typeof v === 'string' && v.indexOf('data:image') === 0 && v.length > 300 * 1024;
      });
      if (!todo.length) { if (!silent) toast('图片已经够小，无需压缩', 'ok'); return { fixed: 0, total: 0 }; }
      var done = 0, fixed = 0;
      return Promise.all(todo.map(function (id) {
        return recompressDataUrl(all[id]).then(function (out) {
          if (out && out.length < all[id].length) { fixed++; return MediaStore.put(id, out); }
        }).catch(function () {}).then(function () { done++; if (!silent && done % 8 === 0) toast('已处理 ' + done + '/' + todo.length); });
      })).then(function () {
        if (!silent) toast('图片压缩完成：共处理 ' + todo.length + ' 张。手机端刷新页面即可正常显示', 'ok');
        return { fixed: fixed, total: todo.length };
      });
    });
  }
  // 启动自动修复：静默压缩过大的图片，使手机端也能完整显示；完成后重渲染当前视图让修复即时生效（无需手动点按钮）。
  function autoFixImages() {
    if (!MediaStore.available()) return;
    recompressAllMedia(true).then(function (res) {
      if (!res || !res.fixed) return;
      try {
        var bankEl = document.getElementById('view-bank');
        var practiceEl = document.getElementById('view-practice');
        if (bankEl && !bankEl.hidden) renderBankList();
        else if (practiceEl && !practiceEl.hidden && state.session && !state.session.finished && !state.session.answered) renderQuestion();
      } catch (e) {}
    }).catch(function () {});
  }

  // 媒体值可能是 Blob（编辑器上传存 IDB）/ dataURL 字符串（导入还原）/ base64（内联）
  // 统一转成可直接赋给 src 的地址，Blob 形式用 object URL 并登记以便回收
  function mediaUrl(val) {
    if (val && typeof val !== 'string' && (typeof Blob !== 'undefined' && (val instanceof Blob || val instanceof File))) {
      var u = URL.createObjectURL(val); mediaUrls.push(u); return u;
    }
    return val;
  }

  // 将题目图片的 mediaId 引用补全为内联 data：优先 mediaMap（如 userbank 的 _media），
  // 其次内存缓存 lastOfficialMedia，再次本地 IndexedDB（MediaStore，异步补全）。
  // 目的：图片内联后，渲染不再依赖 IndexedDB（移动端可靠），且可随导出 / 服务器同步流转到任意设备。
  function hydrateQuestionMedia(q, mediaMap) {
    if (!q) return;
    ['questionImages', 'optionImages'].forEach(function (k) {
      var list = q[k];
      if (!list) return;
      list.forEach(function (im) {
        if (!im || im.data) return;
        var v = (mediaMap && mediaMap[im.mediaId]) || (lastOfficialMedia && lastOfficialMedia[im.mediaId]) || null;
        if (v) { im.data = (typeof v === 'string') ? v : (v.data || null); return; }
        if (im.mediaId && MediaStore.available()) {
          MediaStore.get(im.mediaId).then(function (val) {
            if (!val) return;
            if (typeof val === 'string') { im.data = val; }
            else { blobToDataURL(val).then(function (d) { im.data = d; }).catch(function () {}); }
          }).catch(function () {});
        }
      });
    });
  }

  // 设置音频 src：data URL 直接赋给 <audio> 在 preload=none 时部分浏览器不加载，
  // 故统一转成 Blob 对象 URL（最可靠）。返回 Promise，设置完成后 resolve。
  function setAudioSrc(el, val) {
    return new Promise(function (resolve) {
      if (!val) { resolve(); return; }
      if (typeof Blob !== 'undefined' && (val instanceof Blob || val instanceof File)) {
        var u = URL.createObjectURL(val); mediaUrls.push(u); el.src = u; resolve();
      } else if (typeof val === 'string' && val.indexOf('data:') === 0) {
        try {
          fetch(val).then(function (r) { return r.blob(); }).then(function (b) {
            var u = URL.createObjectURL(b); mediaUrls.push(u); el.src = u; resolve();
          }).catch(function () { el.src = val; resolve(); });
        } catch (e) { el.src = val; resolve(); }
      } else {
        el.src = val; resolve();
      }
    });
  }

  /* ---------------- OCR（Tesseract.js，按需联网加载） ---------------- */
  var tessPromise = null;
  function loadTesseract() {
    if (tessPromise) return tessPromise;
    tessPromise = new Promise(function (res, rej) {
      if (window.Tesseract) { res(window.Tesseract); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js';
      s.async = true;
      s.onload = function () { res(window.Tesseract); };
      s.onerror = function () { rej(new Error('OCR 组件加载失败（需要联网）')); };
      document.head.appendChild(s);
    });
    return tessPromise;
  }
  function ocrImage(dataUrl, onProgress) {
    return loadTesseract().then(function (T) {
      return T.recognize(dataUrl, 'chi_sim+eng', {
        logger: function (m) { if (onProgress && m && typeof m.progress === 'number') onProgress(m.progress, m.status); }
      }).then(function (r) { return (r.data && r.data.text) ? r.data.text.trim() : ''; });
    });
  }

  /* ---------------- 持久化 ---------------- */
  // 分数规范化迁移（双向幂等，安全可重复运行）：
  //  ① 回滚残留的"数字—数字"（上次误把分数斜线改成横线）→ 恢复为"数字/数字"原状
  //  ② "整数 空格 分子/分母" 形式的带分数（如 "3 1/2"）→ 整数 + Unicode 分数字符（"3½"）
  // 仅作用于题目文本字段（question/options/answer/analysis），绝不动 _media / dataURL。
  // 拍号"2/4拍""3/4拍"等不受影响：①不会匹配（前后无整数+空格）②保持原状。
  var HYPHEN_FRAC_RE = /(\d+)—(\d+)/g;                    // 上次横线残留 → 回滚为斜线
  var MIXED_FRAC_RE  = /(\d+)\s+(\d+)\s*\/\s*(\d+)/g;     // 带分数"3 1/2" → 整数+Unicode
  var FRAC_MAP = {                                       // 15 种常用 Unicode 分数字符
    '1/2':'½','1/3':'⅓','2/3':'⅔','1/4':'¼','3/4':'¾',
    '1/5':'⅕','2/5':'⅖','3/5':'⅗','4/5':'⅘',
    '1/6':'⅙','5/6':'⅚',
    '1/8':'⅛','3/8':'⅜','5/8':'⅝','7/8':'⅞'
  };
  function normalizeFractions() {
    var changed = false;
    function fix(s) {
      if (typeof s !== 'string') return s;
      var out = s;
      // ① 回滚横线残留（仅当两边都是数字时）
      out = out.replace(HYPHEN_FRAC_RE, function (m, a, b) { changed = true; return a + '/' + b; });
      // ② 带分数 → 整数 + Unicode 字符（仅 15 种常见分数会被转换；拍号/不常见分数保持原样）
      out = out.replace(MIXED_FRAC_RE, function (m, whole, num, den) {
        var key = num + '/' + den;
        return FRAC_MAP[key] ? (changed = true, whole + FRAC_MAP[key]) : m;
      });
      return out;
    }
    state.bank.forEach(function (q) {
      if (!q) return;
      ['question', 'answer', 'analysis'].forEach(function (f) { if (q[f] != null) q[f] = fix(q[f]); });
      if (Array.isArray(q.options)) q.options = q.options.map(fix);
    });
    if (changed) saveBank(); // 幂等：处理后无残留，下次 load 不会重复写
  }
  // 合并完全重复的题库副本：以 (id + 归一化题干 + 选项JSON) 为判重键，仅保留首份。
  // 仅折叠「内容完全相同」的副本，不会误删真正不同的题；合并后 saveBank 落盘。
  function dedupeBank() {
    if (!state.bank.length) return;
    var seen = {}, out = [], removed = 0;
    state.bank.forEach(function (q) {
      if (!q) return;
      ensureUid(q);
      var key = (q.id || '') + '\u0000' + normText(q.question) + '\u0000' + JSON.stringify(q.options || []);
      if (seen[key]) { removed++; return; }
      seen[key] = true;
      out.push(q);
    });
    if (removed) {
      state.bank = out;
      saveBank();
      if (removed > 0) toast('已自动合并 ' + removed + ' 道重复题（同源副本）', 'ok');
    }
  }
  function load() {
    try { state.bank = JSON.parse(localStorage.getItem(LS.bank)) || []; } catch (e) { state.bank = []; }
    // 兼容旧数据：补全三级分类所需字段（缺省按乐理二级/第一套），避免树渲染时空字段
    state.bank.forEach(function (q) {
      if (q && !q.level) q.level = '乐理二级';
      if (q && !q.set) q.set = '第一套';
    });
    normalizeFractions(); // 一次性迁移：已存 localStorage 的旧斜线分数刷新后即变横线（无需重新同步、不破坏自定义题）
    // 为每道题补唯一内部标识 _uid，并合并「完全相同」的重复副本（同 id+同题干+同选项）。
    // 历史某次「导入/同步官方题」与本地已归一化（如 1/2→½）的题面文本对不上，导致官方题被整批追加成两份，
    // 同 id 副本会让删除操作一次删掉多道。此处合并，既修复计数也避免误删。
    state.bank.forEach(ensureUid);
    dedupeBank();
    // 首次打开不再直接建示例；优先用 set1.json 真实题库（见 init 中的 seedInitialBank），不可用再回退示例
    if (!localStorage.getItem(LS.init)) localStorage.setItem(LS.init, '1');
    try { state.wrong = JSON.parse(localStorage.getItem(LS.wrong)) || {}; } catch (e) { state.wrong = {}; }
    try { state.stats = JSON.parse(localStorage.getItem(LS.stats)) || { done: 0 }; } catch (e) { state.stats = { done: 0 }; }
    try { state.history = JSON.parse(localStorage.getItem(LS.history)) || []; } catch (e) { state.history = []; }
    try { state.favorites = JSON.parse(localStorage.getItem(LS.fav)) || {}; } catch (e) { state.favorites = {}; }
    try { state.notes = JSON.parse(localStorage.getItem(LS.notes)) || {}; } catch (e) { state.notes = {}; }
    state.theme = localStorage.getItem(LS.theme);
  }
  // 检测当前题库是否仍为「内置示例」（用于自动升级到官方题库）
  function isSampleBank() {
    var samples = buildSampleBank();
    if (state.bank.length !== samples.length) return false;
    var set = {};
    samples.forEach(function (q) { set[normText(q.question)] = true; });
    return state.bank.every(function (q) { return set[normText(q.question)]; });
  }

  // 同步官方题库（set1.json）：
  // - silent=true 用于启动时的自动升级 / 自动更新（无提示）
  // - 自动升级：设备仍是内置示例时，静默替换为官方题库
  // - 自动更新：设备题库与上次官方版本一致、且官方有新版时，静默替换
  // - 自定义题目（与官方不一致）永不被自动覆盖，确保安全
  // 判断本地题是否被用户改过（有媒体，或题干/选项文本与官方不同）——同步时据此保留用户编辑
  function localModified(local, official) {
    if (!local || !official) return false;
    // 任意媒体字段存在 → 视为用户改过（图片/音频必须保留，绝不被同步覆盖）
    var hasMedia = (local.questionImages && local.questionImages.length) ||
                   (local.optionImages && local.optionImages.some(function (x) { return x && (x.mediaId || x.data); })) ||
                   local.imageMediaId || local.imageData || local.audioMediaId || local.audioData;
    if (hasMedia) return true;
    // 文本类字段：用户只要改过其中任意一项（题干/选项/答案/解析），整题保留，
    // 避免「粘贴的答案被官方答案覆盖」「解析被清掉」
    if (normText(local.question) !== normText(official.question)) return true;
    if (JSON.stringify(local.options || []) !== JSON.stringify(official.options || [])) return true;
    if (String(local.answer == null ? '' : local.answer).trim() !== String(official.answer == null ? '' : official.answer).trim()) return true;
    if (normText(local.explanation) !== normText(official.explanation)) return true;
    if (normText(local.analysis) !== normText(official.analysis)) return true;
    return false;
  }
  // 是否为「用户自定义题」（非官方预置、非内置示例）。用于「只看我的题」过滤与同步保留。
  function isCustomQuestion(q) {
    var id = q && q.id || '';
    return !/^(set\d+-|s\d+$)/.test(id); // 官方 id 形如 set1-mc-01；内置示例 s1..s30
  }
  // 同步官方题库（set1.json）—— 合并式、非破坏性：
  // - 官方题按 id 刷新；但若本地该题被用户改过（加过图片/音频或修改过文字），保留本地版本
  // - 用户的自定义题（含图片/音频）永不被覆盖或清除
  // - 内置示例题（s1..）丢弃
  // 这样「同步官方题库」永远不会清空用户录入的内容（含图片），解决「同步后图片全丢」的事故。
  function syncOfficialBank(silent, force) {
    return fetch(officialUrl())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var res = parseImport(text);
        if (!res || !res.ok) throw new Error('parse');
        var newSig = computeOfficialSig(res.questions);
        var kept = [];
        var officialIds = {};
        res.questions.forEach(function (q) {
          officialIds[q.id] = true;
          var local = null;
          for (var i = 0; i < state.bank.length; i++) { if (state.bank[i].id === q.id) { local = state.bank[i]; break; } }
          // 合并策略（彻底解决「文字又跑回来了」与「同步丢图」两个互斥问题）：
          // 1) 本地该题被用户改过（localModified）且非 force → 保留本地（保护用户编辑）
          // 2) 否则采用官方新版（文本/答案修正能下发），但合并时保留本地的媒体
          //    （optionImages / questionImages / audio），避免「同步后图片全丢」
          // 3) 特殊「以图代文」：官方选项全空 + 本地有 optionImages → 视为官方规范要求以图代文，
          //    自动清除本地冗余文字、保留图片，无需手动点同步、刷新即生效
          if (local) {
            var officialEmptyOpts = !q.options || q.options.every(function (o) { return !o || !String(o).trim(); });
            var localHasOptImg = !!(local.optionImages && local.optionImages.length);
            var autoFixImageOption = officialEmptyOpts && localHasOptImg;
            if (!force && localModified(local, q) && !autoFixImageOption) {
              kept.push(local);
            } else {
              // 即便 localModified 未判定为「已改」，也尽量保留本地录入的文本/媒体，
              // 防止任何情况下「粘贴的答案/题干图片」被官方空值或旧值覆盖（仅覆盖本地非空值）。
              var merged = Object.assign({}, q);
              if (local.optionImages && local.optionImages.length) merged.optionImages = local.optionImages;
              if (local.questionImages && local.questionImages.length) merged.questionImages = local.questionImages;
              if (local.audioMediaId) merged.audioMediaId = local.audioMediaId;
              if (local.audioData) merged.audioData = local.audioData;
              if (local.imageMediaId) merged.imageMediaId = local.imageMediaId;
              if (local.imageData) merged.imageData = local.imageData;
              if (local.answer != null && String(local.answer).trim() !== '') merged.answer = local.answer;
              if (local.explanation && String(local.explanation).trim() !== '') merged.explanation = local.explanation;
              if (local.analysis && String(local.analysis).trim() !== '') merged.analysis = local.analysis;
              if (local._uid) merged._uid = local._uid;
              ensureUid(merged);
              kept.push(merged);
            }
          } else {
            ensureUid(q);
            kept.push(q);
          }
        });
        // 保留用户自定义题（官方 id 已在上一步处理；内置示例 s1.. 丢弃）
        state.bank.forEach(function (ex) {
          if (officialIds[ex.id]) return;
          if (/^s\d+$/.test(ex.id || '')) return; // 丢弃内置示例（测试题）
          kept.push(ex);
        });
        state.bank = kept;
        state.bank.forEach(ensureUid);
        dedupeBank();
        saveBank();
        if (res.media && MediaStore.available()) MediaStore.putAll(res.media).catch(function () {});
        lastOfficialMedia = res.media || lastOfficialMedia; // 内存缓存，播放无需再拉云端
        localStorage.setItem(LS.officialSig, newSig);
        renderDashboard(); renderBankList();
        if (!silent) {
          var mine = kept.length - res.questions.length;
          toast('已同步：官方 ' + res.questions.length + ' 道' + (mine > 0 ? '，保留你的 ' + mine + ' 道' : ''), 'ok');
        }
      })
      .catch(function () { if (!silent) toast('同步失败（可能离线）', 'bad'); });
  }

  // 首次打开：优先用 set1.json 作为初始题库；离线或不存在时回退示例
  function seedInitialBank() {
    fetch(officialUrl())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var res = parseImport(text);
        if (!res || !res.ok) throw new Error('parse');
        state.bank = res.questions.slice();
        state.bank.forEach(ensureUid);
        saveBank();
        localStorage.setItem(LS.officialSig, computeOfficialSig(res.questions));
        renderDashboard(); renderBankList();
        if (res.media && MediaStore.available()) MediaStore.putAll(res.media).catch(function () {});
        lastOfficialMedia = res.media || lastOfficialMedia; // 内存缓存，播放无需再拉云端
      })
      .catch(function () {
        state.bank = buildSampleBank(); saveBank();
        renderDashboard(); renderBankList();
      });
  }
  // 只读拉取服务器上的 userbank.json（用户自定义题 + 图片），自动合入本地题库。
  // 实现「同步到服务器」后跨网址 / 跨设备可用：用户在任一浏览器导出并交由我合并进服务器后，
  // 任意网址、任意设备打开都会自动加载其题目与图片，不再因换网址 / 清缓存而丢失。
  /* ---------------- 自动同步到服务器（零手动，需配置后端） ---------------- */
  // 后端为 Supabase Storage（配置见 js/sync-config.js）。开启后：
  //  - 打开网页自动从服务器拉取题库（pullFromServer）
  //  - 本地有改动时自动推送（saveBank 成功 → schedulePush → pushToServer）
  // 失败时静默（console.warn），不影响正常使用。
  var _pushTimer = null;
  function schedulePush() {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(pushToServer, 1500);
  }
  function collectSyncMedia() {
    var media = {};
    state.bank.forEach(function (q) {
      if (!q) return;
      ['questionImages', 'optionImages'].forEach(function (k) {
        if (!q[k]) return;
        q[k].forEach(function (im) { if (im && im.mediaId && im.data) media[im.mediaId] = im.data; });
      });
    });
    return media;
  }
  function pushToServer() {
    var cfg = window.TIHAI_SYNC;
    if (!cfg || !cfg.enabled || cfg.backend !== 'supabase' || !cfg.supabaseUrl || !cfg.anonKey) return;
    var url = cfg.supabaseUrl.replace(/\/+$/, '') + '/storage/v1/object/' + encodeURIComponent(cfg.bucket) + '/' + encodeURIComponent(cfg.path);
    var payload = { _media: collectSyncMedia(), questions: state.bank, updatedAt: Date.now() };
    fetch(url, {
      method: 'POST',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { console.warn('[sync] push 失败', r.status, t); });
    }).catch(function (e) { console.warn('[sync] push 异常', e); });
  }
  function pullFromServer() {
    var cfg = window.TIHAI_SYNC;
    if (!cfg || !cfg.enabled || cfg.backend !== 'supabase' || !cfg.supabaseUrl || !cfg.anonKey) return;
    var url = cfg.supabaseUrl.replace(/\/+$/, '') + '/storage/v1/object/' + encodeURIComponent(cfg.bucket) + '/' + encodeURIComponent(cfg.path);
    fetch(url, {
      headers: { 'apikey': cfg.anonKey, 'Authorization': 'Bearer ' + cfg.anonKey }
    }).then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (res) {
        if (!res || !Array.isArray(res.questions)) return;
        var byId = {};
        state.bank.forEach(function (q) { if (q && q.id) byId[q.id] = 1; });
        var added = 0;
        res.questions.forEach(function (q) {
          if (!q || !q.id || byId[q.id]) return; // 已存在则不覆盖本地编辑
          byId[q.id] = 1;
          hydrateQuestionMedia(q, res._media);
          state.bank.push(q);
          added++;
        });
        if (added) {
          saveBank();
          try { renderDashboard(); renderBankList(); } catch (e) {}
        }
        if (res._media && MediaStore.available()) MediaStore.putAll(res._media).catch(function () {});
      })
      .catch(function (e) { console.warn('[sync] pull 异常', e); });
  }

  function loadServerBank() {
    try {
      fetch('./userbank.json', { cache: 'no-cache' })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (res) {
          if (!res || !Array.isArray(res.questions)) return;
          var byId = {};
          state.bank.forEach(function (q) { if (q && q.id) byId[q.id] = 1; });
          var added = 0;
          res.questions.forEach(function (q) {
            if (!q || !q.id || byId[q.id]) return; // 已存在则不覆盖本地编辑
            byId[q.id] = 1;
            hydrateQuestionMedia(q, res._media); // 将服务器 _media 补全为内联 data，手机端无需依赖 IndexedDB 即可显示
            state.bank.push(q);
            added++;
          });
          if (added) {
            saveBank();
            try { renderDashboard(); renderBankList(); } catch (e) {}
          }
          if (res._media && MediaStore.available()) MediaStore.putAll(res._media).catch(function () {});
        })
        .catch(function () {});
    } catch (e) {}
  }

  function saveBank() {
    try {
      localStorage.setItem(LS.bank, JSON.stringify(state.bank));
      schedulePush();
      return true;
    } catch (e) {
      var quota = (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014));
      if (quota) {
        // 本地空间不足：必须让保存【成功】，绝不静默丢弃题目或图片引用（否则下次打开图片全丢）。
        // 瘦身优先级：① 剥音频内联数据（体积最大，仍有 mediaId 兜底）② 剥图片内联 data（仅当存在 mediaId 时才剥，
        //   保留 mediaId → 图片改由 IndexedDB 还原，同设备/桌面可靠；跨设备需「同步到服务器」备份）。
        try {
          var stripped = false;
          // ① 先剥音频
          state.bank.forEach(function (q) { if (q && q.audioData) { q.audioData = null; stripped = true; } });
          if (stripped) { try { localStorage.setItem(LS.bank, JSON.stringify(state.bank)); schedulePush(); return true; } catch (e3) {} }
          // ② 仍超限则剥图片内联 data（保留 mediaId 引用；无 mediaId 的图片保留 data，宁占空间也不丢图）
          state.bank.forEach(function (q) {
            ['questionImages', 'optionImages'].forEach(function (k) {
              if (!q[k]) return;
              q[k].forEach(function (im) { if (im && im.data && im.mediaId) { im.data = null; stripped = true; } });
            });
          });
          if (stripped) { localStorage.setItem(LS.bank, JSON.stringify(state.bank)); schedulePush(); return true; }
        } catch (e2) {}
        toast('本地空间极度紧张，已保留全部题目与图片引用。请尽快「导出备份」，避免换设备后丢失。', 'bad');
        return false;
      }
      toast('保存失败：' + (e && e.message ? e.message : '未知错误'), 'bad');
      return false;
    }
  }
  function saveWrong() { localStorage.setItem(LS.wrong, JSON.stringify(state.wrong)); }
  function saveStats() { localStorage.setItem(LS.stats, JSON.stringify(state.stats)); }
  function saveHistory() { localStorage.setItem(LS.history, JSON.stringify(state.history)); }
  function saveFav() { localStorage.setItem(LS.fav, JSON.stringify(state.favorites)); }
  function saveNotes() { localStorage.setItem(LS.notes, JSON.stringify(state.notes)); }

  /* ---------------- 错题管理 ---------------- */
  function hasWrong(id) { return !!state.wrong[id] && !state.wrong[id].mastered; }
  function addWrong(id) {
    var now = Date.now();
    if (!state.wrong[id]) state.wrong[id] = { count: 0, first: now, last: now, mastered: false };
    state.wrong[id].count++;
    state.wrong[id].last = now;
    saveWrong();
  }
  function markMastered(id) {
    if (state.wrong[id]) { state.wrong[id].mastered = true; saveWrong(); }
  }
  function activeWrongIds() {
    return Object.keys(state.wrong).filter(function (id) {
      var w = state.wrong[id];
      return w && !w.mastered && state.bank.some(function (q) { return q.id === id; });
    });
  }
  function masteredCount() {
    return Object.keys(state.wrong).filter(function (id) { return state.wrong[id] && state.wrong[id].mastered; }).length;
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(t) {
    if (t === 'system' || !t) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function initTheme() {
    applyTheme(state.theme || 'system');
    $('#themeToggle').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = (cur === 'dark') ? 'light' : 'dark';
      applyTheme(next);
      state.theme = next;
      localStorage.setItem(LS.theme, next);
    });
  }

  /* ---------------- 路由 ---------------- */
  function showView(name) {
    $all('.view').forEach(function (v) { v.hidden = true; });
    var el = $('#view-' + name);
    if (el) el.hidden = false;
    $all('.nav-link').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-view') === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* 题库视图：group=按套题分组 / flat=全部平铺 */
  var bankView = 'group';
  /* 只看我的题：隐藏官方预置/示例题，只显示用户自定义题 */
  var myOnly = false;
  /* 编辑保存后，renderBankList 重建完成需滚回的题目 key（q._uid || q.id），用于「保存后不跳顶、停在原题进度」 */
  var pendingScrollKey = null;

  /* 已录入题目列表（题库页） */
  function renderBankList() {
    ensureEditorHome(); // 重建前先把编辑器卡片移回 home，避免被 list.innerHTML 清空销毁
    // 重建前停掉正在播放的题库试听音频，避免元素被移出 DOM 后仍在后台响
    if (activeBankAudio) { try { activeBankAudio.pause(); } catch (e) {} activeBankAudio = null; }
    // 记录当前滚动位置：整体重建 DOM 会改变页面总高度，浏览器会把滚动 clamp，
    // 表现为「保存/编辑题目后跳回顶部」。重建完成后原样恢复，做到保存后留在当前位置。
    // 注意：routeTo('import') 会在本函数之后再调用 showView() 主动滚到顶部，故切换视图仍回到顶部，不受影响。
    var savedScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    try {
    var list = $('#bankList');
    var view = myOnly ? state.bank.filter(isCustomQuestion) : state.bank; // 只看我的题：过滤掉官方/示例预置题
    $('#bankCount').textContent = view.length + ' 道' + (myOnly ? '（仅我的）' : '');
    list.innerHTML = '';
    $('#bankEmpty').hidden = view.length > 0;
    if (!view.length) return;

    if (bankView === 'flat') {
      list.classList.remove('bank-grouped');
      view.forEach(function (q, i) { list.appendChild(buildBankItem(q, i)); });
      return;
    }

    // 分组模式：一级 套题(第一/二/…/十套，按套号排序) → 二级 题型(音乐常识/基本乐理/听力) → 题目
    list.classList.add('bank-grouped');
    var SET_ORDER = ['第一套','第二套','第三套','第四套','第五套','第六套','第七套','第八套','第九套','第十套','第十一套','第十二套'];
    var CAT_ORDER = ['音乐常识', '基本乐理', '听力'];
    function setNum(s) {
      var m = /第([一二三四五六七八九十]+)套/.exec(s || '');
      if (!m) return 999;
      var cn = m[1], CN = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
      if (cn === '十') return 10;
      if (cn.indexOf('十') >= 0) {
        var parts = cn.split('十');
        var tens = parts[0] ? (CN[parts[0]] || 1) : 1;
        var ones = parts[1] ? (CN[parts[1]] || 0) : 0;
        return tens * 10 + ones;
      }
      return CN[cn] || 999;
    }

    var tree = {}; // tree[set][cat] = [{q,i}]
    view.forEach(function (q, i) {
      var st = q.set || '第一套';
      var cat = q.category || '未分类';
      tree[st] = tree[st] || {};
      (tree[st][cat] = tree[st][cat] || []).push({ q: q, i: i });
    });
    function sumCount(node) {
      var n = 0;
      Object.keys(node).forEach(function (k) {
        if (Array.isArray(node[k])) n += node[k].length;
        else n += sumCount(node[k]);
      });
      return n;
    }
    function groupNode(title, count, depth, builder) {
      var sec = document.createElement('div');
      sec.className = 'bank-group tree-' + depth;
      sec.innerHTML =
        '<div class="bank-group-head" data-toggle-group>' +
          '<span class="bank-group-fold" aria-hidden="true">▾</span>' +
          '<span class="bank-group-name">' + escapeHtml(title) + '</span>' +
          '<span class="bank-group-count">' + count + ' 道</span>' +
        '</div>' +
        '<div class="bank-group-body"></div>';
      builder(sec.querySelector('.bank-group-body'));
      return sec;
    }
    function practiceBtn(cat, set) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-primary btn-sm bank-practice';
      b.setAttribute('data-practice-cat', cat);
      b.setAttribute('data-practice-set', set || '全部');
      b.setAttribute('data-magnetic', '');
      b.textContent = (cat === '全部') ? '练习整套' : '练习本类';
      return b;
    }

    SET_ORDER.concat(Object.keys(tree).filter(function (s) { return SET_ORDER.indexOf(s) < 0; }))
      .forEach(function (st) {
        if (!tree[st]) return;
        var setNode = groupNode(st, sumCount(tree[st]), 1, function (setBody) {
          CAT_ORDER.concat(Object.keys(tree[st]).filter(function (c) { return CAT_ORDER.indexOf(c) < 0; }))
            .forEach(function (cat) {
              if (!tree[st][cat]) return;
              var items = tree[st][cat];
              var catNode = groupNode(cat, items.length, 2, function (catBody) {
                items.forEach(function (it) { catBody.appendChild(buildBankItem(it.q, it.i)); });
              });
              catNode.querySelector('.bank-group-head').appendChild(practiceBtn(cat, st));
              setBody.appendChild(catNode);
            });
        });
        setNode.querySelector('.bank-group-head').appendChild(practiceBtn('全部', st)); // 练习整套：该套全部题目（跨三类）
        list.appendChild(setNode);
      });
    } finally {
      // 编辑保存后：把刚编辑的题滚回视口中心（优先于绝对 scrollY 恢复，规避「编辑器收起→页面变矮→同 scrollY 指向不同内容」的错位/跳顶）
      if (pendingScrollKey) {
        var target = document.querySelector('.bank-item[data-key="' + pendingScrollKey + '"]');
        if (target) target.scrollIntoView({ block: 'center', behavior: 'auto' });
        pendingScrollKey = null;
      } else {
        // 非编辑场景（删除/切换视图等）：沿用绝对滚动位置恢复
        window.scrollTo(0, savedScroll);
      }
    }
  }

  /* 编辑器卡片「家」锚点：编辑时临时移入题目下方，保存/取消后移回此处 */
  function resetGroupOverflow() {
    // 内联编辑时曾把所在分组 overflow 临时放开，这里统一复原（querySelectorAll 在 IIFE 作用域可用）
    var grps = document.querySelectorAll('.bank-group');
    for (var i = 0; i < grps.length; i++) { grps[i].style.overflow = ''; }
  }
  function moveEditorHome() {
    var ec = $('#editorCard'), home = $('#editorHome');
    if (ec && home && ec.parentElement !== home.parentElement) {
      home.parentNode.insertBefore(ec, home);
    }
    if (ec) ec.classList.remove('inline-edit');
    resetGroupOverflow();
  }
  function ensureEditorHome() { moveEditorHome(); }

  /* 点击「编辑」：把编辑器卡片移到该题下方并就地展开，不再跳到页面底部。
     仅负责 DOM 移动与滚动（不调用 initEditor 作用域内的 loadQuestionIntoEditor）。 */
  function moveEditorToItem(itemDom) {
    var ec = $('#editorCard');
    if (!ec) { console && console.warn && console.warn('moveEditorToItem: #editorCard 未找到'); return; }
    if (itemDom && itemDom.parentNode) {
      itemDom.parentNode.insertBefore(ec, itemDom.nextSibling);
      ec.classList.add('inline-edit');
      // 关键修复：分组容器 .bank-group 默认 overflow:hidden，会变成“滚动容器”，
      // 导致 scsrollIntoView 只滚动分组本身而不滚动页面窗口，编辑器在屏幕外打开却看不到。
      // 内联编辑期间临时将其 overflow 放开，移回时由 moveEditorHome/resetGroupOverflow 复原。
      var g = itemDom.closest ? itemDom.closest('.bank-group') : null;
      if (g) g.style.overflow = 'visible';
    }
    $('#edCancelBtn').hidden = false;
    requestAnimationFrame(function () {
      // 滚动目标用「被点击的那道题本身」而非整个编辑器卡片：
      // 编辑器卡片很高（含题干/选项/答案/音频），若 block:center 会把顶部的「题目文字」输入框滚出视野，
      // 用户只看到表单中段而找不到题目输入框，误以为“不能编辑”。滚到题目本身可保证题目与其下方编辑器首部同时可见。
      if (itemDom && itemDom.scrollIntoView) {
        itemDom.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        ec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  /* ---------------- 题库听力题试听播放器 ---------------- */
  // 多个题库卡片可各持一个独立 <audio>，同一时刻只播一个；共享一个 AudioContext 做增益
  var activeBankAudio = null;
  var bankAudioCtx = null;
  function attachBankGain(audioEl, gainVal) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    var ctx = bankAudioCtx;
    if (!ctx) { try { ctx = bankAudioCtx = new AC(); } catch (e) { return false; } }
    if (audioEl._graph) {
      if (ctx.state === 'suspended') ctx.resume();
      audioEl._graph.gain.gain.value = Math.min(gainVal, 8);
      return true;
    }
    try {
      var src = ctx.createMediaElementSource(audioEl);
      var g = ctx.createGain();
      g.gain.value = Math.min(gainVal, 8);
      src.connect(g); g.connect(ctx.destination);
      audioEl._graph = { gain: g };
      return true;
    } catch (e) { return false; }
  }

  // 为听力题构建内嵌试听播放器（独立 <audio> + 进度条 + 响度滑块），仅首次播放时懒加载音频
  function buildBankAudioPlayer(q) {
    var wrap = document.createElement('div');
    wrap.className = 'bi-audio';
    wrap.innerHTML =
      '<button type="button" class="bi-play" aria-label="试听音频">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '<span class="bi-play-label">试听</span>' +
      '</button>' +
      '<div class="bi-audio-progress" role="slider" tabindex="0" aria-label="播放进度">' +
        '<div class="bi-audio-bar"></div>' +
      '</div>' +
      '<span class="bi-audio-time">00:00</span>' +
      '<span class="bi-audio-gain" title="响度（放大偏轻的录音）">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>' +
        '<input type="range" class="bi-vol" min="1" max="4" step="0.1" value="2.5" aria-label="响度" />' +
      '</span>' +
      '<audio preload="none"></audio>';

    var audio = wrap.querySelector('audio');
    var playBtn = wrap.querySelector('.bi-play');
    var label = wrap.querySelector('.bi-play-label');
    var svg = playBtn.querySelector('svg');
    var progress = wrap.querySelector('.bi-audio-progress');
    var bar = wrap.querySelector('.bi-audio-bar');
    var timeEl = wrap.querySelector('.bi-audio-time');
    var vol = wrap.querySelector('.bi-vol');
    var loaded = false;
    var gain = parseFloat(vol.value) || 2.5;

    function fmt(t) {
      if (!isFinite(t) || t < 0) t = 0;
      var m = Math.floor(t / 60), s = Math.floor(t % 60);
      return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
    }
    function setPlaying(on) {
      wrap.classList.toggle('playing', on);
      var icon = on ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
      svg.innerHTML = icon;
      label.textContent = on ? '暂停' : (audio.currentTime > 0.3 && !audio.ended ? '继续' : '试听');
    }
    function load() {
      if (loaded) return Promise.resolve();
      var p = q.audioData
        ? Promise.resolve(q.audioData)
        : (MediaStore.available() && q.audioMediaId ? getMediaValue(q.audioMediaId) : Promise.resolve(null));
      return p.then(function (val) {
        if (!val) return Promise.reject(new Error('音频缺失'));
        return setAudioSrc(audio, val).then(function () { loaded = true; });
      });
    }
    function toggle() {
      if (audio.paused) {
        if (activeBankAudio && activeBankAudio !== audio) { try { activeBankAudio.pause(); } catch (e) {} }
        load().then(function () {
          if (!attachBankGain(audio, gain)) audio.volume = Math.min(gain, 1);
          if (bankAudioCtx && bankAudioCtx.state === 'suspended') bankAudioCtx.resume();
          activeBankAudio = audio;
          return audio.play();
        }).then(function () { setPlaying(true); }).catch(function (err) {
          label.textContent = '音频不可用';
          console.warn('题库试听播放失败', err);
        });
      } else {
        audio.pause();
      }
    }
    playBtn.addEventListener('click', toggle);
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { if (!audio.ended) setPlaying(false); });
    audio.addEventListener('ended', function () {
      setPlaying(false); bar.style.width = '0%'; audio.currentTime = 0;
      if (activeBankAudio === audio) activeBankAudio = null;
    });
    audio.addEventListener('timeupdate', function () {
      var d = audio.duration || 0;
      if (d > 0) bar.style.width = (audio.currentTime / d * 100) + '%';
      timeEl.textContent = fmt(audio.currentTime) + (d > 0 ? ' / ' + fmt(d) : '');
    });
    progress.addEventListener('click', function (e) {
      var d = audio.duration || 0; if (!d) return;
      var r = progress.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      audio.currentTime = ratio * d;
    });
    vol.addEventListener('input', function () {
      gain = parseFloat(vol.value) || 2.5;
      if (audio._graph) audio._graph.gain.gain.value = Math.min(gain, 8);
      else audio.volume = Math.min(gain, 1);
    });
    return wrap;
  }

  /* 单个题目行（分组与平铺复用）：展开式，题目+选项+答案+解析全显示 */
  function buildBankItem(q, i) {
    var item = document.createElement('div');
    item.className = 'bank-item expanded';
    item.setAttribute('data-id', q.id);
    item.setAttribute('data-key', q._uid || q.id); // 与编辑键(data-edit/data-del)一致，供保存后滚回定位

    // 头部：序号 + 分类 + 操作
    var head = document.createElement('div');
    head.className = 'bi-head';
    head.innerHTML =
      '<span class="bank-idx">' + (i + 1) + '</span>' +
      '<span class="tag tag-level">' + escapeHtml(q.level || '乐理二级') + '</span>' +
      '<span class="tag tag-cat">' + escapeHtml(q.category || '未分类') + '</span>' +
      '<span class="tag tag-set">' + escapeHtml(q.set || '第一套') + '</span>' +
      '<span class="bank-act">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + (q._uid || q.id) + '">编辑</button>' +
        '<button type="button" class="btn btn-ghost btn-sm btn-danger" data-del="' + (q._uid || q.id) + '">删除</button>' +
      '</span>';
    item.appendChild(head);

    // 题干（含内嵌图片）
    var qBox = document.createElement('div');
    qBox.className = 'bi-q';
    item.appendChild(qBox);
    renderInlineText(qBox, q.question, function (idx) {
      var im = (q.questionImages || [])[idx];
      if (!im) return null;
      if (im.mediaId) return getMediaValue(im.mediaId).then(function (v) { return v ? mediaUrl(v) : null; });
      return im.data || null;
    });
    if (q.imageMediaId || q.imageData) {
      var leg = document.createElement('img');
      leg.className = 'q-inline-img';
      leg.alt = '题目图片';
      qBox.appendChild(leg);
      var lp = q.imageMediaId
        ? getMediaValue(q.imageMediaId).then(function (v) { return v ? mediaUrl(v) : null; })
        : Promise.resolve(q.imageData);
      lp.then(function (v) { if (v) leg.src = v; }).catch(function () {});
    }

    // 听力题：在题库卡片内同步显示音频并支持试听
    if (q.category === '听力' && (q.audioMediaId || q.audioData)) {
      item.appendChild(buildBankAudioPlayer(q));
    }

    // 选项（正确答案高亮）
    var opts = document.createElement('div');
    opts.className = 'bi-opts';
    var labels = ['A', 'B', 'C', 'D'];
    for (var k = 0; k < 4; k++) {
      var isAns = (q.answer === k);
      var row = document.createElement('div');
      row.className = 'bi-opt' + (isAns ? ' is-answer' : '');
      row.innerHTML = '<span class="opt-key">' + labels[k] + (isAns ? ' ✓' : '') + '</span><span class="bi-opt-body"></span>';
      var body = row.querySelector('.bi-opt-body');
      var txt = optText(q, k);
      if (txt) body.appendChild(document.createTextNode(txt));
      var optImg = (q.optionImages && q.optionImages[k]) ? q.optionImages[k] : null;
      if (optImg) {
        var im2 = document.createElement('img');
        im2.className = 'bi-opt-img';
        body.appendChild(im2);
        (function (imEl, oi) {
          var val = oi.mediaId
            ? getMediaValue(oi.mediaId).then(function (v) { return v ? mediaUrl(v) : null; })
            : Promise.resolve(oi.data || null);
          val.then(function (v) { if (v) imEl.src = v; }).catch(function () {});
        })(im2, optImg);
      }
      opts.appendChild(row);
    }
    item.appendChild(opts);

    // 解析
    if (q.explanation) {
      var exp = document.createElement('div');
      exp.className = 'bi-exp';
      exp.innerHTML = '<span class="bi-exp-label">解析</span>' + escapeHtml(q.explanation);
      item.appendChild(exp);
    }
    return item;
  }

  /* ---------------- 仪表盘 ---------------- */
  function renderDashboard() {
    $('#statTotal').textContent = state.bank.length;
    var cats = {};
    state.bank.forEach(function (q) { cats[q.category] = 1; });
    $('#statCats').textContent = '覆盖 ' + Object.keys(cats).length + ' 个分类';
    var aw = activeWrongIds().length;
    $('#statWrong').textContent = aw;
    $('#statWrongFoot').textContent = aw > 0 ? '保持手感，专项突破' : '太棒了，暂无错题';
    $('#statDone').textContent = state.stats.done;
  }

  /* ---------------- 设置页 ---------------- */
  function renderCatChips() {
    var box = $('#catChips');
    box.innerHTML = '';
    var cats = {};
    state.bank.forEach(function (q) { cats[q.category] = 1; });
    var list = ['全部'].concat(Object.keys(cats));
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'chip' + (c === selectedCat ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', function () {
        selectedCat = c;
        $all('.chip', box).forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
      box.appendChild(b);
    });
  }
  function renderSetChips() {
    var box = $('#setChips');
    if (!box) return;
    box.innerHTML = '';
    var sets = {};
    state.bank.forEach(function (q) { sets[q.set || '第一套'] = 1; });
    var order = ['第一套','第二套','第三套','第四套','第五套','第六套','第七套','第八套','第九套','第十套','第十一套','第十二套'];
    var sorted = order.filter(function (s) { return sets[s]; })
      .concat(Object.keys(sets).filter(function (s) { return order.indexOf(s) < 0; }));
    ['全部'].concat(sorted).forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'chip' + (s === selectedSet ? ' active' : '');
      b.textContent = s;
      b.addEventListener('click', function () {
        selectedSet = s;
        $all('.chip', box).forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
      box.appendChild(b);
    });
  }
  function initSetup() {
    $('#countChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      chip.classList.add('active');
      selectedCount = parseInt(chip.getAttribute('data-count'), 10);
      $('#customCount').value = '';
    });
    $('#timeChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      chip.classList.add('active');
      selectedTime = parseInt(chip.getAttribute('data-time'), 10);
    });
    $('#listenChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      chip.classList.add('active');
      listenTime = parseInt(chip.getAttribute('data-listen'), 10);
    });
    $('#customCount').addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      if (!isNaN(v) && v > 0) {
        selectedCount = v;
        $all('.chip', $('#countChips')).forEach(function (x) { x.classList.remove('active'); });
      }
    });
    $('#startBtn').addEventListener('click', function () {
      var count = parseInt($('#customCount').value, 10);
      if (!isNaN(count) && count > 0) selectedCount = count;
      if (setupMode === 'wrong') {
        var wf = $('#weakFirst');
        weakFirst = !!(wf && wf.checked);
      }
      startPractice({ mode: setupMode, count: selectedCount, category: selectedCat, set: selectedSet, timeLimit: selectedTime, listenTime: listenTime, weakFirst: weakFirst });
    });
  }
  function openSetup(mode) {
    setupMode = mode || 'normal';
    selectedCount = 10;
    selectedCat = '全部';
    selectedSet = '全部';
    selectedTime = 0;
    listenTime = 0;
    weakFirst = false;
    $('#setupTitle').textContent = setupMode === 'wrong' ? '错题专项练习' : (setupMode === 'fav' ? '练习收藏' : '开始刷题');
    $('#setupSub').textContent = setupMode === 'wrong'
      ? '仅从你的错题本中抽取，答对即移出错题本。'
      : (setupMode === 'fav' ? '从你收藏的题目里抽取练习。' : '选择题目数量与范围，系统将随机抽取。');
    $all('.chip', $('#countChips')).forEach(function (x) {
      x.classList.toggle('active', parseInt(x.getAttribute('data-count'), 10) === 10);
    });
    $all('.chip', $('#timeChips')).forEach(function (x) {
      x.classList.toggle('active', parseInt(x.getAttribute('data-time'), 10) === 0);
    });
    $all('.chip', $('#listenChips')).forEach(function (x) {
      x.classList.toggle('active', parseInt(x.getAttribute('data-listen'), 10) === 0);
    });
    $('#customCount').value = '';
    $('#weakField').hidden = (setupMode !== 'wrong');
    var wf = $('#weakFirst'); if (wf) wf.checked = false;
    renderCatChips();
    renderSetChips();
    showView('setup');
  }

  /* ---------------- 练习引擎 ---------------- */
  function activeFavIds() {
    return Object.keys(state.favorites).filter(function (id) {
      return state.favorites[id] && state.bank.some(function (q) { return q.id === id; });
    });
  }

  function startPractice(opts) {
    var sampled;

    if (opts.mode === 'replay') {
      // 重刷本次错题：直接使用上一练习轮次的错题列表（题目对象引用，仍指向 state.bank）
      sampled = (opts.questions || []).slice();
      if (!sampled.length) { toast('没有可重刷的错题', 'bad'); return; }
    } else if (opts.mode === 'composed') {
      // 「随机出题」：10 道音乐常识 + 10 道基本乐理 + 15 道听力，各自随机抽，再整体打乱顺序
      var COMPOSED_SPEC = [
        { cat: '音乐常识', n: 10 },
        { cat: '基本乐理', n: 10 },
        { cat: '听力',     n: 15 }
      ];
      var tmp = [];
      COMPOSED_SPEC.forEach(function (spec) {
        var cpool = state.bank.filter(function (q) { return q.category === spec.cat; });
        if (myOnly) cpool = cpool.filter(isCustomQuestion);
        var take = Math.min(spec.n, cpool.length);
        tmp = tmp.concat(shuffle(cpool).slice(0, take));
      });
      sampled = shuffle(tmp);
      if (!sampled.length) { toast('题库暂无题目', 'bad'); return; }
    } else {
      var pool;
      if (opts.mode === 'wrong') {
        var ids = activeWrongIds();
        pool = state.bank.filter(function (q) { return ids.indexOf(q.id) >= 0; });
      } else if (opts.mode === 'fav') {
        var fids = activeFavIds();
        pool = state.bank.filter(function (q) { return fids.indexOf(q.id) >= 0; });
      } else {
        pool = state.bank.slice();
      }
      if (opts.category && opts.category !== '全部') {
        pool = pool.filter(function (q) { return q.category === opts.category; });
      }
      if (opts.set && opts.set !== '全部') {
        pool = pool.filter(function (q) { return (q.set || '第一套') === opts.set; });
      }
      if (myOnly) {
        // 「只看我的题」开启时，练习也只抽用户自定义题（不含官方/示例预置）
        pool = pool.filter(isCustomQuestion);
      }
      if (!pool.length) {
        var msg = opts.mode === 'wrong' ? '暂无符合条件的错题' : (opts.mode === 'fav' ? '收藏夹为空' : '该分类下暂无题目');
        toast(msg, 'bad');
        return;
      }

      var count = (opts.count && opts.count > 0) ? Math.min(opts.count, pool.length) : pool.length;
      if (opts.mode === 'wrong' && opts.weakFirst) {
        // 优先薄弱点：按错误次数降序取前 count 道
        pool.sort(function (a, b) {
          var ca = (state.wrong[a.id] && state.wrong[a.id].count) || 0;
          var cb = (state.wrong[b.id] && state.wrong[b.id].count) || 0;
          return cb - ca;
        });
        sampled = pool.slice(0, count);
      } else {
        sampled = shuffle(pool).slice(0, count);
      }
    }

    session = {
      mode: opts.mode,
      questions: sampled,
      idx: 0,
      selected: null,
      answered: false,
      correctCount: 0,
      results: [],
      timeLimit: opts.timeLimit || 0,
      listenTime: opts.listenTime || 0,
      listenStarted: false,
      timerId: null,
      remaining: opts.timeLimit || 0
    };
    showView('practice');
    renderQuestion();
  }

  // 选项文字：以图代文——若选项含图片，图片即内容，不再显示冗余文字
  function optText(q, i) {
    if (q.optionImages && q.optionImages[i]) return '';
    var t = (q.options && q.options[i]) || '';
    return t || '';
  }

  // 题目内嵌图片标记：[[图N]]（N 为 1-based，对应 questionImages 下标 N-1）
  var INLINE_IMG_RE = /\[\[图(\d+)\]\]/g;
  // 将题目文字渲染为 DOM：文字段 + 内联 <img>。getImg(idx) 返回 dataURL 字符串或 Promise<dataURL> 或 null
  // ⚠️ 关键：img/val 必须用 const/let 块级作用域；不能用 var（否则 .then 闭包陷阱，多张图异步加载时 src 全设到最后一张上）
  function renderInlineText(container, text, getImg) {
    container.innerHTML = '';
    const re = new RegExp(INLINE_IMG_RE);
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
      const idx = parseInt(m[1], 10) - 1;
      const img = document.createElement('img');
      img.className = 'q-inline-img';
      img.alt = '题目内嵌图片';
      // 兜底：取不到有效图源时隐藏，避免出现破碎图标；异步加载失败同样隐藏
      img.onerror = function () { img.style.display = 'none'; };
      img.style.display = 'none';
      container.appendChild(img);
      const val = getImg ? getImg(idx) : null;
      if (val && typeof val.then === 'function') {
        // IIFE 隔离：把当前 img 立即捕获到独立作用域，防止多图异步回调闭包串改
        (function (curImg) {
          val.then(function (v) { if (v) { curImg.src = v; curImg.style.display = ''; } })
             .catch(function () { curImg.style.display = 'none'; });
        })(img);
      } else if (val) {
        img.src = val; img.style.display = '';
      }
      last = re.lastIndex;
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  }
  // 去掉内嵌图片标记，得到纯文字（用于列表/错题本展示）
  function plainQuestion(q) {
    return String(q.question || '').replace(INLINE_IMG_RE, '').replace(/\s+/g, ' ').trim();
  }

  function renderQuestion() {
    var q = session.questions[session.idx];
    var total = session.questions.length;
    $('#qCat').textContent = q.category;
    $('#qDiff').textContent = q.difficulty;
    $('#qIndex').textContent = 'Q' + (session.idx + 1);
    // 题目文字 + 内嵌图片（inline）
    renderInlineText($('#qText'), q.question, function (idx) {
      var im = (q.questionImages || [])[idx];
      if (!im) return null;
      if (im.mediaId) return getMediaValue(im.mediaId).then(function (v) { return v ? mediaUrl(v) : null; });
      return im.data || null;
    });
    // 兼容旧版独立图片：内嵌到题目末尾
    if (q.imageMediaId || q.imageData) {
      var leg = document.createElement('img');
      leg.className = 'q-inline-img';
      leg.alt = '题目图片';
      leg.style.display = 'none';
      leg.onerror = function () { leg.style.display = 'none'; };
      $('#qText').appendChild(leg);
      var lp = q.imageMediaId ? getMediaValue(q.imageMediaId).then(function (v) { return v ? mediaUrl(v) : null; }) : Promise.resolve(q.imageData);
      lp.then(function (v) { if (v) { leg.src = v; leg.style.display = ''; } }).catch(function () { leg.style.display = 'none'; });
    }

    // 题目媒体（音频）
    revokeMediaUrls();
    var qMedia = $('#qMedia'), qAudioWrap = $('#qAudioWrap'), qAudio = $('#qAudio');
    qMedia.hidden = true;
    qAudioWrap.hidden = true; try { qAudio.pause(); } catch (e) {} qAudio.removeAttribute('src');
    qAudio.volume = 1; // 保留用户设置的响度滑块值，跨题不重置
    var hasAud = (MediaStore.available() && q.audioMediaId) || q.audioData;
    // 音频按钮仅对「听力」类开放；音乐常识 / 基本乐理即使带音频也隐藏
    var isListen = q.category === '听力';
    if (isListen && (q.audioMediaId || q.audioData)) {
      var audioReady = q.audioData
        ? Promise.resolve(q.audioData)
        : getMediaValue(q.audioMediaId);
      audioReady.then(function (val) {
        if (!val) return;
        setAudioSrc(qAudio, val).then(function () {
          qAudioWrap.hidden = false; qMedia.hidden = false;
        });
      }).catch(function () {});
    }

    var optBox = $('#options');
    optBox.innerHTML = '';
    var optImgs = q.optionImages || [];
    q.options.forEach(function (text, i) {
      var b = document.createElement('button');
      b.className = 'option';
      b.setAttribute('data-i', i);
      var inner = '<span class="opt-key">' + String.fromCharCode(65 + i) + '</span>';
      var im = optImgs[i];
      var hasImg = !!im;
      if (hasImg) {
        // 以图代文：有图片的选项不再渲染文字（图片本身即选项内容）
        inner += '<span class="opt-img"><img alt="选项图片" class="opt-img-el" /></span>';
      } else {
        inner += '<span class="opt-txt"></span>';
      }
      b.innerHTML = inner;
      if (text && !hasImg) b.querySelector('.opt-txt').textContent = text;
      if (hasImg) {
        var imEl = b.querySelector('.opt-img-el');
        var src = (typeof im === 'string') ? im : (im.data || null);
        if (src) { imEl.src = src; }
        else if (im.mediaId && MediaStore.available()) {
          getMediaValue(im.mediaId).then(function (v) { if (v) imEl.src = mediaUrl(v); }).catch(function () {});
        }
      }
      b.addEventListener('click', function () { selectOption(i); });
      optBox.appendChild(b);
    });

    $('#explain').hidden = true;
    $('#submitBtn').hidden = false;
    $('#nextBtn').hidden = true;
    session.selected = null;
    session.answered = false;

    // 收藏 / 笔记 状态
    var favBtn = $('#favBtn');
    favBtn.classList.toggle('active', !!state.favorites[q.id]);
    var noteBtn = $('#noteBtn');
    var noteArea = $('#noteArea');
    var noteInput = $('#noteInput');
    noteArea.hidden = true;
    noteInput.value = '';
    noteBtn.classList.remove('active');
    if (state.notes[q.id]) { noteBtn.classList.add('active'); }

    // 计时
    var isListening = (q.category === '听力') && hasAud;
    var timerEl = $('#qTimer');
    var hintEl = $('#qTimerHint');
    if (isListening && session.listenTime > 0) {
      // 听力计时：播放音频后才开始倒计时
      timerEl.hidden = false;
      timerEl.classList.add('pending');
      timerEl.classList.remove('warn');
      $('#qTimerNum').textContent = session.listenTime + 's';
      $('#qTimerFill').style.width = '100%';
      hintEl.hidden = false;
      hintEl.textContent = '▶ 播放音频后开始计时';
      session.listenStarted = false;
      session.remaining = session.listenTime;
    } else if (session.timeLimit > 0) {
      startTimer();
    } else {
      timerEl.hidden = true;
      timerEl.classList.remove('pending');
      hintEl.hidden = true;
    }

    updateProgress();
  }

  function startTimer(limit) {
    stopTimer();
    var dur = (typeof limit === 'number' && limit > 0) ? limit : (session.timeLimit || 0);
    if (dur <= 0) { $('#qTimer').hidden = true; return; }
    session.remaining = dur;
    session.timerDur = dur;
    var timerEl = $('#qTimer');
    var numEl = $('#qTimerNum');
    var fillEl = $('#qTimerFill');
    timerEl.hidden = false;
    timerEl.classList.remove('warn', 'pending');
    $('#qTimerHint').hidden = true;
    numEl.textContent = dur + 's';
    fillEl.style.width = '100%';
    session.timerId = setInterval(function () {
      session.remaining--;
      numEl.textContent = Math.max(0, session.remaining) + 's';
      var pct = session.timerDur ? (session.remaining / session.timerDur * 100) : 0;
      fillEl.style.width = Math.max(0, pct) + '%';
      if (session.remaining <= Math.ceil(session.timerDur / 3)) timerEl.classList.add('warn');
      if (session.remaining <= 0) {
        stopTimer();
        if (!session.answered) { toast('时间到！', 'bad'); submitAnswer(true); }
      }
    }, 1000);
  }
  function stopTimer() {
    if (session && session.timerId) { clearInterval(session.timerId); session.timerId = null; }
  }

  function selectOption(i) {
    if (session.answered) return;
    session.selected = i;
    $all('.option').forEach(function (o) {
      o.classList.toggle('selected', parseInt(o.getAttribute('data-i'), 10) === i);
    });
  }

  function updateProgress() {
    var total = session.questions.length;
    $('#progLabel').textContent = '第 ' + (session.idx + 1) + ' / ' + total + ' 题';
    $('#progScore').textContent = '正确 ' + session.correctCount;
    $('#progFill').style.width = ((session.idx) / total * 100) + '%';
  }

  function submitAnswer(forced) {
    if (session.answered) return;
    if (session.selected === null && !forced) { toast('请先选择一个答案', 'bad'); return; }
    stopTimer();
    // 清除听力计时待机态
    var tEl = $('#qTimer');
    if (tEl) { tEl.classList.remove('pending'); }
    var hEl = $('#qTimerHint');
    if (hEl) { hEl.hidden = true; }
    session.answered = true;
    var q = session.questions[session.idx];
    var userAns = (session.selected === null) ? -1 : session.selected;
    var correct = (userAns === q.answer);

    $all('.option').forEach(function (o) {
      var i = parseInt(o.getAttribute('data-i'), 10);
      o.classList.add('locked');
      if (i === q.answer) o.classList.add('correct');
      else if (i === userAns) o.classList.add('wrong');
    });

    var ex = $('#explain');
    ex.hidden = false;
    var badge = $('#explainBadge');
    badge.textContent = correct ? '回答正确' : '回答错误';
    badge.style.background = correct ? 'var(--ok-soft)' : 'var(--bad-soft)';
    badge.style.color = correct ? 'var(--ok)' : 'var(--bad)';
    $('#explainTitle').textContent = '正确答案：' + String.fromCharCode(65 + q.answer) + '. ' + optText(q, q.answer);
    $('#explainText').textContent = q.explanation || '（暂无解析）';

    if (correct) {
      session.correctCount++;
      if (hasWrong(q.id)) {
        markMastered(q.id);
        if (session.mode === 'wrong') toast('已掌握，移出错题本', 'ok');
      }
    } else {
      addWrong(q.id);
    }

    state.stats.done++;
    saveStats();
    session.results.push({ q: q, userAns: userAns, correct: correct });

    updateProgress();
    $('#progFill').style.width = ((session.idx + 1) / session.questions.length * 100) + '%';
    $('#submitBtn').hidden = true;
    $('#nextBtn').hidden = false;
  }

  function nextQuestion() {
    stopTimer();
    if (session.idx + 1 < session.questions.length) {
      session.idx++;
      renderQuestion();
    } else {
      showResult();
    }
  }

  /* ---------------- 结果 ---------------- */
  function showResult() {
    var total = session.questions.length;
    var correct = session.correctCount;
    var acc = total ? Math.round(correct / total * 100) : 0;
    state.history.push({ ts: Date.now(), mode: session.mode, total: total, correct: correct, accuracy: acc });
    if (state.history.length > 100) state.history = state.history.slice(-100);
    saveHistory();
    var ring = $('#scoreRing');
    ring.style.setProperty('--p', acc);
    $('#scoreNum').textContent = acc + '%';
    $('#rTotal').textContent = total;
    $('#rCorrect').textContent = correct;
    $('#rWrong').textContent = total - correct;

    var wrongs = session.results.filter(function (r) { return !r.correct; });
    // 收集本轮错题，供「重刷本次错题」使用（题目对象引用，重刷时仍指向题库原题）
    lastSessionWrong = wrongs.map(function (r) { return r.q; });
    var replayBtn = $('#replayWrongBtn');
    if (replayBtn) {
      if (wrongs.length) {
        replayBtn.hidden = false;
        replayBtn.textContent = '重刷本次错题（' + wrongs.length + '）';
      } else {
        replayBtn.hidden = true;
      }
    }
    var reviewCard = $('#reviewCard');
    if (wrongs.length) {
      var list = $('#reviewList');
      list.innerHTML = '';
      wrongs.forEach(function (r) {
        var d = document.createElement('div');
        d.className = 'review-item';
        d.innerHTML = '<div class="rq"></div><div class="ra"></div><div class="ry"></div>';
        d.querySelector('.rq').textContent = r.q.question;
        d.querySelector('.ra').textContent = '你的答案：' + (r.userAns != null ? optText(r.q, r.userAns) : '未作答');
        d.querySelector('.ry').textContent = '正确答案：' + optText(r.q, r.q.answer);
        list.appendChild(d);
      });
      reviewCard.hidden = false;
    } else {
      reviewCard.hidden = true;
    }
    showView('result');
  }

  /* ---------------- 错题本 ---------------- */
  function renderWrong() {
    var ids = activeWrongIds();
    $('#wrongCount').textContent = ids.length;
    $('#masteredCount').textContent = masteredCount();
    var list = $('#wrongList');
    var empty = $('#wrongEmpty');
    list.innerHTML = '';
    if (!ids.length) { empty.hidden = false; list.hidden = true; return; }
    empty.hidden = true; list.hidden = false;

    ids.sort(function (a, b) { return (state.wrong[b].last || 0) - (state.wrong[a].last || 0); });
    ids.forEach(function (id, idx) {
      var q = state.bank.filter(function (x) { return x.id === id; })[0];
      if (!q) return;
      var w = state.wrong[id];
      var item = document.createElement('div');
      item.className = 'wrong-item';
      item.innerHTML =
        '<div class="wi-main">' +
          '<div class="wi-q"></div>' +
          '<div class="wi-meta"><span class="wi-cat"></span><span class="wi-err"></span><span class="wi-ans"></span></div>' +
        '</div>' +
        '<div class="wi-actions">' +
          '<button class="mini-btn ok" data-act="master">标记掌握</button>' +
          '<button class="mini-btn bad" data-act="remove">移除</button>' +
        '</div>';
      item.querySelector('.wi-q').textContent = plainQuestion(q);
      item.querySelector('.wi-cat').textContent = q.category;
      item.querySelector('.wi-err').textContent = '错 ' + w.count + ' 次';
      var ansTxt = optText(q, q.answer);
      item.querySelector('.wi-ans').textContent = '正确：' + String.fromCharCode(65 + q.answer) + (ansTxt ? (' ' + ansTxt) : '');
      item.querySelector('[data-act="master"]').addEventListener('click', function () {
        markMastered(id); toast('已标记为掌握', 'ok'); renderWrong();
      });
      item.querySelector('[data-act="remove"]').addEventListener('click', function () {
        delete state.wrong[id]; saveWrong(); toast('已移除'); renderWrong();
      });
      list.appendChild(item);
    });
  }

  /* ---------------- 练习记录 / 正确率趋势 ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildTrendChart(data) {
    if (!data.length) return '';
    var W = 680, H = 240, padL = 46, padR = 16, padT = 20, padB = 34;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = data.length;
    var stepX = innerW / (n - 1 || 1);
    var pts = data.map(function (r, i) {
      var x = padL + (n === 1 ? innerW / 2 : i * stepX);
      var y = padT + innerH * (1 - r.accuracy / 100);
      return { x: x, y: y };
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var base = padT + innerH;
    var area = 'M' + pts[0].x.toFixed(1) + ' ' + base +
      pts.map(function (p) { return 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join('') +
      'L' + pts[pts.length - 1].x.toFixed(1) + ' ' + base + ' Z';
    var grid = '';
    [0, 50, 100].forEach(function (g) {
      var y = padT + innerH * (1 - g / 100);
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="currentColor" stroke-opacity="0.14" stroke-width="1"/>';
      grid += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="currentColor" fill-opacity="0.55" font-size="12">' + g + '%</text>';
    });
    var dots = pts.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="currentColor"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="color:var(--accent)" role="img" aria-label="正确率趋势图">' +
      '<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="currentColor" stop-opacity="0.28"/>' +
      '<stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#trendFill)"/>' +
      '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + '</svg>';
  }

  function renderHistory() {
    var list = state.history;
    $('#histCount').textContent = list.length;
    var chartEl = $('#trendChart');
    var listEl = $('#histList');
    var empty = $('#histEmpty');
    var card = $('#histCard');
    if (!list.length) {
      chartEl.innerHTML = '<div class="chart-empty">完成一次练习后，这里会显示你的正确率趋势。</div>';
      listEl.innerHTML = '';
      card.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true; card.hidden = false;
    chartEl.innerHTML = buildTrendChart(list.slice(-20));
    listEl.innerHTML = '';
    list.slice().reverse().slice(0, 30).forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'hist-item';
      var modeName = r.mode === 'wrong' ? '错题专项'
        : (r.mode === 'fav' ? '收藏练习'
        : (r.mode === 'composed' ? '随机组卷'
        : (r.mode === 'replay' ? '重刷错题' : '随机刷题')));
      var dt = new Date(r.ts);
      var dateStr = (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' +
        ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
      d.innerHTML = '<span class="hi-acc"></span><span class="hi-meta"></span><span class="hi-mode"></span>';
      d.querySelector('.hi-acc').textContent = r.accuracy + '%';
      d.querySelector('.hi-meta').textContent = dateStr + ' · 答对 ' + r.correct + '/' + r.total;
      d.querySelector('.hi-mode').textContent = modeName;
      listEl.appendChild(d);
    });
  }

  /* ---------------- 收藏夹 ---------------- */
  function renderFavorites() {
    var ids = activeFavIds();
    $('#favCount').textContent = ids.length;
    var list = $('#favList');
    var empty = $('#favEmpty');
    list.innerHTML = '';
    if (!ids.length) { empty.hidden = false; list.hidden = true; return; }
    empty.hidden = true; list.hidden = false;
    ids.forEach(function (id) {
      var q = state.bank.filter(function (x) { return x.id === id; })[0];
      if (!q) return;
      var item = document.createElement('div');
      item.className = 'wrong-item';
      var hasNote = !!state.notes[id];
      item.innerHTML =
        '<div class="wi-main">' +
          '<div class="wi-q"></div>' +
          '<div class="wi-meta"><span class="wi-cat"></span>' + (hasNote ? '<span class="wi-hasnote">有笔记</span>' : '') + '</div>' +
          (hasNote ? '<div class="wi-note">' + escapeHtml(state.notes[id]) + '</div>' : '') +
        '</div>' +
        '<div class="wi-actions">' +
          '<button class="mini-btn bad" data-act="unfav">取消收藏</button>' +
        '</div>';
      item.querySelector('.wi-q').textContent = plainQuestion(q);
      item.querySelector('.wi-cat').textContent = q.category;
      item.querySelector('[data-act="unfav"]').addEventListener('click', function () {
        delete state.favorites[id]; saveFav(); toast('已取消收藏'); renderFavorites();
      });
      list.appendChild(item);
    });
  }

  /* ---------------- 导入 / 导出 ---------------- */
  function parseImport(text) {
    text = (text || '').trim();
    if (!text) return { ok: false, msg: '内容为空' };
    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) { /* 尝试 CSV */ }

    var arr = [];
    if (parsed) {
      if (Array.isArray(parsed)) arr = parsed;
      else if (Array.isArray(parsed.questions)) arr = parsed.questions;
      else if (Array.isArray(parsed.data)) arr = parsed.data;
      else return { ok: false, msg: 'JSON 格式应是题目数组' };
    } else {
      arr = parseCSV(text);
      if (!arr) return { ok: false, msg: '无法解析，请检查 CSV 格式' };
    }

    var valid = [];
    arr.forEach(function (o) {
      if (!o || typeof o !== 'object') return;
      var q = normText(o.question);
      var opts = Array.isArray(o.options) ? o.options : (typeof o.options === 'string' ? o.options.split('|') : null);
      // 检测「以图代文」题：options 全空但题干/选项有图——这种题必须保留（题库里多套题用了此模式）
      var hasInlineImg = (Array.isArray(o.questionImages) && o.questionImages.length) ||
                         (Array.isArray(o.optionImages) && o.optionImages.length) ||
                         o.imageMediaId || o.imageData;
      if (!q || !opts || opts.length < 2) {
        if (!(hasInlineImg && q)) return;
        // 以图代文占位：补 3 个「图X」占位选项让 UI 能渲染（实际显示由 questionImages/optionImages 提供）
        var placeholderN = Math.max(3, (Array.isArray(o.optionImages) ? o.optionImages.length : 0) || 3);
        opts = [];
        for (var pi = 0; pi < placeholderN; pi++) opts.push('图' + String.fromCharCode(65 + pi));
      }
      opts = opts.map(function (s) { return String(s).trim(); }).filter(function (s) { return s; });
      if (opts.length < 2) {
        if (!(hasInlineImg && q)) return;
        // 占位不足时再补
        var need = 3 - opts.length;
        for (var pi2 = 0; pi2 < need; pi2++) opts.push('图' + String.fromCharCode(65 + opts.length));
      }
      var ans = resolveAnswer(o.answer, opts);
      valid.push({
        id: o.id || genId(q),
        question: String(o.question).trim(),
        options: opts,
        answer: ans,
        explanation: o.explanation ? String(o.explanation).trim() : '',
        category: o.category ? String(o.category).trim() : '未分类',
        difficulty: o.difficulty ? String(o.difficulty).trim() : '简单',
        level: o.level ? String(o.level).trim() : '乐理二级',
        set: o.set ? String(o.set).trim() : '第一套',
        imageMediaId: o.imageMediaId || null,
        imageData: o.imageData || null,
        questionImages: Array.isArray(o.questionImages) ? o.questionImages.map(function (im) { return { mediaId: im.mediaId || null, data: im.data || null }; }) : [],
        audioMediaId: o.audioMediaId || null,
        audioData: o.audioData || null,
        optionImages: Array.isArray(o.optionImages) ? o.optionImages.map(function (oi) {
          if (!oi) return null;
          // 兼容两种存储格式：
          //  - 旧版/导入时直接内嵌的 base64 字符串："data:image/png;base64,..."
          //  - 规范对象：{ mediaId, data }
          // 之前此处对字符串取到 oi.mediaId/oi.data 均为 undefined，会丢失图片数据 → 选项空白
          if (typeof oi === 'string') return { mediaId: null, data: oi };
          return { mediaId: oi.mediaId || null, data: oi.data || null };
        }) : null
      });
    });

    if (!valid.length) return { ok: false, msg: '未找到有效题目' };

    var before = state.bank.length;
    var byKey = {}, byId = {};
    state.bank.forEach(function (q) { byKey[normText(q.question)] = q; if (q.id) byId[q.id] = q; });
    var added = 0, updated = 0;
    valid.forEach(function (q) {
      var key = normText(q.question);
      // 优先按业务 id 匹配（官方题 id 稳定），其次按归一化题干匹配：
      // 避免本地已归一化的题面（如 1/2→½）与原始导入文本对不上而被当成「新题」整批追加成重复副本
      var ex = (q.id && byId[q.id]) || byKey[key];
      if (ex) {
        // 合并更新：以导入版本为准，保留原 id，补全媒体字段
        ex.question = q.question;
        ex.options = q.options;
        ex.answer = q.answer;
        ex.explanation = q.explanation;
        ex.category = q.category;
        ex.difficulty = q.difficulty;
        ex.level = q.level || '乐理二级';
        ex.set = q.set || '第一套';
        if (q.imageMediaId || q.imageData) { ex.imageMediaId = q.imageMediaId || null; ex.imageData = q.imageData || null; }
        if (q.questionImages && q.questionImages.length) { ex.questionImages = q.questionImages; }
        if (q.optionImages) { ex.optionImages = q.optionImages; }
        if (q.audioMediaId || q.audioData) { ex.audioMediaId = q.audioMediaId || null; ex.audioData = q.audioData || null; }
        updated++;
      } else {
        ensureUid(q);
        state.bank.push(q);
        added++;
      }
      byKey[key] = ex || q;
      if (q.id) byId[q.id] = ex || q;
    });
    saveBank();
    var tail = updated ? '，更新 ' + updated + ' 道' : '';
    return {
      ok: true,
      questions: valid,
      msg: '成功导入 ' + added + ' 道新题' + tail + '（去重后共 ' + state.bank.length + ' 道）',
      added: added,
      media: parsed && parsed._media ? parsed._media : null
    };
  }

  // CSV 解析（独立函数，供 parseImport 调用）
  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return null;
    // 跳过表头
    if (/question\s*,\s*options/i.test(lines[0])) lines = lines.slice(1);
    var out = [];
    lines.forEach(function (line) {
      var parts = line.split(',');
      if (parts.length < 3) return;
      var question = parts[0].trim();
      var options = parts[1].split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      var answer = parts[2].trim();
      var explanation = '', category = '未分类', difficulty = '简单';
      if (parts.length >= 5) {
        difficulty = parts[parts.length - 1].trim();
        category = parts[parts.length - 2].trim();
        explanation = parts.slice(3, parts.length - 2).join(',').trim();
      } else if (parts.length === 4) {
        explanation = parts[3].trim();
      }
      out.push({ question: question, options: options, answer: answer, explanation: explanation, category: category, difficulty: difficulty });
    });
    return out.length ? out : null;
  }

  function exportBank() {
    var mediaIds = {};
    // 导出只内联「图片类」媒体：音频走部署目录 media/ 外链按需加载，不再内联，避免导出文件膨胀到 10MB 卡死
    state.bank.forEach(function (q) {
      if (q.imageMediaId) mediaIds[q.imageMediaId] = 1;
      if (q.questionImages) q.questionImages.forEach(function (im) { if (im && im.mediaId) mediaIds[im.mediaId] = 1; });
      if (q.optionImages) q.optionImages.forEach(function (oi) { if (oi && oi.mediaId) mediaIds[oi.mediaId] = 1; });
    });
    var finish = function (media) {
      var payload = { _media: media || {}, questions: state.bank };
      var data = JSON.stringify(payload, null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'tihai-bank-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('已导出 ' + state.bank.length + ' 道题', 'ok');
    };
    if (MediaStore.available()) {
      MediaStore.all().then(function (all) {
        var media = {};
        Object.keys(mediaIds).forEach(function (id) {
          var v = all[id];
          if (!v) return;
          media[id] = (typeof v === 'string') ? Promise.resolve(v) : blobToDataURL(v);
        });
        Promise.all(Object.keys(media).map(function (k) { return media[k]; })).then(function (vals) {
          var out = {}; Object.keys(media).forEach(function (k, i) { out[k] = vals[i]; });
          finish(out);
        });
      }).catch(function () { finish({}); });
    } else {
      finish({});
    }
  }

  function initImport() {
    function handleImport(text) {
      var res;
      try { res = parseImport(text); }
      catch (e) { res = { ok: false, msg: '解析出错：' + (e && e.message ? e.message : e) }; }
      var msg = $('#importMsg');
      if (!res || !res.ok) {
        msg.className = 'import-msg bad';
        msg.textContent = (res && res.msg) || '导入失败';
        return;
      }
      // 题目已同步写入 state.bank，立即刷新列表（不被媒体还原阻塞）
      renderDashboard();
      renderBankList();
      $('#importText').value = '';
      if ($('#fileInput')) $('#fileInput').value = '';
      msg.className = 'import-msg ok';
      msg.textContent = res.msg + (res.media ? '（题目已导入，媒体后台还原中…）' : '');
      // 后台还原媒体（图片/音频），失败不影响题目显示
      if (res.media && MediaStore.available()) {
        MediaStore.putAll(res.media).then(function () {
          msg.textContent = res.msg + '（媒体已还原）';
        }).catch(function () {
          msg.textContent = res.msg + '（题目已导入，但部分媒体还原失败，可重导该套补全）';
        });
      }
    }
    $('#importBtn').addEventListener('click', function () { handleImport($('#importText').value); });
    $('#fileInput').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { handleImport(String(reader.result)); };
      reader.readAsText(file);
    });
    var drop = $('#fileDrop');
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) {
      var file = e.dataTransfer.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { handleImport(String(reader.result)); };
      reader.readAsText(file);
    });

    $('#exportBtn').addEventListener('click', exportBank);
    $('#syncExportBtn').addEventListener('click', function () {
      exportBank();
      var m = $('#syncMsg');
      if (m) {
        m.className = 'import-msg ok';
        m.textContent = '已生成含图片的备份文件。请把下载的 tihai-bank-日期.json 通过聊天发给我，我合并进服务器后，你的题目和图片会在任意网址 / 设备自动加载、不再丢失。';
      }
    });
    $('#recompressBtn').addEventListener('click', function () {
      var m = $('#recompressMsg'); if (m) { m.className = 'import-msg'; m.textContent = '压缩中…'; }
      recompressAllMedia().then(function () { if (m) { m.className = 'import-msg ok'; m.textContent = '完成。手机端刷新页面后图片即可正常显示。'; } });
    });
    $('#resetBankBtn').addEventListener('click', function () {
      confirmDialog('恢复为内置示例题库？当前自定义题目将被覆盖（错题保留）。').then(function (ok) {
        if (!ok) return;
        state.bank = buildSampleBank();
        saveBank();
        renderDashboard();
        toast('已恢复示例题库', 'ok');
      });
    });

    $('#clearBankBtn').addEventListener('click', function () {
      if (!state.bank.length) { toast('题库已是空的', 'ok'); return; }
      confirmDialog('确定清空全部题库？共 ' + state.bank.length + ' 道题将被删除，且不可恢复（错题本与收藏不受影响）。').then(function (ok) {
        if (!ok) return;
        state.bank = [];
        saveBank();
        renderDashboard();
        renderBankList();
        if (MediaStore.available()) MediaStore.clear();
        toast('题库已清空', 'ok');
      });
    });

    $('#syncOfficialBtn').addEventListener('click', function () {
      var warn = (state.bank.length && !isSampleBank()) ? '将用官方题库（set1.json）替换当前题库，你自定义的题会丢失。继续？' : '将从官方题库（set1.json）载入最新题目，继续？';
      confirmDialog(warn).then(function (ok) {
        if (!ok) return;
        syncOfficialBank(false, true);
      });
    });

    $all('.fmt-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        $all('.fmt-tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var fmt = t.getAttribute('data-fmt');
        $('#fmtJson').hidden = fmt !== 'json';
        $('#fmtCsv').hidden = fmt !== 'csv';
      });
    });
  }

  /* ---------------- 可视化录入编辑器 ---------------- */
  function initEditor() {
    var edCat = '音乐常识', edAns = 0, audioFile = null, audUrl = null;
    var edLevel = '乐理二级', edSet = '第一套';
    var editingId = null;
    var optImgData = [null, null, null, null]; // 各选项图片（data URL），与 options 对齐
    var pendingOptIdx = 0; // 当前正在选图的目标选项序号
    var origAud = { id: null, data: null, removed: false };
    var qInlineImgs = []; // 题目内嵌图片：[{ data, mediaId }]
    var origExp = '';

    $('#edCats').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      edCat = c.getAttribute('data-cat');
      $('#edAudioField').hidden = (edCat !== '听力');
      if (edCat !== '听力') {
        audioFile = null;
        if (audUrl) { URL.revokeObjectURL(audUrl); audUrl = null; }
        $('#edAudioPreview').removeAttribute('src'); $('#edAudioPreview').hidden = true;
        $('#edAudioInput').value = '';
        $('#edAudioClear').hidden = true;
        origAud = { id: null, data: null, removed: true };
      }
    });

    // 防御：旧版 HTML 可能不含 edLevels/edSets 容器，缺失时跳过绑定而非让 initEditor 崩溃
    // （一旦崩溃，后续 #bankList 委托与 initEvents 都不执行，题库页所有按钮会集体失灵）
    var elLevels = $('#edLevels');
    if (elLevels) elLevels.addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      edLevel = c.getAttribute('data-level');
    });
    var elSets = $('#edSets');
    if (elSets) elSets.addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      edSet = c.getAttribute('data-set');
    });

    $('#edAnswer').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $all('.chip', this).forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      edAns = parseInt(c.getAttribute('data-ans'), 10);
    });

    // -------- 题目内嵌图片：插入 / 粘贴 / 预览 --------
    function updateQPreview() {
      var box = $('#edQPreview'), ta = $('#edQuestion'), txt = ta.value;
      if (!txt && qInlineImgs.length === 0) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      renderInlineText(box, txt, function (idx) {
        var im = qInlineImgs[idx];
        if (!im) return null;
        if (im.data) return im.data;
        if (im.mediaId && MediaStore.available()) return MediaStore.get(im.mediaId).then(function (v) { return v || null; });
        return null;
      });
    }
    function insertInlineImage(file) {
      if (!file) return;
      var ta = $('#edQuestion');
      var start = ta.selectionStart || 0, end = ta.selectionEnd || 0;
      // 关键：编号同步分配（先占位置再异步填图），避免两张图快速粘贴时异步顺序错乱导致
      // 编号与数组错位、出现编号缺口，进而渲染取到 undefined 变成破碎图。
      var n = qInlineImgs.length + 1; // 1-based，插入前即确定，插入后数组长度必然 == n
      var token = '[[图' + n + ']]';
      var entry = { data: null, mediaId: null, pending: true };
      qInlineImgs.push(entry);
      ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
      ta.focus();
      try { ta.setSelectionRange(start + token.length, start + token.length); } catch (e) {}
      updateQPreview();
      processImageFile(file).then(function (dataUrl) {
        entry.data = dataUrl;
        entry.pending = false;
        // 同步把图片落库到 IndexedDB（MediaStore），localStorage 只留 mediaId 引用，避免 base64 撑爆本地存储导致整段保存丢失
        if (MediaStore.available()) {
          var mid = genId('qimg' + Date.now() + Math.random().toString(36).slice(2, 6));
          MediaStore.put(mid, dataUrl).then(function () { entry.mediaId = mid; }).catch(function () { /* 保留 data 兜底 */ });
        }
        updateQPreview();
      }).catch(function () {
        // 读取失败：按引用移除这条占位（避免 pop 误删后插入的图），并从文本清掉对应标记
        var i = qInlineImgs.indexOf(entry);
        if (i >= 0) qInlineImgs.splice(i, 1);
        renumberInlineTokens();
        updateQPreview();
        toast('图片读取失败，请重试', 'bad');
      });
    }
    // 把文本中所有 [[图N]] 按出现顺序重排为连续 1..K，与 qInlineImgs 顺序严格对齐。
    // 彻底消除“编号有缺口 / 错位”导致的破碎图（删除图片、粘贴失败回滚、载入旧题都会触发）。
    function renumberInlineTokens() {
      var ta = $('#edQuestion');
      var txt = ta.value;
      var parts = txt.split(/(\[\[图\d+\]\])/g);
      var imgIdx = 0;
      var out = parts.map(function (p) {
        var mm = /^\[\[图(\d+)\]\]$/.exec(p);
        if (mm) {
          if (imgIdx < qInlineImgs.length) { imgIdx++; return '[[图' + imgIdx + ']]'; }
          return ''; // 多余的标记（无对应图）直接删除
        }
        return p;
      }).join('');
      ta.value = out;
    }
    $('#edInlineImgBtn').addEventListener('click', function () { $('#edInlineImgInput').value = ''; $('#edInlineImgInput').click(); });
    $('#edInlineImgInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (f) insertInlineImage(f);
    });
    // 在题目文字框内 Ctrl+V 直接粘贴图片并内嵌
    $('#edQuestion').addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var k = 0; k < items.length; k++) {
        if (items[k].type && items[k].type.indexOf('image') === 0) {
          var f = items[k].getAsFile();
          if (f) { e.preventDefault(); insertInlineImage(f); }
          break;
        }
      }
    });
    // 识别图片文字：将识别结果插入光标处（不再单独挂图）
    $('#edOcrBtn').addEventListener('click', function () { $('#edOcrInput').value = ''; $('#edOcrInput').click(); });
    $('#edOcrInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var st = $('#edOcrStatus'); st.hidden = false; st.className = 'ed-ocr-status'; st.textContent = '识别中… 0%';
      processImageFile(f, 2000, 0.9).then(function (dataUrl) {
        return ocrImage(dataUrl, function (p) { st.textContent = '识别中… ' + Math.round((p || 0) * 100) + '%'; });
      }).then(function (text) {
        if (text && text.trim()) {
          var ta = $('#edQuestion');
          var start = ta.selectionStart || ta.value.length, end = ta.selectionEnd || ta.value.length;
          ta.value = ta.value.slice(0, start) + text.trim() + ta.value.slice(end);
          ta.focus();
          st.textContent = '识别完成 ✓'; st.classList.add('ok');
          updateQPreview();
        } else {
          st.textContent = '未识别到文字，请手动输入'; st.classList.add('bad');
        }
      }).catch(function (err) {
        st.textContent = '识别失败：' + ((err && err.message) ? err.message : '请检查网络后重试');
        st.classList.add('bad');
      });
    });
    $('#edQuestion').addEventListener('input', updateQPreview);

    $('#edAudioInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      audioFile = f;
      if (audUrl) URL.revokeObjectURL(audUrl);
      audUrl = URL.createObjectURL(f);
      var ap = $('#edAudioPreview'); ap.src = audUrl; ap.hidden = false;
      $('#edAudioClear').hidden = false;
    });
    $('#edAudioClear').addEventListener('click', function () {
      audioFile = null;
      if (audUrl) { URL.revokeObjectURL(audUrl); audUrl = null; }
      $('#edAudioPreview').removeAttribute('src'); $('#edAudioPreview').hidden = true;
      $('#edAudioInput').value = ''; $('#edAudioClear').hidden = true;
      origAud = { id: null, data: null, removed: true };
    });

    // 选项图片：粘贴 / 选择 / 移除
    function renderOptPreview(i) {
      var prev = $('#edOptPrev' + i), img = $('#edOptImg' + i);
      var v = optImgData[i];
      if (!v) { img.removeAttribute('src'); prev.hidden = true; return; }
      if (typeof v === 'string') { img.src = v; prev.hidden = false; return; }
      // v: { data, mediaId }（从已有题库载入时）
      if (v.data) { img.src = v.data; prev.hidden = false; }
      else if (v.mediaId && MediaStore.available()) {
        MediaStore.get(v.mediaId).then(function (val) {
          if (val) { img.src = (typeof val === 'string') ? val : URL.createObjectURL(val); prev.hidden = false; }
        }).catch(function () {});
      }
    }
    [0, 1, 2, 3].forEach(function (i) {
      $('#edOptImgBtn' + i).addEventListener('click', function () {
        pendingOptIdx = i; $('#edOptImgInput').value = ''; $('#edOptImgInput').click();
      });
      // 在选项输入框内 Ctrl+V 直接粘贴图片
      $('#edOpt' + i).addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var k = 0; k < items.length; k++) {
          if (items[k].type && items[k].type.indexOf('image') === 0) {
            var f = items[k].getAsFile();
            if (f) { e.preventDefault(); optImgData[i] = ''; processImageFile(f).then(function (d) { optImgData[i] = d; renderOptPreview(i); }); }
            break;
          }
        }
      });
      // 移除图片
      $('#edOptPrev' + i).querySelector('.ed-opt-x').addEventListener('click', function () {
        optImgData[i] = null; renderOptPreview(i);
      });
    });
    $('#edOptImgInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      optImgData[pendingOptIdx] = '';
      processImageFile(f).then(function (d) { optImgData[pendingOptIdx] = d; renderOptPreview(pendingOptIdx); }).catch(function () { optImgData[pendingOptIdx] = null; });
    });

    $('#edSaveBtn').addEventListener('click', function () {
      var q = $('#edQuestion').value.trim();
      var opts = [0, 1, 2, 3].map(function (i) { return $('#edOpt' + i).value.trim(); });
      if (!q) { toast('请填写题目文字', 'bad'); return; }
      var emptyTxt = opts.some(function (o) { return !o; });
      var emptyAll = opts.every(function (o, i) { return !o && !optImgData[i]; });
      if (emptyAll) { toast('请至少填写一个选项的文字或图片', 'bad'); return; }
      if (emptyTxt && opts.some(function (o, i) { return !o && optImgData[i]; })) {
        /* 部分选项仅含图片，允许保存 */
      }
      var msg = $('#edMsg'); msg.className = 'import-msg'; msg.textContent = '保存中…';
      try {
        var qObj = {
          id: editingId || genId(q + edCat), question: q, options: opts, answer: edAns,
          explanation: editingId ? origExp : '', category: edCat, difficulty: '简单',
          level: edLevel, set: edSet,
          imageMediaId: null, imageData: null, audioMediaId: null, audioData: null,
          optionImages: null,
          _uid: editingId ? null : genUid() // 新建题发唯一 _uid；编辑题在下方沿用原 _uid
        };
        var steps = [];
        // 题目内嵌图片：按文字中的 [[图N]] 标记收集，去重并按出现顺序重新编号 1..M
        var inlineMap = {}, inlineImgs = [];
        var tokRe = /\[\[图(\d+)\]\]/g, tm;
        while ((tm = tokRe.exec(q)) !== null) {
          var ii = parseInt(tm[1], 10) - 1;
          if (!qInlineImgs[ii] || inlineMap[ii] != null) continue;
          inlineMap[ii] = inlineImgs.length;
          inlineImgs.push(qInlineImgs[ii]);
        }
        // 将内嵌图片落库到 IndexedDB（MediaStore），localStorage 仅保留极小的 mediaId 引用，
        // 彻底规避「base64 撑爆 localStorage → 保存静默失败 → 刷新后图片/整题丢失」的问题
        inlineImgs.forEach(function (im) {
          if (MediaStore.available() && im.data && !im.mediaId) {
            var mid = genId('qimg' + Date.now() + Math.random().toString(36).slice(2, 6));
            im.mediaId = mid;
            // 仍写入 IndexedDB 作为离线缓存，但【保留内联 data】——移动端可直接渲染，且能随导出/同步流转到任意设备
            steps.push(MediaStore.put(mid, im.data).then(function () { /* 保留内联 data */ }).catch(function () { im.mediaId = null; }));
          }
        });
        qObj.questionImages = inlineImgs.map(function (im) {
          return { mediaId: im.mediaId || null, data: im.data || null };
        });
        qObj.imageMediaId = null; qObj.imageData = null; // 不再使用独立图片字段
        // 选项图片同样落库 IndexedDB：optImgData 可能是 base64 字符串（刚粘贴）或 {data,mediaId}（载入旧题）
        var optImgs = optImgData.map(function (d, i) {
          if (!d) return null;
          var data = (typeof d === 'string') ? d : (d.data || null);
          var mediaId = (typeof d === 'string') ? null : (d.mediaId || null);
          var im = { data: data, mediaId: mediaId };
          if (MediaStore.available() && im.data && !im.mediaId) {
            var mid = genId('oimg' + Date.now() + Math.random().toString(36).slice(2, 6) + i);
            im.mediaId = mid;
            // 保留内联 data（理由同上）
            steps.push(MediaStore.put(mid, im.data).then(function () { /* 保留内联 data */ }).catch(function () { im.mediaId = null; }));
          }
          return im;
        });
        qObj.optionImages = optImgs.map(function (im) {
          return im ? { mediaId: im.mediaId || null, data: im.data || null } : null;
        });
        qObj.question = q.replace(/\[\[图(\d+)\]\]/g, function (_, n) {
          var idx = parseInt(n, 10) - 1;
          return inlineMap[idx] != null ? '[[图' + (inlineMap[idx] + 1) + ']]' : '';
        });
        // 同步回文本框，保持标记编号与 qInlineImgs 一致
        qInlineImgs = inlineImgs.slice();
        $('#edQuestion').value = qObj.question;
        updateQPreview();
        if (audioFile) {
          if (MediaStore.available()) {
            var aid = genId('aud' + Date.now());
            steps.push(MediaStore.put(aid, audioFile).then(function () { qObj.audioMediaId = aid; }));
          } else {
            steps.push(blobToDataURL(audioFile).then(function (d) { qObj.audioData = d; }));
          }
        } else if (origAud.removed) {
          /* 保留 null */
        } else {
          qObj.audioMediaId = origAud.id; qObj.audioData = origAud.data;
        }
        Promise.all(steps).then(function () {
          if (editingId) {
            var idx = -1;
            for (var i = 0; i < state.bank.length; i++) { if (state.bank[i].id === editingId) { idx = i; break; } }
            if (idx >= 0) {
              qObj._uid = state.bank[idx]._uid || qObj._uid || genUid(); // 编辑沿用原 _uid，保证删除/编辑锚点稳定
              state.bank[idx] = qObj;
            }
          } else {
            state.bank.push(qObj);
          }
          var ok = saveBank();
          // 记录刚编辑的题，供 renderBankList 重建后滚回该题目的视口位置（解决「保存后跳回顶部」）
          if (editingId) {
            for (var _s = 0; _s < state.bank.length; _s++) {
              if (state.bank[_s].id === editingId) { pendingScrollKey = state.bank[_s]._uid || state.bank[_s].id; break; }
            }
          }
          renderDashboard(); renderBankList();
          if (ok) {
            msg.className = 'import-msg ok';
            msg.textContent = editingId ? '已更新题目' : ('已保存 1 道题（当前共 ' + state.bank.length + ' 道）');
            resetEditor();
            toast(editingId ? '题目已更新' : '题目已保存', 'ok');
          } else {
            // 本地存储写入失败（配额已满/被禁用）：in-memory 已更新但 localStorage 未落盘，
            // 不显示成功、不清空表单，提示用户立即导出备份，避免本次编辑彻底丢失
            msg.className = 'import-msg bad';
            msg.textContent = '题目已在当前页更新，但本地存储写入失败（空间已满或被禁用），刷新后会丢失。请立即「导出备份」或删除部分图片题后再试。';
          }
        }).catch(function (err) {
          msg.className = 'import-msg bad';
          msg.textContent = '媒体保存失败，题目未保存' + (err && err.message ? '：' + err.message : '');
        });
      } catch (err) {
        msg.className = 'import-msg bad';
        msg.textContent = '保存出错：' + (err && err.message ? err.message : '未知错误');
        console && console.error && console.error('save question error', err);
      }
    });

    $('#edResetBtn').addEventListener('click', resetEditor);
    $('#edCancelBtn').addEventListener('click', function () { resetEditor(); toast('已取消编辑', 'ok'); });

    $('#bankList').addEventListener('click', function (e) {
      var prac = e.target.closest('[data-practice-cat]');
      if (prac) {
        var pcat = prac.getAttribute('data-practice-cat');
        var pset = prac.getAttribute('data-practice-set') || '全部';
        startPractice({ mode: 'normal', count: 0, category: pcat, set: pset, timeLimit: 0, listenTime: 0, weakFirst: false });
        return;
      }
      var head = e.target.closest('[data-toggle-group]');
      if (head && !e.target.closest('.bank-practice')) {
        head.closest('.bank-group').classList.toggle('collapsed');
        return;
      }
      var ed = e.target.closest('[data-edit]');
      var dl = e.target.closest('[data-del]');
      if (ed) {
        var id = ed.getAttribute('data-edit');
        var q = null, itemDom = ed.closest('.bank-item');
        for (var i = 0; i < state.bank.length; i++) { if ((state.bank[i]._uid || state.bank[i].id) === id) { q = state.bank[i]; break; } }
        if (q) { loadQuestionIntoEditor(q); moveEditorToItem(itemDom); }
      } else if (dl) {
        var did = dl.getAttribute('data-del');
        confirmDialog('确定删除这道题？删除后无法恢复。').then(function (ok) {
          if (!ok) return;
          var before = state.bank.length;
          // 按唯一 _uid 删除（回退到 id），保证「删一道只删一道」，即使存在同 id 副本也只移除非目标份
          state.bank = state.bank.filter(function (x) { return (x._uid || x.id) !== did; });
          var removed = before - state.bank.length;
          var saved = saveBank();
          renderDashboard(); renderBankList();
          if (saved) toast('已删除 ' + removed + ' 道题', 'ok');
          else toast('已删除（但本地存储已满，刷新后可能恢复，建议导出备份）', 'bad');
        });
      }
    });

    // 题库视图切换：按套题 / 全部平铺
    $all('#bankViewTabs .bvt').forEach(function (b) {
      b.addEventListener('click', function () {
        bankView = b.getAttribute('data-view-mode');
        $all('#bankViewTabs .bvt').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderBankList();
      });
    });

    // 「只看我的题」：隐藏官方预置/示例题，只显示用户自定义题（图片/音频随题保留）
    var myOnlyBtn = $('#myOnlyBtn');
    if (myOnlyBtn) {
      myOnlyBtn.addEventListener('click', function () {
        myOnly = !myOnly;
        myOnlyBtn.classList.toggle('active', myOnly);
        myOnlyBtn.textContent = myOnly ? '显示全部题' : '只看我的题';
        renderBankList();
      });
    }

    function loadQuestionIntoEditor(q) {
      editingId = q.id;
      edCat = q.category;
      $all('.chip', $('#edCats')).forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-cat') === edCat); });
      $('#edAudioField').hidden = (edCat !== '听力');
      edLevel = q.level || '乐理二级';
      var lvChips = $('#edLevels');
      if (lvChips) $all('.chip', lvChips).forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-level') === edLevel); });
      edSet = q.set || '第一套';
      var stChips = $('#edSets');
      if (stChips) $all('.chip', stChips).forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-set') === edSet); });
      $('#edQuestion').value = q.question;
      (q.options || []).forEach(function (o, i) { if (i < 4) $('#edOpt' + i).value = o; });
      optImgData = [null, null, null, null];
      (q.optionImages || []).forEach(function (img, i) { if (i < 4) optImgData[i] = img || null; });
      [0, 1, 2, 3].forEach(function (i) { renderOptPreview(i); });
      edAns = q.answer;
      $all('.chip', $('#edAnswer')).forEach(function (x) { x.classList.toggle('active', parseInt(x.getAttribute('data-ans'), 10) === edAns); });
      $('#edAudioField').hidden = (edCat !== '听力');
      origExp = q.explanation || '';
      origAud = { id: q.audioMediaId || null, data: q.audioData || null, removed: false };
      // 内嵌图片：载入并解析为可预览 data URL
      qInlineImgs = [];
      (q.questionImages || []).forEach(function (im) {
        if (im && (im.mediaId || im.data)) qInlineImgs.push({ data: im.data || null, mediaId: im.mediaId || null });
      });
      renumberInlineTokens(); // 修正历史数据中可能出现的编号缺口/错位，避免载入即破碎
      qInlineImgs.forEach(function (im) {
        if (im.mediaId && MediaStore.available()) {
          MediaStore.get(im.mediaId).then(function (v) {
            if (v) { im.data = (typeof v === 'string') ? v : URL.createObjectURL(v); updateQPreview(); }
          }).catch(function () {});
        }
      });
      updateQPreview();
      // 音频预览
      if (origAud.id && MediaStore.available()) {
        MediaStore.get(origAud.id).then(function (b) { if (b) { var u = URL.createObjectURL(b); audUrl = u; $('#edAudioPreview').src = u; $('#edAudioPreview').hidden = false; $('#edAudioClear').hidden = false; } }).catch(function () {});
      } else if (origAud.data) {
        $('#edAudioPreview').src = origAud.data; $('#edAudioPreview').hidden = false; $('#edAudioClear').hidden = false;
      } else {
        $('#edAudioPreview').removeAttribute('src'); $('#edAudioPreview').hidden = true; $('#edAudioClear').hidden = true;
      }
      audioFile = null;
      $('#edAudioInput').value = '';
      $('#edCancelBtn').hidden = false;
      $('#edSaveBtn').textContent = '保存修改';
      toast('已载入题目，修改后点「保存修改」', 'ok');
      // 注意：不要在这里 scrollIntoView —— 编辑为就地内联，滚动由 moveEditorToItem 在
      // 编辑器移动到题目下方之后统一处理，否则会先把页面滚到原底部的编辑器位置。
    }

    function resetEditor() {
      $('#edQuestion').value = '';
      [0, 1, 2, 3].forEach(function (i) { $('#edOpt' + i).value = ''; });
      optImgData = [null, null, null, null];
      [0, 1, 2, 3].forEach(function (i) { renderOptPreview(i); });
      edAns = 0;
      $all('.chip', $('#edAnswer')).forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-ans') === '0'); });
      edCat = '音乐常识';
      $all('.chip', $('#edCats')).forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-cat') === '音乐常识'); });
      $('#edAudioField').hidden = true;
      qInlineImgs = [];
      $('#edQPreview').hidden = true; $('#edQPreview').innerHTML = '';
      $('#edOcrStatus').hidden = true;
      audioFile = null;
      if (audUrl) { URL.revokeObjectURL(audUrl); audUrl = null; }
      $('#edAudioPreview').removeAttribute('src'); $('#edAudioPreview').hidden = true;
      $('#edAudioInput').value = '';
      $('#edAudioClear').hidden = true;
      editingId = null;
      origAud = { id: null, data: null, removed: false };
      origExp = '';
      $('#edCancelBtn').hidden = true;
      $('#edSaveBtn').textContent = '保存到题库';
      moveEditorHome(); // 编辑结束，把编辑器卡片移回原位
    }
  }

  /* ---------------- 磁性按钮 ---------------- */
  function initMagnetic() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    $all('[data-magnetic]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (mx * 0.12) + 'px,' + (my * 0.18) + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function initEvents() {
    // 导航
    $all('.nav-link').forEach(function (n) {
      n.addEventListener('click', function () { routeTo(n.getAttribute('data-view')); });
    });
    // data-action 委托
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var act = el.getAttribute('data-action');
      if (act === 'goto-dashboard') routeTo('dashboard');
      else if (act === 'goto-setup') { openSetup('normal'); }
      else if (act === 'goto-wrong') routeTo('wrong');
      else if (act === 'goto-favorites') routeTo('favorites');
      else if (act === 'goto-history') routeTo('history');
      else if (act === 'goto-import') routeTo('import');
      else if (act === 'composed') { startPractice({ mode: 'composed' }); }
      else if (act === 'export-bank') exportBank();
    });

    $('#quitPractice').addEventListener('click', function () {
      if (session && session.answered === false && session.idx > 0) {
        confirmDialog('退出后将不记录本次进度，确定退出？').then(function (ok) {
          if (!ok) return;
          stopTimer();
          routeTo('dashboard');
        });
      } else {
        stopTimer();
        routeTo('dashboard');
      }
    });
    $('#submitBtn').addEventListener('click', submitAnswer);
    $('#nextBtn').addEventListener('click', nextQuestion);
    $('#reviewWrongBtn').addEventListener('click', function () {
      var card = $('#reviewCard');
      if (!card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#replayWrongBtn').addEventListener('click', function () {
      if (!lastSessionWrong.length) { toast('没有可重刷的错题', 'bad'); return; }
      startPractice({ mode: 'replay', questions: lastSessionWrong });
    });

    // 听力音频增益：用 Web Audio 实时放大音量（针对原录音偏轻），默认 2.5 倍，滑块可调 1~4 倍
    var audioCtx = null, audioGain = null, audioSource = null, audioGraphReady = false;
    function ensureAudioGraph() {
      if (audioGraphReady) {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // 不支持则退回 <audio>.volume
      try {
        audioCtx = new AC();
        audioGain = audioCtx.createGain();
        audioSource = audioCtx.createMediaElementSource($('#qAudio'));
        audioSource.connect(audioGain);
        audioGain.connect(audioCtx.destination);
        var v = parseFloat($('#qVolume').value); if (isNaN(v)) v = 2.5;
        audioGain.gain.value = v;
        audioGraphReady = true;
      } catch (e) { audioGraphReady = false; }
    }
    function applyBoost() {
      var v = parseFloat($('#qVolume').value); if (isNaN(v)) v = 2.5;
      if (audioGraphReady && audioGain) audioGain.gain.value = v;
      else $('#qAudio').volume = Math.min(v, 1);
    }

    $('#qPlayBtn').addEventListener('click', function () {
      var a = $('#qAudio');
      var wrap = $('#qAudioWrap');
      if (!a.src) { toast('该题没有音频', 'bad'); return; }
      ensureAudioGraph();
      applyBoost();
      if (a.paused) {
        var p = a.play();
        if (p && p.catch) {
          p.catch(function (err) {
            toast('音频播放失败：' + ((err && err.name) || '未知错误') + '，可重试', 'bad');
          });
        }
        wrap.classList.add('playing');
        $('#qPlayLabel').textContent = '播放中…';
      } else {
        a.pause();
        wrap.classList.remove('playing');
        $('#qPlayLabel').textContent = '播放音频';
      }
      // 听力计时：首次播放后才开始倒计时
      if (session && session.listenTime > 0 && !session.listenStarted && !session.answered) {
        session.listenStarted = true;
        startTimer(session.listenTime);
      }
    });
    // 播放结束 / 暂停时复位视觉态
    $('#qAudio').addEventListener('ended', function () {
      $('#qAudioWrap').classList.remove('playing');
      $('#qPlayLabel').textContent = '重新播放';
    });
    $('#qAudio').addEventListener('pause', function () {
      if (!$('#qAudio').ended) { $('#qAudioWrap').classList.remove('playing'); $('#qPlayLabel').textContent = '播放音频'; }
    });
    // 响度滑块：Web Audio 增益（1~4 倍），不支持时退回 <audio>.volume
    $('#qVolume').addEventListener('input', applyBoost);

    $('#drillWrongBtn').addEventListener('click', function () {
      if (!activeWrongIds().length) { toast('暂无错题可练习', 'bad'); return; }
      openSetup('wrong');
    });
    $('#clearWrongBtn').addEventListener('click', function () {
      if (!activeWrongIds().length) { toast('错题本已为空', 'bad'); return; }
      confirmDialog('确定清空所有错题记录？此操作不可撤销。').then(function (ok) {
        if (!ok) return;
        state.wrong = {};
        saveWrong();
        renderWrong();
        renderDashboard();
        toast('错题本已清空', 'ok');
      });
    });

    // 收藏夹
    $('#drillFavBtn').addEventListener('click', function () {
      if (!activeFavIds().length) { toast('收藏夹为空', 'bad'); return; }
      openSetup('fav');
    });
    $('#clearFavBtn').addEventListener('click', function () {
      if (!activeFavIds().length) { toast('收藏夹已为空', 'bad'); return; }
      confirmDialog('确定清空所有收藏？此操作不可撤销。').then(function (ok) {
        if (!ok) return;
        state.favorites = {};
        saveFav();
        renderFavorites();
        renderDashboard();
        toast('收藏夹已清空', 'ok');
      });
    });

    // 题目卡片：收藏 / 笔记
    $('#favBtn').addEventListener('click', function () {
      if (!session) return;
      var id = session.questions[session.idx].id;
      if (state.favorites[id]) {
        delete state.favorites[id]; saveFav();
        this.classList.remove('active'); toast('已取消收藏');
      } else {
        state.favorites[id] = true; saveFav();
        this.classList.add('active'); toast('已收藏', 'ok');
      }
    });
    $('#noteBtn').addEventListener('click', function () {
      if (!session) return;
      var area = $('#noteArea'), input = $('#noteInput'), id = session.questions[session.idx].id;
      area.hidden = !area.hidden;
      if (!area.hidden) { input.value = state.notes[id] || ''; input.focus(); this.classList.add('active'); }
      else { this.classList.toggle('active', !!state.notes[id]); }
    });
    $('#noteInput').addEventListener('blur', function () {
      if (!session) return;
      var id = session.questions[session.idx].id;
      var v = this.value.trim();
      if (v) { state.notes[id] = v; saveNotes(); $('#noteBtn').classList.add('active'); }
      else { delete state.notes[id]; saveNotes(); $('#noteBtn').classList.remove('active'); }
    });
  }

  function routeTo(name) {
    if (name === 'wrong') renderWrong();
    else if (name === 'favorites') renderFavorites();
    else if (name === 'history') renderHistory();
    else if (name === 'dashboard') renderDashboard();
    else if (name === 'setup') openSetup('normal');
    else if (name === 'import') renderBankList();
    showView(name);
  }

  /* ---------------- 启动 ---------------- */
  // 通过链接 ?clear=1 触发一次性清空（用于远程帮用户清空题库）
  function autoClearFromUrl() {
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('clear') !== '1') return;
      var before = state.bank.length;
      state.bank = [];
      saveBank();
      if (MediaStore.available() && MediaStore.clear) MediaStore.clear();
      renderDashboard();
      renderBankList();
      // 清理 URL，避免刷新后再次清空
      u.searchParams.delete('clear');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      toast('题库已清空（共 ' + before + ' 道）', 'ok');
    } catch (e) { /* 忽略 URL 解析异常 */ }
  }

  // 通过链接 ?sync=1 一键同步官方题库（用于远程/手动强制同步）
  function autoSyncFromUrl() {
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('sync') !== '1') return;
      syncOfficialBank(false, true);
      u.searchParams.delete('sync');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* 忽略 */ }
  }

  // 通过链接 ?load=filename.json 自动获取并导入（支持 ?clear=1&load=set1.json 一键清空+导入）
  function autoLoadFromUrl() {
    try {
      var u = new URL(window.location.href);
      var file = u.searchParams.get('load');
      if (!file) return;
      var loadUrl = file.indexOf('?') >= 0 ? file + '&_=' + Date.now() : file + '?_=' + Date.now();
      fetch(loadUrl)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          var res = parseImport(text);
          if (!res || !res.ok) { toast((res && res.msg) || '自动加载失败', 'bad'); return; }
          renderDashboard();
          renderBankList();
          if (res.media && MediaStore.available()) {
            lastOfficialMedia = res.media || lastOfficialMedia; // 内存缓存
            MediaStore.putAll(res.media).then(function () {
              toast(res.msg + '（媒体已还原）', 'ok');
            }).catch(function () {
              toast(res.msg + '（题目已导入，媒体还原失败可重导）', 'bad');
            });
          } else {
            toast(res.msg, 'ok');
          }
          // 清理 URL，避免刷新再次加载
          u.searchParams.delete('load');
          history.replaceState(null, '', u.pathname + u.search + u.hash);
        })
        .catch(function (e) { toast('自动加载失败：' + (e && e.message), 'bad'); });
    } catch (e) { /* 忽略 URL 解析异常 */ }
  }

  var inited = false;
  function init() {
    if (inited) return;
    inited = true;
    var firstRun = !localStorage.getItem(LS.init);
    load();
    initTheme();
    initSetup();
    initImport();
    initEditor();
    initEvents();
    initMagnetic();
    renderDashboard();
    showView('dashboard');
    if (firstRun && state.bank.length === 0) seedInitialBank();
    autoClearFromUrl();
    autoLoadFromUrl();
    syncOfficialBank(true); // 静默自动升级示例→官方，并在官方更新时自动同步
    autoSyncFromUrl(); // ?sync=1 一键手动同步官方题库
    loadServerBank(); // 只读拉取服务器 userbank.json（用户自定义题+图片），实现跨网址/设备同步
    pullFromServer(); // 若已配置 Supabase 后端，则自动从服务器拉取题库（零手动同步）；未配置时静默跳过
    // 将本地已存于 IndexedDB 的图片补全为内联 data：移动端可靠渲染，且可随导出/同步流转到任意设备
    state.bank.forEach(function (q) { hydrateQuestionMedia(q); });
    autoFixImages(); // 静默自动压缩过大的图片，确保手机端打开即可完整显示（无需手动点按钮）
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
