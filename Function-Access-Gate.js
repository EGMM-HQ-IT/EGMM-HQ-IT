/* =====================================================================
   Function-Access-Gate.js — ACCESS 기반 공용 입장 게이트
   ---------------------------------------------------------------------
   앞으로 만드는(또는 교체하는) 모든 HTML 은 이 게이트 하나로
   Firestore ACCESS 컬렉션(egmm-hq-it / DB "egmm")의
   아이디 · 비밀번호 · 직급 · 권한 · 차단 설정에 따라 입장이 결정됩니다.

   배치 위치: 저장소 루트 (Function-Firebase-Egmm.js 와 같은 위치)

   사용법 (페이지 <body> 최상단 또는 <head> 끝):
     <script src="../Function-Firebase-Egmm.js"></script>
     <script src="../Function-Access-Gate.js"></script>
     <script>
       AccessGate.require({
         menu:  "MENU-PLU-LIST",   // 이 페이지의 메뉴 코드 (MENU.html 에서 생성한 코드)
         title: "PLU LIST"          // 로그인 창 제목 (생략 가능)
       }).then(function(user){
         // 입장 허용됨 — user = { id, fullName, rank, perms }
       });
     </script>

   입장 판정 순서:
     1) 차단(blocked)된 아이디 → 거부
     2) 비밀번호 불일치 → 거부
     3) menu 코드를 지정한 경우:
        · 계정 perms 에 "*" 또는 해당 메뉴 코드가 있으면 허용
        · MENU/{코드} 문서의 allowUsers 에 아이디가 있으면 허용
        · MENU/{코드} 문서의 allowRanks 에 계정 직급 코드가 있으면 허용
        · 그 외 → "권한 없음" 거부
     4) menu 를 생략하면 로그인(아이디·비번·차단)만 검사
   같은 탭 안에서는 sessionStorage 로 로그인이 유지됩니다.
   ===================================================================== */
