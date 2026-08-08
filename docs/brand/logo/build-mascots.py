"""
สร้างไฟล์มาสคอตทุกแบบจากต้นแบบเดียว
================================================================

ปัญหาที่สคริปต์นี้แก้:
  มาสคอตมี 7 ไฟล์ แต่ "ตัวถัง" (หัว ตัว แขน แว่น เงา) เหมือนกันหมด
  ต่างกันแค่สีหน้ากับท่าทาง
  ถ้าเขียนแยก 7 ไฟล์ด้วยมือ พอวันหนึ่งอยากขยับตาลง 2 พิกเซล
  ต้องไล่แก้ 7 ที่ และพลาดที่เดียวก็เพี้ยนทั้งชุดโดยไม่มีอะไรเตือน

  สคริปต์นี้เก็บตัวถังไว้ที่เดียว แล้วประกอบสีหน้าต่างๆ เข้าไป

วิธีรัน:
    python docs/brand/logo/build-mascots.py

จะได้ไฟล์ .svg ธรรมดาออกมา ใครก็เปิดใช้ได้ ไม่ต้องมี Python

⚠️ ห้ามแก้ไฟล์ .svg ที่สคริปต์นี้สร้างโดยตรง — รันทีเดียวหายหมด
   ให้แก้ที่สคริปต์นี้แล้วรันใหม่

--------------------------------------------------------------
ทิศแสง: ตกจากบนซ้ายเสมอ
  ทุกชิ้นส่วนสว่างด้านบนซ้าย เข้มด้านล่างขวา
  ถ้าเพิ่มชิ้นส่วนใหม่ต้องทำตามทิศนี้ ไม่งั้นภาพจะดูผิดธรรมชาติทันที
--------------------------------------------------------------
"""

from pathlib import Path

OUT_DIR = Path(__file__).parent

# ค่าสีทั้งหมดต้องตรงกับ tokens.css
BRAND_600 = "#286096"
BRAND_700 = "#1b4a76"
BRAND_800 = "#133555"
TEAL = "#5db5b5"
TEAL_DIM = "#2c5470"   # เส้นเกณฑ์ที่ยังไม่ติด
GRAY_EYE = "#7d94a8"   # ตาดับตอนระบบไม่ตอบสนอง


# ============================================================
# 1. ชุดไล่เฉดสี — ใช้ร่วมกันทุกไฟล์
# ============================================================

DEFS = """  <defs>
    <linearGradient id="shell" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#fbfdff"/>
      <stop offset="0.45" stop-color="#e6eef9"/>
      <stop offset="1" stop-color="#c5d8ef"/>
    </linearGradient>
    <linearGradient id="shellBody" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#f2f7fd"/>
      <stop offset="0.5" stop-color="#dbe7f6"/>
      <stop offset="1" stop-color="#b9cfe9"/>
    </linearGradient>
    <linearGradient id="shellArm" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#dbe7f6"/>
      <stop offset="1" stop-color="#a3bfe0"/>
    </linearGradient>
    <radialGradient id="screen" cx="0.38" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#24507c"/>
      <stop offset="0.55" stop-color="#153a5e"/>
      <stop offset="1" stop-color="#0b2138"/>
    </radialGradient>
    <radialGradient id="screenOff" cx="0.38" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#2c4c68"/>
      <stop offset="0.55" stop-color="#213b52"/>
      <stop offset="1" stop-color="#16293a"/>
    </radialGradient>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="eye" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#8fdcd6"/>
      <stop offset="0.6" stop-color="#5db5b5"/>
      <stop offset="1" stop-color="#349090"/>
    </radialGradient>
    <linearGradient id="ring" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#407bb5"/>
      <stop offset="0.5" stop-color="#286096"/>
      <stop offset="1" stop-color="#153c62"/>
    </linearGradient>
    <linearGradient id="ringOff" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#8aa4bd"/>
      <stop offset="1" stop-color="#5a7a99"/>
    </linearGradient>
    <linearGradient id="glass" x1="0.15" y1="0.1" x2="0.85" y2="0.9">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f4f9ff"/>
      <stop offset="1" stop-color="#dceaf9"/>
    </linearGradient>
    <radialGradient id="groundShadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8fa3b8" stop-opacity="0.42"/>
      <stop offset="0.6" stop-color="#8fa3b8" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#8fa3b8" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clipScreen"><rect x="53" y="36" width="104" height="70" rx="24"/></clipPath>
    <clipPath id="clipChest"><rect x="83" y="150" width="44" height="36" rx="9"/></clipPath>
    <clipPath id="clipGlass"><circle cx="210" cy="66" r="25"/></clipPath>
  </defs>
"""


