from playwright.sync_api import sync_playwright, expect
import time
import os

def run_test():
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1280, 'height': 720})
            page = context.new_page()

            # 1. Load page
            page.goto("http://localhost:3000")
            page.wait_for_selector(".store-card")
            page.screenshot(path="verification/1_initial_load.png")

            # 2. Test Filter Reset
            search_input = page.locator("#search-input")
            search_input.fill("강남")
            time.sleep(1)
            page.screenshot(path="verification/2_after_search.png")

            reset_btn = page.locator("#btn-reset-filters")
            reset_btn.click()
            time.sleep(1)
            page.screenshot(path="verification/3_after_reset.png")

            # 3. Test Store Click
            page.locator(".store-card").first.click()
            time.sleep(1)
            page.screenshot(path="verification/4_after_store_click.png")

            # 4. Test Back-step
            page.evaluate("() => document.getElementById('btn-back-step').click()")
            time.sleep(1)
            page.screenshot(path="verification/5_after_back_step.png")

            browser.close()
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    run_test()
