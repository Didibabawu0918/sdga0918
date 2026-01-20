
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Users, 
  Timer, 
  Skull, 
  Zap, 
  CheckCircle2,
  Volume2,
  VolumeX,
  Trophy,
  History,
  Sparkles,
  Share2,
  ArrowUpSquare,
  AlertTriangle,
  Rocket,
  Copy,
  ExternalLink,
  MousePointer2,
  Settings2,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

// --- 类型定义 ---
interface Member {
  id: string;
  name: string;
  avatar: string; 
  totalPenalties: number;
}

interface Mission {
  id: string;
  gameName: string;
  penaltyAmount: number;
  startTime: number; 
  participants: {
    memberId: string;
    status: 'pending' | 'online' | 'late';
  }[];
  isCompleted: boolean;
  gameState?: 'assembling' | 'playing' | 'recording';
}

interface PenaltyRecord {
  id: string;
  memberName: string;
  gameName: string;
  amount: number;
  date: string;
  roast?: string;
}

const LOCAL_ROASTS = [
  "这人可能是坐轮椅来的，大家体谅下。",
  "建议直接踢出群聊，省得浪费大家感情。",
  "他是去火星打比赛了吗？延迟这么高？",
  "又在厕所里掉进去了？",
  "你这准时率，比我的中奖率还低。"
];

const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const playNotificationSound = (type: 'success' | 'alert') => {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'alert') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, now);
      gain.gain.setValueAtTime(0.05, now);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {}
};

