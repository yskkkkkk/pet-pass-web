// HTML 이스케이프 (XSS 방지)
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Throttling utility for performance
 */
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

/**
 * Mobile Viewport Height Fix
 * To prevent layout jumps when the virtual keyboard appears,
 * we only update --vh if the width changes (orientation)
 * or the height change is significant (not just the keyboard).
 */
let lastWidth = window.innerWidth;
function setViewportHeight() {
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;

  // Update only if width changes or for initial load
  if (currentWidth !== lastWidth) {
    const vh = currentHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    lastWidth = currentWidth;
  }
}

// Initial set and throttled resize listener
const vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--vh', `${vh}px`);
window.addEventListener('resize', throttle(setViewportHeight, 150));

let map;
let clusterer = null;
let markers = [];
let stores = []; // Global store data, fetched from API
let selectedStore = null; // 현재 상세 페이지에 표시 중인 매장 정보
let currentBoundsFilter = null; // Store map bounds for filtering
let currentFilteredStores = []; // 현재 필터링된 매장 리스트 (Back-step용)
let lastMapState = null; // 매장 클릭 직전의 지도 상태 저장
let isSystemMoving = false; // 시스템에 의한 지도 이동 플래그
let _systemMoveTimer = null;  // 시스템 이동 락 타이머

/**
 * 시스템 지도 이동 시작 — isSystemMoving 플래그를 true로 설정하고
 * 최대 1500ms 동안 유지하는 안전망 타이머를 추가.
 * setCenter + setLevel 분리 호출 사이에 idle 이벤트가 끼어드는
 * 레이스 컨디션을 방지합니다.
 */
function beginSystemMove() {
  isSystemMoving = true;
  if (_systemMoveTimer) clearTimeout(_systemMoveTimer);
  _systemMoveTimer = setTimeout(() => {
    isSystemMoving = false;
    _systemMoveTimer = null;
  }, 1500);
}

const storeList = document.getElementById('store-list');
const overlay = document.getElementById('overlay');
const storeDetail = document.getElementById('store-detail');
const authModal = document.getElementById('auth-modal');
const infoModal = document.getElementById('info-modal');
const btnSearchHere = document.getElementById('btn-search-here');
const btnBackStep = document.getElementById('btn-back-step');
const btnResetFilters = document.getElementById('btn-reset-filters');
const btnViewMap = document.getElementById('btn-view-map');

// [Issue 3] Map Button State Management
const MapButtonState = {
  NONE: 'NONE',
  SEARCH_HERE: 'SEARCH_HERE',
  GO_BACK: 'GO_BACK'
};

let currentMapButtonState = MapButtonState.NONE;
let mapButtonTimeout = null;

/**
 * [State Machine] Map UI Button Management
 * Ensures 'Search Here' and 'Go Back' buttons never overlap.
 */
function updateMapButtonUI(state) {
  currentMapButtonState = state;
  if (mapButtonTimeout) clearTimeout(mapButtonTimeout);

  // Helper to hide buttons with transition
  const hide = (btn) => {
    btn.style.opacity = '0';
    btn.style.pointerEvents = 'none';
  };

  // Helper to show buttons with transition
  const show = (btn) => {
    btn.style.display = 'block';
    btn.style.pointerEvents = 'auto';
    setTimeout(() => {
      btn.style.opacity = '1';
    }, 10);
  };

  if (state === MapButtonState.NONE) {
    hide(btnSearchHere);
    hide(btnBackStep);
    mapButtonTimeout = setTimeout(() => {
      btnSearchHere.style.display = 'none';
      btnBackStep.style.display = 'none';
    }, 300);
  } else if (state === MapButtonState.SEARCH_HERE) {
    // State: SEARCH_HERE (Exclusive)
    hide(btnBackStep);
    btnBackStep.style.display = 'none';
    lastMapState = null;

    show(btnSearchHere);
  } else if (state === MapButtonState.GO_BACK) {
    // State: GO_BACK (Exclusive)
    hide(btnSearchHere);
    btnSearchHere.style.display = 'none';

    show(btnBackStep);
  }
}

// Init Map
function initMap() {
  const container = document.getElementById('map-mock');
  
  if (typeof kakao === 'undefined' || !kakao.maps) {
    console.warn("Kakao Map API가 로드되지 않았습니다.");
    const fallback = document.createElement('div');
    fallback.style.cssText = 'display:flex; height:100%; align-items:center; justify-content:center; text-align:center; padding:20px; line-height:1.6; background: var(--bg-secondary); color: var(--text-primary); position:absolute; top:0; left:0; width:100%; z-index:50; border: 1px solid var(--border);';
    fallback.innerHTML = `<p><b>지도 스크립트가 차단되었습니다.</b><br/>1. 카카오 플랫폼(Web) 설정에 <b>file://</b> 이 등록되었는지 확인하세요.<br/>2. 브라우저의 광고 차단(AdBlock) 확장이 켜져있다면 잠시 꺼주세요.</p>`;
    container.appendChild(fallback);
    return;
  }

  const options = {
    // Center at Kakao Pangyo HQ
    center: new kakao.maps.LatLng(37.3957, 127.1105),
    level: 6 // Zoom level (smaller is closer)
  };
  
  try {
    map = new kakao.maps.Map(container, options);
    
    // Clusterer 초기화
    clusterer = new kakao.maps.MarkerClusterer({
      map: map,
      averageCenter: true,
      minLevel: 6,
      styles: [{
        width: '53px', height: '52px',
        background: 'rgba(211, 149, 48, 0.9)',
        color: '#fff',
        textAlign: 'center',
        lineHeight: '54px',
        borderRadius: '50%',
        fontWeight: 'bold',
        border: '2px solid #fff',
        boxShadow: '0 2px 6px rgba(80, 60, 20, 0.2)'
      }]
    });
    
    // Catch panning and zooming to show "Search Here" button
    kakao.maps.event.addListener(map, 'dragend', showSearchHereBtn);
    kakao.maps.event.addListener(map, 'zoom_changed', showSearchHereBtn);

    // 시스템 이동이 완전히 끝났을 때 플래그 해제
    // 타이머가 살아있으면 함께 클리어 (beginSystemMove와 연동)
    kakao.maps.event.addListener(map, 'idle', () => {
      if (_systemMoveTimer) {
        clearTimeout(_systemMoveTimer);
        _systemMoveTimer = null;
      }
      isSystemMoving = false;
    });
  } catch (e) {
    console.warn("Kakao Map API 실행 중 오류 발생:", e);
  }
}

