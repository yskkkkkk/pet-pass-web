from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_map_logic(page: Page):
    # 1. Start: Go to the application
    page.goto("http://localhost:3000")
    page.wait_for_timeout(2000)

    # 2. Test Condition A: Region ON + Search keyword with 0 results
    region_depth1 = page.locator('#region-depth1')
    search_input = page.locator('#search-input')

    region_depth1.select_option('서울특별시')
    search_input.fill('이것은존재하지않는매장명입니다')
    page.wait_for_timeout(500) # wait for debounce

    # Capture screenshot of the feedback message
    page.screenshot(path="/home/jules/verification/condition_a_feedback.png")

    # 3. Test Reset and No "Search Here" button
    btn_reset = page.locator('#btn-reset-filters')
    btn_reset.click()
    page.wait_for_timeout(1000)

    # Capture screenshot after reset
    page.screenshot(path="/home/jules/verification/after_reset.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_map_logic(page)
        finally:
            browser.close()
