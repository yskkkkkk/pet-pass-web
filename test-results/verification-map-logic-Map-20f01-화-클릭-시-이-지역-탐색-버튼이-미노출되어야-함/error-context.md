# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verification/map-logic.spec.js >> Map Logic and UX Refinement >> 초기화 클릭 시 이 지역 탐색 버튼이 미노출되어야 함
- Location: verification/map-logic.spec.js:25:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#btn-search-here')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#btn-search-here')
    9 × locator resolved to <button class="glass" id="btn-search-here">📍 이 지역 탐색</button>
      - unexpected value "hidden"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e4] [cursor=pointer]: 🐾 Pet-Pass
    - generic [ref=e5]:
      - textbox "지역명, 상호명 검색..." [ref=e6]
      - button "↺" [ref=e7] [cursor=pointer]
    - generic [ref=e8]:
      - button "매장 등록 제안" [ref=e9] [cursor=pointer]
      - button "디지털 펫 패스" [ref=e10] [cursor=pointer]
  - main [ref=e11]:
    - paragraph [ref=e14]:
      - text: 지도 스크립트가 차단되었습니다.
      - text: 1. 카카오 플랫폼(Web) 설정에 file:// 이 등록되었는지 확인하세요.
      - text: 2. 브라우저의 광고 차단(AdBlock) 확장이 켜져있다면 잠시 꺼주세요.
    - complementary [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]:
          - heading "공식 인증 매장 (1572)" [level=2] [ref=e19]
          - combobox [ref=e21] [cursor=pointer]:
            - option "전국" [selected]
            - option "서울특별시"
            - option "경기도"
            - option "부산광역시"
            - option "대구광역시"
            - option "인천광역시"
            - option "광주광역시"
            - option "대전광역시"
            - option "울산광역시"
            - option "세종특별자치시"
            - option "강원특별자치도"
            - option "충청북도"
            - option "충청남도"
            - option "전라북도"
            - option "전라남도"
            - option "경상북도"
            - option "경상남도"
            - option "제주특별자치도"
        - generic [ref=e22]:
          - generic [ref=e23] [cursor=pointer]: 전체
          - generic [ref=e24] [cursor=pointer]: 카페
          - generic [ref=e25] [cursor=pointer]: 일반음식점
          - generic [ref=e26] [cursor=pointer]: 제과점
      - generic [ref=e27]: 광고 · 프리미엄 펫푸드브랜드 신제품 런칭 기념 특가 (예시)
      - generic [ref=e28]:
        - generic [ref=e29] [cursor=pointer]:
          - generic [ref=e30]:
            - generic [ref=e31]: 🛡️
            - generic [ref=e32]: 2026 공식인증
          - generic [ref=e33]:
            - generic [ref=e34]: ☕
            - heading "？커피,MOCC" [level=3] [ref=e35]
            - paragraph [ref=e36]: 서울특별시 관악구 미성길 7(1층 신림동)
            - generic [ref=e37]:
              - generic [ref=e38]: 카페
              - generic [ref=e39]: 서울
        - generic [ref=e40] [cursor=pointer]:
          - generic [ref=e41]:
            - generic [ref=e42]: 🛡️
            - generic [ref=e43]: 2026 공식인증
          - generic [ref=e44]:
            - generic [ref=e45]: 🍽️
            - heading "1 way in(원 웨이 인)" [level=3] [ref=e46]
            - paragraph [ref=e47]: 광주광역시 동구 동산길 73-3(2층 운림동)
            - generic [ref=e48]:
              - generic [ref=e49]: 일반음식점
              - generic [ref=e50]: 광주
        - generic [ref=e51] [cursor=pointer]:
          - generic [ref=e52]:
            - generic [ref=e53]: 🛡️
            - generic [ref=e54]: 2026 공식인증
          - generic [ref=e55]:
            - generic [ref=e56]: 🍽️
            - heading "100 ROAD" [level=3] [ref=e57]
            - paragraph [ref=e58]: 경기도 김포시 월곶면 월하로 96(1층)
            - generic [ref=e59]:
              - generic [ref=e60]: 일반음식점
              - generic [ref=e61]: 경기
        - generic [ref=e62] [cursor=pointer]:
          - generic [ref=e63]:
            - generic [ref=e64]: 🛡️
            - generic [ref=e65]: 2026 공식인증
          - generic [ref=e66]:
            - generic [ref=e67]: 🍽️
            - heading "153수제강정" [level=3] [ref=e68]
            - paragraph [ref=e69]: 전라남도 진도군 고군면 신비의바닷길 74(등 축제장 일원)
            - generic [ref=e70]:
              - generic [ref=e71]: 일반음식점
              - generic [ref=e72]: 전남
        - generic [ref=e73] [cursor=pointer]:
          - generic [ref=e74]:
            - generic [ref=e75]: 🛡️
            - generic [ref=e76]: 2026 공식인증
          - generic [ref=e77]:
            - generic [ref=e78]: ☕
            - heading "1938맨션1" [level=3] [ref=e79]
            - paragraph [ref=e80]: 전북특별자치도 전주시 완산구 어진길 78(1층 경원동2가)
            - generic [ref=e81]:
              - generic [ref=e82]: 카페
              - generic [ref=e83]: 전북
        - generic [ref=e84] [cursor=pointer]:
          - generic [ref=e85]:
            - generic [ref=e86]: 🛡️
            - generic [ref=e87]: 2026 공식인증
          - generic [ref=e88]:
            - generic [ref=e89]: ☕
            - heading "1938맨션2층" [level=3] [ref=e90]
            - paragraph [ref=e91]: 전북특별자치도 전주시 완산구 어진길 78(2층 경원동2가)
            - generic [ref=e92]:
              - generic [ref=e93]: 카페
              - generic [ref=e94]: 전북
        - generic [ref=e95] [cursor=pointer]:
          - generic [ref=e96]:
            - generic [ref=e97]: 🛡️
            - generic [ref=e98]: 2026 공식인증
          - generic [ref=e99]:
            - generic [ref=e100]: 🍽️
            - heading "1938함덕차관" [level=3] [ref=e101]
            - paragraph [ref=e102]: 제주특별자치도 제주시 조천읍 신북로 494(1층)
            - generic [ref=e103]:
              - generic [ref=e104]: 일반음식점
              - generic [ref=e105]: 제주
        - generic [ref=e106] [cursor=pointer]:
          - generic [ref=e107]:
            - generic [ref=e108]: 🛡️
            - generic [ref=e109]: 2026 공식인증
          - generic [ref=e110]:
            - generic [ref=e111]: 🍽️
            - heading "200%(이백퍼센트)" [level=3] [ref=e112]
            - paragraph [ref=e113]: 경기도 남양주시 불암로 307(2층 별내동)
            - generic [ref=e114]:
              - generic [ref=e115]: 일반음식점
              - generic [ref=e116]: 경기
        - generic [ref=e117] [cursor=pointer]:
          - generic [ref=e118]:
            - generic [ref=e119]: 🛡️
            - generic [ref=e120]: 2026 공식인증
          - generic [ref=e121]:
            - generic [ref=e122]: 🍽️
            - heading "2020메이드인코리아 오푼(두잔)" [level=3] [ref=e123]
            - paragraph [ref=e124]: 대전광역시 서구 도솔로388번길 28(5층 일부호 괴정동)
            - generic [ref=e125]:
              - generic [ref=e126]: 일반음식점
              - generic [ref=e127]: 대전
        - generic [ref=e128] [cursor=pointer]:
          - generic [ref=e129]:
            - generic [ref=e130]: 🛡️
            - generic [ref=e131]: 2026 공식인증
          - generic [ref=e132]:
            - generic [ref=e133]: 🍽️
            - heading "213점" [level=3] [ref=e134]
            - paragraph [ref=e135]: 서울특별시 은평구 응암로21가길 27(1층 응암동)
            - generic [ref=e136]:
              - generic [ref=e137]: 일반음식점
              - generic [ref=e138]: 서울
        - generic [ref=e139] [cursor=pointer]:
          - generic [ref=e140]:
            - generic [ref=e141]: 🛡️
            - generic [ref=e142]: 2026 공식인증
          - generic [ref=e143]:
            - generic [ref=e144]: 🍽️
            - heading "33떡볶이&꼬마김밥 대명비발디파크점" [level=3] [ref=e145]
            - paragraph [ref=e146]: 강원특별자치도 홍천군 서면 한치골길 262(오크동지하1층 BOOTH1)
            - generic [ref=e147]:
              - generic [ref=e148]: 일반음식점
              - generic [ref=e149]: 강원
        - generic [ref=e150] [cursor=pointer]:
          - generic [ref=e151]:
            - generic [ref=e152]: 🛡️
            - generic [ref=e153]: 2026 공식인증
          - generic [ref=e154]:
            - generic [ref=e155]: 🍽️
            - heading "4 WEEKS COFFEE(포윅스커피)" [level=3] [ref=e156]
            - paragraph [ref=e157]: 경기도 의정부시 태평로 14(지상1층 의정부동)
            - generic [ref=e158]:
              - generic [ref=e159]: 일반음식점
              - generic [ref=e160]: 경기
        - generic [ref=e161] [cursor=pointer]:
          - generic [ref=e162]:
            - generic [ref=e163]: 🛡️
            - generic [ref=e164]: 2026 공식인증
          - generic [ref=e165]:
            - generic [ref=e166]: 🍽️
            - heading "55갤런-와인&비어펍" [level=3] [ref=e167]
            - paragraph [ref=e168]: 경기도 김포시 양촌읍 김포대로 1619(1층 일부호)
            - generic [ref=e169]:
              - generic [ref=e170]: 일반음식점
              - generic [ref=e171]: 경기
        - generic [ref=e172] [cursor=pointer]:
          - generic [ref=e173]:
            - generic [ref=e174]: 🛡️
            - generic [ref=e175]: 2026 공식인증
          - generic [ref=e176]:
            - generic [ref=e177]: 🍽️
            - heading "55도" [level=3] [ref=e178]
            - paragraph [ref=e179]: 경기도 이천시 대월면 대월로 956(1층)
            - generic [ref=e180]:
              - generic [ref=e181]: 일반음식점
              - generic [ref=e182]: 경기
        - generic [ref=e183] [cursor=pointer]:
          - generic [ref=e184]:
            - generic [ref=e185]: 🛡️
            - generic [ref=e186]: 2026 공식인증
          - generic [ref=e187]:
            - generic [ref=e188]: 🍽️
            - heading "6층커피집" [level=3] [ref=e189]
            - paragraph [ref=e190]: 인천광역시 서구 청라루비로 93(루비타워 603호 청라동)
            - generic [ref=e191]:
              - generic [ref=e192]: 일반음식점
              - generic [ref=e193]: 인천
        - generic [ref=e194] [cursor=pointer]:
          - generic [ref=e195]:
            - generic [ref=e196]: 🛡️
            - generic [ref=e197]: 2026 공식인증
          - generic [ref=e198]:
            - generic [ref=e199]: 🍽️
            - heading "8코기네" [level=3] [ref=e200]
            - paragraph [ref=e201]: 경기도 양평군 양평읍 쉬자파크길 193-1(카페 1,2층)
            - generic [ref=e202]:
              - generic [ref=e203]: 일반음식점
              - generic [ref=e204]: 경기
        - generic [ref=e205] [cursor=pointer]:
          - generic [ref=e206]:
            - generic [ref=e207]: 🛡️
            - generic [ref=e208]: 2026 공식인증
          - generic [ref=e209]:
            - generic [ref=e210]: 🍽️
            - heading "97.7화씨" [level=3] [ref=e211]
            - paragraph [ref=e212]: 서울특별시 중구 난계로15길 41-7(지하1층 황학동)
            - generic [ref=e213]:
              - generic [ref=e214]: 일반음식점
              - generic [ref=e215]: 서울
        - generic [ref=e216] [cursor=pointer]:
          - generic [ref=e217]:
            - generic [ref=e218]: 🛡️
            - generic [ref=e219]: 2026 공식인증
          - generic [ref=e220]:
            - generic [ref=e221]: 🍽️
            - heading "9램(9ram)" [level=3] [ref=e222]
            - paragraph [ref=e223]: 서울특별시 마포구 포은로 105(2층 망원동)
            - generic [ref=e224]:
              - generic [ref=e225]: 일반음식점
              - generic [ref=e226]: 서울
        - generic [ref=e227] [cursor=pointer]:
          - generic [ref=e228]:
            - generic [ref=e229]: 🛡️
            - generic [ref=e230]: 2026 공식인증
          - generic [ref=e231]:
            - generic [ref=e232]: 🍽️
            - heading "AINA 카페(아이나 카페)" [level=3] [ref=e233]
            - paragraph [ref=e234]: 인천광역시 강화군 길상면 해안동로 116-12(1~2층)
            - generic [ref=e235]:
              - generic [ref=e236]: 일반음식점
              - generic [ref=e237]: 인천
        - generic [ref=e238] [cursor=pointer]:
          - generic [ref=e239]:
            - generic [ref=e240]: 🛡️
            - generic [ref=e241]: 2026 공식인증
          - generic [ref=e242]:
            - generic [ref=e243]: 🍽️
            - heading "BaV COFFEE(바브 커피)" [level=3] [ref=e244]
            - paragraph [ref=e245]: 경기도 의정부시 장곡로 464(지상1층 신곡동)
            - generic [ref=e246]:
              - generic [ref=e247]: 일반음식점
              - generic [ref=e248]: 경기
        - generic [ref=e249] [cursor=pointer]:
          - generic [ref=e250]:
            - generic [ref=e251]: 🛡️
            - generic [ref=e252]: 2026 공식인증
          - generic [ref=e253]:
            - generic [ref=e254]: ☕
            - heading "BeansMan(빈스맨)" [level=3] [ref=e255]
            - paragraph [ref=e256]: 인천광역시 중구 인중로164번길 51(1층 답동)
            - generic [ref=e257]:
              - generic [ref=e258]: 카페
              - generic [ref=e259]: 인천
        - generic [ref=e260] [cursor=pointer]:
          - generic [ref=e261]:
            - generic [ref=e262]: 🛡️
            - generic [ref=e263]: 2026 공식인증
          - generic [ref=e264]:
            - generic [ref=e265]: 🍽️
            - heading "Better Days(베럴 데이즈)" [level=3] [ref=e266]
            - paragraph [ref=e267]: 인천광역시 중구 영종진광장로 52(블루오션프라자 1층 106호 중산동)
            - generic [ref=e268]:
              - generic [ref=e269]: 일반음식점
              - generic [ref=e270]: 인천
        - generic [ref=e271] [cursor=pointer]:
          - generic [ref=e272]:
            - generic [ref=e273]: 🛡️
            - generic [ref=e274]: 2026 공식인증
          - generic [ref=e275]:
            - generic [ref=e276]: ☕
            - heading "BLEND(블렌드)" [level=3] [ref=e277]
            - paragraph [ref=e278]: 경기도 화성시 동탄구 동탄공원로3길 14-3(1층 전체호 반송동)
            - generic [ref=e279]:
              - generic [ref=e280]: 카페
              - generic [ref=e281]: 경기
        - generic [ref=e282] [cursor=pointer]:
          - generic [ref=e283]:
            - generic [ref=e284]: 🛡️
            - generic [ref=e285]: 2026 공식인증
          - generic [ref=e286]:
            - generic [ref=e287]: ☕
            - heading "CAFE사개" [level=3] [ref=e288]
            - paragraph [ref=e289]: 경기도 화성시 병점구 반월체육공원길 71-16(1층 반월동)
            - generic [ref=e290]:
              - generic [ref=e291]: 카페
              - generic [ref=e292]: 경기
        - generic [ref=e293] [cursor=pointer]:
          - generic [ref=e294]:
            - generic [ref=e295]: 🛡️
            - generic [ref=e296]: 2026 공식인증
          - generic [ref=e297]:
            - generic [ref=e298]: 🍽️
            - heading "ChapChap(찹찹)" [level=3] [ref=e299]
            - paragraph [ref=e300]: 경기도 수원시 팔달구 수원천로 353(2층 북수동)
            - generic [ref=e301]:
              - generic [ref=e302]: 일반음식점
              - generic [ref=e303]: 경기
        - generic [ref=e304] [cursor=pointer]:
          - generic [ref=e305]:
            - generic [ref=e306]: 🛡️
            - generic [ref=e307]: 2026 공식인증
          - generic [ref=e308]:
            - generic [ref=e309]: ☕
            - heading "DDogDog(똑독)" [level=3] [ref=e310]
            - paragraph [ref=e311]: 경기도 부천시 소사구 연동로 112(주프레시푸드 3층 옥길동)
            - generic [ref=e312]:
              - generic [ref=e313]: 카페
              - generic [ref=e314]: 경기
        - generic [ref=e315] [cursor=pointer]:
          - generic [ref=e316]:
            - generic [ref=e317]: 🛡️
            - generic [ref=e318]: 2026 공식인증
          - generic [ref=e319]:
            - generic [ref=e320]: 🍽️
            - heading "DEEP(딥딥딥)" [level=3] [ref=e321]
            - paragraph [ref=e322]: 경기도 고양시 덕양구 동산1로 38(1층 동산동)
            - generic [ref=e323]:
              - generic [ref=e324]: 일반음식점
              - generic [ref=e325]: 경기
        - generic [ref=e326] [cursor=pointer]:
          - generic [ref=e327]:
            - generic [ref=e328]: 🛡️
            - generic [ref=e329]: 2026 공식인증
          - generic [ref=e330]:
            - generic [ref=e331]: 🍽️
            - heading "errd(에르디)" [level=3] [ref=e332]
            - paragraph [ref=e333]: 서울특별시 관악구 관악로12길 113(대원빌딩 1층 103호 봉천동)
            - generic [ref=e334]:
              - generic [ref=e335]: 일반음식점
              - generic [ref=e336]: 서울
        - generic [ref=e337] [cursor=pointer]:
          - generic [ref=e338]:
            - generic [ref=e339]: 🛡️
            - generic [ref=e340]: 2026 공식인증
          - generic [ref=e341]:
            - generic [ref=e342]: ☕
            - heading "ESSOR(카페잇소)" [level=3] [ref=e343]
            - paragraph [ref=e344]: 경상남도 밀양시 삼랑진읍 행곡로 425-1(1,2층)
            - generic [ref=e345]:
              - generic [ref=e346]: 카페
              - generic [ref=e347]: 경남
        - generic [ref=e348] [cursor=pointer]:
          - generic [ref=e349]:
            - generic [ref=e350]: 🛡️
            - generic [ref=e351]: 2026 공식인증
          - generic [ref=e352]:
            - generic [ref=e353]: 🍽️
            - heading "flat(플랫) 동탄점" [level=3] [ref=e354]
            - paragraph [ref=e355]: 경기도 화성시 동탄구 동탄대로14길 6-34(1층 일부호 오산동)
            - generic [ref=e356]:
              - generic [ref=e357]: 일반음식점
              - generic [ref=e358]: 경기
        - generic [ref=e359] [cursor=pointer]:
          - generic [ref=e360]:
            - generic [ref=e361]: 🛡️
            - generic [ref=e362]: 2026 공식인증
          - generic [ref=e363]:
            - generic [ref=e364]: 🍽️
            - heading "flot(플로)" [level=3] [ref=e365]
            - paragraph [ref=e366]: 서울특별시 은평구 서오릉로 20-1(1층 녹번동)
            - generic [ref=e367]:
              - generic [ref=e368]: 일반음식점
              - generic [ref=e369]: 서울
        - generic [ref=e370] [cursor=pointer]:
          - generic [ref=e371]:
            - generic [ref=e372]: 🛡️
            - generic [ref=e373]: 2026 공식인증
          - generic [ref=e374]:
            - generic [ref=e375]: 🍽️
            - heading "forpie(폴파이)" [level=3] [ref=e376]
            - paragraph [ref=e377]: 충청북도 단양군 단양읍 삼봉로 227(1층)
            - generic [ref=e378]:
              - generic [ref=e379]: 일반음식점
              - generic [ref=e380]: 충북
        - generic [ref=e381] [cursor=pointer]:
          - generic [ref=e382]:
            - generic [ref=e383]: 🛡️
            - generic [ref=e384]: 2026 공식인증
          - generic [ref=e385]:
            - generic [ref=e386]: ☕
            - heading "Full moon(풀문)" [level=3] [ref=e387]
            - paragraph [ref=e388]: 경기도 화성시 효행구 봉담읍 장등2길 6-33(101호)
            - generic [ref=e389]:
              - generic [ref=e390]: 카페
              - generic [ref=e391]: 경기
        - generic [ref=e392] [cursor=pointer]:
          - generic [ref=e393]:
            - generic [ref=e394]: 🛡️
            - generic [ref=e395]: 2026 공식인증
          - generic [ref=e396]:
            - generic [ref=e397]: ☕
            - heading "G340" [level=3] [ref=e398]
            - paragraph [ref=e399]: 충청남도 부여군 부여읍 계백로 340
            - generic [ref=e400]:
              - generic [ref=e401]: 카페
              - generic [ref=e402]: 충남
        - generic [ref=e403] [cursor=pointer]:
          - generic [ref=e404]:
            - generic [ref=e405]: 🛡️
            - generic [ref=e406]: 2026 공식인증
          - generic [ref=e407]:
            - generic [ref=e408]: ☕
            - heading "GT커피광주수완점" [level=3] [ref=e409]
            - paragraph [ref=e410]: 광주광역시 광산구 수완로50번길 49(1층 수완동)
            - generic [ref=e411]:
              - generic [ref=e412]: 카페
              - generic [ref=e413]: 광주
        - generic [ref=e414] [cursor=pointer]:
          - generic [ref=e415]:
            - generic [ref=e416]: 🛡️
            - generic [ref=e417]: 2026 공식인증
          - generic [ref=e418]:
            - generic [ref=e419]: 🍽️
            - heading "hebe coffee(헤베 커피)" [level=3] [ref=e420]
            - paragraph [ref=e421]: 서울특별시 중구 필동로 32(낙원빌딩 1층 필동2가)
            - generic [ref=e422]:
              - generic [ref=e423]: 일반음식점
              - generic [ref=e424]: 서울
        - generic [ref=e425] [cursor=pointer]:
          - generic [ref=e426]:
            - generic [ref=e427]: 🛡️
            - generic [ref=e428]: 2026 공식인증
          - generic [ref=e429]:
            - generic [ref=e430]: 🍽️
            - heading "HeyVERT" [level=3] [ref=e431]
            - paragraph [ref=e432]: 서울특별시 서초구 서래로6길 25(1층 반포동, 궁전타운)
            - generic [ref=e433]:
              - generic [ref=e434]: 일반음식점
              - generic [ref=e435]: 서울
        - generic [ref=e436] [cursor=pointer]:
          - generic [ref=e437]:
            - generic [ref=e438]: 🛡️
            - generic [ref=e439]: 2026 공식인증
          - generic [ref=e440]:
            - generic [ref=e441]: 🍽️
            - heading "Hrr(흐르르)" [level=3] [ref=e442]
            - paragraph [ref=e443]: 서울특별시 서초구 잠원로 201-12(1층 잠원동)
            - generic [ref=e444]:
              - generic [ref=e445]: 일반음식점
              - generic [ref=e446]: 서울
        - generic [ref=e447] [cursor=pointer]:
          - generic [ref=e448]:
            - generic [ref=e449]: 🛡️
            - generic [ref=e450]: 2026 공식인증
          - generic [ref=e451]:
            - generic [ref=e452]: ☕
            - heading "INNER PEACE(이너피스)" [level=3] [ref=e453]
            - paragraph [ref=e454]: 서울특별시 강서구 양천로66길 6(생활편익시설동 1층 105호 등촌동, 삼성한사랑1차아파트)
            - generic [ref=e455]:
              - generic [ref=e456]: 카페
              - generic [ref=e457]: 서울
        - generic [ref=e458] [cursor=pointer]:
          - generic [ref=e459]:
            - generic [ref=e460]: 🛡️
            - generic [ref=e461]: 2026 공식인증
          - generic [ref=e462]:
            - generic [ref=e463]: 🍽️
            - heading "LUV PLUTO 러브 플루토" [level=3] [ref=e464]
            - paragraph [ref=e465]: 서울특별시 서대문구 불광천길 180(지하1층, 1층 101호 북가좌동, 아임빌)
            - generic [ref=e466]:
              - generic [ref=e467]: 일반음식점
              - generic [ref=e468]: 서울
        - generic [ref=e469] [cursor=pointer]:
          - generic [ref=e470]:
            - generic [ref=e471]: 🛡️
            - generic [ref=e472]: 2026 공식인증
          - generic [ref=e473]:
            - generic [ref=e474]: 🍽️
            - heading "mari.v(마리브)" [level=3] [ref=e475]
            - paragraph [ref=e476]: 경기도 고양시 일산동구 일산로380번길 35-1(1층 일부호 정발산동)
            - generic [ref=e477]:
              - generic [ref=e478]: 일반음식점
              - generic [ref=e479]: 경기
        - generic [ref=e480] [cursor=pointer]:
          - generic [ref=e481]:
            - generic [ref=e482]: 🛡️
            - generic [ref=e483]: 2026 공식인증
          - generic [ref=e484]:
            - generic [ref=e485]: 🍽️
            - heading "Moon's(문스)" [level=3] [ref=e486]
            - paragraph [ref=e487]: 경기도 용인시 기흥구 죽전로15번길 15-3(보정동,1층)
            - generic [ref=e488]:
              - generic [ref=e489]: 일반음식점
              - generic [ref=e490]: 경기
        - generic [ref=e491] [cursor=pointer]:
          - generic [ref=e492]:
            - generic [ref=e493]: 🛡️
            - generic [ref=e494]: 2026 공식인증
          - generic [ref=e495]:
            - generic [ref=e496]: 🍽️
            - heading "Moony(무니)" [level=3] [ref=e497]
            - paragraph [ref=e498]: 부산광역시 해운대구 우동1로38번길 11(1층 141호 우동, 우일맨션)
            - generic [ref=e499]:
              - generic [ref=e500]: 일반음식점
              - generic [ref=e501]: 부산
        - generic [ref=e502] [cursor=pointer]:
          - generic [ref=e503]:
            - generic [ref=e504]: 🛡️
            - generic [ref=e505]: 2026 공식인증
          - generic [ref=e506]:
            - generic [ref=e507]: ☕
            - heading "ngl(엔지엘)" [level=3] [ref=e508]
            - paragraph [ref=e509]: 경기도 용인시 처인구 금령로40번길 12(1층 일부 김량장동)
            - generic [ref=e510]:
              - generic [ref=e511]: 카페
              - generic [ref=e512]: 경기
        - generic [ref=e513] [cursor=pointer]:
          - generic [ref=e514]:
            - generic [ref=e515]: 🛡️
            - generic [ref=e516]: 2026 공식인증
          - generic [ref=e517]:
            - generic [ref=e518]: 🥐
            - heading "NUAGE(누아즈)" [level=3] [ref=e519]
            - paragraph [ref=e520]: 경기도 용인시 기흥구 구성1로 20(주공프라자 102호 청덕동)
            - generic [ref=e521]:
              - generic [ref=e522]: 제과점
              - generic [ref=e523]: 경기
        - generic [ref=e524] [cursor=pointer]:
          - generic [ref=e525]:
            - generic [ref=e526]: 🛡️
            - generic [ref=e527]: 2026 공식인증
          - generic [ref=e528]:
            - generic [ref=e529]: ☕
            - heading "nue.(뉴)" [level=3] [ref=e530]
            - paragraph [ref=e531]: 인천광역시 서구 옥빛로15번길 14(레이크하우스 1층 일부호 청라동)
            - generic [ref=e532]:
              - generic [ref=e533]: 카페
              - generic [ref=e534]: 인천
        - generic [ref=e535] [cursor=pointer]:
          - generic [ref=e536]:
            - generic [ref=e537]: 🛡️
            - generic [ref=e538]: 2026 공식인증
          - generic [ref=e539]:
            - generic [ref=e540]: ☕
            - heading "O'vely" [level=3] [ref=e541]
            - paragraph [ref=e542]: 전라남도 여수시 학동5길 10(1층 학동)
            - generic [ref=e543]:
              - generic [ref=e544]: 카페
              - generic [ref=e545]: 전남
        - generic [ref=e546] [cursor=pointer]:
          - generic [ref=e547]:
            - generic [ref=e548]: 🛡️
            - generic [ref=e549]: 2026 공식인증
          - generic [ref=e550]:
            - generic [ref=e551]: ☕
            - heading "oki오키" [level=3] [ref=e552]
            - paragraph [ref=e553]: 광주광역시 동구 동계로15번길 29(1층 동명동)
            - generic [ref=e554]:
              - generic [ref=e555]: 카페
              - generic [ref=e556]: 광주
        - generic [ref=e557] [cursor=pointer]:
          - generic [ref=e558]:
            - generic [ref=e559]: 🛡️
            - generic [ref=e560]: 2026 공식인증
          - generic [ref=e561]:
            - generic [ref=e562]: 🍽️
            - heading "ONBREW온브루" [level=3] [ref=e563]
            - paragraph [ref=e564]: 충청남도 천안시 동남구 청수9로 55(1층 101호 청당동)
            - generic [ref=e565]:
              - generic [ref=e566]: 일반음식점
              - generic [ref=e567]: 충남
        - generic [ref=e568] [cursor=pointer]:
          - generic [ref=e569]:
            - generic [ref=e570]: 🛡️
            - generic [ref=e571]: 2026 공식인증
          - generic [ref=e572]:
            - generic [ref=e573]: 🍽️
            - heading "OU_TOPOS(우토포스)" [level=3] [ref=e574]
            - paragraph [ref=e575]: 서울특별시 서초구 방배로39길 42-7(1층 방배동)
            - generic [ref=e576]:
              - generic [ref=e577]: 일반음식점
              - generic [ref=e578]: 서울
        - button "더 보기 (50/1572)" [ref=e579] [cursor=pointer]
  - generic [ref=e580]:
    - generic [ref=e582]:
      - heading "상호명" [level=2] [ref=e583]
      - text: 종류
    - generic [ref=e584]:
      - img "Store" [ref=e586]
      - generic [ref=e587]:
        - heading "2026 법적 기준 통과 항목" [level=4] [ref=e588]
        - list
        - button "📍 지도에서 위치 보기" [ref=e589] [cursor=pointer]
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  |
  3  | test.describe('Map Logic and UX Refinement', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     // 서버가 실행 중이라고 가정하고 접속 (기본 3000 포트)
  6  |     await page.goto('http://localhost:3000');
  7  |     // Kakao Map 로드 대기 (충분한 시간 부여)
  8  |     await page.waitForTimeout(2000);
  9  |   });
  10 |
  11 |   test('수동 드래그 시 이 지역 탐색 버튼이 노출되어야 함', async ({ page }) => {
  12 |     const btnSearchHere = page.locator('#btn-search-here');
  13 |     await expect(btnSearchHere).not.toBeVisible();
  14 |
  15 |     // 지도 영역 드래그 시뮬레이션
  16 |     await page.mouse.move(500, 500);
  17 |     await page.mouse.down();
  18 |     await page.mouse.move(600, 600);
  19 |     await page.mouse.up();
  20 |
  21 |     // 드래그 후 버튼 노출 확인
  22 |     await expect(btnSearchHere).toBeVisible();
  23 |   });
  24 |
  25 |   test('초기화 클릭 시 이 지역 탐색 버튼이 미노출되어야 함', async ({ page }) => {
  26 |     const btnSearchHere = page.locator('#btn-search-here');
  27 |     const btnResetFilters = page.locator('#btn-reset-filters');
  28 |
  29 |     // 먼저 버튼을 노출시킴
  30 |     await page.mouse.move(500, 500);
  31 |     await page.mouse.down();
  32 |     await page.mouse.move(600, 600);
  33 |     await page.mouse.up();
> 34 |     await expect(btnSearchHere).toBeVisible();
     |                                 ^ Error: expect(locator).toBeVisible() failed
  35 |
  36 |     // 초기화 버튼 클릭
  37 |     await btnResetFilters.click();
  38 |
  39 |     // 즉시 숨겨져야 함
  40 |     await expect(btnSearchHere).not.toBeVisible();
  41 |
  42 |     // 시스템 이동(전국으로 리셋) 중에도 노출되지 않아야 함 (충분히 대기)
  43 |     await page.waitForTimeout(1000);
  44 |     await expect(btnSearchHere).not.toBeVisible();
  45 |   });
  46 |
  47 |   test('검색 결과 0개 시 상황별 피드백 확인 - 조건 A (지역 필터 ON + 검색어)', async ({ page }) => {
  48 |     const regionDepth1 = page.locator('#region-depth1');
  49 |     const searchInput = page.locator('#search-input');
  50 |     const storeList = page.locator('#store-list');
  51 |
  52 |     // 지역 선택 (서울특별시)
  53 |     await regionDepth1.selectOption('서울특별시');
  54 |     // 존재하지 않을 법한 검색어 입력
  55 |     await searchInput.fill('존재하지않는매장명123');
  56 |     await page.waitForTimeout(500); // 디바운스 대기
  57 |
  58 |     const expectedText = '선택하신 지역 내에 해당 검색어와 일치하는 매장이 없습니다.';
  59 |     await expect(storeList).toContainText(expectedText);
  60 |   });
  61 |
  62 |   test('검색 결과 0개 시 상황별 피드백 확인 - 조건 B (일반 상황)', async ({ page }) => {
  63 |     const searchInput = page.locator('#search-input');
  64 |     const storeList = page.locator('#store-list');
  65 |
  66 |     // 지역은 '전국'인 상태에서 존재하지 않는 검색어 입력
  67 |     await searchInput.fill('존재하지않는매장명XYZ');
  68 |     await page.waitForTimeout(500);
  69 |
  70 |     const expectedText = '해당 조건의 공식 인증 매장이 없습니다.';
  71 |     await expect(storeList).toContainText(expectedText);
  72 |   });
  73 | });
  74 |
```