function showSearchHereBtn() {
  if (isSystemMoving) return;
  updateMapButtonUI(MapButtonState.SEARCH_HERE);
}

btnSearchHere.onclick = () => {
  handleSearchInThisArea();
};

function handleSearchInThisArea() {
  // 1. 모든 필터 및 검색어 초기화 (지도 리셋 제외)
  resetAllFilters(true);

  // 2. 현재 지도 영역 설정
  currentBoundsFilter = map.getBounds();

  // 3. 버튼 숨김 및 검색 실행
  updateMapButtonUI(MapButtonState.NONE);
  applyFilters();

  if (window.minimizeBottomSheet) {
    window.minimizeBottomSheet();
  }
}

// Add markers for stores
function updateMapMarkers(data) {
  if (!window.kakao || !window.kakao.maps) return;

  // Clear existing markers
  markers.forEach(m => m.setMap(null));
  markers = [];

  if (data.length === 0) {
    // Re-center to Default Kakao HQ if completely default state
    if (currentRegion1 === '전국' && currentSearch === '') {
      beginSystemMove();
      map.setCenter(new kakao.maps.LatLng(37.3957, 127.1105));
      map.setLevel(6);
    }
    return;
  }

  const bounds = new kakao.maps.LatLngBounds();

  // Custom Marker Image: Honey Gold pin (#D39530) with white outline
  // Using a data URI SVG for the custom pin
  const pinSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <path d="M16 42L4.686 28.523C1.657 24.945 0 20.55 0 16C0 7.163 7.163 0 16 0C24.837 0 32 7.163 32 16C32 20.55 30.343 24.945 27.314 28.523L16 42Z" fill="#A3E635" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
    </svg>
  `.trim();
  const markerImage = new kakao.maps.MarkerImage(
    'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(pinSvg))),
    new kakao.maps.Size(32, 42),
    { offset: new kakao.maps.Point(16, 42) }
  );

  for (let i = 0; i < data.length; i++) {
    const store = data[i];
    if (store.lat && store.lng) {
      const position = new kakao.maps.LatLng(store.lat, store.lng);
      
      const marker = new kakao.maps.Marker({
        position: position,
        title: store.name,
        image: markerImage
      });
      
      kakao.maps.event.addListener(marker, 'click', function() {
        showDetail(store);
      });
      
      markers.push(marker);
      bounds.extend(position);
    }
  }
  
  if (clusterer) {
    clusterer.clear();
    clusterer.addMarkers(markers);
  } else {
    markers.forEach(m => m.setMap(map));
  }

  // Automatically adjust bounds only when a specific filter/search is applied
  // 검색 중일 때는 검색 결과를 한눈에 볼 수 있도록 영역을 조정함 (Issue 3)
  if (currentBoundsFilter !== null && currentSearch.trim() === '') {
    // Do NOT alter the camera if the user is explicitly searching within their current dragged bounds
  } else if (currentRegion1 === '전국' && currentSearch === '') {
    // Handled in data.length === 0 block if no markers
    beginSystemMove();
    map.setCenter(new kakao.maps.LatLng(37.3957, 127.1105));
    map.setLevel(6);
  } else if (markers.length > 0) {
    beginSystemMove();
    map.setBounds(bounds);
  }
}

/**
 * Render Skeleton UI
 */
function renderSkeleton() {
  storeList.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'store-card glass';
    skeleton.innerHTML = `
      <div class="skeleton skeleton-image"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text" style="width: 50%"></div>
    `;
    storeList.appendChild(skeleton);
  }
}

// Render store cards
function renderStores(data) {
  storeList.innerHTML = '';
  
  // Update dynamic count
  const countEl = document.getElementById('store-count');
  const totalCountEl = document.getElementById('total-count-display');

  if (countEl) countEl.innerText = data.length;
  if (totalCountEl) {
    totalCountEl.style.display = data.length > 0 ? 'block' : 'none';
  }

  if (data.length === 0) {
    // 지역 필터가 켜져 있고(전국이 아님) 검색어가 비어있지 않은 경우 (Condition A)
    if (currentRegion1 !== '전국' && currentSearch.trim() !== '') {
      storeList.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary); line-height:1.6;">
        선택하신 지역 내에 해당 검색어와 일치하는 매장이 없습니다.<br/>
        지역 설정을 변경하거나 검색어를 다시 확인해 주세요.
      </div>`;
    } else {
      // 그 외 일반 상황 (Condition B)
      storeList.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary);">해당 조건의 공식 인증 매장이 없습니다.</div>`;
    }
    return;
  }

  const PAGE_SIZE = 50;
  let renderData = data;
  let page = 0;

  function renderPage() {
    const slice = renderData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    slice.forEach((store, idx) => {
      const index = page * PAGE_SIZE + idx;
    const card = document.createElement('div');
    card.className = 'store-card glass animate-in';
    card.style.animationDelay = `${Math.min(index, 20) * 0.05}s`; // cap delay for large lists
    
    const typeEmoji = { '카페': '☕', '일반음식점': '🍽️', '제과점': '🥐', '기타': '🏪' };
    const uiType = UI_CATEGORY_MAP[store.type] || store.type;
    const emoji = typeEmoji[uiType] || '🐾';

    // 이미지 소스가 있는 경우 Lazy Loading 적용 (현재 데이터에는 없으나 확장을 위해 구조화)
    const storeImg = store.imgUrl ? `<img src="${store.imgUrl}" loading="lazy" alt="${escapeHtml(store.name)}">` : '';

    card.innerHTML = `
      ${storeImg}
      <div class="verified-badge">
        <span style="font-size: 14px;">🛡️</span>
        <span>2026 공식인증</span>
      </div>
      <div class="store-info" style="padding-top: 8px;">
        <div style="font-size: 28px; margin-bottom: 10px;">${emoji}</div>
        <h3 class="store-name">${escapeHtml(store.name)}</h3>
        <p style="margin-bottom: 8px;">${escapeHtml(store.address)}</p>
        <div class="facility-icons">
          <span class="icon-tag">${escapeHtml(uiType)}</span>
          <span class="icon-tag">${escapeHtml(store.region)}</span>
        </div>
      </div>
    `;

    card.onclick = () => {
      showDetail(store);
    };
    storeList.appendChild(card);
    });

    // '더 보기' 버튼 추가
    const total = renderData.length;
    const shown = (page + 1) * PAGE_SIZE;
    if (shown < total) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'auth-btn glass';
      loadMoreBtn.style.cssText = 'width:100%; margin: 10px 0 20px; padding: 14px; font-size: 14px;';
      loadMoreBtn.innerText = `더 보기 (${shown}/${total})`;
      loadMoreBtn.onclick = () => {
        page++;
        loadMoreBtn.remove();
        renderPage();
      };
      storeList.appendChild(loadMoreBtn);
    }
  }

  renderPage();
}