(function(){
  'use strict';
  var SS_KEY = 'egmmAccessAuth';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  /* 아이디 입력: 무조건 영문(A-Z)·숫자만 — 한글 등 다른 문자는 입력 즉시 제거 */
  function forceEng(el){
    if(!el) return;
    function fix(){ var f=el.value.toUpperCase().replace(/[^A-Z0-9-]/g,''); if(el.value!==f) el.value=f; }
    el.addEventListener('input', fix);
    el.addEventListener('compositionend', fix);
    el.addEventListener('blur', fix);
  }

  function getSession(){
    try{ var raw=sessionStorage.getItem(SS_KEY); return raw?JSON.parse(raw):null; }catch(e){ return null; }
  }
  function setSession(u){
    try{ sessionStorage.setItem(SS_KEY, JSON.stringify(u)); }catch(e){}
  }

  function buildOverlay(title){
    var st=document.createElement('style');
    st.textContent =
      'html.ag-lock body > *:not(#agGateOv){ visibility:hidden !important; }'
      +'#agGateOv{ position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center;'
      +' background:#EDEAE3; visibility:visible !important;'
      +" font-family:'Pretendard','Malgun Gothic','맑은 고딕',system-ui,sans-serif; }"
      +'#agGateOv .ag-card{ width:340px; background:#FFFDFA; border:1.5px solid #E4DFD4; border-radius:18px;'
      +' padding:30px 30px 26px; box-shadow:0 14px 30px -20px rgba(30,27,22,.42); }'
      +'#agGateOv .ag-title{ margin:0 0 18px; font-size:22px; font-weight:800; letter-spacing:.12em; text-align:center; color:#1E1B16; }'
      +'#agGateOv .ag-field{ margin-bottom:12px; }'
      +'#agGateOv .ag-field label{ display:block; font-size:11px; font-weight:800; letter-spacing:.08em; color:#8C8578; margin-bottom:5px; }'
      +'#agGateOv .ag-field input{ width:100%; box-sizing:border-box; border:1.5px solid #E4DFD4; border-radius:10px;'
      +' padding:12px 14px; font:inherit; font-size:15px; font-weight:700; color:#1E1B16; background:#FFFDFA; }'
      +'#agGateOv #agId{ text-transform:uppercase; }'
      +'#agGateOv .ag-field input:focus{ outline:none; border-color:#2F5D46; }'
      +'#agGateOv .ag-err{ min-height:18px; font-size:12px; font-weight:800; color:#9C3327; margin:2px 0 10px; text-align:center; }'
      +'#agGateOv .ag-btn{ width:100%; border:none; border-radius:10px; padding:13px 0; font:inherit; font-size:14px;'
      +' font-weight:800; letter-spacing:.08em; cursor:pointer; background:#2F5D46; color:#fff; }';
    (document.head||document.documentElement).appendChild(st);

    var ov=document.createElement('div'); ov.id='agGateOv';
    ov.innerHTML='<div class="ag-card">'
      +'<h1 class="ag-title">'+esc(title||'LOGIN')+'</h1>'
      +'<div class="ag-field"><label>ID</label><input type="text" id="agId" placeholder="ID" autocomplete="off" autocapitalize="characters"></div>'
      +'<div class="ag-field"><label>PASSWORD</label><input type="password" id="agPw" placeholder="••••••" autocomplete="off"></div>'
      +'<div class="ag-err" id="agErr"></div>'
      +'<button class="ag-btn" id="agEnter" type="button">ENTER</button>'
      +'</div>';
    (document.body||document.documentElement).appendChild(ov);
    return ov;
  }

  function unlock(){
    var ov=document.getElementById('agGateOv'); if(ov) ov.remove();
    document.documentElement.classList.remove('ag-lock');
  }

  /* 계정+메뉴 문서를 읽어 입장 판정. 반환: {ok,user} 또는 {err} */
  function verify(fb, id, pw, menuCode){
    id = String(id||'').trim().toUpperCase();
    return fb.getDoc(fb.doc(fb.db,'ACCESS',id)).then(function(snap){
      if(!snap || !snap.exists || !snap.exists()) return {err:'ID NOT FOUND'};
      var u = snap.data() || {};
      if(u.blocked === true) return {err:'BLOCKED ID · ASK MANAGER'};
      return window.EgmmFB.verifyPw(u.pw, pw).then(function(ok){
        if(!ok) return {err:'WRONG PASSWORD'};
        var user = { id:id, fullName:u.fullName||'', rank:u.rank||'', perms:Array.isArray(u.perms)?u.perms:[] };
        if(!menuCode) return {ok:true, user:user};
        if(user.perms.indexOf('*')>=0 || user.perms.indexOf(menuCode)>=0) return {ok:true, user:user};
        return fb.getDoc(fb.doc(fb.db,'MENU',menuCode)).then(function(ms){
          var m = (ms && ms.exists && ms.exists()) ? (ms.data()||{}) : null;
          if(m){
            if(m.active === false) return {err:'MENU DISABLED'};
            var au = Array.isArray(m.allowUsers)?m.allowUsers:[];
            var ar = Array.isArray(m.allowRanks)?m.allowRanks:[];
            if(au.indexOf(id)>=0) return {ok:true, user:user};
            if(user.rank && ar.indexOf(user.rank)>=0) return {ok:true, user:user};
          }
          return {err:'NO ACCESS PERMISSION ('+menuCode+')'};
        });
      });
    }).catch(function(e){
      console.error('[AccessGate]', e);
      return {err:'CONNECTION ERROR — TRY AGAIN'};
    });
  }

  /* 세션 사용자에게 menuCode 권한이 있는지 (재검사) */
  function sessionAllowed(fb, u, menuCode){
    if(!menuCode) return Promise.resolve(true);
    if(u.perms && (u.perms.indexOf('*')>=0 || u.perms.indexOf(menuCode)>=0)) return Promise.resolve(true);
    return fb.getDoc(fb.doc(fb.db,'MENU',menuCode)).then(function(ms){
      var m=(ms && ms.exists && ms.exists())?(ms.data()||{}):null;
      if(!m) return false;
      if(m.active===false) return false;
      var au=Array.isArray(m.allowUsers)?m.allowUsers:[], ar=Array.isArray(m.allowRanks)?m.allowRanks:[];
      return au.indexOf(u.id)>=0 || (u.rank && ar.indexOf(u.rank)>=0);
    }).catch(function(){ return false; });
  }

  window.AccessGate = {
    user: null,
    logout: function(){ try{ sessionStorage.removeItem(SS_KEY); }catch(e){} window.AccessGate.user=null; location.reload(); },

    require: function(opts){
      opts = opts || {};
      var menuCode = opts.menu ? String(opts.menu).toUpperCase() : '';
      document.documentElement.classList.add('ag-lock');

      return new Promise(function(resolve){
        function start(){
          if(!window.EgmmFB){ showErrOnly('Function-Firebase-Egmm.js 로드 필요'); return; }
          window.EgmmFB.ready.then(function(fb){
            var sess=getSession();
            if(sess && sess.id){
              sessionAllowed(fb, sess, menuCode).then(function(ok){
                if(ok){ window.AccessGate.user=sess; unlock(); resolve(sess); }
                else showLogin(fb);
              });
            } else showLogin(fb);
          }).catch(function(){
            showErrOnly('FIREBASE 설정 필요 — Function-Firebase-Egmm.js 확인');
          });
        }

        function showErrOnly(msg){
          var ov=document.getElementById('agGateOv')||buildOverlay(opts.title);
          var er=ov.querySelector('#agErr'); if(er) er.textContent=msg;
          var bt=ov.querySelector('#agEnter'); if(bt) bt.disabled=true;
        }

        function showLogin(fb){
          var ov=document.getElementById('agGateOv')||buildOverlay(opts.title);
          var idIn=ov.querySelector('#agId'), pwIn=ov.querySelector('#agPw'),
              er=ov.querySelector('#agErr'), bt=ov.querySelector('#agEnter');
          var busy=false;
          function submit(){
            if(busy) return;
            var idv=(idIn.value||'').trim().toUpperCase(), pwv=(pwIn.value||'').trim();
            er.textContent='';
            if(!idv){ er.textContent='ENTER ID'; idIn.focus(); return; }
            if(!pwv){ er.textContent='ENTER PASSWORD'; pwIn.focus(); return; }
            busy=true; er.textContent='CHECKING…';
            verify(fb, idv, pwv, menuCode).then(function(r){
              busy=false;
              if(!r || r.err){ er.textContent=(r&&r.err)||'ERROR'; pwIn.value=''; pwIn.focus(); return; }
              setSession(r.user);
              window.AccessGate.user=r.user;
              unlock(); resolve(r.user);
            });
          }
          bt.onclick=submit;
          forceEng(idIn);
          pwIn.addEventListener('keydown',function(e){ if(e.key==='Enter') submit(); });
          idIn.addEventListener('keydown',function(e){ if(e.key==='Enter') pwIn.focus(); });
          setTimeout(function(){ idIn.focus(); },80);
        }

        if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start, {once:true});
        else start();
      });
    }
  };
})();