# ============================================================
# 2. ชิ้นส่วนตัวถัง
# ============================================================

GROUND = '  <ellipse cx="105" cy="226" rx="72" ry="15" fill="url(#groundShadow)"/>\n'

ARMS_ACTIVE = """  <g stroke="url(#shellArm)" stroke-width="17" stroke-linecap="round">
    <path d="M72 146 L48 166"/>
    <path d="M138 143 L170 115"/>
  </g>
  <circle cx="47" cy="167" r="11.5" fill="url(#shellArm)"/>
  <circle cx="171" cy="114" r="11.5" fill="url(#shellArm)"/>
"""

# ท่าแขนห้อยลงทั้งสองข้าง ใช้ตอนระบบไม่ตอบสนอง
ARMS_DOWN = """  <g stroke="url(#shellArm)" stroke-width="17" stroke-linecap="round">
    <path d="M72 146 L48 166"/>
    <path d="M138 146 L162 166"/>
  </g>
  <circle cx="47" cy="167" r="11.5" fill="url(#shellArm)"/>
  <circle cx="163" cy="167" r="11.5" fill="url(#shellArm)"/>
"""

BODY = """  <path d="M105 124 C81 124 69 141 66 176 C64 197 73 210 91 210 H119 C137 210 146 197 144 176 C141 141 129 124 105 124 Z" fill="url(#shellBody)"/>
  <path d="M105 124 C88 124 77 132 71 148 C82 155 93 158 105 158 C117 158 128 155 139 148 C133 132 122 124 105 124 Z" fill="#a9c3e2" opacity="0.20"/>
  <path d="M84 133 C76 142 72 156 70 173" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.45"/>
  <rect x="97" y="110" width="16" height="16" rx="5" fill="#b9cfe9"/>
"""

# แสงขอบต้องวิ่งตามความโค้งของมุมพอดี ไม่งั้นจะดูเหมือนรอยขีดข่วนบนหัว
# เส้นทั้งสองวางบนกรอบที่ย่อเข้ามา 5 หน่วยจากขอบจริง (รัศมีมุมจึงเป็น 27 ไม่ใช่ 32)
HEAD_SHELL = """  <rect x="39" y="22" width="132" height="98" rx="32" fill="url(#shell)"/>
  <path d="M44 56 A 27 27 0 0 1 71 27" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" opacity="0.8"/>
  <path d="M166 86 A 27 27 0 0 1 139 115" stroke="#9db8db" stroke-width="4.5" stroke-linecap="round" opacity="0.4"/>
"""


def screen(off: bool = False) -> str:
    """หน้าจอบนหัว — ถ้า off=True จะใช้เฉดสีที่ดูเหมือนจอดับ"""
    fill = "url(#screenOff)" if off else "url(#screen)"
    return f"""  <rect x="53" y="36" width="104" height="70" rx="24" fill="{fill}"/>
  <g clip-path="url(#clipScreen)"><rect x="53" y="36" width="104" height="70" fill="url(#glare)"/></g>
  <rect x="53" y="36" width="104" height="70" rx="24" stroke="#0a1d31" stroke-width="2" opacity="0.55"/>
"""


# ============================================================
# 3. สีหน้า — ส่วนเดียวที่ต่างกันจริงระหว่างไฟล์
# ============================================================