// Show Store Details Bottom Sheet
function showDetail(store) {
  selectedStore = store; // 현재 선택된 매장 정보 저장
  const detailName = document.getElementById('detail-name');
  const detailImg = document.getElementById('detail-img');
  const complianceList = document.getElementById('compliance-list');

  detailName.innerText = store.name;
  if (detailImg) detailImg.style.display = 'none'; // 이미지 없으므로 숨김

  const uiType = UI_CATEGORY_MAP[store.type] || store.type;
  
  complianceList.innerHTML = `
    <li style="margin-bottom: 8px; padding: 9px 14px; background: var(--bg-primary); border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 16px;">📍</span>
      <p style="font-size: 14px; font-weight: 500; line-height: 1.4; color: var(--text-primary);">${escapeHtml(store.address)}</p>
    </li>
    <li style="margin-bottom: 8px; padding: 9px 14px; background: var(--bg-primary); border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px; color: var(--primary); opacity: 0.8;">🏷️</span>
        <span style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${escapeHtml(uiType)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px; background: var(--accent-green); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--on-primary); flex-shrink: 0;">
        <span style="font-size: 12px;">🛡️</span>
        <span style="font-size: 11px; font-weight: 800; color: var(--on-primary); letter-spacing: -0.2px;">공식 인증</span>
      </div>
    </li>
  `;

  overlay.style.display = 'block';
  setTimeout(() => overlay.style.opacity = '1', 10);
  storeDetail.classList.add('active');
}

// Overlay click wrapper to close any active modal/sheet
overlay.onclick = () => {
  overlay.style.opacity = '0';
  setTimeout(() => overlay.style.display = 'none', 300);
  storeDetail.classList.remove('active');
  authModal.classList.remove('active');
  if (infoModal) infoModal.classList.remove('active');
};

// Buttons & Filters
const btnAuth = document.getElementById('btn-auth');
const btnFetchGov = document.getElementById('btn-fetch-gov');
const btnCloseAuth = document.getElementById('btn-close-auth');
const inputDogRegNo = document.getElementById('input-dog-reg-no');
const inputOwnerBirth = document.getElementById('input-owner-birth');
const filterTags = document.querySelectorAll('.filters .icon-tag');
const regionDepth1 = document.getElementById('region-depth1');
const regionDepth2 = document.getElementById('region-depth2');
const searchInput = document.getElementById('search-input');
// [지도에서 위치 보기] 버튼 클릭 이벤트
if (btnViewMap) {
  btnViewMap.onclick = () => {
    if (!selectedStore) return;

    // 1. 현재 상태 저장 (Back-step용)
    lastMapState = {
      center: map.getCenter(),
      level: map.getLevel(),
      filteredStores: [...currentFilteredStores]
    };

    // 2. 지도 이동 및 확대
    beginSystemMove();
    const moveLatLon = new kakao.maps.LatLng(selectedStore.lat, selectedStore.lng);

    map.setLevel(3);
    map.panTo(moveLatLon);

    // 3. 이전 위치로 버튼 활성화
    updateMapButtonUI(MapButtonState.GO_BACK);

    // 4. 상세 페이지 닫기
    overlay.click();
  };
}

