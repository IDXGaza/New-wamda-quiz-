import React, { useState } from 'react';
import { Track } from '../types';

interface ShareTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
}

export const ShareTrackModal: React.FC<ShareTrackModalProps> = ({
  isOpen,
  onClose,
  track
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!isOpen || !track) return null;

  // Calculate file details
  const sizeMB = track.fileBlob ? (track.fileBlob.size / (1024 * 1024)).toFixed(1) : '0.0';
  const fileType = track.fileBlob?.type || 'audio/mpeg';
  const isWav = track.name?.toLowerCase().endsWith('.wav') || fileType.includes('wav');
  const formatName = isWav ? 'WAV (غير مضغوط)' : (fileType.includes('mp4') || fileType.includes('m4a') ? 'M4A' : 'MP3');

  // Generate File object for sharing or downloading
  const getShareFile = (): File | null => {
    if (!track.fileBlob) return null;
    try {
      let fileName = 'audio.mp3';
      if (track.fileBlob instanceof File && track.fileBlob.name) {
        fileName = track.fileBlob.name;
      } else {
        const mimeType = track.fileBlob.type || 'audio/mpeg';
        const extension = mimeType.includes('mpeg') ? 'mp3' : (mimeType.split('/')[1]?.split(';')[0] || 'mp3');
        fileName = `${track.name.replace(/[\\/:*?"<>|]/g, '_')}.${extension}`;
      }
      return new File([track.fileBlob], fileName, { 
        type: track.fileBlob.type || 'audio/mpeg',
        lastModified: Date.now()
      });
    } catch (e) {
      console.warn("Could not create File for sharing:", e);
      return null;
    }
  };

  // Option 1: Native File Share (mp3 file)
  const handleNativeFileShare = async () => {
    const file = getShareFile();
    if (!file) {
      setStatusMessage('❌ نعتذر، الملف الصوتي غير متوفر في الذاكرة حالياً.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage('⏳ جاري تحضير الملف الصوتي للمشاركة...');

    try {
      const shareTitle = track.name;
      const shareText = `أنشودة: ${track.name}${track.artist ? ` - ${track.artist}` : ''}`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: shareTitle,
          text: shareText,
        });
        setStatusMessage('✅ تم فتح قائمة المشاركة بنجاح!');
      } else if (navigator.share) {
        // Fallback to sharing as link/text if file share is not supported
        const shareUrl = (track.audioUrl && !track.audioUrl.startsWith('blob:')) ? track.audioUrl : window.location.origin;
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        setStatusMessage('ℹ️ مشاركة الملف كملف مباشر غير مدعومة في متصفحك، تم إرسال معلومات الأنشودة كرابط.');
      } else {
        // Fallback to download
        handleDownload();
        setStatusMessage('ℹ️ متصفحك لا يدعم مشاركة الملفات، تم تنزيل الملف مباشرة بدلاً من ذلك.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatusMessage(null);
      } else {
        console.error('File share failed:', err);
        setStatusMessage(`❌ حدث خطأ أثناء المشاركة: ${err.message || 'غير معروف'}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Option 2: Quick WhatsApp Text Share
  const handleWhatsAppShare = () => {
    const shareUrl = (track.audioUrl && !track.audioUrl.startsWith('blob:')) ? track.audioUrl : window.location.origin;
    const text = `🌸 *استمع إلى أنشودة:* ${track.name}\n🎙️ *المنشد:* ${track.artist || 'غير معروف'}\n✨ عبر تطبيق ترانيم المتميز:\n🔗 ${shareUrl}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Option 3: Quick Telegram Text Share
  const handleTelegramShare = () => {
    const shareUrl = (track.audioUrl && !track.audioUrl.startsWith('blob:')) ? track.audioUrl : window.location.origin;
    const text = `🌸 استمع إلى أنشودة: ${track.name}\n🎙️ المنشد: ${track.artist || 'غير معروف'}\n✨ عبر تطبيق ترانيم المتميز:\n🔗 ${shareUrl}`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Option 4: Direct Download File
  const handleDownload = () => {
    if (!track.fileBlob) {
      setStatusMessage('❌ نعتذر، الملف غير متوفر للتنزيل.');
      return;
    }
    try {
      const file = getShareFile();
      if (!file) return;
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage('🎉 تم بدء تنزيل الملف الصوتي بنجاح!');
    } catch (err: any) {
      console.error('Download failed:', err);
      setStatusMessage('❌ فشل تنزيل الملف الصوتي.');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md font-sans">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-2xl overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#4da8ab]/10 dark:bg-[#4da8ab]/20 rounded-xl text-[#4da8ab]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.482 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">خيارات مشاركة المقطع</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5">
          {/* Track Info Card */}
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800 flex-shrink-0">
              <img 
                src={track.coverUrl} 
                alt="" 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-black text-[#4da8ab] truncate">المقطع المحدد:</h4>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate mt-0.5">{track.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black bg-slate-200/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md">
                  {formatName}
                </span>
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">
                  {sizeMB} ميجابايت
                </span>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className={`p-3 text-xs text-center font-bold rounded-2xl border transition-all duration-300 ${
              statusMessage.includes('✅') || statusMessage.includes('🎉')
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : statusMessage.includes('⏳')
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
              : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            }`}>
              {statusMessage}
            </div>
          )}

          {/* Options List */}
          <div className="space-y-3">
            {/* Native share mp3 file option */}
            <button
              onClick={handleNativeFileShare}
              disabled={isProcessing}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-l from-slate-50 to-white dark:from-slate-950/20 dark:to-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl transition-all hover:border-[#4da8ab] hover:shadow-md cursor-pointer text-right group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-[#4da8ab]/10 rounded-xl text-[#4da8ab] group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.482 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span>مشاركة كملف صوتي (MP3 / الأصلي)</span>
                    <span className="bg-emerald-500/10 text-emerald-500 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-emerald-500/15">موصى به هاتفياً</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 leading-normal">
                    إرسال الملف الصوتي الفعلي مباشرة إلى الواتساب، تيليجرام، وباقي التطبيقات.
                  </p>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Quick WhatsApp option */}
            <button
              onClick={handleWhatsAppShare}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-l from-emerald-50/20 to-white dark:from-emerald-950/5 dark:to-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl transition-all hover:border-emerald-500 hover:shadow-md cursor-pointer text-right group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.454 5.709 1.455h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100">مشاركة سريعة عبر واتساب</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 leading-normal">
                    إرسال اسم الأنشودة وتفاصيلها ورابطها كرسالة سريعة ومباشرة.
                  </p>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Quick Telegram option */}
            <button
              onClick={handleTelegramShare}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-l from-sky-50/20 to-white dark:from-sky-950/5 dark:to-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl transition-all hover:border-sky-500 hover:shadow-md cursor-pointer text-right group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-sky-500/10 text-sky-500 rounded-xl group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-1-.64-.35-1 .22-1.58.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.27-2.03-.49-.82-.27-1.47-.41-1.42-.87.03-.24.36-.49 1-.74 3.9-1.69 6.51-2.8 7.83-3.33 3.73-1.49 4.5-1.75 5.01-1.76.11 0 .36.03.52.16.14.11.18.26.2.46-.01.12 0 .25-.02.39z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100">مشاركة سريعة عبر تيليجرام</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 leading-normal">
                    إرسال تفاصيل المقطع الصوتي كمنشور في تيليجرام.
                  </p>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Direct Download option */}
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-l from-slate-50 to-white dark:from-slate-950/20 dark:to-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl transition-all hover:border-[#4da8ab] hover:shadow-md cursor-pointer text-right group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100">تنزيل وحفظ الملف الصوتي</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 leading-normal">
                    تحميل ملف الـ {formatName} مباشرة إلى ذاكرة جهازك.
                  </p>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Desktop/System Helper Alert */}
          <div className="p-3.5 bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 rounded-2xl border border-[#4da8ab]/10 text-[10px] text-[#4da8ab] font-bold leading-relaxed">
            💡 *نصيحة ذكية:* إذا كنت تستخدم جهاز كمبيوتر أو لم تنجح المشاركة المباشرة، فخيار **"تنزيل وحفظ الملف الصوتي"** هو الأفضل، حيث يمكنك بعدها سحب الملف الصوتي وتنزيله مباشرة داخل محادثة واتساب أو تيليجرام ليرسل كصوت!
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareTrackModal;
