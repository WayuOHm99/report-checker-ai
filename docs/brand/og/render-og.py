"""
สร้าง og.png จาก og.svg
================================================================

og.png คือภาพที่โผล่ขึ้นมาตอนมีคนแชร์ลิงก์เว็บใน LINE, Facebook, X
ขนาดมาตรฐานคือ 1200 x 630 พิกเซล

ทำไมต้องมีสคริปต์: ถ้าแก้ข้อความหรือสีใน og.svg แล้ว
ต้องสร้าง og.png ใหม่ทุกครั้ง ไม่งั้นภาพที่คนเห็นตอนแชร์จะเป็นของเก่า

วิธีรัน:
    pip install cairosvg fonttools brotli
    python docs/brand/og/render-og.py

ข้อควรรู้เรื่องฟอนต์ไทย:
  โปรแกรมวาดภาพต้องหาไฟล์ฟอนต์ไทยในเครื่องให้เจอ ไม่งั้นตัวอักษรไทย
  จะกลายเป็นสี่เหลี่ยมเปล่าทั้งหมด
  สคริปต์นี้จะติดตั้งฟอนต์ให้อัตโนมัติ โดยดึงจาก node_modules ของโปรเจกต์เอง
  (แพ็กเกจ @fontsource/noto-sans-thai ที่เว็บใช้อยู่แล้ว)
  จึงต้องรัน `npm install` มาก่อน
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
REPO_ROOT = HERE.parent.parent.parent
FONT_SOURCE = REPO_ROOT / "node_modules" / "@fontsource" / "noto-sans-thai" / "files"
FONT_INSTALL_DIR = Path.home() / ".fonts"

# ชื่อวงศ์ฟอนต์ที่ og.svg เรียกใช้ — ต้องตรงกับค่า font-family ในไฟล์นั้น
FONT_FAMILY = "RLNotoThai"


def install_thai_font() -> bool:
    """รวมฟอนต์ชุดละตินกับชุดไทยเข้าเป็นไฟล์เดียว แล้วติดตั้งลงเครื่อง

    ทำไมต้องรวม: แพ็กเกจ fontsource แยกไฟล์ตามภาษาเพื่อให้เว็บโหลดเร็ว
    แต่โปรแกรมวาดภาพเลือกได้ไฟล์เดียวต่อหนึ่งชื่อฟอนต์
    ถ้าไม่รวม จะได้ตัวอักษรอังกฤษแต่ตัวไทยหาย (หรือกลับกัน)
    """
    try:
        from fontTools.merge import Merger
        from fontTools.ttLib import TTFont
    except ImportError:
        print("ไม่พบไลบรารี fonttools — ติดตั้งด้วย: pip install fonttools brotli")
        return False

    if not FONT_SOURCE.exists():
        print(f"ไม่พบไฟล์ฟอนต์ที่ {FONT_SOURCE}")
        print("ต้องรัน `npm install` ที่รากโปรเจกต์ก่อน")
        return False

    FONT_INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        for weight, style in ((400, "Regular"), (700, "Bold")):
            parts = []
            for subset in ("latin", "thai"):
                source = FONT_SOURCE / f"noto-sans-thai-{subset}-{weight}-normal.woff2"
                if not source.exists():
                    print(f"ไม่พบ {source.name}")
                    return False
                font = TTFont(source)
                font.flavor = None  # คลายการบีบอัดแบบ woff2 ให้เป็น ttf ธรรมดา
                part_path = os.path.join(tmp, f"{subset}-{weight}.ttf")
                font.save(part_path)
                parts.append(part_path)

            merged = Merger().merge(parts)
            for record in merged["name"].names:
                if record.nameID in (1, 16):
                    record.string = FONT_FAMILY
                elif record.nameID == 2:
                    record.string = style
                elif record.nameID == 4:
                    record.string = f"{FONT_FAMILY} {style}"
                elif record.nameID == 6:
                    record.string = f"{FONT_FAMILY}-{style}"
            merged.save(str(FONT_INSTALL_DIR / f"{FONT_FAMILY}-{style}.ttf"))
            print(f"ติดตั้งฟอนต์ {FONT_FAMILY}-{style}.ttf แล้ว")

    # บอกระบบให้รู้จักฟอนต์ที่เพิ่งวางลงไป (ถ้าเครื่องไม่มี fc-cache ก็ข้ามได้)
    if shutil.which("fc-cache"):
        subprocess.run(["fc-cache", "-f"], capture_output=True, check=False)
    return True


def render() -> int:
    try:
        import cairosvg
    except ImportError:
        print("ไม่พบไลบรารี cairosvg — ติดตั้งด้วย: pip install cairosvg")
        return 1

    if not install_thai_font():
        print("\nติดตั้งฟอนต์ไม่สำเร็จ — ถ้าปล่อยผ่าน ตัวอักษรไทยจะกลายเป็นสี่เหลี่ยมเปล่า")
        return 1

    source = HERE / "og.svg"
    target = HERE / "og.png"
    cairosvg.svg2png(url=str(source), write_to=str(target), output_width=1200, output_height=630)

    size_kb = target.stat().st_size / 1024
    print(f"\nสร้าง {target.name} แล้ว — 1200x630 พิกเซล, {size_kb:.0f} KB")
    print("อย่าลืมเปิดดูด้วยตาก่อนใช้งาน ว่าตัวอักษรไทยไม่กลายเป็นสี่เหลี่ยมเปล่า")
    return 0


if __name__ == "__main__":
    sys.exit(render())
