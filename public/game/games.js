/**
 * 미니게임 목록 — 허브 화면(/game)과 서버(api/game.js)가 함께 읽는 유일한 목록.
 *
 * 게임을 추가하려면 여기에 항목을 하나 추가한다. (자세한 순서는 docs/minigame_structure.md)
 *   type  'party' 같이 하는 게임: PC 진행 + 휴대폰 참가. 서버 규칙이 lib/game/games/<id>/ 에 있어야 한다.
 *         'solo'  혼자 하는 게임: 브라우저 안에서만 동작. 서버 코드가 필요 없다.
 *   path  게임 첫 화면 주소. 같이 하는 게임은 그 아래에 host(진행)·play(참가) 화면을 둔다.
 *   minPlayers / maxPlayers  (같이 하는 게임) 시작 가능한 인원
 *   settings  (같이 하는 게임) 진행자가 대기실에서 바꾸는 설정. 형식은 lib/game/settings.js
 *             예: { key: 'rounds', label: '라운드 수', type: 'int', min: 3, max: 20, default: 10 }
 *             choice의 value는 숫자도 된다 (대기실이 고른 항목의 value를 그대로 보낸다)
 *             hidden: true면 대기실에 입력칸을 그리지 않는다 (방을 만들 때 정하는 값)
 */
(function (root, factory) {
  var games = factory();
  if (typeof module === 'object' && module.exports) module.exports = games;
  else root.MG_GAMES = games;
})(this, function () {
  return [
    {
      id: 'minority',
      type: 'party',
      name: '소수결 게임',
      tagline: '같은 질문에 A와 B 중 하나를 고르고, 더 적은 사람이 고른 쪽만 살아남습니다.',
      players: '3명 이상',
      path: '/game/minority',
      minPlayers: 3,
      maxPlayers: 200,
      settings: []
    },
    {
      id: 'auction',
      type: 'party',
      name: '블라인드 경매',
      tagline: '한정된 칩으로 몰래 입찰해서, 가장 많이 건 사람이 물건을 가져갑니다. 칩은 이기든 지든 사라져요.',
      players: '2~15명',
      path: '/game/auction',
      minPlayers: 2,
      maxPlayers: 15,
      settings: [
        { key: 'rounds', label: '라운드 수', type: 'int', min: 5, max: 15, default: 10 },
        { key: 'chips', label: '시작 칩', type: 'choice', options: [{ value: 50, label: '50개' }, { value: 100, label: '100개' }, { value: 200, label: '200개' }], default: 100 },
        { key: 'surprises', label: '돌발 물건 (미스터리 상자·저주 물건)', type: 'bool', default: true },
        { key: 'screen', label: '진행 화면', type: 'choice', options: [{ value: 'phone', label: '휴대폰만' }, { value: 'pc', label: 'PC 화면' }], default: 'pc', hidden: true }
      ]
    }
  ];
});
