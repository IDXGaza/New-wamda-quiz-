import React from 'react';
import { Clock, BarChart2, TrendingUp } from 'lucide-react';
import { Track } from '../types';

interface StatsWidgetProps {
  tracks: Track[];
}

const StatsWidget: React.FC<StatsWidgetProps> = ({ tracks }) => {
  const totalTime = tracks.reduce((acc, t) => acc + (t.listenTime || 0), 0);
  const topTracks = [...tracks]
    .filter(t => (t.playCount || 0) > 0 || (t.listenTime || 0) > 0)
    .sort((a, b) => (b.listenTime || 0) - (a.listenTime || 0))
    .slice(0, 3);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}س ${m}د`;
    if (m > 0) return `${m}د ${s}ث`;
    return `${s}ث`;
  };

  if (tracks.length === 0) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 space-y-4 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
         <div className="flex items-center gap-2">
           <BarChart2 className="w-4 h-4 text-[#4da8ab]" />
           <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">إحصائيات الاستماع</span>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-950 p-3 rounded-2xl shadow-sm border border-slate-100/50 dark:border-slate-800/50">
          <div className="flex items-center gap-1.5 mb-1 opacity-60">
            <Clock className="w-3 h-3" />
            <span className="text-[9px] font-bold">إجمالي الوقت</span>
          </div>
          <p className="text-xs font-black text-[#4da8ab]">{formatTime(totalTime)}</p>
        </div>
        <div className="bg-white dark:bg-slate-950 p-3 rounded-2xl shadow-sm border border-slate-100/50 dark:border-slate-800/50">
          <div className="flex items-center gap-1.5 mb-1 opacity-60">
            <TrendingUp className="w-3 h-3" />
            <span className="text-[9px] font-bold">مرات التشغيل</span>
          </div>
          <p className="text-xs font-black text-[#4da8ab]">{tracks.reduce((acc, t) => acc + (t.playCount || 0), 0)}</p>
        </div>
      </div>

      {topTracks.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mr-1">الأكثر استماعاً</span>
          {topTracks.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 bg-white/40 dark:bg-slate-800/40 p-2 rounded-xl border border-white/20 dark:border-slate-700/20">
              <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 w-3">{i + 1}</span>
              <div className="relative shrink-0">
                <img src={t.coverUrl} className="w-6 h-6 rounded-md object-cover" alt="" />
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-[10px] font-bold truncate leading-none mb-0.5">{t.name}</p>
                <p className="text-[8px] opacity-50 truncate">{formatTime(t.listenTime || 0)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StatsWidget;
