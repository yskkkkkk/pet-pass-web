/**
 * [V2] 고도화된 가중치 기반 검색 로직
 *
 * 주요 개선 사항:
 * 1. 세분화된 가중치(WEIGHTS) 시스템 도입
 *    - 매장명 정확히 일치(1000) > 행정구역 정확히 일치(800) > 매장명 전방 일치(600) 등
 * 2. 지도 영역 보너스(IN_BOUNDS_BONUS: 150)
 *    - 현재 사용자가 보고 있는 지도 화면 내의 매장을 검색 결과 상단에 우선 배치
 * 3. 정교한 정렬(Tie-breaking)
 *    - 가중치 점수가 같을 경우 매장명을 가나다순으로 정렬하여 일관된 결과 제공
 * 4. 초성 검색 통합
 *    - 한글 초성 검색 시에도 적절한 가중치(350)를 부여하여 검색 유연성 확보
 */

const WEIGHTS = {
  NAME_EXACT: 1000,
  ADDR_PART_EXACT: 800,
  NAME_STARTS_WITH: 600,
  ADDR_PART_STARTS_WITH: 400,
  CHOSUNG_MATCH: 350,
  NAME_CONTAINS: 300,
  IN_BOUNDS_BONUS: 150,
  ADDR_CONTAINS: 100
};

function applyFilters_V2() {
  // ... (필터 키 체크 및 초기화)

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    let score = 0;

    // (하드 필터: 카테고리/지역 생략)

    // 지도 영역 보너스 점수
    if (mapBounds && mapBounds.contain(pos)) {
      score += WEIGHTS.IN_BOUNDS_BONUS;
    }

    if (keyword !== '') {
      // 매장명 매칭 (Exact > StartsWith > Contains)
      // 초성 매칭 (Hangul.search)
      // 주소 매칭 (Administrative parts EXACT > STARTS_WITH > CONTAINS)

      if (!hasMatch) continue;
    }

    resultsWithScore.push({ store, score });
  }

  // 최종 정렬 (Score DESC, Name ASC)
  resultsWithScore.sort((a, b) => b.score - a.score || a.store.name.localeCompare(b.store.name));

  // (렌더링 및 마커 업데이트 생략)
}
