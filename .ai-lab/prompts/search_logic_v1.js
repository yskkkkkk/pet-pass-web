/**
 * [V1] 기존 검색 및 필터링 로직 (Issue 3, 4 해결 직후 버전)
 *
 * 주요 특징:
 * 1. 행정구역 매칭 가중치: 주소 split 후 '정확히 일치(100)', '전방 일치(50)' 부여
 * 2. 텍스트 검색: Hangul.search 사용 시 이름(10), 주소(5) 부여
 * 3. 검색 범위: 검색어 입력 시 지도 Viewport 제한 무시
 * 4. 최적화: 300ms 디바운싱 및 2글자 제한
 */

function applyFilters_V1() {
  const currentFilterKey = `${currentCategory}-${currentRegion1}-${currentRegion2}-${currentSearch}-${currentBoundsFilter ? currentBoundsFilter.toString() : 'none'}`;

  if (lastFilterKey === currentFilterKey) return;
  lastFilterKey = currentFilterKey;

  const keyword = currentSearch.trim();
  const resultsWithScore = [];

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    let score = 0;

    // 1. 카테고리 필터
    const matchCategory = (currentCategory === '전체') || (store.type === currentCategory);
    if (!matchCategory) continue;

    // 2. 지역 필터
    let matchRegion = true;
    if (currentRegion1 !== '전국') {
      const matchRegion1 = store.address.includes(currentRegion1);
      let matchRegion2 = true;
      if (currentRegion2 !== '전체') {
        matchRegion2 = store.address.includes(currentRegion2);
      }
      matchRegion = matchRegion1 && matchRegion2;
    }
    if (!matchRegion) continue;

    // 3. 텍스트 검색 (가중치 기반)
    let matchSearch = true;
    if (keyword !== '') {
      matchSearch = false;
      const addressParts = store.address.split(' ');

      // 행정구역 매칭 가중치
      for (const part of addressParts) {
        if (part === keyword) {
          score += 100;
          matchSearch = true;
        } else if (part.startsWith(keyword)) {
          score += 50;
          matchSearch = true;
        }
      }

      if (typeof Hangul !== 'undefined') {
        const matchName = Hangul.search(store.name, keyword) !== -1;
        const matchAddr = Hangul.search(store.address, keyword) !== -1;
        if (matchName) score += 10;
        if (matchAddr) score += 5;
        if (matchName || matchAddr) matchSearch = true;
      } else {
        const lowerKeyword = keyword.toLowerCase();
        const matchName = store.name.toLowerCase().includes(lowerKeyword);
        const matchAddr = store.address.toLowerCase().includes(lowerKeyword);
        if (matchName) score += 10;
        if (matchAddr) score += 5;
        if (matchName || matchAddr) matchSearch = true;
      }
    }
    if (!matchSearch) continue;

    // 4. 지도 영역 필터
    let matchBounds = true;
    if (currentBoundsFilter && window.kakao && keyword === '') {
      const position = new kakao.maps.LatLng(store.lat, store.lng);
      matchBounds = currentBoundsFilter.contain(position);
    }
    if (!matchBounds) continue;

    resultsWithScore.push({ store, score });
  }

  if (keyword !== '') {
    resultsWithScore.sort((a, b) => b.score - a.score);
  }

  const finalResults = resultsWithScore.map(r => r.store);
  renderStores(finalResults);
  updateMapMarkers(finalResults);
}