def eyes_round(cy: int = 68, r: int = 12) -> str:
    """ตาวงกลมทึบ + จุดสว่าง 2 จุด = ดูมีชีวิตโดยไม่ต้องมีคิ้วหรือปาก"""
    hl = r / 3
    return f"""  <circle cx="81" cy="{cy}" r="{r + 1}" fill="#3f9a9a" opacity="0.35"/>
  <circle cx="129" cy="{cy}" r="{r + 1}" fill="#3f9a9a" opacity="0.35"/>
  <circle cx="81" cy="{cy}" r="{r}" fill="url(#eye)"/>
  <circle cx="129" cy="{cy}" r="{r}" fill="url(#eye)"/>
  <circle cx="{81 - r / 3:.1f}" cy="{cy - r / 2.7:.1f}" r="{hl:.1f}" fill="#eafcfb"/>
  <circle cx="{129 - r / 3:.1f}" cy="{cy - r / 2.7:.1f}" r="{hl:.1f}" fill="#eafcfb"/>
  <circle cx="{81 + r / 3:.1f}" cy="{cy + r / 2.4:.1f}" r="{hl / 2:.1f}" fill="#eafcfb" opacity="0.55"/>
  <circle cx="{129 + r / 3:.1f}" cy="{cy + r / 2.4:.1f}" r="{hl / 2:.1f}" fill="#eafcfb" opacity="0.55"/>
"""


EYES_SMILE = """  <g stroke="#5db5b5" stroke-width="7" stroke-linecap="round" fill="none">
    <path d="M70 73 Q81 58 92 73"/>
    <path d="M118 73 Q129 58 140 73"/>
  </g>
  <g stroke="#8fdcd6" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.7">
    <path d="M72 70 Q81 60 90 70"/>
    <path d="M120 70 Q129 60 138 70"/>
  </g>
"""

EYES_OFF = f"""  <g stroke="{GRAY_EYE}" stroke-width="7" stroke-linecap="round">
    <path d="M72 68 H90"/>
    <path d="M120 68 H138"/>
  </g>
"""


def chest(lit: int = 3, off: bool = False) -> str:
    """แผงหน้าอกที่แสดงเกณฑ์ 3 ข้อ — lit บอกว่าติดแล้วกี่เส้น"""
    bars = [("M90 160 H120",), ("M90 168 H110",), ("M90 176 H116",)]
    fill = "url(#screenOff)" if off else "url(#screen)"
    lines = ""
    for i, (d,) in enumerate(bars):
        color = "#3a5a76" if off else (TEAL if i < lit else TEAL_DIM)
        lines += f'    <path d="{d}" stroke="{color}"/>\n'
    return f"""  <rect x="83" y="150" width="44" height="36" rx="9" fill="{fill}"/>
  <g clip-path="url(#clipChest)"><rect x="83" y="150" width="44" height="36" fill="url(#glare)"/></g>
  <rect x="83" y="150" width="44" height="36" rx="9" stroke="#0a1d31" stroke-width="1.6" opacity="0.5"/>
  <g stroke-width="3.6" stroke-linecap="round">
{lines}  </g>
"""


LENS_UP = f"""  <path d="M176 110 L192 94" stroke="#153c62" stroke-width="10" stroke-linecap="round"/>
  <path d="M177 107 L190 93" stroke="#4a7fb5" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <circle cx="210" cy="66" r="25" fill="url(#glass)"/>
  <g clip-path="url(#clipGlass)"><path d="M182 40 L214 40 L192 92 L182 92 Z" fill="#ffffff" opacity="0.75"/></g>
  <circle cx="210" cy="66" r="30" stroke="url(#ring)" stroke-width="10"/>
  <path d="M192 50 A 26 26 0 0 1 208 41" stroke="#8fb8dd" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
  <g stroke="{BRAND_600}" stroke-width="5" stroke-linecap="round">
    <path d="M194 56 H226"/>
    <path d="M194 66 H214"/>
    <path d="M194 76 H222"/>
  </g>
"""

