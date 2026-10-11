/* 프랑스어 레슨 편집기: 서버 없이 브라우저에서 작동합니다. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const list=$('#lesson-list'), sectionList=$('#section-list');
  let lessons=[], selected=null, dirty=false, directoryHandle=null, sourceZip=null, sourceRoot='french-audio-site/';
  const audioBlobs=new Map();
  const uid=()=>crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
  const clone=o=>JSON.parse(JSON.stringify(o));
  const escapeJs=s=>JSON.stringify(String(s)).replace(/</g,'\\u003c');

  function normalizeLesson(l){
    return {id:l.id||uid(),lesson:Number(l.lesson)||1,title:l.title||`${l.lesson||1}차시`,sections:(l.sections||[]).map(s=>({id:s.id||uid(),title:s.title||'새 섹션',columns:Number(s.columns)||0,items:(s.items||[]).map(i=>({id:i.id||uid(),text:i.text||'',audio:i.audio||'',sourcePath:i.sourcePath||((i.audio&&l.lesson)?`audio/lesson${l.lesson}/${i.audio}`:'')}))}))};
  }
  function setStatus(message,connected){ $('#status').textContent=message; $('#connection-dot').classList.toggle('connected',!!connected); }
  let toastTimer; function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}
  function changed(){dirty=true; setStatus('저장하지 않은 변경 사항이 있어요.',!!directoryHandle);}
  function fileNameSafe(name,fallback='audio.mp3'){return (name||fallback).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/^\.+/,'_').slice(0,140)||fallback}
  function uniqueAudioName(lesson,file,item){
    const base=fileNameSafe(file.name); const used=new Set();
    lesson.sections.forEach(s=>s.items.forEach(i=>{if(i!==item&&i.audio)used.add(i.audio.toLowerCase())}));
    if(!used.has(base.toLowerCase()))return base;
    const dot=base.lastIndexOf('.'), stem=dot>0?base.slice(0,dot):base, ext=dot>0?base.slice(dot):'';
    let n=2,candidate;do{candidate=`${stem}_${n++}${ext}`}while(used.has(candidate.toLowerCase()));return candidate;
  }

  async function loadBundledLessons(){
    window.LESSONS=[];
    await new Promise(resolve=>{const s=document.createElement('script');s.src='data/lessons/manifest.js';s.onload=s.onerror=()=>resolve();document.head.appendChild(s)});
    const numbers=Array.isArray(window.LESSON_FILES)?window.LESSON_FILES:Array.from({length:100},(_,i)=>i+1);
    for(const n of numbers){
      const ok=await new Promise(resolve=>{const s=document.createElement('script');s.src=`data/lessons/lesson${n}.js`;s.onload=()=>resolve(true);s.onerror=()=>{s.remove();resolve(false)};document.head.appendChild(s)});
      if(!ok&&!Array.isArray(window.LESSON_FILES))break;
    }
    lessons=(window.LESSONS||[]).map(normalizeLesson).sort((a,b)=>a.lesson-b.lesson); selected=lessons[0]?.id||null; render();
  }

  function render(){
    lessons.sort((a,b)=>a.lesson-b.lesson);
    list.innerHTML='';
    lessons.forEach(l=>{const b=document.createElement('button');b.type='button';b.className='lesson-tab'+(l.id===selected?' active':'');b.innerHTML=`<span class="badge">${l.lesson}</span><span class="label"></span>`;b.querySelector('.label').textContent=l.title;b.onclick=()=>{selected=l.id;render()};list.append(b)});
    const lesson=lessons.find(l=>l.id===selected);
    $('#empty-state').hidden=!!lesson; $('#lesson-editor').hidden=!lesson;
    if(!lesson)return;
    $('#lesson-title').value=lesson.title; $('#lesson-number').value=lesson.lesson;
    sectionList.innerHTML=''; lesson.sections.forEach((s,si)=>sectionList.append(renderSection(lesson,s,si)));
  }

  function renderSection(lesson,section,si){
    const card=document.createElement('section');card.className='section-card panel';card.dataset.id=section.id;
    const head=document.createElement('div');head.className='section-head';
    head.innerHTML=`<span class="section-handle" title="섹션">▦</span><div class="field"><label>섹션 이름</label><input class="section-title" type="text"></div><div class="field columns-field"><label>카드 배열</label><select class="section-columns"><option value="0">자동</option><option value="3">3열</option></select></div><div class="section-tools"><button class="mini section-up" type="button" title="위로">↑</button><button class="mini section-down" type="button" title="아래로">↓</button><button class="mini delete section-delete" type="button" title="삭제">×</button></div>`;
    head.querySelector('.section-title').value=section.title;head.querySelector('.section-columns').value=String(section.columns||0);
    head.querySelector('.section-title').oninput=e=>{section.title=e.target.value;changed()};head.querySelector('.section-columns').onchange=e=>{section.columns=Number(e.target.value);changed()};
    head.querySelector('.section-up').onclick=()=>move(lesson.sections,si,-1);head.querySelector('.section-down').onclick=()=>move(lesson.sections,si,1);
    head.querySelector('.section-delete').onclick=()=>confirmDelete(`“${section.title}” 섹션과 안의 카드 ${section.items.length}개를 삭제합니다.`,()=>{lesson.sections.splice(si,1);changed();render()});
    card.append(head);
    const items=document.createElement('div');items.className='items';section.items.forEach((item,ii)=>items.append(renderItem(lesson,section,item,ii)));card.append(items);
    const add=document.createElement('button');add.type='button';add.className='add-item';add.textContent='＋ 카드 추가';add.onclick=()=>{section.items.push({id:uid(),text:'',audio:'',sourcePath:''});changed();render();setTimeout(()=>{const rows=card.querySelectorAll('.item-text');rows[rows.length-1]?.focus()},0)};card.append(add);return card;
  }

  function renderItem(lesson,section,item,ii){
    const row=document.createElement('div');row.className='item-row';
    row.innerHTML=`<span class="item-number">${ii+1}</span><input class="item-text" type="text" placeholder="프랑스어 단어나 문장"><div class="audio-control"><button class="mini audio-play" type="button" title="미리 듣기">▶</button><span class="audio-name"></span><label class="audio-pick">음성 선택<input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg"></label></div><div class="row-tools"><button class="mini item-up" type="button" title="위로">↑</button><button class="mini item-down" type="button" title="아래로">↓</button><button class="mini delete item-delete" type="button" title="삭제">×</button></div>`;
    const text=row.querySelector('.item-text'),name=row.querySelector('.audio-name');text.value=item.text;name.textContent=item.audio||'음성 없음';name.classList.toggle('missing',!item.audio);
    text.oninput=e=>{item.text=e.target.value;changed()};
    row.querySelector('input[type=file]').onchange=e=>{const file=e.target.files[0];if(!file)return;const old=item.blobKey;if(old)audioBlobs.delete(old);item.audio=uniqueAudioName(lesson,file,item);item.blobKey=uid();item.sourcePath='';audioBlobs.set(item.blobKey,file);changed();render()};
    row.querySelector('.audio-play').onclick=async()=>{try{const blob=await audioBlobFor(item,lesson);if(!blob)throw new Error('음성 파일을 찾을 수 없습니다.');const url=URL.createObjectURL(blob),a=new Audio(url);a.onended=()=>URL.revokeObjectURL(url);a.onerror=()=>URL.revokeObjectURL(url);await a.play()}catch(e){toast(e.message)}};
    row.querySelector('.item-up').onclick=()=>move(section.items,ii,-1);row.querySelector('.item-down').onclick=()=>move(section.items,ii,1);
    row.querySelector('.item-delete').onclick=()=>{if(item.blobKey)audioBlobs.delete(item.blobKey);section.items.splice(ii,1);changed();render()};return row;
  }
  function move(arr,index,delta){const to=index+delta;if(to<0||to>=arr.length)return;[arr[index],arr[to]]=[arr[to],arr[index]];changed();render()}

  $('#lesson-title').oninput=e=>{const l=current();l.title=e.target.value;changed();renderTabsOnly()};
  $('#lesson-number').onchange=e=>{const l=current(),n=Math.max(1,Number(e.target.value)||1);if(lessons.some(x=>x!==l&&x.lesson===n)){toast(`${n}번 레슨이 이미 있어요.`);e.target.value=l.lesson;return}l.lesson=n;if(!l.title.trim())l.title=`${n}차시`;changed();render()};
  function renderTabsOnly(){[...list.children].forEach((b,i)=>b.querySelector('.label').textContent=lessons[i].title)}
  function current(){return lessons.find(l=>l.id===selected)}
  $('#add-lesson').onclick=()=>{const n=Math.max(0,...lessons.map(l=>l.lesson))+1,l=normalizeLesson({lesson:n,title:`${n}차시`,sections:[]});lessons.push(l);selected=l.id;changed();render();setTimeout(()=>$('#lesson-title').select(),0)};
  $('#add-section').onclick=()=>{const l=current();l.sections.push({id:uid(),title:'새 섹션',columns:0,items:[]});changed();render()};
  $('#delete-lesson').onclick=()=>{const l=current();confirmDelete(`“${l.title}”와 안의 모든 섹션을 삭제합니다.`,()=>{lessons=lessons.filter(x=>x!==l);selected=lessons[0]?.id||null;changed();render()})};
  function confirmDelete(message,onConfirm){const d=$('#confirm-dialog');$('#confirm-message').textContent=message;d.showModal();d.onclose=()=>{if(d.returnValue==='confirm')onConfirm()}}

  function lessonJs(l){
    const sections=l.sections.map(s=>`    {\n      title: ${escapeJs(s.title)},${s.columns===3?'\n      columns: 3,':''}\n      items: [\n${s.items.map(i=>`        { text: ${escapeJs(i.text)}, audio: ${i.audio?escapeJs(i.audio):'null'} },`).join('\n')}\n      ],\n    },`).join('\n');
    return `// 레슨 편집기에서 생성한 파일입니다.\nwindow.LESSONS.push({\n  lesson: ${l.lesson},\n  title: ${escapeJs(l.title)},\n  sections: [\n${sections}\n  ],\n});\n`;
  }

  async function getDir(root,path,create=false){let h=root;const parts=path.split('/').filter(Boolean);for(const p of parts)h=await h.getDirectoryHandle(p,{create});return h}
  async function getFileFromDir(path){if(!directoryHandle)return null;try{const parts=path.split('/').filter(Boolean),name=parts.pop(),dir=await getDir(directoryHandle,parts.join('/'));return await (await dir.getFileHandle(name)).getFile()}catch{return null}}
  async function audioBlobFor(item,lesson){
    if(item.blobKey&&audioBlobs.has(item.blobKey))return audioBlobs.get(item.blobKey);
    const path=item.sourcePath||`audio/lesson${lesson.lesson}/${item.audio}`;
    const fromDir=await getFileFromDir(path);if(fromDir)return fromDir;
    if(sourceZip){const f=sourceZip.file(sourceRoot+path)||sourceZip.file(path);if(f)return f.async('blob')}
    if(location.protocol!=='file:'){const r=await fetch(path);if(r.ok)return r.blob()}
    return null;
  }
  async function writeFile(dir,path,data){const parts=path.split('/').filter(Boolean),name=parts.pop(),target=await getDir(dir,parts.join('/'),true),handle=await target.getFileHandle(name,{create:true}),w=await handle.createWritable();await w.write(data);await w.close()}

  $('#open-folder').onclick=async()=>{
    if(!window.showDirectoryPicker){toast('이 기능은 Chrome 또는 Edge에서 사용할 수 있어요. ZIP 방식을 이용해 주세요.');return}
    try{let h=await showDirectoryPicker({mode:'readwrite'});if((await h.queryPermission({mode:'readwrite'}))!=='granted'&&(await h.requestPermission({mode:'readwrite'}))!=='granted')throw new Error('폴더 쓰기 권한이 필요합니다.');directoryHandle=h;setStatus(`“${h.name}” 폴더가 연결됐어요.`,true);toast('사이트 폴더 연결 완료')}catch(e){if(e.name!=='AbortError')toast(e.message)}
  };
  $('#save-folder').onclick=async()=>{
    if(!directoryHandle){$('#open-folder').click();return}
    try{setStatus('파일을 저장하는 중…',true);await writeFile(directoryHandle,'data/lessons/manifest.js',manifestJs());for(const l of lessons){await writeFile(directoryHandle,`data/lessons/lesson${l.lesson}.js`,lessonJs(l));for(const s of l.sections)for(const i of s.items)if(i.audio){const blob=await audioBlobFor(i,l);if(!blob)throw new Error(`“${i.text||i.audio}”의 음성 파일을 찾을 수 없습니다.`);await writeFile(directoryHandle,`audio/lesson${l.lesson}/${i.audio}`,blob);i.sourcePath=`audio/lesson${l.lesson}/${i.audio}`;delete i.blobKey}}
      audioBlobs.clear();dirty=false;setStatus(`“${directoryHandle.name}” 폴더에 저장했어요.`,true);toast('저장 완료')
    }catch(e){setStatus('저장 중 문제가 생겼어요.',true);toast(e.message)}
  };

  $('#zip-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{setStatus('ZIP을 읽는 중…',false);sourceZip=await JSZip.loadAsync(file);const names=Object.keys(sourceZip.files),index=names.find(n=>/(^|\/)index\.html$/i.test(n));sourceRoot=index?index.slice(0,index.lastIndexOf('/')+1):'';const parsed=[];for(const name of names.filter(n=>new RegExp(`^${sourceRoot.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}data/lessons/lesson\\d+\\.js$`,'i').test(n)).sort()){const text=await sourceZip.file(name).async('text'),found=parseLesson(text);if(found)parsed.push(found)}if(parsed.length){lessons=parsed.map(normalizeLesson).sort((a,b)=>a.lesson-b.lesson);selected=lessons[0]?.id||null;dirty=false;render()}setStatus(`“${file.name}”을 불러왔어요.`,false);toast(`${parsed.length}개 레슨을 불러왔어요.`)}catch(err){sourceZip=null;toast('ZIP을 읽지 못했습니다: '+err.message)}finally{e.target.value=''}};
  function parseLesson(text){
    try{
      const marker=text.indexOf('.push('),start=marker<0?-1:text.indexOf('(',marker)+1,end=text.lastIndexOf(');');
      if(start<1||end<=start)return null;
      const value=JSON5.parse(text.slice(start,end));
      return value&&typeof value==='object'&&Number.isFinite(Number(value.lesson))?value:null;
    }catch{return null}
  }

  async function addDirectoryToZip(zip,handle,prefix=''){
    for await(const [name,entry] of handle.entries()){const path=prefix+name;if(entry.kind==='directory')await addDirectoryToZip(zip,entry,path+'/');else zip.file(path,await (await entry.getFile()).arrayBuffer())}
  }
  $('#export-zip').onclick=async()=>{
    try{setStatus('완성 ZIP을 만드는 중…',!!directoryHandle);let zip=new JSZip(),root='french-audio-site/';
      if(sourceZip){for(const [name,entry] of Object.entries(sourceZip.files))if(!entry.dir)zip.file(name,await entry.async('arraybuffer'));root=sourceRoot||root}
      else if(directoryHandle){await addDirectoryToZip(zip,directoryHandle,root)}
      else throw new Error('먼저 사이트 폴더를 연결하거나, 현재 사이트 ZIP을 불러와 주세요.');
      Object.keys(zip.files).filter(n=>n.startsWith(root+'data/lessons/lesson')&&/\.js$/i.test(n)).forEach(n=>zip.remove(n));
      zip.file(`${root}data/lessons/manifest.js`,manifestJs());
      for(const l of lessons){zip.file(`${root}data/lessons/lesson${l.lesson}.js`,lessonJs(l));for(const s of l.sections)for(const i of s.items)if(i.audio){const blob=await audioBlobFor(i,l);if(!blob)throw new Error(`“${i.text||i.audio}”의 음성 파일을 찾을 수 없습니다.`);zip.file(`${root}audio/lesson${l.lesson}/${i.audio}`,blob)}}
      const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download='french-audio-site-edited.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);dirty=false;setStatus('완성 ZIP을 내려받았어요.',!!directoryHandle);toast('ZIP 내보내기 완료')
    }catch(e){setStatus('ZIP을 만들지 못했어요.',!!directoryHandle);toast(e.message)}
  };

  /* ---------- GitHub 원클릭 저장 ---------- */
  const GH_CONFIG_KEY='frenchLessonGithubConfig',GH_LOCAL_TOKEN='frenchLessonGithubToken',GH_SESSION_TOKEN='frenchLessonGithubSessionToken';
  function githubConfig(){
    try{return {...{owner:'libok03',repo:'test',branch:'main',path:''},...JSON.parse(localStorage.getItem(GH_CONFIG_KEY)||'{}')}}
    catch{return {owner:'libok03',repo:'test',branch:'main',path:''}}
  }
  function githubToken(){return sessionStorage.getItem(GH_SESSION_TOKEN)||localStorage.getItem(GH_LOCAL_TOKEN)||''}
  function cleanRepoPath(path){return String(path||'').trim().replace(/^\/+|\/+$/g,'').replace(/\/{2,}/g,'/')}
  function openGithubSettings(){
    const c=githubConfig();$('#github-owner').value=c.owner;$('#github-repo').value=c.repo;$('#github-branch').value=c.branch;$('#github-path').value=c.path;$('#github-token').value=githubToken();$('#github-remember').checked=!!localStorage.getItem(GH_LOCAL_TOKEN);const result=$('#github-test-result');result.textContent='';result.className='test-result';$('#github-dialog').showModal();
  }
  $('#github-settings').onclick=openGithubSettings;
  $('#github-cancel').onclick=()=>$('#github-dialog').close();
  async function githubApi(path,options={},token=githubToken()){
    const response=await fetch(`https://api.github.com${path}`,{...options,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
    const data=response.status===204?{}:await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.message||`GitHub 오류 (${response.status})`);error.status=response.status;throw error}return data;
  }
  $('#github-form').onsubmit=async e=>{
    e.preventDefault();const result=$('#github-test-result');result.textContent='연결을 확인하는 중…';result.className='test-result';
    const config={owner:$('#github-owner').value.trim(),repo:$('#github-repo').value.trim(),branch:$('#github-branch').value.trim()||'main',path:cleanRepoPath($('#github-path').value)};const token=$('#github-token').value.trim();
    try{await githubApi(`/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,{},token);localStorage.setItem(GH_CONFIG_KEY,JSON.stringify(config));sessionStorage.setItem(GH_SESSION_TOKEN,token);if($('#github-remember').checked)localStorage.setItem(GH_LOCAL_TOKEN,token);else localStorage.removeItem(GH_LOCAL_TOKEN);result.textContent='연결됐습니다. 이제 GitHub에 저장할 수 있어요.';result.className='test-result success';setTimeout(()=>$('#github-dialog').close(),700);setStatus(`GitHub ${config.owner}/${config.repo}에 연결됐어요.`,true)}catch(err){result.textContent=err.status===401?'토큰을 확인해 주세요.':err.status===404?'저장소 이름이나 토큰 권한을 확인해 주세요.':err.message;result.className='test-result error'}
  };
  function arrayBufferToBase64(buffer){const bytes=new Uint8Array(buffer);let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary)}
  async function saveToGithub(){
    const config=githubConfig(),token=githubToken();if(!token){openGithubSettings();return}
    const prefix=config.path?config.path+'/':'',repo=`${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
    $('#github-save').disabled=true;setStatus('GitHub에 저장할 파일을 준비하는 중…',true);
    try{
      const ref=await githubApi(`/repos/${repo}/git/ref/heads/${encodeURIComponent(config.branch)}`),parent=ref.object.sha,commit=await githubApi(`/repos/${repo}/git/commits/${parent}`),existing=await githubApi(`/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
      const files=[{path:`${prefix}data/lessons/manifest.js`,text:manifestJs()}];
      for(const l of lessons){files.push({path:`${prefix}data/lessons/lesson${l.lesson}.js`,text:lessonJs(l)});for(const s of l.sections)for(const i of s.items)if(i.audio){const blob=await audioBlobFor(i,l);if(!blob)throw new Error(`“${i.text||i.audio}”의 음성 파일을 찾을 수 없습니다.`);files.push({path:`${prefix}audio/lesson${l.lesson}/${i.audio}`,blob})}}
      const wantedLessons=new Set(lessons.map(l=>`${prefix}data/lessons/lesson${l.lesson}.js`)),tree=[];
      for(const entry of existing.tree||[])if(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}data/lessons/lesson\\d+\\.js$`).test(entry.path)&&!wantedLessons.has(entry.path))tree.push({path:entry.path,mode:'100644',type:'blob',sha:null});
      let done=0;for(const file of files){setStatus(`GitHub에 업로드 중… ${++done}/${files.length}`,true);const payload=file.text!=null?{content:file.text,encoding:'utf-8'}:{content:arrayBufferToBase64(await file.blob.arrayBuffer()),encoding:'base64'};const created=await githubApi(`/repos/${repo}/git/blobs`,{method:'POST',body:JSON.stringify(payload)});tree.push({path:file.path,mode:'100644',type:'blob',sha:created.sha})}
      const newTree=await githubApi(`/repos/${repo}/git/trees`,{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree})}),newCommit=await githubApi(`/repos/${repo}/git/commits`,{method:'POST',body:JSON.stringify({message:`레슨 편집기에서 업데이트 (${new Date().toLocaleString('ko-KR')})`,tree:newTree.sha,parents:[parent]})});
      await githubApi(`/repos/${repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,{method:'PATCH',body:JSON.stringify({sha:newCommit.sha,force:false})});dirty=false;setStatus('GitHub 저장 완료 — 페이지가 곧 자동으로 갱신됩니다.',true);toast('GitHub에 저장했습니다')
    }catch(err){setStatus('GitHub 저장에 실패했어요.',true);if(err.status===401||err.status===403){toast('토큰 권한을 확인해 주세요.');openGithubSettings()}else if(err.status===409||err.status===422)toast('다른 변경이 먼저 저장됐어요. 페이지를 새로 열고 다시 시도해 주세요.');else toast(err.message)}finally{$('#github-save').disabled=false}
  }
  $('#github-save').onclick=saveToGithub;
  if(githubToken()){const c=githubConfig();setStatus(`GitHub ${c.owner}/${c.repo}에 연결돼 있어요.`,true)}
  addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  function manifestJs(){return `// 레슨 편집기에서 자동 관리합니다.\nwindow.LESSON_FILES = [${lessons.map(l=>l.lesson).sort((a,b)=>a-b).join(', ')}];\n`}
  loadBundledLessons();
})();
