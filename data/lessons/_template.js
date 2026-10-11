// ============================================================
// 새 차시 템플릿
// 1) 이 파일을 복사해서 이름을 lesson7.js (8이면 lesson8.js …) 로 바꾼다
// 2) 아래 lesson 숫자, title 을 바꾼다
// 3) audio/lesson7/ 폴더를 만들고 mp3 를 넣는다
// 4) items 에 { text: "화면 글자", audio: "파일이름.mp3" } 를 적는다
// ============================================================
window.LESSONS.push({
  lesson: 7,
  title: "7차시",
  sections: [
    {
      title: "단어",            // 섹션 이름 (자유롭게)
      items: [
        { text: "bonjour", audio: "01_bonjour.mp3" },
        { text: "merci",   audio: "02_merci.mp3" },
      ],
    },
    {
      title: "문장",
      // columns: 3,            // (선택) 한 줄에 3개씩 보이게 하려면 주석 해제
      items: [
        { text: "Je m'appelle Julie.", audio: "03_je_mappelle_julie.mp3" },
      ],
    },
  ],
});
