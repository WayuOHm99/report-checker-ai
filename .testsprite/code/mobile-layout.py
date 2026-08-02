import asyncio

from playwright import async_api
from playwright.async_api import expect


TARGET_URL = "https://reportcheckxd.pages.dev/"
MOBILE_WIDTH = 390
MOBILE_HEIGHT = 844


async def run_test():
    playwright = None
    browser = None
    context = None

    try:
        playwright = await async_api.async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                f"--window-size={MOBILE_WIDTH},{MOBILE_HEIGHT}",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process",
            ],
        )
        context = await browser.new_context(
            viewport={"width": MOBILE_WIDTH, "height": MOBILE_HEIGHT},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
        )
        context.set_default_timeout(15_000)
        page = await context.new_page()

        await page.goto(TARGET_URL, wait_until="domcontentloaded")

        heading = page.get_by_role("heading", name="ตรวจรายงานด้วย AI", level=1)
        await expect(heading).to_be_visible()
        assert await heading.text_content() == "ตรวจรายงานด้วย AI"

        layout = await page.evaluate(
            """
            () => ({
              viewportWidth: window.innerWidth,
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            })
            """
        )
        assert layout["viewportWidth"] == MOBILE_WIDTH, layout
        assert layout["scrollWidth"] <= layout["clientWidth"], layout

        report = (
            "บทนำ รายงานสังเคราะห์นี้ใช้ตรวจการจัดวางบนหน้าจอมือถือ "
            "โดยมีรายละเอียดเพียงพอสำหรับเปิดใช้งานปุ่มตรวจรายงาน "
            "และไม่มีข้อมูลส่วนบุคคลหรือข้อมูลจริงของผู้ใช้งาน"
        )
        await page.get_by_label("ข้อความรายงาน").fill(report)

        analyze_button = page.get_by_role("button", name="ตรวจรายงาน")
        await expect(analyze_button).to_be_visible()
        await expect(analyze_button).to_be_enabled()
        box = await analyze_button.bounding_box()
        assert box is not None
        assert box["height"] >= 44, box
        assert box["x"] >= 0, box
        assert box["x"] + box["width"] <= MOBILE_WIDTH, box

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if playwright:
            await playwright.stop()


asyncio.run(run_test())