// Region Data Mapping
const regionData = {
  "서울특별시": ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"],
  "경기도": ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "파주시", "시흥시", "김포시", "광명시", "광주시", "군포시", "이천시", "오산시", "하남시", "양주시", "구리시", "안성시", "포천시", "의왕시", "여주시", "양평군", "동두천시", "가평군", "과천시", "연천군"],
  "부산광역시": ["해운대구", "부산진구", "동래구", "사하구", "금정구", "연제구", "수영구", "사상구", "기장군", "남구", "북구", "영도구", "중구", "서구", "동구", "강서구"],
  "대구광역시": ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"],
  "인천광역시": ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
  "광주광역시": ["동구", "서구", "남구", "북구", "광산구"],
  "대전광역시": ["동구", "중구", "서구", "유성구", "대덕구"],
  "울산광역시": ["중구", "남구", "동구", "북구", "울주군"],
  "세종특별자치시": [],
  "강원특별자치도": ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"],
  "충청북도": ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"],
  "충청남도": ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"],
  "전북특별자치도": ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군"],
  "전라남도": ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"],
  "경상북도": ["포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시", "상주시", "문경시", "경산시", "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군"],
  "경상남도": ["창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시", "의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군", "함양군", "거창군", "합천군"],
  "제주특별자치도": ["제주시", "서귀포시"]
};
// Pet Card Elements
const authFormView = document.getElementById('auth-form-view');
const petCardView = document.getElementById('pet-card-view');
const btnCloseCard = document.getElementById('btn-close-card');
const btnUnlink = document.getElementById('btn-unlink');

function displayPetCard(petData) {
  if (!petData) return;

  document.getElementById('card-pet-name').innerText = petData.dogNm || '-';
  document.getElementById('card-pet-kind').innerText = petData.kindNm || '품종 정보 없음';
  document.getElementById('card-pet-sex').innerText = petData.sexNm || '-';
  document.getElementById('card-pet-neuter').innerText = petData.neuterYn || '-';

  // 생일 데이터 표시 (birthDt 우선, 없으면 ownerBirth 기반 연도)
  if (petData.birthDt) {
    document.getElementById('card-pet-birth').innerText = petData.birthDt;
  } else {
    document.getElementById('card-pet-birth').innerText = petData.ownerBirth ? `20${petData.ownerBirth.substring(0, 2)}` : '-';
  }

  // 등록번호 마스킹 처리 (보안 및 줄바꿈 방지: 6자리 노출 + 4자리 별표)
  const regNo = petData.dogRegNo || '';
  const maskedRegNo = regNo.length >= 10 ? `${regNo.substring(0, 6)}****` : regNo;
  document.getElementById('card-reg-no').innerText = maskedRegNo || '-';

  authFormView.style.display = 'none';
  petCardView.style.display = 'block';
  
  overlay.style.display = 'block';
  setTimeout(() => overlay.style.opacity = '1', 10);
  authModal.classList.add('active');
}

function unlinkPetPass() {
  if (confirm("정말로 펫 패스 연동을 해제하시겠습니까?\n기기에 저장된 인증 정보가 즉시 삭제됩니다.")) {
    localStorage.removeItem('petPassToken');
    localStorage.removeItem('petPassData');
    
    btnAuth.classList.remove('active');
    btnAuth.innerText = "디지털 펫 패스";
    
    overlay.click();
    
    // Reset view for next open
    setTimeout(() => {
      authFormView.style.display = 'block';
      petCardView.style.display = 'none';
    }, 300);
  }
}

// Info Modal Logic
const logo = document.querySelector('.logo');
const btnCloseInfo = document.getElementById('btn-close-info');
const btnGithub = document.getElementById('btn-github');
const btnBlog = document.getElementById('btn-blog');

if (logo) {
  logo.onclick = () => {
    overlay.style.display = 'block';
    setTimeout(() => overlay.style.opacity = '1', 10);
    if (infoModal) infoModal.classList.add('active');
  };
}

if (btnCloseInfo) {
  btnCloseInfo.onclick = () => {
    overlay.click();
  };
}

if (btnGithub) {
  btnGithub.onclick = () => {
    window.open('https://github.com/yskkkkkk/pet-pass-web', '_blank');
  };
}

if (btnBlog) {
  btnBlog.onclick = () => {
    window.location.href = '/blog';
  };
}

// Auth Modal Logic
btnAuth.onclick = () => {
  const savedData = localStorage.getItem('petPassData');
  
  if (savedData) {
    try {
      displayPetCard(JSON.parse(savedData));
    } catch (e) {
      console.error("저장된 펫 데이터 파싱 실패:", e);
      localStorage.removeItem('petPassData'); // 손상된 데이터 삭제
      showAuthForm();
    }
  } else {
    showAuthForm();
  }
};

function showAuthForm() {
  authFormView.style.display = 'block';
  petCardView.style.display = 'none';
  overlay.style.display = 'block';
  setTimeout(() => overlay.style.opacity = '1', 10);
  authModal.classList.add('active');
}

/**
 * 숫자 입력 필드 정규화
 * - 숫자 이외 문자를 즉시 제거
 * - maxlength와 동일한 길이 제한 유지
 */
