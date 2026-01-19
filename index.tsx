
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Users, 
  Timer, 
  Skull, 
  Plus, 
  Zap, 
  ShieldAlert, 
  Trash2, 
  CheckCircle2,
  DollarSign,
  MessageSquareQuote,
  Edit2,
  Camera,
  BellRing,
  Volume2,
  VolumeX,
  Check,
  Gamepad2,
  Coins,
  Hourglass,
  Trophy,
  History,
  Sparkles,
  Sword,
  Share2,
  QrCode,
  Download,
  Info
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

interface GameRecord {
  id: string;
  gameName: string;
  date: string;
  winner: string;
  summary: string;
  penaltyCount: number;
}

// --- 辅助函数 ---
const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// --- 音效 ---
const playNotificationSound = (type: 'success' | 'alert' | 'victory') => {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // 某些浏览器需要恢复上下文
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'alert') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'victory') {
      osc.type = 'sine';
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
      });
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) {
    console.warn("音频播报失败，可能受限于浏览器策略:", e);
  }
};

const SquadGuardian = () => {
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('squad_members');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: '大腿一号', avatar: '🎮', totalPenalties: 0 },
      { id: '2', name: '人体描边大师', avatar: '⚡', totalPenalties: 0 }
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

  const [gameArchives, setGameArchives] = useState<GameRecord[]>(() => {
    const saved = localStorage.getItem('game_archives');
    return saved ? JSON.parse(saved) : [];
  });

  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);

  // 任务/结算状态
  const [resultWinner, setResultWinner] = useState('');
  const [resultSummary, setResultSummary] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState('🎮');
  const [newMissionGame, setNewMissionGame] = useState('英雄联盟');
  const [newMissionMinutes, setNewMissionMinutes] = useState(10);
  const [newPenaltyAmount, setNewPenaltyAmount] = useState(10);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState<{name: string, text: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化检查：检测 URL 是否包含分享数据
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const syncData = urlParams.get('sync');
    if (syncData) {
      try {
        const decodedData = JSON.parse(atob(syncData));
        if (window.confirm(`发现好友分享的战队：${decodedData.members.length}名成员。是否载入？（这将覆盖你当前的本地数据）`)) {
          setMembers(decodedData.members);
          setHistory(decodedData.history || []);
          setGameArchives(decodedData.archives || []);
          // 清除 URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.error("同步失败:", e);
      }
    }
  }, []);

  // 数据持久化
  useEffect(() => {
    localStorage.setItem('squad_members', JSON.stringify(members));
    localStorage.setItem('active_mission', JSON.stringify(activeMission));
    localStorage.setItem('penalty_history', JSON.stringify(history));
    localStorage.setItem('game_archives', JSON.stringify(gameArchives));
  }, [members, activeMission, history, gameArchives]);

  // 倒计时
  const [timeLeft, setTimeLeft] = useState<number>(0);
  useEffect(() => {
    if (!activeMission || activeMission.isCompleted || activeMission.gameState !== 'assembling') return;
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, activeMission.startTime - now);
      setTimeLeft(diff);
      if (diff === 0) handleMissionExpire();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeMission]);

  const handleMissionExpire = async () => {
    if (!activeMission) return;
    if (isSoundEnabled) playNotificationSound('alert');
    
    setLoadingAI(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const lateParticipants = activeMission.participants.filter(p => p.status === 'pending');
    
    const updatedHistory = [...history];
    const updatedMembers = [...members];
    
    for (const p of lateParticipants) {
      const member = members.find(m => m.id === p.memberId);
      if (!member) continue;
      let roast = `迟到就要受罚！`;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `针对玩家 "${member.name}" 玩 "${activeMission.gameName}" 迟到，并欠下 ${activeMission.penaltyAmount}元，写一段幽默毒舌的短吐槽。`,
        });
        roast = response.text || roast;
      } catch (e) {
        console.error("AI 吐槽生成失败:", e);
      }
      updatedHistory.unshift({
        id: Math.random().toString(36).substr(2, 9),
        memberName: member.name,
        gameName: activeMission.gameName,
        amount: activeMission.penaltyAmount,
        date: new Date().toLocaleString(),
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

  const handleShareSquad = () => {
    const syncPayload = btoa(JSON.stringify({
      members,
      history: history.slice(0, 5), 
      archives: gameArchives.slice(0, 5)
    }));
    const shareUrl = `${window.location.origin}${window.location.pathname}?sync=${syncPayload}`;
    
    if (navigator.share) {
      navigator.share({
        title: '加入我的开黑战队',
        text: '这是我的开黑战队名单，点击链接同步加入小狗逼准时宝！',
        url: shareUrl
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('同步链接已复制！发给好友打开即可同步战队。');
    }
  };

  const toggleMemberSelection = (id: string) => {
    setSelectedMemberIds(prev => prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]);
  };

  const startMission = () => {
    if (selectedMemberIds.length === 0) return alert("请先选择参与成员！");
    setActiveMission({
      id: Date.now().toString(),
      gameName: newMissionGame,
      penaltyAmount: newPenaltyAmount,
      startTime: Date.now() + newMissionMinutes * 60 * 1000,
      participants: selectedMemberIds.map(id => ({ memberId: id, status: 'pending' })),
      isCompleted: false,
      gameState: 'assembling'
    });
  };

  const checkIn = (memberId: string) => {
    if (!activeMission) return;
    const updated = { ...activeMission };
    const pIdx = updated.participants.findIndex(p => p.memberId === memberId);
    if (pIdx > -1) {
      updated.participants[pIdx].status = 'online';
      setActiveMission(updated);
      if (isSoundEnabled) playNotificationSound('success');
      if (updated.participants.every(p => p.status === 'online')) {
        setActiveMission({ ...updated, gameState: 'playing' });
      }
    }
  };

  const renderAvatar = (avatar: string, size: string = "w-10 h-10") => {
    if (avatar?.startsWith('data:image')) return <img src={avatar} className={`${size} rounded-full object-cover border border-slate-700 shadow-sm`} alt="avatar" />;
    return <div className={`${size} flex items-center justify-center bg-slate-800 rounded-full text-lg shadow-inner`}>{avatar || '🎮'}</div>;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 safe-top safe-bottom pb-24 font-sans selection:bg-cyan-500/30">
      
      {/* 顶部引导：下载 App */}
      {showInstallPrompt && (
        <div className="bg-cyan-600 p-2 text-center text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 animate-in slide-in-from-top-full duration-500">
          <Download size={12} /> 点击浏览器菜单“添加到主屏幕” 即可作为 App 使用
          <button onClick={() => setShowInstallPrompt(false)} className="ml-4 opacity-50 underline">不再提示</button>
        </div>
      )}

      {/* 手机端头部 */}
      <header className="p-6 flex justify-between items-center border-b border-slate-900 sticky top-0 bg-slate-950/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500 p-1.5 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Zap className="text-slate-950 fill-slate-950" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase leading-none">
              小狗逼<span className="text-cyan-400">准时宝</span>
            </h1>
            <p className="text-[8px] text-slate-500 font-bold tracking-[0.2em] uppercase mt-1">Gamer Guard PRO</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleShareSquad} className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-cyan-400 active:scale-90 transition-transform"><Share2 size={20} /></button>
          <button onClick={() => setIsSoundEnabled(!isSoundEnabled)} className={`p-2.5 bg-slate-900 border border-slate-800 rounded-xl active:scale-90 transition-transform ${isSoundEnabled ? 'text-cyan-400' : 'text-slate-600'}`}>
            {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto space-y-6">
        
        {/* 核心任务区 */}
        <section className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-[2.5rem] p-6 shadow-2xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[50px] -mr-16 -mt-16 rounded-full group-hover:bg-cyan-500/10 transition-colors"></div>
          
          {!activeMission ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-3 text-cyan-400 font-black italic uppercase text-xs tracking-widest">
                <Timer size={18} /> 配置集结任务
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">目标游戏</label>
                  <input type="text" value={newMissionGame} onChange={e => setNewMissionGame(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-sm font-black focus:border-cyan-500/50 outline-none transition-all shadow-inner" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-red-500/70 uppercase tracking-widest ml-1">鸽子税 (元)</label>
                  <input type="number" value={newPenaltyAmount} onChange={e => setNewPenaltyAmount(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-4 text-sm font-black text-red-400 focus:border-red-500/50 outline-none transition-all shadow-inner" />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">参与人员指定</label>
                <div className="flex flex-wrap gap-2.5">
                  {members.map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => toggleMemberSelection(m.id)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border text-xs font-black transition-all active:scale-95 ${selectedMemberIds.includes(m.id) ? 'bg-cyan-500/10 border-cyan-500 text-cyan-100 shadow-[0_5px_15px_rgba(6,182,212,0.1)]' : 'bg-slate-950/50 border-slate-800 text-slate-500'}`}
                    >
                      {renderAvatar(m.avatar, "w-6 h-6")} {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={startMission} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-slate-950 font-black py-5 rounded-[2rem] uppercase tracking-[0.2em] shadow-xl shadow-cyan-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <Zap size={20} className="fill-slate-950" /> 开启准时考验
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
               <div className="flex justify-between items-center bg-slate-950/80 p-6 rounded-[2rem] border border-slate-800/50 shadow-inner">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/10 text-cyan-500 rounded-full text-[8px] font-black uppercase mb-1.5 border border-cyan-500/20">
                      <Gamepad2 size={10} /> {activeMission.gameName}
                    </div>
                    <h3 className="text-2xl font-black italic uppercase leading-none">集结倒计时</h3>
                  </div>
                  <div className={`text-4xl font-mono font-black tabular-nums tracking-tighter ${timeLeft < 60000 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    {formatTime(timeLeft)}
                  </div>
               </div>
               <div className="space-y-3">
                 {activeMission.participants.map(p => {
                    const m = members.find(mem => mem.id === p.memberId);
                    return (
                      <div key={p.memberId} className={`flex items-center justify-between p-5 rounded-[1.8rem] border transition-all duration-300 ${p.status === 'online' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-950/50 border-slate-800'}`}>
                        <div className="flex items-center gap-4">
                          {renderAvatar(m?.avatar || '🎮', "w-11 h-11")}
                          <span className={`font-black text-lg ${p.status === 'online' ? 'text-emerald-400' : 'text-white'}`}>{m?.name}</span>
                        </div>
                        {p.status === 'pending' ? (
                          <button onClick={() => checkIn(p.memberId)} className="bg-slate-50 hover:bg-cyan-500 text-slate-950 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">我已上线</button>
                        ) : (
                          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/20">
                            <CheckCircle2 className="text-emerald-500" size={20} />
                          </div>
                        )}
                      </div>
                    )
                 })}
               </div>
               <button onClick={() => setActiveMission(null)} className="w-full text-slate-600 hover:text-red-500 text-[10px] font-black uppercase py-2 transition-colors tracking-widest">取消此次任务</button>
            </div>
          )}
        </section>

        {/* 财富黑榜 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-red-500 font-black italic uppercase text-xs tracking-widest px-2">
            <Skull size={16} /> 战队身价榜 (欠款)
          </div>
          <div className="grid grid-cols-1 gap-3">
            {members.sort((a,b) => b.totalPenalties - a.totalPenalties).map((m, idx) => (
              <div key={m.id} className="flex items-center justify-between p-5 bg-slate-900/50 rounded-[2rem] border border-slate-800 shadow-xl group transition-all hover:border-red-500/30">
                <div className="flex items-center gap-4">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-black ${idx === 0 && m.totalPenalties > 0 ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{idx + 1}</div>
                  {renderAvatar(m.avatar, "w-11 h-11")}
                  <span className="font-black text-lg group-hover:text-white transition-colors">{m.name}</span>
                </div>
                <div className="text-right">
                  <p className={`font-black text-xl tabular-nums ${m.totalPenalties > 0 ? 'text-red-500' : 'text-slate-600'}`}>¥{m.totalPenalties}</p>
                  <p className="text-[8px] text-slate-600 uppercase font-black tracking-tighter">累积鸽子税</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 历史记录 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-slate-500 font-black italic uppercase text-xs tracking-widest px-2">
            <History size={16} /> 近期处决档案
          </div>
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="py-12 text-center text-slate-800 font-black uppercase text-[10px] tracking-[0.5em]">档案库暂空</div>
            ) : (
              history.slice(0, 5).map(h => (
                <div key={h.id} className="p-5 bg-slate-900/30 rounded-[1.8rem] border border-slate-800/50 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <p className="font-black text-sm">{h.memberName} <span className="text-slate-600 font-normal italic">放了鸽子</span></p>
                    <span className="text-red-500 font-black text-xs">-¥{h.amount}</span>
                  </div>
                  {h.roast && <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic border-l-2 border-cyan-500/30 pl-3">"{h.roast}"</p>}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-2xl border-t border-slate-800 px-6 pt-4 pb-10 flex justify-between items-center z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveMission(null)} className="flex flex-col items-center gap-1.5 text-cyan-400 transition-transform active:scale-90">
          <Zap size={22} className="fill-cyan-400" />
          <span className="text-[8px] font-black uppercase tracking-widest">任务</span>
        </button>
        <button onClick={() => setIsAddingMember(true)} className="flex flex-col items-center gap-1.5 text-slate-500 transition-transform active:scale-90">
          <Users size={22} />
          <span className="text-[8px] font-black uppercase tracking-widest">成员</span>
        </button>
        
        <div className="relative -mt-12">
          <button onClick={handleShareSquad} className="bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 p-5 rounded-[2rem] shadow-[0_10px_25px_rgba(6,182,212,0.4)] active:scale-95 transition-transform">
            <Share2 size={24} />
          </button>
        </div>

        <button className="flex flex-col items-center gap-1.5 text-slate-500 transition-transform active:scale-90 opacity-40">
          <Trophy size={22} />
          <span className="text-[8px] font-black uppercase tracking-widest">成就</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-slate-500 transition-transform active:scale-90 opacity-40">
          <Info size={22} />
          <span className="text-[8px] font-black uppercase tracking-widest">设置</span>
        </button>
      </nav>

      {/* 弹窗组件 */}
      {isAddingMember && (
        <div className="fixed inset-0 bg-slate-950/95 z-[200] flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300 backdrop-blur-sm">
           <div className="bg-slate-900 border border-slate-800 w-full max-w-sm p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <h2 className="text-3xl font-black italic text-cyan-400 uppercase text-center tracking-tighter">招募新队员</h2>
              <div className="space-y-6">
                <div className="flex justify-center">
                   <button onClick={() => fileInputRef.current?.click()} className="relative w-28 h-28 bg-slate-950 rounded-full flex items-center justify-center text-4xl overflow-hidden border-2 border-slate-800 shadow-inner group">
                      {newMemberAvatar.startsWith('data') ? <img src={newMemberAvatar} className="w-full h-full object-cover" /> : newMemberAvatar}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera size={20} className="text-white" />
                      </div>
                   </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">队员代号</label>
                  <input type="text" placeholder="例: 终极鸽王" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 font-black text-center focus:border-cyan-500 transition-all outline-none" />
                </div>
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
                 <button onClick={() => setIsAddingMember(false)} className="flex-1 font-black text-slate-500 uppercase text-[10px] tracking-widest">取消</button>
                 <button onClick={() => {
                   if(!newMemberName) return;
                   setMembers([...members, { id: Date.now().toString(), name: newMemberName, avatar: newMemberAvatar, totalPenalties: 0 }]);
                   setIsAddingMember(false);
                   setNewMemberName('');
                   setNewMemberAvatar('🎮');
                 }} className="flex-[2] bg-cyan-500 text-slate-950 font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-xs">入队生效</button>
              </div>
           </div>
        </div>
      )}

      {/* AI 运行反馈 */}
      {loadingAI && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 backdrop-blur-2xl border-2 border-cyan-500/30 p-8 rounded-[3rem] z-[300] flex flex-col items-center gap-4 animate-in zoom-in duration-300 shadow-[0_0_100px_rgba(6,182,212,0.2)]">
           <div className="relative">
             <Sparkles className="text-cyan-400 animate-pulse" size={48} />
             <div className="absolute inset-0 bg-cyan-400 blur-2xl opacity-20"></div>
           </div>
           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 animate-bounce">AI 正在录入处决档案...</span>
        </div>
      )}

    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<SquadGuardian />);
