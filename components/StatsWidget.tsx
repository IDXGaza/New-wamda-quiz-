import React from 'react';
import { BarChart2, TrendingUp, Music, Sparkles } from 'lucide-react';
import { Track } from '../types';

interface StatsWidgetProps {
  tracks: Track[];
}

const StatsWidget: React.FC<StatsWidgetProps> = ({ tracks }) => {
  const totalTime = tracks.reduce((acc, t) => acc + (t.listenTime || 0), 0);
  const topTracks = [...tracks]
    .filter(t => (t.playCount || 0) > 0 || (t.listenTime || 0) > 0)
    .sort((a, b) => {
      const diff = (b.listenTime || 0) - (a.listenTime || 0);
      if (diff !== 0) return diff;
      return (b.playCount || 0) - (a.playCount || 0);
    })
    .slice(0, 3);

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return '0 دقيقة';
    const minutes = Math.round(seconds / 60);
    if (minutes === 0) {
      return 'أقل من دقيقة';
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) {
      return `${h} ساعة و ${m} دقيقة`;
    }
    return `${m} دقيقة`;
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl p-4 border border-slate-150 dark:border-slate-800/80 space-y-3 mb-3 animate-in fade-in slide-in-from-top-4 duration-300 text-right" dir="rtl">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
         <div className="flex items-center gap-1.5">
           <BarChart2 className="w-4 h-4 text-[#4da8ab]" />
           <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">إحصائيات الاستماع والنشاط</span>
         </div>
      </div>

      {/* إحصائيات الأناشيد */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 p-3 rounded-xl border border-[#4da8ab]/10 dark:border-[#4da8ab]/15 text-right">
          <div className="flex items-center gap-1 mb-1 text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[9px] font-black">وقت الاستماع</span>
          </div>
          <p className="text-xs font-black text-[#4da8ab] leading-tight truncate">{formatTime(totalTime)}</p>
        </div>
        
        <div className="bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 p-3 rounded-xl border border-[#4da8ab]/10 dark:border-[#4da8ab]/15 text-right">
          <div className="flex items-center gap-1 mb-1 text-slate-500 dark:text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-[9px] font-black">التشغيل الكلي</span>
          </div>
          <p className="text-xs font-black text-[#4da8ab] leading-tight truncate">{tracks.reduce((acc, t) => acc + (t.playCount || 0), 0)} مرة</p>
        </div>
      </div>

      {/* التوب 3 أناشيد استماعاً */}
      {topTracks.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
          <div className="flex items-center gap-1.5 mr-0.5 text-slate-500 dark:text-slate-400">
            <Music className="w-3.5 h-3.5 text-[#4da8ab]" />
            <span className="text-[10px] font-black">الأناشيد الأكثر استماعاً</span>
          </div>
          <div className="space-y-1.5">
            {topTracks.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all">
                <div className="flex items-center justify-center w-4 h-4 bg-[#4da8ab]/10 text-[#4da8ab] text-[9px] font-black rounded">
                  {i + 1}
                </div>
                <div className="w-7 h-7 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800 flex-shrink-0">
                  <img 
                    src={t.coverUrl || undefined} 
                    className="w-full h-full object-cover" 
                    alt="" 
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[10px] font-black text-slate-800 dark:text-slate-200 truncate leading-none mb-0.5">{t.name}</p>
                  <p className="text-[8px] text-slate-400 dark:text-slate-500 truncate leading-none">{t.artist || 'منشد غير معروف'}</p>
                </div>
                <div className="text-left flex-shrink-0 pl-1">
                  <p className="text-[9px] font-black text-[#4da8ab] leading-none">{formatTime(t.listenTime || 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsWidget;