function bindNumericInput(inputEl, maxLength) {
  if (!inputEl) return;
  inputEl.addEventListener('input', () => {
    const digitsOnly = inputEl.value.replace(/\D/g, '').slice(0, maxLength);
    if (inputEl.value !== digitsOnly) {
      inputEl.value = digitsOnly;
    }
  });
}

bindNumericInput(inputDogRegNo, 15);
bindNumericInput(inputOwnerBirth, 6);

btnCloseAuth.onclick = () => {
  overlay.click();
};

btnCloseCard.onclick = () => {
  overlay.click();
};

btnUnlink.onclick = () => {
  unlinkPetPass();
};

btnFetchGov.onclick = async () => {
  const dogRegNo = (inputDogRegNo?.value || '').trim();
  const ownerBirth = (inputOwnerBirth?.value || '').trim();

  if (!dogRegNo || !ownerBirth) {
    alert("동물등록번호와 생년월일 6자리를 정확히 입력해주세요.");
    return;
  }

  // 데이터 상세 검증
  if (!/^\d{15}$/.test(dogRegNo)) {
    alert("동물등록번호는 15자리 숫자입니다.");
    return;
  }
  if (!/^\d{6}$/.test(ownerBirth)) {
    alert("생년월일은 6자리(예: 900101)로 입력해야 합니다.");
    return;
  }

  btnFetchGov.innerText = "데이터베이스 조회 중...";
  btnFetchGov.style.pointerEvents = 'none';

  try {
    const response = await fetch(`/api/get-pet-data?dogRegNo=${encodeURIComponent(dogRegNo)}&ownerBirth=${encodeURIComponent(ownerBirth)}`);
    if (!response.ok) throw new Error(`서버 오류 (${response.status})`);
    const result = await response.json();

    if (result.success) {
      const petData = result.data;
      localStorage.setItem('petPassToken', `VERIFIED-${dogRegNo.substring(0, 4)}***`);
      localStorage.setItem('petPassData', JSON.stringify(petData));

      btnAuth.classList.add('active');
      btnAuth.innerText = "연동 완료 🐾";

      // 즉시 카드 표시
      displayPetCard(petData);
      alert(result.message || "정부 데이터베이스 확인이 완료되었습니다! 펫 패스가 기기에 등록되었습니다.");
    } else {
      const errorMsg = result.errorTitle ? `[${result.errorTitle}]\n${result.error}` : `[인증 실패]\n${result.error || '알 수 없는 오류'}`;
      alert(errorMsg);
    }
  } catch (error) {
    alert("서버 연결 실패 또는 정부망 통신 에러가 발생했습니다.\n서버 터미널 콘솔을 확인해주세요.");
  } finally {
    btnFetchGov.innerText = "정부 데이터베이스 조회";
    btnFetchGov.style.pointerEvents = 'auto';
  }
};

async function fetchStores() {
  renderSkeleton();
  try {
    const response = await fetch('/api/stores');
    if (!response.ok) throw new Error('데이터 로딩 실패');
    stores = await response.json();

    calculateRegionCounts();
    updateRegionDepth1UI();

    // Slight delay for smooth transition from skeleton
    setTimeout(() => {
      applyFilters();
    }, 400);
  } catch (err) {
    console.error('매장 정보를 가져오는데 실패했습니다:', err);
    storeList.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">매장 정보를 불러올 수 없습니다. 서버 상태를 확인해주세요.</div>`;
  }
}

// Category Mapping for UI and Data
const CATEGORY_MAP = {
  '카페': ['카페', '휴게음식점'],
  '일반음식점': ['일반음식점'],
  '제과점': ['제과점', '제과점영업']
};

const UI_CATEGORY_MAP = {
  '휴게음식점': '카페',
  '제과점영업': '제과점'
};

// Filter State & Logic
let currentCategory = '전체';

/**
 * Pre-calculate store counts for each region
 */
let regionCounts = { depth1: {}, depth2: {} };

function calculateRegionCounts() {
  const counts = {
    depth1: { "전국": stores.length },
    depth2: {}
  };

  for (const r1 in regionData) {
    counts.depth1[r1] = 0;
    counts.depth2[r1] = { "전체": 0 };
    regionData[r1].forEach(r2 => {
      counts.depth2[r1][r2] = 0;
    });
  }

  stores.forEach(store => {
    for (const r1 in regionData) {
      if (store.address.includes(r1)) {
        counts.depth1[r1]++;
        counts.depth2[r1]["전체"]++;
        const districts = regionData[r1];
        for (const r2 of districts) {
          if (store.address.includes(r2)) {
            counts.depth2[r1][r2]++;
          }
        }
        break;
      }
    }
  });

  regionCounts = counts;
}

/**
 * Update the labels and disabled status of Depth 1 region options
 */
function updateRegionDepth1UI() {
  const options = regionDepth1.querySelectorAll('option');
  options.forEach(opt => {
    const regionName = opt.value;
    const count = regionCounts.depth1[regionName] || 0;
    opt.innerText = `${regionName} (${count})`;
    if (count === 0 && regionName !== '전국') {
      opt.disabled = true;
    } else {
      opt.disabled = false;
    }
  });
}

let currentRegion1 = '전국';
let currentRegion2 = '전체';
let currentSearch = '';

