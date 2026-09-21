/* =====================================================================
   Function-Firebase-Egmm.js — EGMM-HQ-IT 공용 Firebase 연결 모듈
   ---------------------------------------------------------------------
   · 프로젝트: egmm-hq-it · Firestore DB ID: "egmm" (default 아님!)
   · 이 파일 하나에만 설정을 넣으면 ACCESS / DEPARTMENT / MENU /
     FUNCTION-CODE 및 Function-Access-Gate.js 가 전부 이 설정을 사용.
   · 배치 위치: 저장소 루트 (다른 Function-*.js 와 같은 위치)
   ---------------------------------------------------------------------
   사용법:
     <script src="../Function-Firebase-Egmm.js"></script>
     <script>
       EgmmFB.ready.then(function(fb){
         // fb.db, fb.doc, fb.getDoc, fb.getDocs, fb.setDoc,
         // fb.updateDoc, fb.deleteDoc, fb.collection, fb.onSnapshot
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
      collection: F.collection, onSnapshot: F.onSnapshot
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

  /* 코드 정규화: 대문자 · 영문/숫자 외 → '-' · 연속/양끝 '-' 제거 */
  window.EgmmFB.sanitizeCode = function(s){
    return String(s || "").toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  };
})();
