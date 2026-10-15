import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ConfirmDialogState } from '../types';

interface ConfirmModalProps {
  dialog: ConfirmDialogState;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ dialog, onClose }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!dialog.isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await dialog.onConfirm();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Google Sheets');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDanger = dialog.variant === 'danger';
  const isSuccess = dialog.variant === 'success';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white rounded-2xl border border-[#E5E5EA] shadow-xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDanger
                    ? 'bg-[#DC2626]/10 text-[#DC2626]'
                    : isSuccess
                    ? 'bg-[#16A34A]/10 text-[#16A34A]'
                    : 'bg-[#0071E3]/10 text-[#0071E3]'
                }`}
              >
                {isDanger ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : isSuccess ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Info className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#1D1D1F]">
                  {dialog.title}
                </h3>
                <p className="text-xs text-[#6E6E73] mt-0.5">
                  ยืนยันการอัปเดตข้อมูลไปยัง Google Sheets
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-4 text-sm text-[#1D1D1F] leading-relaxed">
            {dialog.description}
          </p>

          {dialog.details && dialog.details.length > 0 && (
            <div className="mt-3 p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E5E5EA] space-y-1.5">
              {dialog.details.map((line, idx) => (
                <div key={idx} className="text-xs text-[#1D1D1F] font-mono-tabular">
                  {line}
                </div>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="mt-3 p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-xs text-[#DC2626]">
              {errorMsg}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isDanger
                  ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                  : isSuccess
                  ? 'bg-[#16A34A] hover:bg-[#15803D]'
                  : 'bg-[#0071E3] hover:bg-[#005BB5]'
              } disabled:opacity-50`}
            >
              {isSubmitting ? 'กำลังบันทึกข้อมูล...' : dialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