// 가중치 설정 (Issue 4 및 고도화 요구사항 반영)
const WEIGHTS = {
  NAME_EXACT: 1000,           // 매장명 정확히 일치
  ADDR_PART_EXACT: 800,       // 행정구역(시/군/구) 정확히 일치
  NAME_STARTS_WITH: 600,      // 매장명 전방 일치
  ADDR_PART_STARTS_WITH: 400,  // 행정구역 전방 일치
  CHOSUNG_MATCH: 350,         // 초성 검색 일치
  NAME_CONTAINS: 300,         // 매장명 포함
  IN_BOUNDS_BONUS: 150,       // 현재 지도 영역 내 보너스
  ADDR_CONTAINS: 100          // 주소 단순 포함
};

function updateRegionDepth2(region1) {
  if (region1 === '전국') {
    regionDepth2.style.display = 'none';
    regionDepth2.innerHTML = '<option value="전체">전체</option>';
    currentRegion2 = '전체';
    return;
  }

  const districts = regionData[region1] || [];
  regionDepth2.style.display = 'block';

  const totalCountForRegion = regionCounts.depth2[region1]?.["전체"] || 0;
  regionDepth2.innerHTML = `<option value="전체">전체 (${totalCountForRegion})</option>`;

  districts.forEach(district => {
    const count = regionCounts.depth2[region1]?.[district] || 0;
    const option = document.createElement('option');
    option.value = district;
    option.innerText = `${district} (${count})`;
    if (count === 0) {
      option.disabled = true;
    }
    regionDepth2.appendChild(option);
  });

  currentRegion2 = '전체';
}

let lastFilterKey = '';

function applyFilters() {
  const currentFilterKey = `${currentCategory}-${currentRegion1}-${currentRegion2}-${currentSearch}-${currentBoundsFilter ? currentBoundsFilter.toString() : 'none'}`;

  if (lastFilterKey === currentFilterKey) return;
  lastFilterKey = currentFilterKey;

  const keyword = currentSearch.trim().toLowerCase();
  const resultsWithScore = [];
  const mapBounds = (window.kakao && map) ? map.getBounds() : null;

  // 성능 최적화: 1,572개 데이터를 위해 고속 for 루프 사용 (Issue 5)
  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    let score = 0;

    // 1. 하드 필터 (카테고리 및 지역 선택)
    const targetTypes = CATEGORY_MAP[currentCategory] || [currentCategory];
    const matchCategory = (currentCategory === '전체') || targetTypes.includes(store.type);
    if (!matchCategory) continue;
    
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
    
    // 2. 현재 지도 영역 내 보너스 점수 (UI 상의 매장 우선순위 반영)
    if (mapBounds && store.lat && store.lng) {
      const pos = new kakao.maps.LatLng(store.lat, store.lng);
      if (mapBounds.contain(pos)) {
        score += WEIGHTS.IN_BOUNDS_BONUS;
      }
    }

    // 3. 텍스트 검색 가중치 로직 (Issue 4 고도화)
    if (keyword !== '') {
      let hasMatch = false;
      const lowerName = store.name.toLowerCase();
      const lowerAddr = store.address.toLowerCase();

      // [매장명 매칭]
      if (lowerName === keyword) {
        score += WEIGHTS.NAME_EXACT;
        hasMatch = true;
      } else if (lowerName.startsWith(keyword)) {
        score += WEIGHTS.NAME_STARTS_WITH;
        hasMatch = true;
      } else if (lowerName.includes(keyword)) {
        score += WEIGHTS.NAME_CONTAINS;
        hasMatch = true;
      }

      // [초성 매칭]
      if (!hasMatch && typeof Hangul !== 'undefined') {
        if (Hangul.search(store.name, keyword) !== -1) {
          score += WEIGHTS.CHOSUNG_MATCH;
          hasMatch = true;
        }
      }

      // [주소/행정구역 매칭]
      const addressParts = lowerAddr.split(' ');
      let addrPartMatch = false;
      for (const part of addressParts) {
        if (part === keyword) {
          score += WEIGHTS.ADDR_PART_EXACT;
          addrPartMatch = true;
        } else if (part.startsWith(keyword)) {
          score += WEIGHTS.ADDR_PART_STARTS_WITH;
          addrPartMatch = true;
        }
      }

      if (addrPartMatch) {
        hasMatch = true;
      } else if (lowerAddr.includes(keyword)) {
        score += WEIGHTS.ADDR_CONTAINS;
        hasMatch = true;
      }

      // 검색어가 있는데 매칭되는 것이 없으면 제외
      if (!hasMatch) continue;
    }
    
    // 4. 지도 영역 필터 (검색어가 없을 때만 적용 - Issue 3)
    if (currentBoundsFilter && window.kakao && keyword === '') {
      const pos = new kakao.maps.LatLng(store.lat, store.lng);
      if (!currentBoundsFilter.contain(pos)) continue;
    }

    resultsWithScore.push({ store, score });
  }

  // 5. 최종 정렬: 가중치 점수 내림차순 -> 이름 오름차순
  resultsWithScore.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.store.name.localeCompare(b.store.name);
  });
  
  const finalResults = resultsWithScore.map(r => r.store);
  currentFilteredStores = finalResults; // 상태 업데이트

  renderStores(finalResults);
  updateMapMarkers(finalResults);
}

// Event Listeners for Filters
filterTags.forEach(tag => {
  tag.addEventListener('click', () => {
    filterTags.forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    currentCategory = tag.innerText;
    applyFilters();
  });
});

