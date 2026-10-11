/* ============================================================
   UI / 기능 코드  (차시를 추가할 때는 이 파일을 고칠 필요가 없습니다)
   - data/lessons/lessonN.js 파일을 1번부터 순서대로 자동으로 불러옵니다.
   - 각 파일은 window.LESSONS 에 차시 데이터를 하나씩 등록합니다.
   ============================================================ */
window.LESSONS = [];
const MAX_LESSONS = 100;               // 이 번호까지 찾아봅니다
const $tabs = document.getElementById('tabs');
const $content = document.getElementById('content');
const $current = document.getElementById('current');

const SPEAKER = '<svg class="spk" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const BARS = '<span class="bars"><i></i><i></i><i></i></span>';

/* ---------- 차시 파일 자동 불러오기 ---------- */
function loadScript(src){
  return new Promise(res=>{
    const s=document.createElement('script');
    s.src=src; s.onload=()=>res(true); s.onerror=()=>{s.remove();res(false)};
    document.head.appendChild(s);
  });
}
async function loadAllLessons(){
  await loadScript('data/lessons/manifest.js');
  const numbers=Array.isArray(window.LESSON_FILES)
    ? window.LESSON_FILES
    : Array.from({length:MAX_LESSONS},(_,i)=>i+1);
  for(const n of numbers){
    const ok = await loadScript(`data/lessons/lesson${n}.js`);
    if(!ok && !Array.isArray(window.LESSON_FILES)) break;
  }
  window.LESSONS.sort((a,b)=>a.lesson-b.lesson);
}

/* ---------- 오디오 (한 번에 하나만 재생) ---------- */
let audio = null, playingBtn = null;
function stopCurrent(){
  if(audio){audio.pause();audio.currentTime=0;}
  if(playingBtn){playingBtn.classList.remove('playing');playingBtn.setAttribute('aria-pressed','false');}
  audio=null; playingBtn=null;
}
function markMissing(btn){
  btn.classList.remove('playing'); btn.classList.add('missing'); btn.disabled=true;
  btn.querySelector('.txt').insertAdjacentHTML('beforeend','<span class="note">음성 준비 중</span>');
}
function play(btn, src){
  stopCurrent();                       // 다시 눌러도 처음부터 다시 재생
  const a = new Audio(src);
  audio=a; playingBtn=btn;
  btn.classList.add('playing'); btn.setAttribute('aria-pressed','true');
  const done=()=>{ if(audio===a) stopCurrent(); };
  a.addEventListener('ended',done);
  a.addEventListener('error',()=>{ if(audio===a) audio=null,playingBtn=null; markMissing(btn); });
  a.play().catch(err=>{ if(err.name!=='AbortError' && a.error==null) done(); });
}

/* ---------- 화면 그리기 ---------- */
function audioPath(lesson, file){
  return file ? `${lesson.audioDir || `audio/lesson${lesson.lesson}/`}${file}` : null;
}
function makeCard(lesson, item, index){
  const b=document.createElement('button');
  b.type='button'; b.className='card'; b.setAttribute('aria-pressed','false');
  const number=document.createElement('span'); number.className='card-number'; number.textContent=String(index+1).padStart(2,'0');
  const lang=document.createElement('span'); lang.className='txt'; lang.lang='fr'; lang.textContent=item.text;
  const icon=document.createElement('span'); icon.className='icon'; icon.innerHTML=SPEAKER+BARS;
  b.append(number,lang,icon);
  const src=audioPath(lesson,item.audio);
  if(!src){ markMissing(b); }
  else b.addEventListener('click',()=>play(b,src));
  return b;
}
function renderLesson(lesson){
  stopCurrent();
  $content.innerHTML='';
  $current.textContent=`현재 선택: ${lesson.title || lesson.lesson+'차시'}`;
  const sections=(lesson.sections||[]).filter(s=>s.items&&s.items.length);
  if(!sections.length){
    $content.innerHTML='<div class="empty-note">이 차시의 자료는 아직 준비 중이에요. 🎧</div>'; return;
  }
  sections.forEach(sec=>{
    const el=document.createElement('section'); el.className='section';
    const h=document.createElement('h2'); h.textContent=sec.title||'';
    const small=document.createElement('small'); small.textContent=`${sec.items.length}개`; h.append(small);
    const grid=document.createElement('div'); grid.className='grid'+(sec.columns===3?' cols-3':'');
    sec.items.forEach((it,index)=>grid.append(makeCard(lesson,it,index)));
    el.append(h,grid); $content.append(el);
  });
}
function hasContent(l){return (l.sections||[]).some(s=>s.items&&s.items.length)}
function select(n){
  const lesson=window.LESSONS.find(l=>l.lesson===n); if(!lesson) return;
  [...$tabs.children].forEach(t=>t.setAttribute('aria-selected',String(+t.dataset.n===n)));
  history.replaceState(null,'','#'+n);
  renderLesson(lesson);
}

(async function init(){
  await loadAllLessons();
  if(!window.LESSONS.length){ $content.innerHTML='<div class="empty-note">차시 데이터를 찾을 수 없어요. data/lessons 폴더를 확인해 주세요.</div>'; return; }
  window.LESSONS.forEach(l=>{
    const t=document.createElement('button'); t.type='button'; t.role='tab';
    t.className='tab'+(hasContent(l)?'':' empty'); t.dataset.n=l.lesson;
    t.textContent=l.title||`${l.lesson}차시`;
    t.addEventListener('click',()=>select(l.lesson));
    $tabs.append(t);
  });
  const fromHash=parseInt(location.hash.slice(1),10);
  const latest=[...window.LESSONS].reverse().find(hasContent) || window.LESSONS[0];
  select(window.LESSONS.some(l=>l.lesson===fromHash)?fromHash:latest.lesson);
})();
