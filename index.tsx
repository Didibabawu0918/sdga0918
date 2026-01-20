
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
  Settings2,
  Plus,
  Edit2,
  BellRing,
  Trash2,
  ArrowRight,
  Clock
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
  durationMinutes: number;
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
  "你这准时率，比我的中奖率还低。",
  "下次开黑建议提前一天叫他起床。"
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
  const [isManagingMembers, setIsManagingMembers] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState('🎮');
  
  const [newMissionGame, setNewMissionGame] = useState('英雄联盟');
  const [newPenaltyAmount, setNewPenaltyAmount] = useState(10);
  const [newMissionDuration, setNewMissionDuration] = useState(10);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  
  const [loadingAI, setLoadingAI] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const syncData = urlParams.get('sync');
    if (syncData) {
      try {
        const decoded = JSON.parse(atob(syncData));
        if (decoded.members) setMembers(decoded.members);
        if (decoded.history) setHistory(decoded.history);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {}
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
      
      try {
        if (process.env.API_KEY) {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `针对玩家 "${member.name}" 在开黑集结中迟到，写一段极度简短、毒舌且幽默的吐槽。`,
          });
          roast = response.text || roast;
        }
      } catch (e) {
        console.warn("AI 吐槽调用失败，已切换至本地库。");
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

  const nudgeMember = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member || !activeMission) return;
    
    const messages = [
      `【准时保】@${member.name}，大伙在《${activeMission.gameName}》等你了！再不来扣你 ${activeMission.penaltyAmount} 块钱！`,
      `【准时保】快特么上线！@${member.name}，别磨蹭了！倒计时还在走呢！`,
      `【准时保】@${member.name}，你是打算用你的鸽子翅膀带飞全场吗？快上线！`,
      `【准时保】兄弟们已经饥渴难耐了，@${member.name} 快来！`
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];
    
    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        navigator.clipboard.writeText(text);
        alert('催促信息已复制到剪贴板，快发给 TA！');
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('催促信息已复制到剪贴板，快发给 TA！');
    }
  };

  const renderAvatar = (avatar: string, size: string = "w-10 h-10") => {
    if (avatar?.startsWith('data:image')) return <img src={avatar} className={`${size} rounded-full object-cover border border-white/10`} alt="avatar" />;
    return <div className={`${size} flex items-center justify-center bg-slate-900 rounded-full border border-white/10 text-lg shadow-inner`}>{avatar || '🎮'}</div>;
  };

  const startMission = () => {
    if (selectedMemberIds.length === 0) return alert("请先选几个冤大头");
    if (!newMissionGame) return alert("请输入游戏名称");
    
    const startTime = Date.now() + newMissionDuration * 60 * 1000;
    setActiveMission({ 
      id: Date.now().toString(), 
      gameName: newMissionGame, 
      penaltyAmount: newPenaltyAmount, 
      startTime, 
      durationMinutes: newMissionDuration,
      participants: selectedMemberIds.map(id => ({ memberId: id, status: 'pending' })), 
      isCompleted: false, 
      gameState: 'assembling' 
    });
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-black text-slate-100 font-sans">
      
      {/* 沉浸式头部 */}
      <header className="px-6 pt-12 pb-4 shrink-0 flex justify-between items-end border-b border-white/5 bg-black/60 backdrop-blur-3xl z-50 safe-top">
        <div className="flex items-center gap-4">
          <div className="bg-cyan-500 w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.3)]">
            <Zap className="text-black fill-black" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase leading-none">小狗逼准时保</h1>
            <p className="text-[9px] text-cyan-500 font-black tracking-widest uppercase mt-1 opacity-80">Anti-Gezhi Guardian</p>
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
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full"></div>
            
            {!activeMission ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-[0.2em] mb-2">
                  <Timer size={14} /> 集结指令
                </div>
                
                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-2 px-1">任务配置</label>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex items-center bg-black/40 rounded-2xl p-2 border border-white/5">
                        <div className="bg-cyan-500/10 p-2 rounded-xl text-cyan-500 mr-3"><Plus size={16}/></div>
                        <input type="text" placeholder="游戏名称" value={newMissionGame} onChange={e => setNewMissionGame(e.target.value)} className="bg-transparent border-none flex-1 text-sm font-black focus:outline-none placeholder:text-slate-700" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center bg-black/40 rounded-2xl p-2 border border-white/5">
                          <div className="bg-red-500/10 p-2 rounded-xl text-red-500 mr-3">¥</div>
                          <input type="number" placeholder="罚款金额" value={newPenaltyAmount} onChange={e => setNewPenaltyAmount(Number(e.target.value))} className="bg-transparent border-none flex-1 text-sm font-black focus:outline-none placeholder:text-slate-700" />
                        </div>
                        <div className="flex items-center bg-black/40 rounded-2xl p-2 border border-white/5">
                          <div className="bg-amber-500/10 p-2 rounded-xl text-amber-500 mr-3"><Clock size={16}/></div>
                          <input type="number" placeholder="时长(分)" value={newMissionDuration} onChange={e => setNewMissionDuration(Number(e.target.value))} className="bg-transparent border-none flex-1 text-sm font-black focus:outline-none placeholder:text-slate-700" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-3 px-1">选取队友</label>
                    <div className="flex flex-wrap gap-2.5">
                      {members.map(m => (
                        <button key={m.id} onClick={() => setSelectedMemberIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])} className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border transition-all ${selectedMemberIds.includes(m.id) ? 'bg-cyan-500/20 border-cyan-500 text-cyan-100' : 'bg-white/5 border-white/5 text-slate-500'}`}>
                          {renderAvatar(m.avatar, "w-6 h-6")} <span className="text-[11px] font-black uppercase">{m.name}</span>
                        </button>
                      ))}
                      {members.length === 0 && <p className="text-[10px] text-slate-600 font-bold p-2 italic">暂无战友，请先添加</p>}
                    </div>
                  </div>
                </div>

                <button onClick={startMission} className="w-full bg-cyan-500 text-black font-black py-5 rounded-[2rem] uppercase tracking-widest active:scale-95 transition-all shadow-[0_10px_30px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2">
                  开始倒计时 <ArrowRight size={20} />
                </button>
              </div>
            ) : (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center bg-white/5 p-6 rounded-[2rem] border border-white/5 shadow-inner">
                  <div className="space-y-1">
                    <p className="text-cyan-500 font-black text-[9px] uppercase tracking-widest">{activeMission.gameName} · ¥{activeMission.penaltyAmount}</p>
                    <h3 className="text-2xl font-black italic uppercase">集结中</h3>
                  </div>
                  <div className={`text-4xl font-mono font-black tabular-nums ${timeLeft < 60000 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{formatTime(timeLeft)}</div>
                </div>
                
                <div className="space-y-3">
                  {activeMission.participants.map(p => {
                    const m = members.find(mem => mem.id === p.memberId);
                    return (
                      <div key={p.memberId} className={`flex items-center justify-between p-4 rounded-3xl border transition-all ${p.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/20 opacity-60' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex items-center gap-4">{renderAvatar(m?.avatar || '', "w-11 h-11")}<span className="font-black text-lg">{m?.name}</span></div>
                        <div className="flex gap-2">
                          {p.status === 'pending' && (
                            <>
                              <button onClick={() => nudgeMember(p.memberId)} className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 active:scale-90 transition-transform">
                                <BellRing size={20} />
                              </button>
                              <button onClick={() => checkIn(p.memberId)} className="bg-white text-black px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg">我上线了</button>
                            </>
                          )}
                          {p.status === 'online' && <CheckCircle2 className="text-emerald-500" size={24} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="flex gap-3">
                  <button onClick={() => setActiveMission(null)} className="flex-1 bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] py-4 rounded-2xl border border-white/5">终止任务</button>
                </div>
              </div>
            )}
          </section>

          {/* 鸽子身价榜 */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2 text-red-500 font-black italic uppercase text-[10px] tracking-widest"><Skull size={14} /> 鸽子黑名单</div>
              <button onClick={() => setIsManagingMembers(true)} className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 hover:text-cyan-500 transition-colors">管理名单 <Edit2 size={10} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {members.sort((a,b) => b.totalPenalties - a.totalPenalties).map((m, i) => (
                <div key={m.id} className="group flex items-center justify-between p-5 bg-white/5 rounded-[2rem] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-black ${i === 0 && m.totalPenalties > 0 ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-white/10 text-slate-400'}`}>{i + 1}</span>
                    {renderAvatar(m.avatar, "w-11 h-11")}<span className="font-black text-lg">{m.name}</span>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-xl tabular-nums ${m.totalPenalties > 0 ? 'text-red-500' : 'text-slate-600'}`}>¥{m.totalPenalties}</p>
                    <p className="text-[8px] text-slate-700 font-black uppercase">历史欠款</p>
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <button onClick={() => setIsManagingMembers(true)} className="w-full py-10 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center gap-3 text-slate-700 hover:text-slate-500 transition-colors">
                  <Users size={32} />
                  <span className="text-[10px] font-black uppercase tracking-widest">还没有被处决的人</span>
                </button>
              )}
            </div>
          </section>

          {/* 处决记录 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-500 font-black italic uppercase text-[10px] tracking-widest px-2"><History size={14} /> 处决公示板</div>
            <div className="space-y-3">
              {history.length === 0 ? <div className="py-12 text-center text-white/5 font-black uppercase text-[10px] tracking-[0.4em]">暂无公开处刑</div> : history.slice(0, 10).map(h => (
                <div key={h.id} className="p-5 bg-white/5 rounded-[2rem] border border-white/5 space-y-3 animate-in fade-in duration-500">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-xs uppercase tracking-tight">{h.memberName}</p>
                      <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-lg font-black italic">DELAYED</span>
                    </div>
                    <span className="text-red-500 font-mono font-black text-sm">-¥{h.amount}</span>
                  </div>
                  {h.roast && <p className="text-[11px] text-slate-400 font-medium italic border-l-2 border-cyan-500/40 pl-3 leading-relaxed">"{h.roast}"</p>}
                  <div className="flex justify-between items-center text-[8px] text-slate-700 font-black uppercase">
                    <span>{h.gameName}</span>
                    <span>{h.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* 底部导航 */}
      <nav className="shrink-0 bg-black/80 backdrop-blur-3xl border-t border-white/5 px-8 pt-4 pb-12 flex justify-around items-center z-[100] safe-bottom">
        <button onClick={() => setIsManagingMembers(true)} className="flex flex-col items-center gap-1.5 text-slate-400 active:scale-90 transition-transform"><Users size={22} /><span className="text-[8px] font-black uppercase">名单管理</span></button>
        <div className="relative -mt-12">
          <button onClick={() => {
             const payload = btoa(JSON.stringify({ members, history: history.slice(0, 10) }));
             const url = `${window.location.origin}${window.location.pathname}?sync=${payload}`;
             navigator.clipboard.writeText(url);
             alert('同步链接已复制，发给战友同步状态！');
          }} className="bg-white text-black p-5 rounded-full shadow-[0_10px_30px_rgba(255,255,255,0.2)] active:scale-90 transition-transform"><Share2 size={24} /></button>
        </div>
        <button onClick={() => alert('数据已存至本地，只要不清除浏览器缓存数据就不会丢。')} className="flex flex-col items-center gap-1.5 text-slate-400 active:scale-90 transition-transform"><Settings2 size={22} /><span className="text-[8px] font-black uppercase">系统设置</span></button>
      </nav>

      {/* 管理名单弹窗 */}
      {isManagingMembers && (
        <div className="fixed inset-0 bg-black/95 z-[600] flex flex-col p-6 pt-16 backdrop-blur-2xl animate-in fade-in duration-300">
           <div className="flex justify-between items-center mb-8 px-2">
             <h2 className="text-2xl font-black italic uppercase">名单管理</h2>
             <button onClick={() => setIsManagingMembers(false)} className="text-slate-500 font-black text-xs uppercase">关闭</button>
           </div>

           <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-32">
              {/* 新增/编辑区域 */}
              <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 space-y-6">
                <div className="flex justify-center relative">
                   <button onClick={() => fileInputRef.current?.click()} className="w-24 h-24 bg-black rounded-full flex items-center justify-center text-3xl overflow-hidden border border-white/10 shadow-2xl relative group">
                      {newMemberAvatar.startsWith('data') ? <img src={newMemberAvatar} className="w-full h-full object-cover" /> : newMemberAvatar}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-black uppercase transition-opacity">上传</div>
                   </button>
                   <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
                      const f = e.target.files?.[0];
                      if(f) {
                        const r = new FileReader();
                        r.onloadend = () => setNewMemberAvatar(r.result as string);
                        r.readAsDataURL(f);
                      }
                   }} />
                </div>
                <div className="space-y-4">
                  <input type="text" placeholder="队员昵称" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 font-black text-center text-lg focus:border-cyan-500 outline-none placeholder:text-slate-700" />
                  <div className="flex gap-3">
                    {editingMember && <button onClick={() => { setEditingMember(null); setNewMemberName(''); setNewMemberAvatar('🎮'); }} className="flex-1 bg-white/5 text-slate-500 font-black py-4 rounded-2xl uppercase text-xs">取消</button>}
                    <button onClick={() => {
                      if(!newMemberName) return;
                      if (editingMember) {
                        setMembers(members.map(m => m.id === editingMember.id ? { ...m, name: newMemberName, avatar: newMemberAvatar } : m));
                        setEditingMember(null);
                      } else {
                        setMembers([...members, { id: Date.now().toString(), name: newMemberName, avatar: newMemberAvatar, totalPenalties: 0 }]);
                      }
                      setNewMemberName('');
                      setNewMemberAvatar('🎮');
                    }} className="flex-[2] bg-cyan-500 text-black font-black py-4 rounded-2xl shadow-lg uppercase tracking-widest text-xs">
                      {editingMember ? '保存修改' : '加入名单'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 现有成员列表 */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-2">当前名单 ({members.length})</p>
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-4 bg-white/5 rounded-3xl border border-white/5">
                    <div className="flex items-center gap-4">
                      {renderAvatar(m.avatar, "w-10 h-10")}
                      <span className="font-black text-sm">{m.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingMember(m); setNewMemberName(m.name); setNewMemberAvatar(m.avatar); }} className="p-2.5 rounded-xl bg-white/5 text-slate-500 active:text-cyan-400 transition-colors"><Edit2 size={16}/></button>
                      <button onClick={() => { if(confirm(`确定删除 ${m.name} 吗？`)) setMembers(members.filter(mem => mem.id !== m.id)); }} className="p-2.5 rounded-xl bg-white/5 text-slate-500 active:text-red-400 transition-colors"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}

      {/* AI 吐槽处理遮挡 */}
      {loadingAI && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[700] flex flex-col items-center justify-center gap-6">
           <div className="relative">
             <div className="absolute inset-0 bg-cyan-500/20 blur-2xl rounded-full scale-150 animate-pulse"></div>
             <Sparkles className="text-cyan-400 relative animate-bounce" size={64} />
           </div>
           <span className="text-[11px] font-black uppercase tracking-[0.5em] text-cyan-400 animate-pulse">AI 正在审判中...</span>
        </div>
      )}

    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<SquadGuardian />);