const SquadGuardian = () => {
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('squad_members');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: '大腿一号', avatar: '🎮', totalPenalties: 0 },
      { id: '2', name: '描边大师', avatar: '⚡', totalPenalties: 0 }
    ];
  });

  const [activeMission, setActiveMission] = useState<Mission | null>(() => {
    const saved = localStorage.getItem('active_mission');
    return saved ? JSON.parse(saved) : null;
  });

  const [history, setHistory] = useState<PenaltyRecord[]>(() => {
    const saved = localStorage.getItem('penalty_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState('🎮');
  const [newMissionGame, setNewMissionGame] = useState('英雄联盟');
  const [newPenaltyAmount, setNewPenaltyAmount] = useState(10);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const standalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
    const iframe = window.self !== window.top;
    setIsStandalone(standalone);
    setIsInIframe(iframe);
    
    // 初始化检测 API
    if (process.env.API_KEY) {
      setApiStatus('ok');
    } else {
      setApiStatus('error');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('squad_members', JSON.stringify(members));
    localStorage.setItem('active_mission', JSON.stringify(activeMission));
    localStorage.setItem('penalty_history', JSON.stringify(history));
  }, [members, activeMission, history]);

  useEffect(() => {
    if (!activeMission || activeMission.gameState !== 'assembling') return;
    const interval = setInterval(() => {
      const diff = Math.max(0, activeMission.startTime - Date.now());
      setTimeLeft(diff);
      if (diff === 0) handleMissionExpire();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeMission]);

  const handleMissionExpire = async () => {
    if (!activeMission) return;
    if (isSoundEnabled) playNotificationSound('alert');
    setLoadingAI(true);
    
    const lateParticipants = activeMission.participants.filter(p => p.status === 'pending');
    const updatedHistory = [...history];
    const updatedMembers = [...members];

    for (const p of lateParticipants) {
      const member = members.find(m => m.id === p.memberId);
      if (!member) continue;
      
      let roast = LOCAL_ROASTS[Math.floor(Math.random() * LOCAL_ROASTS.length)];
      
      // 只有在 API 状态 OK 的时候才调用
      if (apiStatus === 'ok') {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `针对玩家 "${member.name}" 迟到欠下 ${activeMission.penaltyAmount}元，写一段极度简短毒舌的吐槽。`,
          });
          roast = response.text || roast;
        } catch (e) {
          console.error("AI 吐槽生成失败，使用本地库", e);
          setApiStatus('error'); // 发现报错，标记状态
        }
      }

      updatedHistory.unshift({
        id: Math.random().toString(36).substr(2, 9),
        memberName: member.name,
        gameName: activeMission.gameName,
        amount: activeMission.penaltyAmount,
        date: new Date().toLocaleTimeString(),
        roast
      });
      const mIdx = updatedMembers.findIndex(m => m.id === member.id);
      if (mIdx !== -1) updatedMembers[mIdx].totalPenalties += activeMission.penaltyAmount;
    }

    setMembers(updatedMembers);
    setHistory(updatedHistory);
    setActiveMission({ ...activeMission, gameState: 'playing' });
    setLoadingAI(false);
  };

  const checkIn = (memberId: string) => {
    if (!activeMission) return;
    setActiveMission(prev => {
      if (!prev) return null;
      const updatedParticipants = prev.participants.map(p => 
        p.memberId === memberId ? { ...p, status: 'online' as const } : p
      );
      return { ...prev, participants: updatedParticipants };
    });
    if (isSoundEnabled) playNotificationSound('success');
  };

  const renderAvatar = (avatar: string, size: string = "w-10 h-10") => {
    if (avatar?.startsWith('data:image')) return <img src={avatar} className={`${size} rounded-full object-cover border border-slate-800`} alt="avatar" />;
    return <div className={`${size} flex items-center justify-center bg-slate-900 rounded-full border border-slate-800 text-lg shadow-inner`}>{avatar || '🎮'}</div>;
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-black text-slate-100 font-sans">
      
      {/* 沉浸式头部 */}
      <header className="px-6 pt-12 pb-4 shrink-0 flex justify-between items-end border-b border-white/5 bg-black/60 backdrop-blur-3xl z-50 safe-top">
        <div className="flex items-center gap-4">
          <div className="bg-cyan-500 w-10 h-10 rounded-xl flex items-center justify-center">
            <Zap className="text-black fill-black" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">准时宝</h1>
            <div className="flex items-center gap-2 mt-1">
               <p className="text-[9px] text-cyan-500 font-black tracking-widest uppercase opacity-80">Gamer Guardian</p>
               {apiStatus === 'ok' ? (
                 <span className="flex items-center gap-0.5 text-[8px] text-emerald-500 font-bold bg-emerald-500/10 px-1 rounded"><ShieldCheck size={8}/> AI 在线</span>
               ) : (
                 <span className="flex items-center gap-0.5 text-[8px] text-red-500 font-bold bg-red-500/10 px-1 rounded"><ShieldAlert size={8}/> 离线模式</span>
               )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsSoundEnabled(!isSoundEnabled)} className={`p-2.5 rounded-xl border border-white/5 bg-white/5 ${isSoundEnabled ? 'text-cyan-400' : 'text-slate-600'}`}>
            {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="flex-1 overflow-y-auto no-scrollbar px-4 pt-6 space-y-8">
        <div className="max-w-md mx-auto space-y-8 pb-32">
          
          {/* 任务集结区 */}
          <section className="bg-gradient-to-b from-slate-900/40 to-black border border-white/10 rounded-[2.5rem] p-6 relative overflow-hidden">
            {!activeMission ? (
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-[0.2em] mb-2">
                  <Timer size={14} /> 发起准时考验
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">游戏名称</label>
                    <input type="text" value={newMissionGame} onChange={e => setNewMissionGame(e.target.value)} className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-4 text-sm font-black focus:border-cyan-500/50 outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-red-500/70 uppercase ml-1">罚款 (元)</label>
                    <input type="number" value={newPenaltyAmount} onChange={e => setNewPenaltyAmount(Number(e.target.value))} className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-4 text-sm font-black text-red-400 focus:border-red-500/50 outline-none" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">选中参与者</label>
                  <div className="flex flex-wrap gap-2.5">
                    {members.map(m => (
                      <button key={m.id} onClick={() => setSelectedMemberIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border transition-all ${selectedMemberIds.includes(m.id) ? 'bg-cyan-500/10 border-cyan-500 text-cyan-100' : 'bg-white/5 border-white/5 text-slate-500'}`}>
                        {renderAvatar(m.avatar, "w-6 h-6")} <span className="text-[11px] font-black uppercase">{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => {
                  if (selectedMemberIds.length === 0) return alert("请先选几个冤大头");
                  setActiveMission({ id: Date.now().toString(), gameName: newMissionGame, penaltyAmount: newPenaltyAmount, startTime: Date.now() + 10 * 60 * 1000, participants: selectedMemberIds.map(id => ({ memberId: id, status: 'pending' })), isCompleted: false, gameState: 'assembling' });
                }} className="w-full bg-white text-black font-black py-5 rounded-[2rem] uppercase tracking-widest active:scale-95 transition-all shadow-xl">开启集结 (10分钟)</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center bg-white/5 p-6 rounded-[2rem] border border-white/5">
                  <div className="space-y-1">
                    <p className="text-cyan-500 font-black text-[9px] uppercase tracking-widest">{activeMission.gameName}</p>
                    <h3 className="text-2xl font-black italic uppercase">集结中</h3>
                  </div>
                  <div className={`text-4xl font-mono font-black tabular-nums ${timeLeft < 60000 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{formatTime(timeLeft)}</div>
                </div>
                <div className="space-y-3">
                  {activeMission.participants.map(p => {
                    const m = members.find(mem => mem.id === p.memberId);
                    return (
                      <div key={p.memberId} className={`flex items-center justify-between p-5 rounded-3xl border transition-all ${p.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/5'}`}>
                        <div className="flex items-center gap-4">{renderAvatar(m?.avatar || '', "w-11 h-11")}<span className="font-black text-lg">{m?.name}</span></div>
                        {p.status === 'pending' ? <button onClick={() => checkIn(p.memberId)} className="bg-white text-black px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg">我上线了</button> : <CheckCircle2 className="text-emerald-500" size={24} />}
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => setActiveMission(null)} className="w-full text-slate-600 text-[10px] font-black uppercase tracking-[0.2em] py-2">取消此局</button>
              </div>
            )}
          </section>

          {/* 榜单 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-red-500 font-black italic uppercase text-[10px] tracking-widest px-2"><Skull size={14} /> 鸽子身价榜 (欠款)</div>
            <div className="grid grid-cols-1 gap-3">
              {members.sort((a,b) => b.totalPenalties - a.totalPenalties).map((m, i) => (
                <div key={m.id} className="flex items-center justify-between p-5 bg-white/5 rounded-[2rem] border border-white/5">
                  <div className="flex items-center gap-4">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-black ${i === 0 && m.totalPenalties > 0 ? 'bg-red-500 text-white' : 'bg-white/10 text-slate-400'}`}>{i + 1}</span>
                    {renderAvatar(m.avatar, "w-11 h-11")}<span className="font-black text-lg">{m.name}</span>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-xl tabular-nums ${m.totalPenalties > 0 ? 'text-red-500' : 'text-slate-600'}`}>¥{m.totalPenalties}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 处决历史 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-500 font-black italic uppercase text-[10px] tracking-widest px-2"><History size={14} /> 处决历史</div>
            <div className="space-y-3">
              {history.length === 0 ? <div className="py-12 text-center text-white/10 font-black uppercase text-[10px] tracking-[0.4em]">没人迟到，真没意思</div> : history.slice(0, 8).map(h => (
                <div key={h.id} className="p-5 bg-white/5 rounded-3xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-start"><p className="font-black text-xs">{h.memberName} <span className="opacity-40">迟到</span></p><span className="text-red-500 font-black text-xs">-¥{h.amount}</span></div>
                  {h.roast && <p className="text-[11px] text-slate-400 font-medium italic border-l-2 border-cyan-500/40 pl-3">"{h.roast}"</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* 底部导航 */}
      <nav className="shrink-0 bg-black/80 backdrop-blur-2xl border-t border-white/5 px-8 pt-4 pb-12 flex justify-around items-center z-[100] safe-bottom">
        <button onClick={() => setIsAddingMember(true)} className="flex flex-col items-center gap-1.5 text-slate-400"><Users size={22} /><span className="text-[8px] font-black uppercase">战友</span></button>
        <div className="relative -mt-12">
          <button onClick={() => {
             const payload = btoa(JSON.stringify({ members, history: history.slice(0, 5) }));
             const url = `${window.location.origin}${window.location.pathname}?sync=${payload}`;
             navigator.clipboard.writeText(url);
             alert('数据同步链接已复制！');
          }} className="bg-white text-black p-5 rounded-full shadow-2xl active:scale-90 transition-transform"><Share2 size={24} /></button>
        </div>
        <button onClick={() => {
          if (apiStatus === 'error') {
            alert('当前 AI 接口不可用。原因可能是：\n1. Google Cloud 计费错误 [OR_BACR2_44]\n2. API Key 未设置\n\nApp 已自动切换至本地毒舌库，您可以继续使用！');
          } else {
            alert('AI 吐槽功能正常工作！');
          }
        }} className="flex flex-col items-center gap-1.5 text-slate-400"><Settings2 size={22} /><span className="text-[8px] font-black uppercase">状态</span></button>
      </nav>

      {/* 嵌套拦截引导层 (针对 Google AI Studio 预览) */}
      {isInIframe && (
        <div className="fixed inset-0 bg-black z-[2000] flex flex-col items-center justify-center p-8 text-center space-y-10 animate-in fade-in duration-500 overflow-hidden">
           <div className="absolute top-4 right-4 animate-bounce">
              <MousePointer2 className="text-cyan-400 rotate-180 mb-2 mx-auto" size={32} />
              <p className="text-[10px] font-black text-cyan-400 uppercase bg-black/80 px-2 py-1 rounded">点击右上角跳出</p>
           </div>
           <div className="space-y-4">
             <div className="flex justify-center mb-2">
                <div className="bg-amber-500/20 p-6 rounded-full border-2 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.3)]">
                  <AlertTriangle className="text-amber-500" size={56} />
                </div>
             </div>
             <h2 className="text-2xl font-black italic uppercase tracking-tighter">预览窗口受限</h2>
             <p className="text-slate-400 text-sm leading-relaxed px-4">核心功能（如全屏、AI 吐槽）需要点击右上角图标在新窗口打开才能完美运行。</p>
           </div>
           <button onClick={() => window.open(window.location.href, '_blank')} className="w-full bg-cyan-500 text-black font-black py-6 rounded-3xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(6,182,212,0.4)] active:scale-95 transition-all">
             <Rocket size={24} /> 🚀 尝试强制跳出
           </button>
        </div>
      )}

      {/* 添加战友弹窗 */}
      {isAddingMember && (
        <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-8 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
           <div className="bg-slate-900/50 border border-white/10 w-full max-w-sm p-10 rounded-[3rem] space-y-8">
              <h2 className="text-3xl font-black italic text-center tracking-tighter uppercase">添加战友</h2>
              <div className="space-y-6">
                <div className="flex justify-center">
                   <button onClick={() => fileInputRef.current?.click()} className="w-28 h-28 bg-black rounded-full flex items-center justify-center text-4xl overflow-hidden border border-white/10 shadow-inner">
                      {newMemberAvatar.startsWith('data') ? <img src={newMemberAvatar} className="w-full h-full object-cover" /> : newMemberAvatar}
                   </button>
                </div>
                <input type="text" placeholder="昵称..." value={newMemberName} onChange={e => setNewMemberName(e.target.value)} className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-5 font-black text-center text-lg focus:border-cyan-500 outline-none" />
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
                   const f = e.target.files?.[0];
                   if(f) {
                     const r = new FileReader();
                     r.onloadend = () => setNewMemberAvatar(r.result as string);
                     r.readAsDataURL(f);
                   }
                }} />
              </div>
              <div className="flex gap-4">
                 <button onClick={() => setIsAddingMember(false)} className="flex-1 font-black text-slate-500 uppercase text-xs">取消</button>
                 <button onClick={() => {
                   if(!newMemberName) return;
                   setMembers([...members, { id: Date.now().toString(), name: newMemberName, avatar: newMemberAvatar, totalPenalties: 0 }]);
                   setIsAddingMember(false);
                   setNewMemberName('');
                   setNewMemberAvatar('🎮');
                 }} className="flex-[2] bg-cyan-500 text-black font-black py-4 rounded-2xl shadow-lg uppercase tracking-widest text-xs">确认添加</button>
              </div>
           </div>
        </div>
      )}

      {loadingAI && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[700] flex flex-col items-center justify-center gap-6">
           <Sparkles className="text-cyan-400 animate-pulse" size={64} />
           <span className="text-[11px] font-black uppercase tracking-[0.5em] text-cyan-400 animate-pulse">正在进行毒舌审查...</span>
        </div>
      )}

    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<SquadGuardian />);
