const stores = [
  {
    id: 1,
    name: "그리너리 베이크샵 (Greenery Bakeshop)",
    type: "제과점",
    description: "2026 식약처 공식 인증 1호점. 조리장과 완전히 분리된 쾌적한 전용석을 갖추고 있습니다.",
    address: "서울시 강남구 테헤란로 123",
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
    verified: true,
    facilities: ["전용 식기", "울타리 구역", "리드줄 걸이", "대형견 가능"],
    compliance: {
      separation: "완전 차단형 (강화유리 칸막이)",
      ventilation: "개별 공조 시스템 설치",
      hygiene: "자체 멸균 식기 세척기 보유"
    },
    lat: 37.498,
    lng: 127.027
  },
  {
    id: 2,
    name: "도어즈 커피 (Doors Coffee)",
    type: "카페",
    description: "반려인과 비반려인이 모두 행복한 공간. 입구부터 철저한 예방접종 확인을 거칩니다.",
    address: "서울시 마포구 망원동 456",
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80",
    verified: true,
    facilities: ["무료 간식", "케이지 대여", "고정 고리"],
    compliance: {
      separation: "좌석 고정형 케이지 제공",
      ventilation: "공기 살균기 상시 가동",
      hygiene: "1회용 반려동물 전용 매트 제공"
    },
    lat: 37.556,
    lng: 126.904
  },
  {
    id: 3,
    name: "테이블 하우스 (Table House)",
    type: "일반음식점",
    description: "국내 최초 '펫-테이블' 정식 도입 업소. 반려동물과 동급의 식사 환경을 제공합니다.",
    address: "경기도 성남시 분당구 판교역로 789",
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
    verified: true,
    facilities: ["반려견 메뉴", "전용 의자", "울타리"],
    compliance: {
      separation: "테이블 간 간격 2M 이상 유지",
      ventilation: "상시 환기 시스템",
      hygiene: "식기 전용 살균 보관함"
    },
    lat: 37.395,
    lng: 127.111
  },
  {
    id: 4,
    name: "오션 펫 비스트로 (Ocean Pet Bistro)",
    type: "일반음식점",
    description: "프리미엄 오션뷰와 함께하는 반려견 동반 레스토랑. 대형견도 편안하게 즐길 수 있습니다.",
    address: "부산시 해운대구 달맞이길 11-1",
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=800&q=80",
    verified: true,
    facilities: ["전용 해변 산책로", "울타리 구역", "대형견 가능", "반려견 화장실"],
    compliance: {
      separation: "야외 테라스 특화 분리 구역",
      ventilation: "탁 트인 개방형 구조",
      hygiene: "전문 인력 수시 청소 감독"
    },
    lat: 35.158,
    lng: 129.160
  },
  {
    id: 5,
    name: "제주 곶자왈 퍼피 카페",
    type: "카페",
    description: "자연 속에서 힐링하는 애견동반 카페. 자체 방역과 위생 수칙을 철저히 준수합니다.",
    address: "제주도 서귀포시 안덕면 산록남로 123",
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=800&q=80",
    verified: true,
    facilities: ["천연 잔디 운동장", "무료 배변봉투", "음수대"],
    compliance: {
      separation: "음료 제조 구역 완전 격리",
      ventilation: "음이온 공기 정화 시스템",
      hygiene: "입장 전 진드기 소독 필수"
    },
    lat: 33.275,
    lng: 126.358
  },
  {
    id: 6,
    name: "멍당 (Mung-Dang)",
    type: "제과점",
    description: "견주도 먹고 강아지도 먹을 수 있는 휴먼그레이드 베이커리. 위생 1등급 인증.",
    address: "서울시 용산구 이태원로 45",
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1581888227599-779811939961?auto=format&fit=crop&w=800&q=80",
    verified: true,
    facilities: ["전용 식기", "리드줄 걸이"],
    compliance: {
      separation: "진열대 유리 차단 (비말 차단)",
      ventilation: "상시 환기",
      hygiene: "UV 살균 소독기 운용"
    },
    lat: 37.534,
    lng: 126.990
  }
];