# แว่นห้อยลงข้างตัว ใช้ตอนระบบไม่ตอบสนอง
LENS_DOWN = """  <path d="M168 172 L182 186" stroke="#5a7a99" stroke-width="10" stroke-linecap="round"/>
  <circle cx="196" cy="204" r="20" fill="#f2f6fa"/>
  <circle cx="196" cy="204" r="24" stroke="url(#ringOff)" stroke-width="9"/>
  <g stroke="#8ba4b8" stroke-width="4.5" stroke-linecap="round">
    <path d="M184 196 H210"/>
    <path d="M184 204 H198"/>
    <path d="M184 212 H206"/>
  </g>
"""


# ============================================================
# 4. ประกอบไฟล์
# ============================================================

def wrap(view_box: str, w: int, h: int, label: str, body: str, note: str) -> str:
    return f"""<!--
  RubricLensAi — {note}

  ⚠️ ไฟล์นี้ถูกสร้างโดย build-mascots.py — ห้ามแก้ตรงนี้ รันทีเดียวหายหมด
     ต้องการแก้ ให้แก้ที่ build-mascots.py แล้วรันใหม่

  แสงตกจากบนซ้ายเสมอ ทุกชิ้นส่วนสว่างบนซ้าย เข้มล่างขวา
  งานออกแบบต้นฉบับ ไม่ได้ลอกจากหุ่นยนต์ยี่ห้อใด
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" width="{w}" height="{h}" fill="none" role="img" aria-label="{label}">
  <title>{label}</title>
{DEFS}{body}</svg>
"""


FULL_VIEWBOX, FULL_W, FULL_H = "30 14 224 230", 224, 230


def build_full(name: str, label: str, note: str, *, face: str, lit: int,
               arms: str = ARMS_ACTIVE, lens: str = LENS_UP, off: bool = False) -> None:
    body = GROUND + arms + BODY + HEAD_SHELL + screen(off) + face + chest(lit, off) + lens
    (OUT_DIR / name).write_text(wrap(FULL_VIEWBOX, FULL_W, FULL_H, label, body, note), encoding="utf-8")
    print(f"  สร้าง {name}")


def build_head() -> None:
    """หัวอย่างเดียว สำหรับพื้นที่แคบ 20-48 พิกเซล"""
    body = HEAD_SHELL + screen() + eyes_round()
    note = "หัวมาสคอตอย่างเดียว (ใช้ที่ 20-48 พิกเซล)"
    (OUT_DIR / "mascot-head.svg").write_text(
        wrap("35 18 140 106", 140, 106, "RubricLensAi", body, note), encoding="utf-8")
    print("  สร้าง mascot-head.svg")


def build_favicon() -> None:
    """ไอคอนแท็บเบราว์เซอร์ 16 พิกเซล

    ต่างจากไฟล์อื่นมาก เพราะที่ 16 พิกเซลรายละเอียดทุกอย่างจะเละ:
      - เหลือแค่หน้าหุ่น ตัดตัว แขน แว่นออกหมด
      - มีพื้นหลังสี่เหลี่ยมสีแบรนด์ เพราะแท็บมีทั้งพื้นขาวและพื้นดำ
      - ไล่เฉดสีเบามาก ใส่แรงกว่านี้จะกลายเป็นสีเลอะตอนย่อ
    """
    svg = f"""<!--
  RubricLensAi — ไอคอนแท็บเบราว์เซอร์

  ⚠️ สร้างโดย build-mascots.py — ห้ามแก้ตรงนี้

  เคยลองใส่ตัวหุ่นลงไปด้วยแล้ว ที่ 16 พิกเซลหัวกับตัวเชื่อมติดกัน
  กลายเป็นก้อนขาวอ่านไม่ออก จึงเหลือแค่หน้า

  สีฝังตายตัว เพราะไอคอนบนแท็บไม่มีบริบทให้สืบทอดสี
  ถ้าเปลี่ยนสีแบรนด์ใน tokens.css ต้องมาแก้ที่ build-mascots.py ด้วยมือ
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none" role="img" aria-label="RubricLensAi">
  <title>RubricLensAi</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3371ab"/>
      <stop offset="1" stop-color="{BRAND_700}"/>
    </linearGradient>
    <linearGradient id="face" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#d9e6f5"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#bg)"/>
  <rect x="4.5" y="7" width="23" height="18" rx="6" fill="url(#face)"/>
  <circle cx="11.4" cy="16" r="3.1" fill="{BRAND_800}"/>
  <circle cx="20.6" cy="16" r="3.1" fill="{BRAND_800}"/>
  <circle cx="10.5" cy="15" r="1.1" fill="{TEAL}"/>
  <circle cx="19.7" cy="15" r="1.1" fill="{TEAL}"/>
</svg>
"""
    (OUT_DIR / "favicon.svg").write_text(svg, encoding="utf-8")
    print("  สร้าง favicon.svg")


