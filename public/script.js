let map;
let markers = [];
let currentBoundsFilter = null; // Store map bounds for filtering

const storeList = document.getElementById('store-list');
const overlay = document.getElementById('overlay');
const storeDetail = document.getElementById('store-detail');
const authModal = document.getElementById('auth-modal');
const btnSearchHere = document.getElementById('btn-search-here');


// Init Map
function initMap() {
  const container = document.getElementById('map-mock');
  
  if (typeof kakao === 'undefined' || !kakao.maps) {
    console.warn("Kakao Map API가 로드되지 않았습니다.");
    container.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; text-align:center; padding:20px; line-height:1.6; background: rgba(0,0,0,0.5);">
      <p><b>지도 스크립트가 차단되었습니다.</b><br/>1. 카카오 플랫폼(Web) 설정에 <b>file://</b> 이 등록되었는지 확인하세요.<br/>2. 브라우저의 광고 차단(AdBlock) 확장이 켜져있다면 잠시 꺼주세요.</p>
    </div>`;
    return;
  }

  const options = {
    // Center at Kakao Pangyo HQ
    center: new kakao.maps.LatLng(37.3957, 127.1105),
    level: 6 // Zoom level (smaller is closer)
  };
  
  try {
    map = new kakao.maps.Map(container, options);
    
    // Catch panning and zooming to show "Search Here" button
    kakao.maps.event.addListener(map, 'dragend', showSearchHereBtn);
    kakao.maps.event.addListener(map, 'zoom_changed', showSearchHereBtn);
  } catch (e) {
    console.warn("Kakao Map API 실행 중 오류 발생:", e);
  }
}

function showSearchHereBtn() {
  btnSearchHere.style.display = 'block';
  setTimeout(() => {
    btnSearchHere.style.opacity = '1';
  }, 10);
}

btnSearchHere.onclick = () => {
  currentBoundsFilter = map.getBounds();
  
  // Hide Button softly
  btnSearchHere.style.opacity = '0';
  setTimeout(() => {
    btnSearchHere.style.display = 'none';
  }, 300);
  
  applyFilters();
};

// Add markers for stores
function updateMapMarkers(data) {
  if (!window.kakao || !window.kakao.maps) return;

  // Clear existing markers
  markers.forEach(m => m.setMap(null));
  markers = [];

  if (data.length === 0) return;

  const bounds = new kakao.maps.LatLngBounds();

  data.forEach(store => {
    if (store.lat && store.lng) {
      const position = new kakao.maps.LatLng(store.lat, store.lng);
      
      const marker = new kakao.maps.Marker({
        position: position,
        title: store.name
      });
      
      marker.setMap(map);
      
      kakao.maps.event.addListener(marker, 'click', function() {
        showDetail(store);
      });
      
      markers.push(marker);
      bounds.extend(position);
    }
  });

  // Automatically adjust bounds only when a specific filter/search is applied
  if (currentBoundsFilter !== null) {
    // Do NOT alter the camera if the user is explicitly searching within their current dragged bounds
  } else if (currentRegion === '전국' && currentSearch === '') {
    // Re-center to Default Kakao HQ if completely default state
    map.setCenter(new kakao.maps.LatLng(37.3957, 127.1105));
    map.setLevel(6);
  } else if (markers.length > 0) {
    map.setBounds(bounds);
  }
}

// Render store cards
function renderStores(data) {
  storeList.innerHTML = '';
  
  // Update dynamic count
  const countEl = document.getElementById('store-count');
  if(countEl) countEl.innerText = data.length;

  if (data.length === 0) {
    storeList.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">해당 조건의 공식 인증 매장이 없습니다.</div>`;
    return;
  }

  data.forEach((store, index) => {
    const card = document.createElement('div');
    card.className = 'store-card glass animate-in';
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
      <div class="verified-badge">
        <span style="font-size: 14px;">🛡️</span>
        <span>2026 OFFICIAL</span>
      </div>
      <img src="${store.image}" alt="${store.name}">
      <div class="store-info">
        <h3>${store.name}</h3>
        <p>${store.address}</p>
        <div class="facility-icons">
          ${store.facilities.map(f => `<span class="icon-tag">${f}</span>`).join('')}
        </div>
      </div>
    `;

    card.onclick = () => showDetail(store);
    storeList.appendChild(card);
  });
}

// Show Store Details Bottom Sheet
function showDetail(store) {
  const detailName = document.getElementById('detail-name');
  const detailType = document.getElementById('detail-type');
  const detailImg = document.getElementById('detail-img');
  const complianceList = document.getElementById('compliance-list');

  detailName.innerText = store.name;
  detailType.innerText = store.type;
  detailImg.src = store.image;
  
  complianceList.innerHTML = `
    <li style="margin-bottom: 12px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px solid var(--peach-main);">
      <p style="font-size: 12px; color: var(--peach-main); margin-bottom: 4px;">조리장 격리</p>
      <p style="font-size: 14px; font-weight: 500;">${store.compliance.separation}</p>
    </li>
    <li style="margin-bottom: 12px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px;">
      <p style="font-size: 12px; color: var(--accent); margin-bottom: 4px;">환기 시스템</p>
      <p style="font-size: 14px; font-weight: 500;">${store.compliance.ventilation}</p>
    </li>
    <li style="margin-bottom: 12px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px;">
      <p style="font-size: 12px; color: var(--accent); margin-bottom: 4px;">위생 관리</p>
      <p style="font-size: 14px; font-weight: 500;">${store.compliance.hygiene}</p>
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
};

// Buttons & Filters
const btnAuth = document.getElementById('btn-auth');
const btnFetchGov = document.getElementById('btn-fetch-gov');
const btnCloseAuth = document.getElementById('btn-close-auth');
const filterTags = document.querySelectorAll('.filters .icon-tag');
const regionSelect = document.querySelector('.filter-header select');
const searchInput = document.getElementById('search-input');

// Auth Modal Logic
btnAuth.onclick = () => {
  const isAuth = localStorage.getItem('petPassToken');
  if (isAuth) {
    alert("이미 인증된 펫 패스가 기기에 저장되어 있습니다.");
    return;
  }
  
  overlay.style.display = 'block';
  setTimeout(() => overlay.style.opacity = '1', 10);
  authModal.classList.add('active');
};

btnCloseAuth.onclick = () => {
  overlay.click();
};

btnFetchGov.onclick = async () => {
  const dogRegNo = document.getElementById('input-dog-reg-no').value.trim();
  const ownerBirth = document.getElementById('input-owner-birth').value.trim();

  if (!dogRegNo || !ownerBirth) {
    alert("동물등록번호와 생년월일 6자리를 정확히 입력해주세요.");
    return;
  }

  // 데이터 상세 검증
  if (dogRegNo.length < 15) {
    alert("동물등록번호는 15자리 숫자입니다.");
    return;
  }
  if (ownerBirth.length < 6) {
    alert("생년월일은 6자리(예: 900101)로 입력해야 합니다.");
    return;
  }

  btnFetchGov.innerText = "데이터베이스 조회 중...";
  btnFetchGov.style.pointerEvents = 'none';

  try {
    const response = await fetch(`/api/auth-pet?dogRegNo=${encodeURIComponent(dogRegNo)}&ownerBirth=${encodeURIComponent(ownerBirth)}`);
    const result = await response.json();

    if (result.success) {
      localStorage.setItem('petPassToken', `VERIFIED-${dogRegNo.substring(0, 4)}***`);
      btnAuth.classList.add('active');
      btnAuth.innerText = "연동 완료 🐾";
      
      alert(result.message || "정부 데이터베이스 확인이 완료되었습니다! 펫 패스가 기기에 등록되었습니다.");
      overlay.click(); 
    } else {
      // 서버에서 500 내리더라도 express.json 썼기 때문에 result로 넘어오거나 catch로 빠짐.
      alert(`[인증 실패]\n${result.error || ''}\n${result.detail || ''}`);
    }
  } catch (error) {
    alert("서버 연결 실패 또는 정부망 통신 에러가 발생했습니다.\n서버 터미널 콘솔을 확인해주세요.");
  } finally {
    btnFetchGov.innerText = "정부 데이터베이스 조회";
    btnFetchGov.style.pointerEvents = 'auto';
  }
};

// Filter State & Logic
let currentCategory = '전체';
let currentRegion = '전국';
let currentSearch = '';

function applyFilters() {
  const filteredStores = stores.filter(store => {
    // 1. Category Filter
    const matchCategory = (currentCategory === '전체') || (store.type === currentCategory);
    
    // 2. Region Filter
    let matchRegion = true;
    if (currentRegion !== '전국') {
      matchRegion = store.address.includes(currentRegion);
    }
    
    // 3. Text Search Filter (Name or Address match with Hangul JS)
    let matchSearch = true;
    if (currentSearch.trim() !== '') {
      const keyword = currentSearch;
      if (typeof Hangul !== 'undefined') {
        // 행망, 자음, 부분합성 등 한국어 검색 특징 지원
        const matchName = Hangul.search(store.name, keyword) !== -1;
        const matchAddr = Hangul.search(store.address, keyword) !== -1;
        matchSearch = matchName || matchAddr;
      } else {
        // Fallback
        const lowerKeyword = keyword.toLowerCase();
        matchSearch = store.name.toLowerCase().includes(lowerKeyword) || store.address.toLowerCase().includes(lowerKeyword);
      }
    }
    
    // 4. Map Bounds Filter
    let matchBounds = true;
    if (currentBoundsFilter && window.kakao) {
      const position = new kakao.maps.LatLng(store.lat, store.lng);
      matchBounds = currentBoundsFilter.contain(position);
    }
    
    return matchCategory && matchRegion && matchSearch && matchBounds;
  });
  
  renderStores(filteredStores);
  updateMapMarkers(filteredStores);
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

regionSelect.addEventListener('change', (e) => {
  currentRegion = e.target.value;
  // Clear map bounds filter when user actively changes region via dropdown
  currentBoundsFilter = null;
  btnSearchHere.style.display = 'none';
  applyFilters();
});

// Event Listener for Search Bar (Live Search)
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    applyFilters();
  });
}

// Initialization on load
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  applyFilters();
  
  // Restore Button State
  if (localStorage.getItem('petPassToken')) {
    btnAuth.classList.add('active');
    btnAuth.innerText = "연동 완료 🐾";
  }
});

