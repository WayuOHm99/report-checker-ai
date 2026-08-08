"""
ตรวจว่าสีใน tokens.css อ่านออกจริงหรือเปล่า
================================================================

ปัญหาที่สคริปต์นี้แก้: การเลือกสีด้วยสายตาเชื่อไม่ได้
สีที่ "ดูสวย" บนจอดีๆ ในห้องแอร์ อาจอ่านไม่ออกเลยบนมือถือกลางแดด
หรือสำหรับคนสายตาเลือนราง

เกณฑ์ที่ใช้คือ WCAG ซึ่งเป็นมาตรฐานสากลเรื่องการเข้าถึงเว็บ
วัดเป็น "อัตราส่วนความตัดกัน" ระหว่างสีตัวอักษรกับสีพื้นหลัง
  - ตัวอักษรขนาดปกติ ต้องอย่างน้อย 4.5 : 1
  - ขอบช่องกรอกและวงแหวน focus ต้องอย่างน้อย 3 : 1

สคริปต์นี้อ่านค่าจาก tokens.css โดยตรง ไม่ได้พิมพ์ค่าซ้ำเอง
แปลว่าถ้าใครแก้สีใน tokens.css แล้วลืมเช็ก รันอันนี้จะฟ้องทันที

วิธีรัน (ต้องมี Python ในเครื่อง):
    python docs/brand/verify-contrast.py

ออก 0 = ผ่านหมด, ออก 1 = มีจุดไม่ผ่าน
"""

import math
import re
import sys
from pathlib import Path

TOKENS_FILE = Path(__file__).parent / "tokens.css"


def oklch_to_srgb(lightness: float, chroma: float, hue_deg: float):
    """แปลงสีจากรูปแบบ oklch (ที่ tokens.css ใช้) เป็นค่าแดง-เขียว-น้ำเงินปกติ"""
    hue_rad = math.radians(hue_deg)
    a = chroma * math.cos(hue_rad)
    b = chroma * math.sin(hue_rad)

    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3

    red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def encode(channel: float) -> float:
        channel = max(0.0, min(1.0, channel))
        if channel > 0.0031308:
            return 1.055 * (channel ** (1 / 2.4)) - 0.055
        return 12.92 * channel

    return tuple(encode(c) for c in (red, green, blue))


def relative_luminance(rgb) -> float:
    """ความสว่างที่ตาคนรับรู้ ตามสูตรของ WCAG"""

    def linearize(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (linearize(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(color_a, color_b) -> float:
    a, b = relative_luminance(color_a), relative_luminance(color_b)
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


def to_hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(round(c * 255) for c in rgb)


def parse_tokens(css_text: str, inherit_from: dict | None = None) -> dict:
    """ดึงค่าสีจากข้อความ CSS — รองรับทั้ง oklch(...) ตรงๆ และ var(--ตัวอื่น)"""
    resolved = dict(inherit_from) if inherit_from else {}
    declarations = {
        m.group(1): m.group(2).strip()
        for m in re.finditer(r"(--rl-[\w-]+):\s*([^;]+);", css_text)
    }

    for name, value in declarations.items():
        direct = re.match(r"oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)", value)
        if direct:
            resolved[name] = oklch_to_srgb(*map(float, direct.groups()))

    # ตัวที่ชี้ไปหาตัวอื่น (var) ต้องแก้หลังจากรู้ค่าตัวจริงแล้ว
    for name, value in declarations.items():
        alias = re.match(r"var\((--rl-[\w-]+)\)", value)
        if alias and alias.group(1) in resolved:
            resolved[name] = resolved[alias.group(1)]

    return resolved


# (คำอธิบาย, สีตัวอักษร, สีพื้นหลัง, อัตราส่วนขั้นต่ำที่ต้องผ่าน)
CHECKS = [
    ("ตัวอักษรหลัก", "--rl-text", "--rl-bg", 4.5),
    ("คำอธิบายประกอบ", "--rl-text-muted", "--rl-bg", 4.5),
    ("ข้อความจาง (หน่วย/วันที่)", "--rl-text-faint", "--rl-bg", 4.5),
    ("ตัวอักษรบนปุ่มหลัก", "--rl-text-onbrand", "--rl-primary", 4.5),
    ("ตัวอักษรบนปุ่มหลักตอนชี้", "--rl-text-onbrand", "--rl-primary-hover", 4.5),
    ("ป้าย ครบตามเกณฑ์", "--rl-met-fg", "--rl-met-bg", 4.5),
    ("ป้าย มีบางส่วน", "--rl-partial-fg", "--rl-partial-bg", 4.5),
    ("ป้าย ยังไม่พบ", "--rl-missing-fg", "--rl-missing-bg", 4.5),
    ("ป้าย ต้องให้คนตรวจ", "--rl-unsure-fg", "--rl-unsure-bg", 4.5),
    ("ป้าย ระบบผิดพลาด", "--rl-danger-fg", "--rl-danger-bg", 4.5),
    ("ลิงก์และคะแนนรวม", "--rl-primary", "--rl-bg", 4.5),
    ("ขอบช่องกรอก", "--rl-border-strong", "--rl-bg", 3.0),
    ("วงแหวนตอนกด Tab", "--rl-focus", "--rl-bg", 3.0),
]


def main() -> int:
    css = TOKENS_FILE.read_text(encoding="utf-8")
    light_css, dark_css = css.split(".dark {", 1)

    light = parse_tokens(light_css)
    dark = parse_tokens(dark_css, inherit_from=light)

    failures = 0
    skipped = 0

    for mode_name, tokens in (("สว่าง", light), ("มืด", dark)):
        print(f"\n=== โหมด{mode_name} ===")
        for label, fg, bg, minimum in CHECKS:
            if fg not in tokens or bg not in tokens:
                print(f"  {label:<28} ตรวจไม่ได้ (หาค่า {fg} หรือ {bg} ไม่เจอ)")
                skipped += 1
                continue

            ratio = contrast_ratio(tokens[fg], tokens[bg])
            passed = ratio >= minimum
            if not passed:
                failures += 1

            mark = "ผ่าน" if passed else "ไม่ผ่าน <<<"
            print(
                f"  {label:<28}{ratio:>7.2f}:1  (ต้องอย่างน้อย {minimum}:1)  {mark}"
                f"   {to_hex(tokens[fg])} บน {to_hex(tokens[bg])}"
            )

    print("\n" + "=" * 62)
    if failures:
        print(f"มีจุดที่ไม่ผ่าน {failures} จุด — ต้องแก้ค่าใน tokens.css ก่อนใช้งาน")
    else:
        print("ผ่านครบทุกจุด")
    if skipped:
        print(f"ตรวจไม่ได้ {skipped} จุด (อาจใช้สีแบบโปร่งใสซึ่งวัดค่าตายตัวไม่ได้)")
    print("=" * 62)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