regionDepth1.addEventListener('change', (e) => {
  currentRegion1 = e.target.value;
  updateRegionDepth2(currentRegion1);
  // Clear map bounds filter when user actively changes region via dropdown
  currentBoundsFilter = null;
  updateMapButtonUI(MapButtonState.NONE);
  applyFilters();
});

regionDepth2.addEventListener('change', (e) => {
  currentRegion2 = e.target.value;
  currentBoundsFilter = null;
  updateMapButtonUI(MapButtonState.NONE);
  applyFilters();
});

// Event Listener for Search Bar (Live Search) - 300ms 디바운싱 및 최소 글자 수 제한
let searchTimer;
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    // 2글자 미만(빈 문자열 제외)인 경우 필터링을 수행하지 않음 (성능 최적화)
    if (val.length === 1) return;

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = val;
      applyFilters();
    }, 300);
  });
}

// Back-step: 이전 위치로 복구
if (btnBackStep) {
  btnBackStep.onclick = () => {
    if (!lastMapState) return;

    // 1. 지도 복구
    beginSystemMove();
    map.setCenter(lastMapState.center);
    map.setLevel(lastMapState.level);

    // 2. 검색 결과 및 마커 복구
    // filteredStores가 없는 경우 현재 필터링된 결과를 유지 (방어 코드)
    const restoredStores = lastMapState.filteredStores ?? currentFilteredStores;
    currentFilteredStores = restoredStores;
    renderStores(currentFilteredStores);
    updateMapMarkers(currentFilteredStores);

    // 3. 버튼 숨김 및 상태 초기화
    updateMapButtonUI(MapButtonState.NONE);
    lastMapState = null;
  };
}

// 모든 필터 및 검색어 초기화 함수
function resetAllFilters(skipMapReset = false) {
  currentCategory = '전체';
  currentRegion1 = '전국';
  currentRegion2 = '전체';
  currentSearch = '';
  currentBoundsFilter = null;

  // UI 동기화
  if (searchInput) searchInput.value = '';
  if (mobileSearchInput) mobileSearchInput.value = '';
  currentSearch = ''; // Ensure internal state is also cleared
  if (regionDepth1) {
    regionDepth1.value = '전국';
    updateRegionDepth2('전국');
  }
  if (filterTags) {
    filterTags.forEach(t => {
      t.classList.remove('active');
      if (t.innerText === '전체') t.classList.add('active');
    });
  }

  if (!skipMapReset) {
    updateMapButtonUI(MapButtonState.NONE);
    beginSystemMove();

    // 지도를 초기 전국 단위 설정값으로 리셋
    if (map) {
      map.setLevel(6);
      map.setCenter(new kakao.maps.LatLng(37.3957, 127.1105));
    }
    applyFilters();
  }
  
  if (window.resetBottomSheet) {
    window.resetBottomSheet();
  }
}

// 필터 초기화 버튼 클릭
if (btnResetFilters) {
  btnResetFilters.onclick = () => {
    resetAllFilters();
  };
}

// 모바일 검색창 동기화
const mobileSearchInput = document.getElementById('mobile-search-input');
const btnResetMobile = document.getElementById('btn-reset-mobile');

if (btnResetMobile) {
  btnResetMobile.onclick = () => {
    resetAllFilters();
  };
}

if (mobileSearchInput && searchInput) {
  mobileSearchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    searchInput.value = val; // 데스크톱 검색창에 동기화
    if (val.length === 1) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = val;
      applyFilters();
    }, 300);
  });

  // 데스크톱 → 모바일 동기화
  searchInput.addEventListener('input', () => {
    mobileSearchInput.value = searchInput.value;
  });
}

// 맨 위로 플로팅 버튼
const btnScrollTop = document.getElementById('btn-scroll-top');
const sidePanelBody = document.getElementById('side-panel-body');
if (btnScrollTop && sidePanelBody) {
  sidePanelBody.addEventListener('scroll', throttle(() => {
    if (sidePanelBody.scrollTop > 250) {
      btnScrollTop.classList.add('visible');
    } else {
      btnScrollTop.classList.remove('visible');
    }
  }, 100));

  btnScrollTop.onclick = () => {
    sidePanelBody.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

// GPS '내 위치' 기능
const btnMyLocation = document.getElementById('btn-my-location');
if (btnMyLocation) {
  btnMyLocation.onclick = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저에서는 위치 정보를 지원하지 않습니다.");
      return;
    }

    btnMyLocation.style.animation = 'pulse 1s infinite';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const locPosition = new kakao.maps.LatLng(lat, lng);

        beginSystemMove();
        map.panTo(locPosition);

        if (window.minimizeBottomSheet) {
          window.minimizeBottomSheet();
        }

        // 내 위치 마커 표시 (선택 사항, 여기서는 이동만 수행)
        btnMyLocation.style.animation = 'none';
      },
      (error) => {
        btnMyLocation.style.animation = 'none';
        let msg = "위치 정보를 가져올 수 없습니다.";
        if (error.code === 1) msg = "위치 정보 공유 승인이 거부되었습니다.";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };
}

