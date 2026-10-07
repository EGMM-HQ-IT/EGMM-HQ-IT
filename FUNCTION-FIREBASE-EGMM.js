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
  window.EgmmFB.hashPw = function(pw){
    pw = String(pw);
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode("THE-SHAWN::" + pw))
        .then(function(buf){
          return "h:" + Array.from(new Uint8Array(buf))
            .map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
        })
        .catch(function(){ return null; });
    }
    return Promise.resolve(null);
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

  /* [2026-10-07] 업체(VENDER) 유사 이름 인식
     venderKey(s)            : 비교 키 — 대소문자·공백·괄호 등 기호 무시 ("EGP (gr)" → "EGPGR")
     venderMatch(venders, s) : 입력 이름이 어느 업체인지 — 축약어(문서 ID/code) · 업체명 · 유사 이름(aliases) 순으로 비교.
                               venders = { 축약어: 문서 } 또는 문서 배열. 반환: 해당 업체 문서(없으면 null) */
  window.EgmmFB.venderKey = function(s){ return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9\uAC00-\uD7A3\u3131-\u318E]/g, ""); };
  window.EgmmFB.venderMatch = function(venders, s){
    var k = window.EgmmFB.venderKey(s); if (!k) return null;
    var list = Array.isArray(venders) ? venders : Object.keys(venders || {}).map(function(c){ var d = venders[c] || {}; if (!d.code) d = Object.assign({ code: c }, d); return d; });
    var i, d, a;
    for (i = 0; i < list.length; i++){ d = list[i] || {}; if (window.EgmmFB.venderKey(d.code) === k) return d; }
    for (i = 0; i < list.length; i++){ d = list[i] || {}; if (window.EgmmFB.venderKey(d.name) === k) return d; }
    for (i = 0; i < list.length; i++){ d = list[i] || {}; a = Array.isArray(d.aliases) ? d.aliases : []; for (var j = 0; j < a.length; j++){ if (window.EgmmFB.venderKey(a[j]) === k) return d; } }
    return null;
  };

  /* [2026-10-07] 부서(DEPARTMENT) 유사 이름 인식 — venderMatch 와 같은 규칙 (코드 → 이름/한글명 → 유사 이름 · 번호(num)도 허용) */
  window.EgmmFB.deptMatch = function(depts, s){
    var k = window.EgmmFB.venderKey(s); if (!k) return null;
    var list = Array.isArray(depts) ? depts : Object.keys(depts || {}).map(function(c){ var d = depts[c] || {}; if (!d.code) d = Object.assign({ code: c }, d); return d; });
    var i, d, a;
    for (i = 0; i < list.length; i++){ d = list[i] || {}; if (window.EgmmFB.venderKey(d.code) === k) return d; }
    for (i = 0; i < list.length; i++){ d = list[i] || {}; if (window.EgmmFB.venderKey(d.name) === k || (d.nameKo && window.EgmmFB.venderKey(d.nameKo) === k)) return d; }
    for (i = 0; i < list.length; i++){ d = list[i] || {}; a = Array.isArray(d.aliases) ? d.aliases : []; for (var j = 0; j < a.length; j++){ if (window.EgmmFB.venderKey(a[j]) === k) return d; } }
    if (/^[0-9]+$/.test(k)){ for (i = 0; i < list.length; i++){ d = list[i] || {}; if (d.num != null && String(d.num) === String(parseInt(k, 10))) return d; } }
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
