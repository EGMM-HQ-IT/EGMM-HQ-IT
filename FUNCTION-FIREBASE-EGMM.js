/* =====================================================================
   FUNCTION-FIREBASE-EGMM.js — EGMM-HQ-IT 공용 Firebase 연결 모듈
   ---------------------------------------------------------------------
   · 프로젝트: egmm-hq-it · Firestore DB ID: "egmm" (default 아님!)
   · 이 파일 하나에만 설정을 넣으면 ACCESS / DEPARTMENT / MENU /
     FUNCTION-CODE 및 FUNCTION-ACCESS-GATE.js 가 전부 이 설정을 사용.
   · 배치 위치: 저장소 루트 (다른 Function-*.js 와 같은 위치)
   ---------------------------------------------------------------------
   사용법:
     <script src="../FUNCTION-FIREBASE-EGMM.js"></script>
     <script>
       EgmmFB.ready.then(function(fb){
         // fb.db, fb.doc, fb.getDoc, fb.getDocs, fb.setDoc,
         // fb.updateDoc, fb.deleteDoc, fb.collection, fb.onSnapshot, fb.writeBatch
       });
     </script>
   ===================================================================== */
(function(){
  'use strict';

  /* ▼▼▼ egmm-hq-it 웹 앱 설정 (plu-local-ver.html 파일 기본값과 동일 · 2026-09) ▼▼▼ */
  var CONFIG = {
    apiKey: "AIzaSyAHUP5maMayaUUDVVvkVSzBooAgdD8UOC0",
    authDomain: "egmm-hq-it.firebaseapp.com",
    projectId: "egmm-hq-it",
    storageBucket: "egmm-hq-it.firebasestorage.app",
    messagingSenderId: "675894371062",
    appId: "1:675894371062:web:02c893e4d65da18f5602d7"
  };
  var DB_ID = "egmm";               // Firestore 데이터베이스 ID (콘솔 확인값)
  /* ▲▲▲ 설정 끝 ▲▲▲ */

  var SDK = "https://www.gstatic.com/firebasejs/10.12.0/";

  function configOk(){
    return CONFIG.apiKey && CONFIG.apiKey.indexOf("PASTE_") !== 0;
  }

  var resolveReady, rejectReady;
  var ready = new Promise(function(res, rej){ resolveReady = res; rejectReady = rej; });
  // 페이지 쪽 미처리 rejection 콘솔 경고 방지 (각 페이지가 catch 처리함)
  ready.catch(function(){});

  window.EgmmFB = {
    ready: ready,
    config: CONFIG,
    dbId: DB_ID,
    configOk: configOk,
    db: null, fns: null
  };


  /* ═══ [CLOUD 압축 묶음 읽기 · 2026-10-02] PLU/UPC MANAGER 가 업체(중간 카테고리)별 gzip 묶음으로 저장한 상품 데이터를 읽는 공용 함수
     · packOn(F,db,root): FB_ROOT/_PACKMETA.on 여부
     · packReadSub(F,db,root,bigId,subId): 묶음 문서(+조각) → rows 배열 [{id,v,sv,m}] (없으면 null)
     · loadProductRows(F,db,root,meta,cache): meta.tree 의 모든 업체 묶음을 읽되, cache.parts[big/sub].pv 가 meta 의 pv 와 같으면 다시 읽지 않음
       → { parts:{key:{pv,rows}}, changed:[key..] }   (묶음 방식이 아니면 null → 각 페이지의 기존 행 문서 읽기로) */
  function gunzipB64(b64){
    var bin=atob(b64), u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    if(typeof pako!=='undefined'&&pako.ungzip) return Promise.resolve(new TextDecoder().decode(pako.ungzip(u8)));
    if(typeof DecompressionStream!=='undefined'){ var ds=new DecompressionStream('gzip'); var w=ds.writable.getWriter(); w.write(u8); w.close(); return new Response(ds.readable).text(); }
    return Promise.reject(new Error('gzip 해제 불가 (브라우저가 오래됨)'));
  }
  function packOn(F,db,root){ return F.getDoc(F.doc(db,root,'_PACKMETA')).then(function(sn){ return !!(sn.exists()&&sn.data()&&sn.data().on); }).catch(function(){ return false; }); }
  function packReadSub(F,db,root,bigId,subId){
    return F.getDoc(F.doc(db,root,'_PACK',bigId,subId)).then(function(sn){
      if(!sn.exists()) return null;
      var d0=sn.data()||{}, n=parseInt(d0.parts||1,10)||1, ps=[];
      for(var p=2;p<=n;p++) ps.push(F.getDoc(F.doc(db,root,'_PACK',bigId,subId+'__P'+p)).then(function(x){ return x.exists()?String((x.data()||{}).d||''):''; }));
      return Promise.all(ps).then(function(parts){ var payload=String(d0.d||'')+parts.join('');
        var txt=(d0.fmt==='GZ')?gunzipB64(payload):Promise.resolve(payload);
        return txt.then(function(json){ var o=JSON.parse(json); return Array.isArray(o)?o:((o&&Array.isArray(o.rows))?o.rows:[]); }); });
    });
  }
  function loadProductRows(F,db,root,meta,cache){
    return packOn(F,db,root).then(function(on){
      if(!on) return null;
      var old=(cache&&cache.parts)||{}, parts={}, changed=[], jobs=[];
      (meta.tree||[]).forEach(function(b){ (b.subs||[]).forEach(function(sb){
        var key=b.id+'/'+sb.id, pv=sb.pv||meta.savedAt||'';
        if(old[key]&&old[key].pv===pv&&Array.isArray(old[key].rows)){ parts[key]={pv:pv,rows:old[key].rows,big:b,sub:sb}; return; }
        jobs.push(packReadSub(F,db,root,b.id,sb.id).then(function(rows){ parts[key]={pv:pv,rows:rows||[],big:b,sub:sb}; changed.push(key); }));
      }); });
      return Promise.all(jobs).then(function(){ return { parts:parts, changed:changed }; });
    });
  }
  window.EgmmFB.gunzipB64=gunzipB64; window.EgmmFB.packOn=packOn; window.EgmmFB.packReadSub=packReadSub; window.EgmmFB.loadProductRows=loadProductRows;

  if (!configOk()) {
    rejectReady(new Error("EGMM_FB_CONFIG_MISSING"));
    try { window.dispatchEvent(new Event("egmm-fb-config-missing")); } catch(e){}
    return;
  }

  Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-firestore.js"),
    import(SDK + "firebase-auth.js")
  ]).then(function(mods){
    var A = mods[0], F = mods[1], AU = mods[2];
    var app;
    try { app = A.initializeApp(CONFIG, "egmm-hq-it"); }
    catch(e){ app = A.getApp("egmm-hq-it"); }
    var db = F.getFirestore(app, DB_ID);   // 이름 있는 DB (egmm)
    var fb = {
      app: app, db: db,
      doc: F.doc, getDoc: F.getDoc, getDocs: F.getDocs,
      setDoc: F.setDoc, updateDoc: F.updateDoc, deleteDoc: F.deleteDoc,
      collection: F.collection, onSnapshot: F.onSnapshot,
      writeBatch: F.writeBatch   /* ADVERTISING/WEEKLY_AD_MANAGER 용 (2026-10) */
    };
    window.EgmmFB.db = db;
    window.EgmmFB.fns = fb;

    /* 익명 인증 (보안규칙 request.auth != null 대응) · 3초 폴백 */
    var fired = false;
    function fire(){
      if (fired) return; fired = true;
      resolveReady(fb);
      try { window.dispatchEvent(new Event("egmm-fb-ready")); } catch(e){}
    }
    try {
      var auth = AU.getAuth(app);
      AU.onAuthStateChanged(auth, function(u){ if (u) fire(); });
      AU.signInAnonymously(auth).catch(function(e){
        console.warn("[EgmmFB 익명 인증 실패]", (e && e.code) || e); fire();
      });
    } catch(e){ fire(); }
    setTimeout(fire, 3000);
  }).catch(function(e){
    console.error("[EgmmFB SDK 로드 실패]", e);
    rejectReady(e);
  });

  /* ── 공용 유틸 ───────────────────────────────────────────── */

  /* 비밀번호 해시 (기존 THE SHAWN 방식과 동일: SHA-256("THE-SHAWN::"+pw) → "h:...") */
  /* [2026-10-08] crypto.subtle 이 없는 환경(http·일부 웹뷰)에서도 같은 해시가 나오도록 순수 JS SHA-256 대체 구현 */
  function __utf8(str){ var out=[], i, c; str=String(str); for(i=0;i<str.length;i++){ c=str.charCodeAt(i);
      if(c<0x80) out.push(c); else if(c<0x800) out.push(0xc0|(c>>6),0x80|(c&63));
      else if(c>=0xd800&&c<0xdc00&&i+1<str.length){ var d=str.charCodeAt(++i); c=0x10000+((c&0x3ff)<<10)+(d&0x3ff); out.push(0xf0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63)); }
      else out.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63)); } return out; }
  function __sha256(str){
    var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var m=__utf8(str), l=m.length*8; m.push(0x80); while(m.length%64!==56) m.push(0);
    for(var i=7;i>=0;i--) m.push(i>=4?0:((l/Math.pow(2,i*8))>>>0)&255);
    var W=new Array(64), rotr=function(x,n){ return (x>>>n)|(x<<(32-n)); };
    for(var j=0;j<m.length;j+=64){
      for(var t=0;t<16;t++) W[t]=(m[j+t*4]<<24)|(m[j+t*4+1]<<16)|(m[j+t*4+2]<<8)|m[j+t*4+3];
      for(t=16;t<64;t++){ var s0=rotr(W[t-15],7)^rotr(W[t-15],18)^(W[t-15]>>>3), s1=rotr(W[t-2],17)^rotr(W[t-2],19)^(W[t-2]>>>10); W[t]=(W[t-16]+s0+W[t-7]+s1)|0; }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for(t=0;t<64;t++){ var S1=rotr(e,6)^rotr(e,11)^rotr(e,25), ch=(e&f)^(~e&g), T1=(h+S1+ch+K[t]+W[t])|0, S0=rotr(a,2)^rotr(a,13)^rotr(a,22), mj=(a&b)^(a&c)^(b&c), T2=(S0+mj)|0;
        h=g; g=f; f=e; e=(d+T1)|0; d=c; c=b; b=a; a=(T1+T2)|0; }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0; H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map(function(x){ return ("00000000"+(x>>>0).toString(16)).slice(-8); }).join("");
  }
  window.EgmmFB.hashPw = function(pw){
    pw = String(pw);
    var js=function(){ try{ return "h:"+__sha256("THE-SHAWN::"+pw); }catch(e){ return null; } };
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode("THE-SHAWN::" + pw))
        .then(function(buf){
          return "h:" + Array.from(new Uint8Array(buf))
            .map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
        })
        .catch(function(){ return js(); });
    }
    return Promise.resolve(js());
  };

  /* 저장된 pin 값과 입력 비밀번호 비교 (h: 해시 · p: 평문 · 구형 평문 모두 허용) */
  window.EgmmFB.verifyPw = function(stored, input){
    stored = String(stored || ""); input = String(input || "");
    return window.EgmmFB.hashPw(input).then(function(h){
      if (h && stored === h) return true;
      if (stored === "p:" + input) return true;
      if (stored !== "" && stored.indexOf("h:") !== 0 && stored.indexOf("p:") !== 0 && stored === input) return true;
      return false;
    });
  };

  /* [2026-10-07] 업체(VENDER) · 부서(DEPARTMENT) 유사 이름 인식
     venderKey(s)            : 비교 키 — 대소문자·공백·괄호 등 기호 무시 ("EGP (gr)" → "EGPGR")
     venderMatch(venders, s) : 입력 이름이 어느 업체인지 — 축약어(문서 ID/code) → 업체명 → 유사 이름(aliases) 순으로 비교.
     deptMatch(depts, s)     : 부서 — 코드 → 이름/한글명 → 유사 이름 → 번호(num)
     [유사도] 정확히 같은 것이 없으면 오타를 허용해 가장 가까운 것을 찾는다 (키 4~7자: 1자 · 8자 이상: 2자 차이까지 —
             글자 바뀜·빠짐·추가. 띄어쓰기·기호는 키에서 이미 제거). 같은 거리의 후보가 둘 이상이면 모호하므로 연결하지 않음.
     venders/depts = { 코드: 문서 } 또는 문서 배열. 반환: 해당 문서(없으면 null) */
  window.EgmmFB.venderKey = function(s){ return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9\uAC00-\uD7A3\u3131-\u318E]/g, ""); };
  function __editDist(a, b, max){                      /* Levenshtein · max 초과면 max+1 */
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++){
      cur[0] = i; var rowMin = cur[0];
      for (j = 1; j <= lb; j++){
        var c = (a.charAt(i - 1) === b.charAt(j - 1)) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }
  window.EgmmFB.fuzzyTol = function(key){ var n = key.length; return n >= 8 ? 2 : (n >= 4 ? 1 : 0); };
  /* 공통: list(문서 배열) · namesOf(doc) → [비교할 문자열들] (앞쪽일수록 우선) */
  function __nameMatch(list, s, namesOf){
    var K = window.EgmmFB.venderKey, k = K(s); if (!k) return null;
    var i, j, d, names;
    /* 1) 정확 일치 — 필드 우선순위대로 */
    var maxLen = 0; for (i = 0; i < list.length; i++){ names = namesOf(list[i] || {}); if (names.length > maxLen) maxLen = names.length; }
    for (j = 0; j < maxLen; j++){ for (i = 0; i < list.length; i++){ d = list[i] || {}; names = namesOf(d); if (j < names.length && K(names[j]) === k) return d; } }
    /* 2) 유사 일치 — 가장 가까운 것 (모호하면 null) */
    var tol = window.EgmmFB.fuzzyTol(k); if (!tol) return null;
    var best = null, bestD = tol + 1, bestKey = "", tie = false;
    for (i = 0; i < list.length; i++){ d = list[i] || {}; names = namesOf(d);
      for (j = 0; j < names.length; j++){ var nk = K(names[j]); if (!nk || nk.length < 3) continue;
        var dist = __editDist(k, nk, tol);
        if (dist < bestD){ bestD = dist; best = d; bestKey = nk; tie = false; }
        else if (dist === bestD && best && best !== d && nk !== bestKey) tie = true;   /* 같은 이름(파트별 중복 등록)은 앞쪽 우선 · 다른 이름이면 모호 */ } }
    return (best && !tie) ? best : null;
  }
  function __asList(v){ return Array.isArray(v) ? v : Object.keys(v || {}).map(function(c){ var d = v[c] || {}; if (!d.code) d = Object.assign({ code: c }, d); return d; }); }
  window.EgmmFB.venderMatch = function(venders, s){
    return __nameMatch(__asList(venders), s, function(d){ return [d.code, d.name].concat(Array.isArray(d.aliases) ? d.aliases : []); });
  };
  window.EgmmFB.deptMatch = function(depts, s){
    var list = __asList(depts), k = window.EgmmFB.venderKey(s);
    var hit = __nameMatch(list, s, function(d){ return [d.code, d.name, d.nameKo].concat(Array.isArray(d.aliases) ? d.aliases : []); });
    if (hit) return hit;
    if (/^[0-9]+$/.test(k)){ for (var i = 0; i < list.length; i++){ var d = list[i] || {}; if (d.num != null && String(d.num) === String(parseInt(k, 10))) return d; } }
    return null;
  };

  /* 코드 정규화: 대문자 · 영문/숫자 외 → '-' · 연속/양끝 '-' 제거 */
  window.EgmmFB.sanitizeCode = function(s){
    return String(s || "").toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  };
})();