// --- 3-Stage Variable Bottom Sheet Logic ---
(function initBottomSheet() {
  const sidePanel = document.querySelector('.side-panel');
  if (!sidePanel) return;
  
  let startY = 0;
  let startHeight = 0;
  let currentHeight = 0;
  let isDragging = false;
  
  const snapPoints = {
    get min() { return 140; }, 
    get mid() { return window.innerHeight * 0.5; },
    get max() { return window.innerHeight * 0.85; }
  };
  
  function setSheetHeight(heightpx) {
    const minBound = snapPoints.min - 20;
    const maxBound = snapPoints.max + 20;
    let newHeight = heightpx;
    if (newHeight < minBound) newHeight = minBound;
    if (newHeight > maxBound) newHeight = maxBound;
    
    currentHeight = newHeight;
    document.documentElement.style.setProperty('--sheet-height', `${newHeight}px`);

    // 상태 기반 가시성 제어 (Mode 1: 지도 최소화 시 숨김)
    const btnMyLocation = document.getElementById('btn-my-location');
    if (btnMyLocation) {
      // 85vh(max) 상태에 근접할 때 버튼 숨김 (약간의 임계값 여유 부여)
      const isNearMax = newHeight >= snapPoints.max - 20;
      if (isNearMax) {
        btnMyLocation.classList.add('hidden');
      } else {
        btnMyLocation.classList.remove('hidden');
      }
    }
  }
  
  if (window.innerWidth <= 768) {
    setSheetHeight(snapPoints.mid);
    currentHeight = snapPoints.mid;
  }

  window.addEventListener('resize', throttle(() => {
     if (window.innerWidth <= 768) {
        snapToNearest();
     } else {
        document.documentElement.style.removeProperty('--sheet-height');
     }
  }, 150));

  function snapToNearest() {
     const h = currentHeight || snapPoints.mid;
     const pts = [snapPoints.min, snapPoints.mid, snapPoints.max];
     const nearest = pts.reduce((prev, curr) => 
       Math.abs(curr - h) < Math.abs(prev - h) ? curr : prev
     );
     setSheetHeight(nearest);
     
     // Full 상태에 안착하면 내부 스크롤 복구
     if (nearest === snapPoints.max) {
       sidePanelBody.style.overflowY = 'auto';
     }
     
     if (nearest === snapPoints.min && sidePanelBody.scrollTop > 0) {
        sidePanelBody.scrollTo({top:0, behavior:'smooth'});
     }

     // 🧪 Debug: Snap 결과
     const stateLabel = nearest === snapPoints.min ? 'Min' : nearest === snapPoints.mid ? 'Half' : 'Full';
     console.log(`[BottomSheet] Snapped → ${stateLabel} (${Math.round(nearest)}px)`);
  }

  // 현재 시트 상태를 라벨로 반환하는 헬퍼
  function getSheetState() {
    const h = currentHeight;
    if (Math.abs(h - snapPoints.max) < 30) return 'Full';
    if (Math.abs(h - snapPoints.mid) < 30) return 'Half';
    return 'Min';
  }
  
  window.resetBottomSheet = () => {
    if (window.innerWidth <= 768) {
      setSheetHeight(snapPoints.mid);
      snapToNearest();
    }
  };

  window.minimizeBottomSheet = () => {
    if (window.innerWidth <= 768) {
      setSheetHeight(snapPoints.min);
      snapToNearest();
    }
  };

  function handleTouchStart(e) {
    if (window.innerWidth > 768) return;
    
    isDragging = true;
    sidePanel.classList.add('dragging');

    // 드래그 핸들 강제 노출 (모바일)
    const handle = sidePanel.querySelector('.drag-handle');
    if (handle) handle.style.display = 'block';

    // [내 위치] 버튼: 드래그 시작 시 즉시 숨김
    const btnMyLocation = document.getElementById('btn-my-location');
    if (btnMyLocation) btnMyLocation.classList.add('is-dragging');
    
    startY = e.touches[0].clientY;
    
    const computedHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sheet-height'), 10);
    startHeight = isNaN(computedHeight) ? snapPoints.mid : computedHeight;

    // 드래그 중에는 윈도우 레벨에서 이벤트 추적
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  }
  
  function handleTouchMove(e) {
    if (!isDragging) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = startY - currentY;  // 양수 = 위로 드래그(시트 확장), 음수 = 아래로 드래그(시트 축소)
    
    if (e.cancelable) {
      e.preventDefault();
    }
    
    const rawHeight = startHeight + deltaY;
    setSheetHeight(rawHeight);
  }
  
  function handleTouchEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    sidePanel.classList.remove('dragging');

    // [내 위치] 버튼: Snap 안착 후 노출
    const btnMyLocation = document.getElementById('btn-my-location');
    if (btnMyLocation) {
      setTimeout(() => btnMyLocation.classList.remove('is-dragging'), 50);
    }
    
    snapToNearest();
    
    // 🔒 CSS Overflow 복구: snapToNearest에서 Full이면 auto 복구됨
    // Full이 아닌 경우에는 overflowY를 기본값으로 복구
    if (getSheetState() !== 'Full') {
      sidePanelBody.style.overflowY = '';
    }

    // 윈도우 리스너 제거
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('touchcancel', handleTouchEnd);
  }
  
  // 오직 핸들 영역에서만 바텀 시트 높이 조절 드래그 시작 가능
  const handleArea = sidePanel.querySelector('.handle-area');
  if (handleArea) {
    handleArea.addEventListener('touchstart', handleTouchStart, {passive: false});
  }
})();

// Initialization on load
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  fetchStores(); // Fetch data from API instead of direct call to applyFilters

  // Restore Button State (Data 위주로 판단)
  if (localStorage.getItem('petPassData')) {
    btnAuth.classList.add('active');
    btnAuth.innerText = "연동 완료 🐾";
  } else {
    btnAuth.classList.remove('active');
    btnAuth.innerText = "디지털 펫 패스";
  }
});
