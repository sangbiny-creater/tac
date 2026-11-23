'use strict';
// 타임어택 연산 광고 설정 — 웹은 AdSense(web), 앱은 AdMob(아래). 한국사와 같은 구글 게시자 계정 pub-8824642278407065
//  AdSense 사이트는 brown-crab.com 으로 신청돼 있어서 하위 도메인(tac.brown-crab.com)에도 그대로 쓸 수 있음.
//  ads.txt 는 tools/publish.sh 가 web.client 값으로 자동으로 만듦.
window.ADS_CONFIG = {
  // ===== 웹 (tac.brown-crab.com) — 구글 AdSense =====
  //  client: AdSense 게시자 ID 'ca-pub-숫자16자리'
  //  bannerSlot: 문제 화면 맨 위 배너 광고 단위 ID. 지금은 한국사 광고 단위(takh_quiz_top_320x50)를 함께 씀.
  //             연산 수익을 따로 보고 싶으면 AdSense → 광고 → 광고 단위별 → 디스플레이 광고(320x50)를 'tac_quiz_top_320x50' 으로 만들고 숫자 10자리를 여기에.
  //  rewarded: '광고 보고 다시 도전'에 AdSense H5 게임 광고(보상형) 사용
  //  test: true 면 진짜 광고 대신 구글 시험 광고 (애드센스 승인 전 확인용). 승인 뒤 false 로.
  web: {
    client: 'ca-pub-8824642278407065',
    bannerSlot: '1014984486',
    rewarded: true,
    test: true,
  },

  // ===== 앱 (나중에 Capacitor 로 만들 때) — AdMob =====
  //  앱을 만들 때 AdMob 에 '타임어택 연산' 앱과 광고 단위 2개(tac_quiz_top_banner · tac_retry_rewarded)를 만들고 아래를 바꾸세요.
  //  지금 값은 구글 공식 시험용 광고 단위예요.
  test: true,
  banner: 'ca-app-pub-3940256099942544/6300978111',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};
