import { ACTIVE_BROWSER_STORAGE_ENTRIES, LEGACY_BROWSER_STORAGE_KEYS } from '@/lib/browser-storage'
import { CONTACT_EMAIL, COPYRIGHT_HOLDER, SITE_NAME, SUPPORT_ISSUES_URL, TERMS_PATH } from '@/lib/site-info'
import { PolicyHighlight, PolicyPage, PolicySection, policyLinkClassName } from '@/pages/PolicyPage'

/**
 * เนื้อหานโยบายความเป็นส่วนตัว รวมหัวข้อคุกกี้ไว้ในหน้าเดียว
 *
 * ทุกข้อในหน้านี้ต้องตรงกับสิ่งที่โค้ดทำจริง ถ้าแก้พฤติกรรมของ Worker หรือของหน้าเว็บ
 * (เช่น เปลี่ยนเวลาเก็บผลชั่วคราว หรือเปลี่ยนขีดจำกัดการใช้งาน) ต้องกลับมาแก้ที่นี่ด้วย
 */
export function PrivacyPolicy() {
  return (
    <PolicyPage
      title="นโยบายความเป็นส่วนตัว"
      summary={`${SITE_NAME} ออกแบบมาให้เก็บข้อมูลของคุณน้อยที่สุดเท่าที่ยังทำงานได้ หน้านี้อธิบายว่าอะไรถูกส่งไปที่ไหน เก็บไว้นานเท่าไร และคุณควบคุมอะไรได้บ้าง`}
    >
      <PolicyHighlight>
        <p className="font-semibold">สรุปสั้น ๆ</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>ไม่มีระบบสมาชิก ไม่ถามชื่อ อีเมล หรือข้อมูลระบุตัวตนของคุณ</li>
          <li>ไฟล์ PDF ของคุณ<strong>ไม่ถูกอัปโหลด</strong> เบราว์เซอร์แปลงเป็นข้อความในเครื่องคุณก่อน</li>
          <li>ระบบ<strong>ไม่มีฐานข้อมูล</strong> จึงไม่มีการเก็บเอกสารของคุณไว้ถาวร</li>
          <li><strong>ไม่มีคุกกี้ ไม่มีตัวติดตาม ไม่มีโฆษณา</strong> จึงไม่มีแถบขอความยินยอมมากวนคุณ</li>
          <li>ข้อความที่คุณกดส่งตรวจถูกส่งต่อไปให้ Google Gemini วิเคราะห์ จึงไม่ควรใส่ข้อมูลลับ</li>
        </ul>
      </PolicyHighlight>

      <PolicySection heading="1. ใครเป็นผู้ให้บริการ">
        <p>
          {SITE_NAME} พัฒนาและดูแลโดย {COPYRIGHT_HOLDER} ในฐานะโครงการส่วนบุคคล
          ติดต่อเรื่องข้อมูลส่วนบุคคลได้ตามช่องทางในข้อ 12
        </p>
      </PolicySection>

      <PolicySection heading="2. ข้อมูลที่ระบบรับเข้ามา">
        <p>ระบบรับเฉพาะสิ่งที่จำเป็นต่อการตรวจเอกสารเท่านั้น คือ</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>ข้อความของเอกสาร</strong> ที่คุณพิมพ์ วาง หรือได้จากการแปลงไฟล์ PDF — และเป็นข้อความชุดที่คุณเห็นและแก้ไขได้ก่อนกดส่งเสมอ</li>
          <li><strong>เกณฑ์การตรวจและประเภทเอกสาร</strong> ที่คุณตั้งค่า</li>
          <li><strong>รหัสสุ่มนิรนาม</strong> ที่เบราว์เซอร์ของคุณสร้างขึ้นเอง ไม่ผูกกับตัวตนของคุณ ใช้เพื่อจำกัดจำนวนครั้งการใช้งานไม่ให้ค่าใช้จ่ายของระบบบานปลาย</li>
          <li><strong>หมายเลข IP</strong> ที่มากับคำขอตามธรรมชาติของอินเทอร์เน็ต ระบบ<strong>ไม่เก็บ IP ดิบ</strong> แต่แปลงเป็นค่าแฮช SHA-256 (ค่าที่ย้อนกลับเป็น IP เดิมไม่ได้) ก่อนนำไปนับจำนวนครั้ง</li>
        </ul>
        <p>ระบบไม่ขอชื่อ อีเมล เบอร์โทร ตำแหน่งที่ตั้ง หรือข้อมูลการชำระเงิน และไม่มีการสร้างโปรไฟล์ผู้ใช้</p>
      </PolicySection>

      <PolicySection heading="3. ไฟล์ PDF ไม่ได้ถูกอัปโหลด">
        <p>
          เมื่อคุณเลือกไฟล์ PDF การอ่านและดึงข้อความทั้งหมดเกิดขึ้น<strong>ในเบราว์เซอร์ของคุณเอง</strong>
          ตัวไฟล์ไม่ได้ถูกส่งขึ้นเซิร์ฟเวอร์ สิ่งที่ถูกส่งคือข้อความที่ปรากฏในกล่องให้คุณตรวจและแก้ไขได้ก่อนกดส่งเท่านั้น
          ถ้ามีเนื้อหาที่ไม่อยากให้ AI เห็น คุณลบออกจากกล่องข้อความก่อนกดส่งได้
        </p>
      </PolicySection>

      <PolicySection heading="4. ข้อความของคุณถูกส่งไปที่ไหน">
        <p>เมื่อคุณกดตรวจ ข้อความเอกสารหลัก ประเภทเอกสาร และเกณฑ์ของคุณจะเดินทางตามลำดับนี้</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>ส่งแบบเข้ารหัส (HTTPS) ไปยังเซิร์ฟเวอร์ตัวกลางของเราที่ทำงานบน <strong>Cloudflare Workers</strong></li>
          <li>เซิร์ฟเวอร์ตัวกลางส่งต่อไปให้ <strong>Google Gemini API</strong> เป็นผู้วิเคราะห์</li>
          <li>ผลวิเคราะห์ถูกส่งกลับมาแสดงบนหน้าจอของคุณ</li>
        </ol>
        <p>
          การใช้งานของคุณจึงอยู่ภายใต้นโยบายของผู้ให้บริการทั้งสองรายนี้ด้วย ได้แก่{' '}
          <a className={policyLinkClassName} href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">นโยบายความเป็นส่วนตัวของ Cloudflare</a>{' '}
          และ{' '}
          <a className={policyLinkClassName} href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">นโยบายความเป็นส่วนตัวของ Google</a>
        </p>
        <p className="font-medium text-slate-900">
          เพราะเนื้อหาของคุณถูกส่งให้ผู้ให้บริการภายนอกประมวลผล โปรดอย่าใส่ข้อมูลลับ ข้อมูลส่วนบุคคลที่อ่อนไหว
          หรือข้อมูลที่คุณไม่มีสิทธิ์เผยแพร่ ลงในเอกสารที่ส่งตรวจ
        </p>
      </PolicySection>

      <PolicySection heading="5. อะไรถูกเก็บชั่วคราวบนเซิร์ฟเวอร์บ้าง">
        <p>
          ระบบนี้<strong>ไม่มีฐานข้อมูลโดยตั้งใจ</strong> จึงไม่มีที่ให้เก็บเอกสารของคุณไว้ถาวร
          สิ่งที่ถูกเก็บมีเพียงสามอย่างนี้ และทุกอย่างมีกำหนดลบอัตโนมัติ
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-900">
                <th className="py-2 pr-3 font-semibold">เก็บอะไร</th>
                <th className="py-2 pr-3 font-semibold">เพื่ออะไร</th>
                <th className="py-2 font-semibold">นานแค่ไหน</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-slate-200">
                <td className="py-3 pr-3">ตัวนับจำนวนครั้ง คู่กับค่าแฮชของ IP และของรหัสนิรนาม</td>
                <td className="py-3 pr-3">จำกัดการใช้งานที่ 10 ครั้งต่อชั่วโมง เพื่อกันการใช้งานเกินควรและค่าใช้จ่ายบานปลาย</td>
                <td className="py-3">1 ชั่วโมง</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-3 pr-3">ตัวนับงบประมาณรายวันของทั้งระบบ (ไม่ผูกกับผู้ใช้คนใด)</td>
                <td className="py-3 pr-3">หยุดให้บริการชั่วคราวเมื่อใช้งบของวันครบ</td>
                <td className="py-3">36 ชั่วโมง</td>
              </tr>
              <tr>
                <td className="py-3 pr-3">ผลวิเคราะห์ที่เพิ่งส่งกลับให้คุณ ซึ่งมีข้อความสั้น ๆ ที่ AI ยกมาจากเอกสารเป็นหลักฐานประกอบคะแนน</td>
                <td className="py-3 pr-3">ถ้าเน็ตหลุดหรือกดซ้ำ ระบบคืนผลเดิมได้โดยไม่ต้องเรียก AI ใหม่ (คุณไม่เสียโควตา ระบบไม่เสียค่าใช้จ่ายซ้ำ)</td>
                <td className="py-3">10 นาที แล้วลบอัตโนมัติ</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>ข้อความเอกสารต้นฉบับของคุณไม่ถูกบันทึกลงที่เก็บข้อมูลของเราเลย</strong>
          ทั้งการอ่านและการวิเคราะห์เกิดขึ้นระหว่างที่คำขอทำงานอยู่เท่านั้น
        </p>
      </PolicySection>

      <PolicySection heading="6. บันทึกการทำงาน (log)">
        <p>
          เมื่อเกิดข้อผิดพลาด ระบบบันทึกเฉพาะ<strong>รหัสข้อผิดพลาด สถานะ และเส้นทางที่เรียก</strong>
          ไม่บันทึกเนื้อหาเอกสาร ไม่บันทึกเกณฑ์ และไม่บันทึกรหัสนิรนามของคุณ
          นอกจากนี้ Cloudflare ในฐานะผู้ให้บริการโครงสร้างพื้นฐานมีบันทึกทางเทคนิคของตัวเองตามนโยบายของผู้ให้บริการ
        </p>
      </PolicySection>

      <PolicySection heading="7. คุกกี้และที่เก็บข้อมูลในเบราว์เซอร์">
        <p>
          <strong>เว็บนี้ไม่ตั้งคุกกี้แม้แต่ตัวเดียว</strong> แต่ใช้ที่เก็บข้อมูลของเบราว์เซอร์
          (localStorage และ sessionStorage) ซึ่งกฎหมายคุ้มครองข้อมูลส่วนบุคคลนับเป็นเทคโนโลยีคล้ายคุกกี้
          จึงเปิดเผยไว้ทั้งหมดตามนี้ ทุกรายการถูกเก็บอยู่ในเครื่องของคุณเอง ไม่ได้ถูกส่งไปเก็บที่เซิร์ฟเวอร์ของเรา
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-900">
                <th className="py-2 pr-3 font-semibold">ชื่อรายการ</th>
                <th className="py-2 pr-3 font-semibold">เก็บไว้ที่ไหน</th>
                <th className="py-2 pr-3 font-semibold">เก็บไปทำไม</th>
                <th className="py-2 font-semibold">อยู่นานแค่ไหน</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {ACTIVE_BROWSER_STORAGE_ENTRIES.map((entry) => (
                <tr key={entry.key} className="border-b border-slate-200 last:border-b-0">
                  <td className="py-3 pr-3"><code className="rounded bg-slate-100 px-1 py-0.5 text-xs break-all">{entry.key}</code></td>
                  <td className="py-3 pr-3">{entry.storageAreaLabel}</td>
                  <td className="py-3 pr-3">{entry.purpose}</td>
                  <td className="py-3">{entry.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-6 text-slate-500">
          เครื่องที่เคยใช้เว็บรุ่นก่อนเปลี่ยนชื่อแบรนด์อาจมีคีย์ชื่อเดิมหลงเหลืออยู่อีก{' '}
          {LEGACY_BROWSER_STORAGE_KEYS.length} รายการ ({LEGACY_BROWSER_STORAGE_KEYS.join(', ')})
          ซึ่งใช้เพื่อวัตถุประสงค์เดียวกัน ระบบอ่านต่อและลบให้เมื่อคุณกด “เริ่มใหม่”
        </p>
        <p className="font-medium text-slate-900">ลบด้วยตัวเองได้อย่างไร</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>ลบร่างงานที่กรอกไว้:</strong> กดปุ่ม “เริ่มใหม่” ในหน้าตรวจเอกสาร หรือปิดแท็บนั้น</li>
          <li><strong>ลบทุกอย่างรวมถึงรหัสนิรนาม:</strong> ล้างข้อมูลเว็บไซต์ของโดเมนนี้ในเบราว์เซอร์ (โดยทั่วไปอยู่ที่ ตั้งค่า → ความเป็นส่วนตัว → ข้อมูลเว็บไซต์และคุกกี้)</li>
          <li><strong>ไม่ให้เก็บอะไรเลยตั้งแต่แรก:</strong> เปิดเว็บในโหมดไม่ระบุตัวตน (incognito) ทุกอย่างจะหายเมื่อปิดหน้าต่าง</li>
        </ul>
        <p>
          ถ้าคุณลบรหัสนิรนามทิ้ง ระบบจะสร้างรหัสใหม่ให้ในการเข้าใช้ครั้งถัดไป และถ้าเบราว์เซอร์ของคุณบล็อกที่เก็บข้อมูลไว้ทั้งหมด
          เว็บก็ยังตรวจเอกสารได้ตามปกติ เพียงแต่จะไม่จำร่างงานให้เมื่อรีเฟรชหน้า
        </p>
      </PolicySection>

      <PolicySection heading="8. ไม่มีการติดตามและไม่มีการขายข้อมูล">
        <p>
          เว็บนี้ไม่มีเครื่องมือเก็บสถิติผู้เข้าชม (เช่น Google Analytics) ไม่มีโฆษณา ไม่มีพิกเซลติดตาม
          ไม่มีปุ่มโซเชียลฝังตัว และไม่มีฟอนต์หรือสคริปต์ที่โหลดจากเว็บอื่น
          ข้อมูลของคุณไม่ถูกขาย แลกเปลี่ยน หรือส่งต่อให้บุคคลที่สามเพื่อการตลาด
          ส่งให้เฉพาะผู้ให้บริการที่จำเป็นต่อการทำงานตามข้อ 4 เท่านั้น
        </p>
      </PolicySection>

      <PolicySection heading="9. ความปลอดภัย">
        <p>
          การรับส่งข้อมูลทั้งหมดเข้ารหัสด้วย HTTPS หน้าเว็บจำกัดให้โหลดสคริปต์ได้จากต้นทางของตัวเองเท่านั้น
          และกุญแจเรียกใช้ AI ถูกเก็บไว้ฝั่งเซิร์ฟเวอร์ ไม่เคยส่งมาที่เบราว์เซอร์
          อย่างไรก็ตาม ไม่มีระบบใดปลอดภัยร้อยเปอร์เซ็นต์ การตัดสินใจว่าจะส่งเนื้อหาใดเข้ามาจึงยังเป็นดุลพินิจของคุณ
        </p>
      </PolicySection>

      <PolicySection heading="10. สิทธิ์ของคุณ">
        <p>
          ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) คุณมีสิทธิ์เข้าถึง แก้ไข ลบ คัดค้าน
          และขอให้ระงับการใช้ข้อมูลส่วนบุคคลของคุณ ในทางปฏิบัติกับเว็บนี้หมายความว่า
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>เนื่องจากไม่มีบัญชีผู้ใช้และไม่มีฐานข้อมูล จึงไม่มีชุดข้อมูลส่วนบุคคลของคุณให้ค้นหาหรือส่งออก</li>
          <li>ข้อมูลที่เก็บบนเครื่องคุณ ลบได้เองทันทีตามวิธีในข้อ 7</li>
          <li>ข้อมูลชั่วคราวบนเซิร์ฟเวอร์ตามข้อ 5 หมดอายุและถูกลบอัตโนมัติภายในเวลาที่ระบุไว้</li>
          <li>หากมีข้อสงสัยหรือต้องการใช้สิทธิ์ ติดต่อตามช่องทางในข้อ 12</li>
        </ul>
      </PolicySection>

      <PolicySection heading="11. ผู้ใช้ที่เป็นเยาวชน">
        <p>
          เครื่องมือนี้ออกแบบมาสำหรับผู้ที่กำลังทำรายงานหรืองานวิจัย หากคุณเป็นผู้เยาว์
          ควรใช้งานภายใต้คำแนะนำของผู้ปกครองหรือครูอาจารย์ และไม่ควรส่งข้อมูลส่วนตัวของตนเองหรือของผู้อื่นเข้ามาในเอกสาร
        </p>
      </PolicySection>

      <PolicySection heading="12. ติดต่อและการเปลี่ยนแปลงนโยบาย">
        <p>
          คำถาม ข้อร้องเรียน หรือคำขอใช้สิทธิ์ ส่งมาที่{' '}
          <a className={policyLinkClassName} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
          หากส่งอีเมลไม่สำเร็จ แจ้งผ่าน{' '}
          <a className={policyLinkClassName} href={SUPPORT_ISSUES_URL} target="_blank" rel="noreferrer">หน้ารับแจ้งปัญหาบน GitHub</a>{' '}
          ได้เช่นกัน
        </p>
        <p>
          หากพฤติกรรมของระบบเปลี่ยน นโยบายฉบับนี้จะถูกแก้ให้ตรงตามความจริงพร้อมปรับวันที่ด้านบน
          ประวัติการแก้ไขทั้งหมดเปิดเผยอยู่ในซอร์สโค้ดสาธารณะของโครงการ
          เงื่อนไขการใช้บริการอยู่ที่{' '}
          <a className={policyLinkClassName} href={TERMS_PATH}>ข้อกำหนดการใช้งาน</a>
        </p>
      </PolicySection>
    </PolicyPage>
  )
}

export default PrivacyPolicy