def build_lockup() -> None:
    """มาสคอต + ชื่อแบรนด์ ใช้ในหัวเว็บและเอกสาร

    ตัวอักษรยังเป็น <text> ไม่ใช่เส้นวาด แปลว่ายืมฟอนต์จากเครื่องที่เปิดไฟล์
    ใช้บนเว็บเราเองได้ปกติ แต่ถ้าส่งโรงพิมพ์ต้องแปลงเป็นเส้นก่อน
    """
    mascot = GROUND + ARMS_ACTIVE + BODY + HEAD_SHELL + screen() + eyes_round() + chest(3) + LENS_UP
    # ย่อมาสคอตเหลือสูง 92 แล้ววางชิดซ้าย จากนั้นวางชื่อแบรนด์ต่อทางขวา
    scale = 0.40
    body = f'  <g transform="translate(-12, 4) scale({scale})">\n' + mascot + "  </g>\n"
    body += f"""  <text x="106" y="63"
        font-family="'Geist Variable', 'Geist', system-ui, sans-serif"
        font-size="34" letter-spacing="-0.7" fill="{BRAND_600}">
    <tspan font-weight="700">RubricLens</tspan><tspan font-weight="500" opacity="0.62">Ai</tspan>
  </text>
"""
    note = "โลโก้เต็ม (มาสคอต + ชื่อแบรนด์)"
    # ความกว้าง 348 มาจากการวัดขอบเขตจริงหลังเรนเดอร์ (ตัวอักษรจบที่ 341) แล้วเผื่อไว้เล็กน้อย
    # ถ้าเปลี่ยนขนาดตัวอักษรหรือชื่อแบรนด์ ต้องวัดใหม่ ไม่งั้นตัวท้ายจะถูกตัดหาย
    (OUT_DIR / "mascot-lockup.svg").write_text(
        wrap("0 0 348 106", 348, 106, "RubricLensAi", body, note), encoding="utf-8")
    print("  สร้าง mascot-lockup.svg")


def main() -> None:
    print("กำลังสร้างไฟล์มาสคอต...")

    build_full("mascot.svg", "RubricLensAi",
               "มาสคอต 2.5D สีหน้าปกติ (หน้าจอว่าง สอนใช้งาน ภาพแชร์ลิงก์)",
               face=eyes_round(), lit=3)

    build_full("mascot-thinking.svg", "กำลังตรวจเอกสาร",
               "สีหน้ากำลังตรวจ — ตาเล็กลงและเลื่อนขึ้น = เพ่งมอง, แผงอกติด 1 ใน 3 เส้น",
               face=eyes_round(cy=62, r=9), lit=1)

    build_full("mascot-done.svg", "ตรวจเสร็จแล้ว",
               "สีหน้าเสร็จแล้ว — ยิ้มด้วยตา ยังไม่มีปาก. ห้ามใช้ในหน้าผลคะแนน",
               face=EYES_SMILE, lit=3)

    build_full("mascot-offline.svg", "ระบบไม่ตอบสนอง",
               "สีหน้าระบบไม่ตอบสนอง — ตาดับ ไม่ใช่หน้าเศร้า. ใช้กับระบบพังเท่านั้น",
               face=EYES_OFF, lit=0, arms=ARMS_DOWN, lens=LENS_DOWN, off=True)

    build_head()
    build_favicon()
    build_lockup()

    print("\nเสร็จแล้ว — อย่าลืมเปิดดูด้วยตาก่อนใช้งาน")


if __name__ == "__main__":
    main()
