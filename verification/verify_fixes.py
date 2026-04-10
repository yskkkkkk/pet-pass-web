from playwright.sync_api import Page, expect, sync_playwright
import time

def test_map_interactions(page: Page):
    # 1. 페이지 접속
    page.goto("http://localhost:3000")

    # 지도 로딩 대기
    page.wait_for_selector(".store-card")
    time.sleep(2) # 카카오 맵 초기화 대기

    # 2. 초기 화면 스크린샷 (필터 초기화 버튼 위치 확인)
    page.screenshot(path="/home/jules/verification/1_initial_load.png")

    # 3. 매장 카드 클릭 시 지도 이동 및 버튼 노출 방지 확인
    first_card = page.locator(".store-card").first
    first_card.click()

    # '이 지역 탐색' 버튼이 보이지 않아야 함
    btn_search_here = page.locator("#btn-search-here")
    # Wait a bit for any potential animation or event
    time.sleep(1)
    expect(btn_search_here).not_to_be_visible()

    # '이전 위치로' 버튼은 보여야 함
    btn_back_step = page.locator("#btn-back-step")
    expect(btn_back_step).to_be_visible()

    page.screenshot(path="/home/jules/verification/2_after_click.png")

    # 4. 오버레이 닫기 (강제 클릭 또는 좌표 클릭)
    # 오버레이 중심이 아니라 구석을 클릭하여 바텀시트 간섭 피함
    page.mouse.click(10, 10)
    time.sleep(1)

    # 5. 필터 초기화 버튼 작동 확인
    btn_reset = page.locator("#btn-reset-filters")
    btn_reset.click()

    # 필터 초기화 후 '이전 위치로' 버튼이 사라져야 함
    time.sleep(1)
    expect(btn_back_step).not_to_be_visible()

    page.screenshot(path="/home/jules/verification/3_after_reset.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_map_interactions(page)
        finally:
            browser.close()
