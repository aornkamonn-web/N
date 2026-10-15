import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // If already running as an installed standalone PWA, hide the install button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#0071E3] bg-[#0071E3]/10 hover:bg-[#0071E3]/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="ติดตั้งแอปลงบนหน้าจอมือถือหรือคอมพิวเตอร์"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isIOS ? 'ติดตั้งแอปบน iOS' : 'ติดตั้ง WebApp'}</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E5EA] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E5EA] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-[#1D1D1F]">
                  วิธีติดตั้งเป็น WebApp (PWA)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-[#1D1D1F]">
              {isIOS ? (
                <div className="space-y-3">
                  <p className="text-[#6E6E73] leading-relaxed">
                    สำหรับผู้ใช้งาน <strong>iPhone / iPad (Safari)</strong> สามารถเพิ่มแอปไว้บนหน้าจอโฮมเพื่อใช้งานแบบเต็มจอเหมือนแอปพลิเคชันทั่วไป:
                  </p>
                  <div className="p-3.5 rounded-xl bg-[#F5F5F7] space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <Share className="w-4 h-4 text-[#0071E3] shrink-0" />
                      <span>
                        1. แตะปุ่ม <strong>แชร์ (Share)</strong> ที่แถบเมนูด้านล่างของ Safari
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <PlusSquare className="w-4 h-4 text-[#0071E3] shrink-0" />
                      <span>
                        2. เลื่อนลงมาแล้วเลือก <strong>"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                      <span>
                        3. แตะ <strong>"เพิ่ม" (Add)</strong> ที่มุมขวาบนเพื่อเสร็จสิ้น
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[#6E6E73] leading-relaxed">
                    คุณสามารถติดตั้ง <strong>Cupertino Stock</strong> เป็นแอปพลิเคชันลงบนเครื่องคอมพิวเตอร์หรือสมาร์ทโฟน Android ได้ทันที:
                  </p>
                  <div className="p-3.5 rounded-xl bg-[#F5F5F7] space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <ExternalLink className="w-4 h-4 text-[#0071E3] shrink-0 mt-0.5" />
                      <span>
                        1. หากกำลังเปิดอยู่ในหน้าต่างตัวอย่าง (Preview) ให้คลิกเปิดลิงก์แอปในแท็บเบราว์เซอร์ใหม่ก่อน
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Download className="w-4 h-4 text-[#0071E3] shrink-0 mt-0.5" />
                      <span>
                        2. คลิกไอคอน <strong>ติดตั้งแอป (Install Cupertino Stock)</strong> บนแถบ URL ด้านขวาบนของ Chrome / Edge หรือเลือกเมนู <strong>"เพิ่มลงในหน้าจอหลัก"</strong> บนมือถือ
                      </span>
                    </div>
                  </div>
                  <div className="pt-1">
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#005BB5] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>เปิดแอปในแท็บใหม่เพื่อติดตั้ง</span>
                    </a>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full py-2.5 rounded-xl bg-[#F5F5F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1D1D1F] transition-colors cursor-pointer"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
