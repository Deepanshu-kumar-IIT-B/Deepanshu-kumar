
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, ChevronLeft, Send, Play, FileText, Sparkles, CheckCircle2, Lightbulb, Info, Maximize2, Minimize2, ZoomIn, Search, Plus, BookOpen, Atom, FlaskConical, Calculator, Clock, Bookmark, BookmarkCheck, Trash2, Layout, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, ArrowRight, Sun, Moon, Volume2, Square, Loader2, User as UserIcon, LogOut, Facebook, Twitter, Chrome, Lock } from 'lucide-react';
import { AppStep, SolutionResult, SavedSolution, User } from './types';
import { processDoubtImage, getStepByStepSolution, fetchYouTubeVideos } from './services/geminiService';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Audio Helpers ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Image Preprocessing ---
async function preprocessImage(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64); return; }
      const maxDim = 2000;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = (h / w) * maxDim; w = maxDim; }
        else { w = (w / h) * maxDim; h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.filter = 'contrast(1.2) brightness(1.05) saturate(0.8)';
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.90));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

const LatexView: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const renderContent = (text: string) => {
    const mathParts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
    return mathParts.map((part, i) => {
      const katex = (window as any).katex;
      if (!katex) return <span key={i}>{part}</span>;
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const math = part.slice(2, -2);
        try {
          const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
          return <div key={i} className="katex-display-container my-4" dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) { return <pre key={i} className="text-red-500">{part}</pre>; }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const math = part.slice(1, -1);
        try {
          const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
          return <span key={i} className="inline-katex" dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) { return <span key={i} className="text-red-500">{part}</span>; }
      }
      const formatted = part.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/<u>(.*?)<\/u>/g, '<u>$1</u>');
      return <span key={i} style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };
  return <div className={className}>{renderContent(content)}</div>;
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState<AppStep>(AppStep.LANDING);
  const [image, setImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [results, setResults] = useState<SolutionResult | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'video'>('text');
  const [mathZoom, setMathZoom] = useState<number>(1);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isNarrating, setIsNarrating] = useState<boolean>(false);
  const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Sign Up / Login State
  const [signUpForm, setSignUpForm] = useState<User>({
    name: '', email: '', phone: '', classLevel: '12th Grade', exam: 'JEE Main', password: ''
  });
  const [loginCreds, setLoginCreds] = useState({ email: '', password: '' });

  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const initialDist = useRef<number | null>(null);
  const [history, setHistory] = useState<SavedSolution[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('doubt_solver_history');
    if (saved) { try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); } }
    
    // Check if session exists
    const sessionUser = localStorage.getItem('doubt_solver_session');
    if (sessionUser) { 
      setUser(JSON.parse(sessionUser)); 
      setStep(AppStep.DASHBOARD);
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(prefersDark);
  }, []);

  useEffect(() => {
    document.body.className = isDarkMode ? 'dark-theme bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // --- Auth Logic ---
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    // Get existing users
    const usersStr = localStorage.getItem('doubt_solver_registered_users') || '[]';
    const users: User[] = JSON.parse(usersStr);
    
    // Check if user already exists
    if (users.some(u => u.email === signUpForm.email)) {
      alert("Email already registered. Please Login.");
      return;
    }

    // Add new user
    const updatedUsers = [...users, signUpForm];
    localStorage.setItem('doubt_solver_registered_users', JSON.stringify(updatedUsers));
    
    // Auto-login
    setUser(signUpForm);
    localStorage.setItem('doubt_solver_session', JSON.stringify(signUpForm));
    setStep(AppStep.DASHBOARD);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const usersStr = localStorage.getItem('doubt_solver_registered_users') || '[]';
    const users: User[] = JSON.parse(usersStr);
    
    const matchedUser = users.find(u => u.email === loginCreds.email && u.password === loginCreds.password);
    
    if (matchedUser) {
      setUser(matchedUser);
      localStorage.setItem('doubt_solver_session', JSON.stringify(matchedUser));
      setStep(AppStep.DASHBOARD);
    } else {
      alert("Invalid email or password. Please check your credentials.");
    }
  };

  const handleSocialAuth = (provider: string) => {
    // Simulated Social Auth Flow
    const mockUser: User = {
      name: `User ${provider}`,
      email: `${provider.toLowerCase()}@social.com`,
      phone: '0000000000',
      classLevel: '12th Grade',
      exam: 'JEE Main'
    };
    
    // Simulate finding or creating the user
    const usersStr = localStorage.getItem('doubt_solver_registered_users') || '[]';
    const users: User[] = JSON.parse(usersStr);
    
    if (!users.some(u => u.email === mockUser.email)) {
      users.push(mockUser);
      localStorage.setItem('doubt_solver_registered_users', JSON.stringify(users));
    }

    setUser(mockUser);
    localStorage.setItem('doubt_solver_session', JSON.stringify(mockUser));
    setStep(AppStep.DASHBOARD);
  };

  const handleLogout = () => {
    localStorage.removeItem('doubt_solver_session');
    setUser(null);
    setStep(AppStep.LANDING);
    setShowProfileMenu(false);
  };

  // --- Solution Logic ---
  const handleSpeak = async () => {
    if (isNarrating) {
      audioSource?.stop();
      setIsNarrating(false);
      return;
    }
    if (!results) return;
    setIsNarrating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const narrationText = `Summary: ${results.explanation.summary}. The final answer is: ${results.explanation.finalAnswer}.`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: narrationText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio data received");
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.onended = () => setIsNarrating(false);
      source.start();
      setAudioSource(source);
    } catch (err) { setIsNarrating(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      setLoadingMessage("Gemini Pro analyzing image...");
      const reader = new FileReader();
      reader.onload = async () => {
        const enhancedBase64 = await preprocessImage(reader.result as string);
        setImage(enhancedBase64);
        triggerOCR(enhancedBase64);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerOCR = async (base64: string) => {
    setLoading(true);
    setLoadingMessage("Understanding question context...");
    try {
      const pureBase64 = base64.split(',')[1];
      const text = await processDoubtImage(pureBase64);
      setExtractedText(text);
      setStep(AppStep.OCR_EDIT);
    } catch (err) { alert("Failed to read image."); }
    finally { setLoading(false); }
  };

  const handleSolve = async () => {
    setLoading(true);
    setLoadingMessage("Thinking deeply about your doubt...");
    try {
      const data = await getStepByStepSolution(extractedText);
      setLoadingMessage("Fetching relevant lectures...");
      const videos = await fetchYouTubeVideos(data.youtubeKeywords);
      setResults({
        extractedText,
        explanation: { summary: data.summary, steps: data.steps, finalAnswer: data.finalAnswer, tips: data.tips },
        videos
      });
      setIsSaved(false);
      setStep(AppStep.RESULTS);
      setMathZoom(1);
    } catch (err) { alert("Deep reasoning failed."); }
    finally { setLoading(false); }
  };

  const handleManualTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (extractedText.trim()) {
      handleSolve();
    }
  };

  const applyFormat = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end);
    setExtractedText(text.substring(0, start) + prefix + selected + suffix + text.substring(end));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + prefix.length, end + prefix.length); }, 0);
  };

  const loadFromHistory = (item: SavedSolution) => {
    setResults(item);
    setExtractedText(item.extractedText);
    setIsSaved(true);
    setStep(AppStep.RESULTS);
    setMathZoom(1);
  };

  const saveToHistory = useCallback(() => {
    if (!results) return;
    const newEntry: SavedSolution = { ...results, id: Date.now().toString(), timestamp: Date.now() };
    const updated = [newEntry, ...history.filter(h => h.extractedText !== results.extractedText)].slice(0, 20);
    setHistory(updated);
    localStorage.setItem('doubt_solver_history', JSON.stringify(updated));
    setIsSaved(true);
  }, [results, history]);

  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    localStorage.setItem('doubt_solver_history', JSON.stringify(updated));
  };

  const renderLoading = () => (
    <div className="fixed inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-8">
        <div className="w-24 h-24 border-4 border-slate-100 dark:border-slate-800 border-t-blue-600 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />
        </div>
      </div>
      <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">AI Professor is Thinking</h3>
      <p className="text-slate-400 font-mono text-xs max-w-sm uppercase tracking-wider">{loadingMessage}</p>
    </div>
  );

  const SocialButtons = () => (
    <div className="grid grid-cols-3 gap-4">
      <button onClick={() => handleSocialAuth('Google')} className="flex items-center justify-center p-4 border rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border-slate-100 dark:border-slate-800 shadow-sm"><Chrome className="w-6 h-6 text-blue-600" /></button>
      <button onClick={() => handleSocialAuth('Twitter')} className="flex items-center justify-center p-4 border rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border-slate-100 dark:border-slate-800 shadow-sm"><Twitter className="w-6 h-6 text-sky-400" /></button>
      <button onClick={() => handleSocialAuth('Facebook')} className="flex items-center justify-center p-4 border rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border-slate-100 dark:border-slate-800 shadow-sm"><Facebook className="w-6 h-6 text-blue-800" /></button>
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col max-w-5xl mx-auto shadow-2xl relative overflow-hidden transition-all ${isDarkMode ? 'bg-slate-950' : 'bg-white sm:bg-slate-50'}`}>
      {loading && renderLoading()}

      {/* Auth Screen Logic */}
      {!user ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50/50 to-white dark:from-slate-900 dark:to-slate-950">
          <div className="max-w-md w-full space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-500/30">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h1 className={`text-4xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>DoubtSolver</h1>
              <p className="text-slate-500 font-medium">Your personal AI Tutor. Solve any doubt instantly.</p>
            </div>

            {step === AppStep.LANDING && (
              <div className="space-y-6">
                <button onClick={() => setStep(AppStep.SIGN_UP)} className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-blue-200 dark:shadow-blue-900/20 hover:bg-blue-700 transition-all">Get Started</button>
                <button onClick={() => setStep(AppStep.LOGIN)} className={`w-full py-6 rounded-[2rem] font-black text-xl border-2 transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50'}`}>Login</button>
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-slate-950 px-4 text-slate-400 font-black">Or join via</span></div>
                </div>
                <SocialButtons />
              </div>
            )}

            {step === AppStep.SIGN_UP && (
              <form onSubmit={handleSignUp} className="space-y-4 animate-in slide-in-from-right duration-500">
                <div className="grid grid-cols-1 gap-4">
                  <input type="text" placeholder="Full Name" required className={`w-full p-5 rounded-2xl border-2 outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-600' : 'bg-white border-slate-100 focus:border-blue-600'}`} onChange={e => setSignUpForm({...signUpForm, name: e.target.value})} />
                  <input type="email" placeholder="Email Address" required className={`w-full p-5 rounded-2xl border-2 outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-600' : 'bg-white border-slate-100 focus:border-blue-600'}`} onChange={e => setSignUpForm({...signUpForm, email: e.target.value})} />
                  <input type="tel" placeholder="Phone Number" required className={`w-full p-5 rounded-2xl border-2 outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-600' : 'bg-white border-slate-100 focus:border-blue-600'}`} onChange={e => setSignUpForm({...signUpForm, phone: e.target.value})} />
                  <div className="relative">
                    <input type="password" placeholder="Create Password" required className={`w-full p-5 pl-14 rounded-2xl border-2 outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-600' : 'bg-white border-slate-100 focus:border-blue-600'}`} onChange={e => setSignUpForm({...signUpForm, password: e.target.value})} />
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <select className={`p-5 rounded-2xl border-2 outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100'}`} onChange={e => setSignUpForm({...signUpForm, classLevel: e.target.value})}>
                      <option>10th Grade</option><option>11th Grade</option><option>12th Grade</option><option>Repeater</option>
                    </select>
                    <select className={`p-5 rounded-2xl border-2 outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100'}`} onChange={e => setSignUpForm({...signUpForm, exam: e.target.value})}>
                      <option>JEE Main</option><option>NEET</option><option>CUET</option><option>Board Exams</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-blue-700 transition-all">Create Account</button>
                <div className="flex flex-col gap-2 pt-2">
                   <div className="relative py-2"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800"></div></div><div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400"><span className="bg-white dark:bg-slate-950 px-3">Sign up with social</span></div></div>
                   <SocialButtons />
                </div>
                <button type="button" onClick={() => setStep(AppStep.LANDING)} className="w-full text-sm font-bold text-slate-400 hover:text-blue-600">Back</button>
              </form>
            )}

            {step === AppStep.LOGIN && (
              <form onSubmit={handleLogin} className="space-y-6 animate-in slide-in-from-left duration-500">
                <input type="email" placeholder="Email Address" required className={`w-full p-5 rounded-2xl border-2 outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-600' : 'bg-white border-slate-100 focus:border-blue-600'}`} onChange={e => setLoginCreds({...loginCreds, email: e.target.value})} />
                <div className="relative">
                  <input type="password" placeholder="Password" required className={`w-full p-5 pl-14 rounded-2xl border-2 outline-none ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-600' : 'bg-white border-slate-100 focus:border-blue-600'}`} onChange={e => setLoginCreds({...loginCreds, password: e.target.value})} />
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
                <button type="submit" className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-xl">Login</button>
                <div className="flex flex-col gap-2 pt-2">
                   <div className="relative py-2"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800"></div></div><div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400"><span className="bg-white dark:bg-slate-950 px-3">Quick Login</span></div></div>
                   <SocialButtons />
                </div>
                <button type="button" onClick={() => setStep(AppStep.LANDING)} className="w-full text-sm font-bold text-slate-400 hover:text-blue-600">Back to Landing</button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Persistent Top Taskbar */}
          <header className={`backdrop-blur-md border-b p-4 sm:p-6 sticky top-0 z-40 flex items-center justify-between transition-colors shadow-sm ${isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-100'}`}>
            <div className="flex items-center gap-4">
              {step !== AppStep.DASHBOARD && (
                <button onClick={() => { setStep(AppStep.DASHBOARD); setExtractedText(''); }} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/20">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className={`text-lg font-black leading-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>DoubtSolver</h1>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em]">GenAI Pro</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <button onClick={toggleTheme} className={`p-2.5 rounded-xl border transition-all hidden sm:flex ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              
              {/* User Interface Right Corner */}
              <div className="relative">
                <button onClick={() => setShowProfileMenu(!showProfileMenu)} className={`flex items-center gap-3 p-1 pr-3 border rounded-full transition-all hover:shadow-md ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm">
                    {user.name.charAt(0)}
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Student</p>
                    <p className="text-xs font-bold truncate max-w-[80px]">{user.name.split(' ')[0]}</p>
                  </div>
                </button>

                {showProfileMenu && (
                  <div className={`absolute right-0 mt-3 w-64 rounded-3xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                    <div className="p-6 border-b dark:border-slate-800 text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 mx-auto flex items-center justify-center"><UserIcon className="w-8 h-8" /></div>
                      <div>
                        <h4 className="font-black text-lg">{user.name}</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{user.classLevel} • {user.exam}</p>
                      </div>
                    </div>
                    <div className="p-2 space-y-1">
                      <button onClick={toggleTheme} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors sm:hidden">
                        {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-400" />}
                        <span className="text-sm font-bold">Switch Theme</span>
                      </button>
                      <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 rounded-2xl transition-colors">
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm font-black">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-8 relative">
            <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#000 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }}></div>

            {step === AppStep.DASHBOARD && (
              <div className="max-w-3xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <section className="space-y-8">
                  <div className="space-y-2">
                    <h2 className={`text-5xl font-black tracking-tight leading-[1.1] ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Hello, {user.name.split(' ')[0]}! <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Solve your doubts.</span>
                    </h2>
                    <p className={`font-medium text-lg ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ready to crush your {user.exam} goals?</p>
                  </div>
                  <form onSubmit={handleManualTextSubmit} className="relative group">
                    <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                      <Search className="w-6 h-6 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    </div>
                    <input type="text" value={extractedText} onChange={(e) => setExtractedText(e.target.value)} placeholder="Type a question or paste text..." className={`w-full py-6 pl-16 pr-20 border-2 rounded-[2.5rem] shadow-xl outline-none transition-all font-semibold ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-200 focus:border-blue-500 shadow-slate-950/40' : 'bg-white border-slate-100 text-slate-700 focus:border-blue-500 shadow-slate-200/40'}`} />
                    <button type="submit" disabled={!extractedText.trim()} className="absolute inset-y-2 right-2 px-6 bg-blue-600 text-white rounded-[2rem] font-black flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-0 disabled:scale-90 transition-all shadow-lg">
                      <ArrowRight className="w-5 h-5" />
                      <span className="hidden sm:inline">Go</span>
                    </button>
                  </form>
                </section>

                <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <button onClick={() => { setExtractedText(''); cameraInputRef.current?.click(); }} className="md:col-span-2 group relative overflow-hidden flex items-center gap-8 p-10 bg-gradient-to-br from-slate-900 to-slate-800 rounded-[3rem] transition-all hover:scale-[1.01] active:scale-[0.98] shadow-2xl shadow-slate-900/20">
                    <div className="bg-blue-600 p-6 rounded-3xl group-hover:rotate-6 transition-transform shadow-xl shadow-blue-600/30">
                      <Camera className="w-12 h-12 text-white" />
                    </div>
                    <div className="text-left">
                      <span className="block text-3xl font-black text-white">Snap & Solve</span>
                      <span className="block text-slate-400 text-sm font-bold mt-1 opacity-80 uppercase tracking-widest">Open Camera</span>
                    </div>
                  </button>
                  <button onClick={() => { setExtractedText(''); fileInputRef.current?.click(); }} className={`flex flex-col items-center justify-center p-8 border rounded-[3rem] transition-all group shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-blue-500' : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-xl'}`}>
                    <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-600 mb-4" />
                    <span className={`text-xs font-black uppercase tracking-widest group-hover:text-slate-700 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>From Gallery</span>
                  </button>
                </section>

                <section className="space-y-6">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-2">Subjects for {user.classLevel}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { name: 'Mathematics', icon: <Calculator />, color: 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 border-orange-100 dark:border-orange-900/30' },
                      { name: 'Physics', icon: <Atom />, color: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 border-blue-100 dark:border-blue-900/30' },
                      { name: 'Chemistry', icon: <FlaskConical />, color: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border-emerald-100 dark:border-emerald-900/30' },
                      { name: 'Biology', icon: <BookOpen />, color: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 border-rose-100 dark:border-rose-900/30' },
                    ].map((subject, idx) => (
                      <button key={idx} className={`flex flex-col items-start gap-4 p-6 border rounded-[2rem] hover:shadow-xl hover:scale-[1.03] transition-all group ${subject.color}`}>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm">{subject.icon}</div>
                        <span className="text-sm font-black tracking-tight">{subject.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Recent Solutions</h3>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-6 no-scrollbar">
                    {history.length > 0 ? history.map((item) => (
                      <div key={item.id} onClick={() => loadFromHistory(item)} className={`min-w-[280px] max-w-[280px] p-6 rounded-[2.5rem] border shadow-sm flex flex-col gap-4 group cursor-pointer transition-all hover:shadow-lg ${isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-blue-900' : 'bg-white border-slate-100 hover:border-blue-200'}`}>
                        <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center shrink-0">
                             <FileText className="w-6 h-6 text-blue-400" />
                          </div>
                          <button onClick={(e) => deleteFromHistory(item.id, e)} className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-1">
                          <p className={`text-sm font-black line-clamp-2 leading-tight ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{item.extractedText || "Saved Doubt"}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{new Date(item.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                    )) : (
                      <div className={`w-full flex flex-col items-center justify-center py-12 border border-dashed rounded-[3rem] ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <Clock className="w-10 h-10 text-slate-200 dark:text-slate-800 mb-4" />
                        <p className="text-slate-400 font-bold text-sm">No recent activity yet.</p>
                      </div>
                    )}
                  </div>
                </section>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
              </div>
            )}

            {step === AppStep.OCR_EDIT && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8">
                <h2 className={`text-4xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Review Doubt</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {image ? (
                    <div className="rounded-[2.5rem] overflow-hidden border-8 border-white dark:border-slate-800 shadow-2xl relative aspect-[3/4] md:sticky md:top-24">
                       <img src={image} alt="Original" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="rounded-[2.5rem] bg-blue-50 dark:bg-blue-900/10 border-4 border-dashed border-blue-100 dark:border-blue-900/30 aspect-[3/4] flex flex-col items-center justify-center p-8 text-center md:sticky md:top-24">
                      <FileText className="w-16 h-16 text-blue-200 mb-4" />
                      <p className="text-blue-400 font-bold text-sm uppercase tracking-widest">Manual Entry</p>
                    </div>
                  )}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-4">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Question Text</label>
                        <div className={`flex items-center gap-1 border rounded-lg p-1 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                          <button onClick={() => applyFormat('**', '**')} className="p-1.5 hover:bg-blue-600 hover:text-white rounded transition-colors"><BoldIcon className="w-4 h-4" /></button>
                          <button onClick={() => applyFormat('*', '*')} className="p-1.5 hover:bg-blue-600 hover:text-white rounded transition-colors"><ItalicIcon className="w-4 h-4" /></button>
                          <button onClick={() => applyFormat('<u>', '</u>')} className="p-1.5 hover:bg-blue-600 hover:text-white rounded transition-colors"><UnderlineIcon className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <textarea ref={textareaRef} value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className={`w-full h-64 p-8 rounded-[2.5rem] border-2 shadow-inner outline-none font-bold transition-all resize-none text-lg leading-relaxed ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-50 focus:border-blue-500 text-slate-800'}`} placeholder="Enter question..." />
                    </div>
                    <button onClick={handleSolve} className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black text-xl shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95">
                      <Sparkles className="w-6 h-6" /> Deep Reason & Solve
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === AppStep.RESULTS && results && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8">
                <div className={`max-w-md mx-auto p-1.5 rounded-[2rem] shadow-inner flex overflow-hidden ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                  <button onClick={() => setActiveTab('text')} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.7rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'text' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-md' : 'text-slate-400'}`}>
                    <FileText className="w-4 h-4" /> Explanation
                  </button>
                  <button onClick={() => setActiveTab('video')} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.7rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'video' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-md' : 'text-slate-400'}`}>
                    <Play className="w-4 h-4" /> Lessons
                  </button>
                </div>

                {activeTab === 'text' ? (
                  <div className="space-y-8 pb-12">
                    <div className="sticky top-24 z-30 flex flex-col items-center gap-4 -mb-8">
                       <div className={`backdrop-blur-md p-2 px-6 rounded-full flex items-center gap-6 shadow-xl border ring-1 ${isDarkMode ? 'bg-slate-900/90 border-slate-800 ring-slate-800' : 'bg-white/90 border-slate-100 ring-slate-200'}`}>
                          <div className="flex items-center gap-2">
                             <button onClick={() => setMathZoom(prev => Math.max(0.7, prev - 0.1))} className="p-2 text-slate-400 hover:text-blue-600"><Minimize2 className="w-5 h-5" /></button>
                             <span className={`font-black text-xs min-w-[3rem] text-center ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>{(mathZoom * 100).toFixed(0)}%</span>
                             <button onClick={() => setMathZoom(prev => Math.min(2.5, prev + 0.1))} className="p-2 text-slate-400 hover:text-blue-600"><Maximize2 className="w-5 h-5" /></button>
                          </div>
                          <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-800"></div>
                          <button onClick={handleSpeak} className={`flex items-center gap-3 p-2 px-4 rounded-full transition-all ${isNarrating ? 'bg-rose-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                             {isNarrating ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
                             <span className="text-[10px] font-black uppercase tracking-widest">{isNarrating ? 'Stop Narrator' : 'Listen to Solution'}</span>
                             {isNarrating && <div className="flex items-center wave-active"><div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div></div>}
                          </button>
                       </div>
                    </div>
                    <div className={`shadow-3xl rounded-[4rem] border overflow-hidden relative ruled-paper min-h-[800px] flex flex-col ${isDarkMode ? 'border-slate-800 shadow-slate-950/60' : 'border-slate-200'}`}>
                      <div className={`p-10 border-b flex items-center justify-between z-20 ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50/80 border-slate-200'}`}>
                        <div className="pl-6"><h3 className={`font-black text-2xl tracking-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Solution Narrative</h3><p className="text-xs text-blue-600 font-bold uppercase tracking-[0.2em] mt-1">Deep Reason Pro Active</p></div>
                      </div>
                      <div className="flex-1 overflow-auto p-4 relative z-20">
                        <div ref={zoomContainerRef} className="zoom-container p-8 md:p-16" style={{ transform: `scale(${mathZoom})`, width: `${100 / mathZoom}%` }}>
                          <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
                            <div className="flex-[1.8] space-y-16">
                              <div className="space-y-6">
                                <div className={`flex items-center gap-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}><div className={`w-10 h-10 rounded-2xl shadow-sm flex items-center justify-center border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}><Info className="w-5 h-5" /></div><h4 className="font-black text-sm uppercase tracking-[0.1em]">Strategy Overview</h4></div>
                                <LatexView content={results.explanation.summary} className={`text-xl leading-relaxed font-handwriting tracking-wide pl-6 border-l-4 ${isDarkMode ? 'text-slate-300 border-slate-700' : 'text-slate-800 border-slate-300'}`} />
                              </div>
                              <div className="space-y-16">
                                <h4 className="font-black text-sm uppercase tracking-[0.2em] text-slate-400 mb-8 border-b border-slate-200 dark:border-slate-800 pb-4">Step-by-Step Breakdown</h4>
                                {results.explanation.steps.map((step, idx) => (
                                  <div key={idx} className="relative group animate-in slide-in-from-left duration-700">
                                     <div className="flex items-start gap-8">
                                        <div className="w-12 h-12 rounded-3xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center font-black shrink-0 shadow-lg">{idx + 1}</div>
                                        <div className="space-y-4 pt-1"><h5 className={`font-black text-2xl group-hover:text-blue-500 transition-colors ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{step.title}</h5><LatexView content={step.content} className={`text-lg leading-loose math-display ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`} /></div>
                                     </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex-1 space-y-12">
                              <div className="sticky top-10 space-y-10">
                                <div className={`border-2 p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden group ${isDarkMode ? 'bg-slate-800/50 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-900'}`}>
                                   <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><CheckCircle2 className="w-32 h-32 rotate-12" /></div>
                                   <h4 className="text-blue-500 font-black text-xs uppercase tracking-widest mb-8 border-b border-slate-100 dark:border-slate-700 pb-4">Final Answer</h4>
                                   <LatexView content={results.explanation.finalAnswer} className="text-4xl font-black text-center math-display" />
                                </div>
                                <div className={`border p-10 rounded-[3rem] space-y-6 shadow-sm relative overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                  <div className="flex items-center gap-3 text-amber-500"><Lightbulb className="w-7 h-7" /><span className="font-black text-sm uppercase tracking-[0.1em]">Expert Insight</span></div>
                                  <div className="space-y-5">{results.explanation.tips.map((tip, i) => (<div key={i} className={`flex gap-4 font-handwriting text-lg leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}><span className="text-amber-500 mt-1 shrink-0">★</span><LatexView content={tip} /></div>))}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="max-w-lg mx-auto pt-8"><button onClick={() => { setExtractedText(''); setStep(AppStep.DASHBOARD); audioSource?.stop(); setIsNarrating(false); }} className="w-full py-7 bg-slate-900 dark:bg-blue-600 text-white rounded-[2.5rem] font-black text-lg shadow-2xl transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-4"><Plus className="w-6 h-6" /> Solve Another One</button></div>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto space-y-10 pb-12">
                    <div className="text-center py-10 space-y-3"><h3 className={`text-4xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Live Video Lessons</h3><p className="text-slate-500 font-medium text-lg">Real-time lectures curated from YouTube.</p></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {results.videos.map((video) => (
                        <a key={video.id} href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className={`flex flex-col rounded-[3rem] border overflow-hidden hover:border-blue-400 transition-all shadow-xl hover:shadow-2xl group active:scale-[0.98] ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                          <div className="relative aspect-video">
                            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform"><Play className="w-10 h-10 text-white fill-current" /></div></div>
                          </div>
                          <div className="p-10 space-y-5"><h3 className={`font-black leading-tight text-xl group-hover:text-blue-500 transition-colors line-clamp-2 ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>{video.title}</h3><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-400">YT</div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">{video.channelTitle}</p></div></div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
};

export default App;
