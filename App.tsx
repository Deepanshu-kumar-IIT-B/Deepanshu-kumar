
import React, { useState, useRef } from 'react';
import { Camera, Upload, ChevronLeft, Send, Play, FileText, Loader2, Sparkles } from 'lucide-react';
import { AppStep, SolutionResult, YouTubeVideo } from './types';
import { processDoubtImage, getStepByStepSolution, fetchMockVideos } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.DASHBOARD);
  const [image, setImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [results, setResults] = useState<SolutionResult | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'video'>('text');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImage(reader.result as string);
        // In a real mobile app, we'd trigger 'image_cropper' here.
        // For web demo, we skip to OCR processing.
        triggerOCR(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerOCR = async (base64: string) => {
    setLoading(true);
    setLoadingMessage("Reading your question...");
    try {
      const pureBase64 = base64.split(',')[1];
      const text = await processDoubtImage(pureBase64);
      setExtractedText(text);
      setStep(AppStep.OCR_EDIT);
    } catch (err) {
      alert("Failed to read image. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSolve = async () => {
    setLoading(true);
    setLoadingMessage("AI is solving your doubt...");
    try {
      const solution = await getStepByStepSolution(extractedText);
      const videos = await fetchMockVideos(solution.videoKeywords);
      
      setResults({
        extractedText,
        explanation: solution.explanation,
        videos
      });
      setStep(AppStep.RESULTS);
    } catch (err) {
      alert("Failed to solve the question. Check your internet.");
    } finally {
      setLoading(false);
    }
  };

  const renderLoading = () => (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
      <p className="text-lg font-medium text-slate-700">{loadingMessage}</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-white shadow-xl relative overflow-hidden">
      {loading && renderLoading()}

      {/* Header */}
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {step !== AppStep.DASHBOARD && (
            <button onClick={() => setStep(AppStep.DASHBOARD)} className="p-1 hover:bg-blue-500 rounded">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h1 className="text-xl font-bold tracking-tight">DoubtSolver AI</h1>
        </div>
        <Sparkles className="w-5 h-5 text-yellow-300" />
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-20">
        {step === AppStep.DASHBOARD && (
          <div className="space-y-8 py-10">
            <div className="text-center space-y-2">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-10 h-10 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Hello, Student!</h2>
              <p className="text-slate-500">Snap a photo of your homework doubt and get instant solutions.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-blue-200 rounded-3xl bg-blue-50 hover:bg-blue-100 transition-colors group"
              >
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                  <Camera className="w-8 h-8 text-white" />
                </div>
                <span className="font-semibold text-blue-700">Take a Photo</span>
                <span className="text-xs text-blue-500 mt-1">Use your camera to capture the question</span>
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm"
              >
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Upload className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-800">Upload from Gallery</p>
                  <p className="text-xs text-slate-500">Pick an existing image from files</p>
                </div>
              </button>
            </div>

            <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100">
              <h3 className="text-sm font-bold text-yellow-800 mb-1">💡 Quick Tip</h3>
              <p className="text-xs text-yellow-700 leading-relaxed">
                Make sure the lighting is good and the question is clear for the most accurate AI solution.
              </p>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload} 
            />
          </div>
        )}

        {step === AppStep.OCR_EDIT && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-800">Confirm Your Question</h2>
              <p className="text-sm text-slate-500">Edit the text below if the AI missed anything.</p>
            </div>
            
            <div className="rounded-xl overflow-hidden border border-slate-200 aspect-video mb-4">
               <img src={image!} alt="Original" className="w-full h-full object-contain bg-slate-100" />
            </div>

            <textarea 
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              className="w-full h-40 p-4 rounded-xl border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-slate-700 font-medium bg-slate-50 resize-none transition-all"
              placeholder="Question text goes here..."
            />

            <button 
              onClick={handleSolve}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Send className="w-5 h-5" />
              Get Step-by-Step Solution
            </button>
          </div>
        )}

        {step === AppStep.RESULTS && results && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab('text')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'text' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <FileText className="w-4 h-4" />
                Explanation
              </button>
              <button 
                onClick={() => setActiveTab('video')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'video' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Play className="w-4 h-4" />
                Video Lessons
              </button>
            </div>

            {activeTab === 'text' ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
                <div className="prose prose-slate prose-sm max-w-none">
                  {results.explanation.split('\n').map((line, i) => (
                    <p key={i} className="mb-2 text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {results.videos.map((video) => (
                  <a 
                    key={video.id} 
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-blue-300 transition-colors shadow-sm group"
                  >
                    <div className="relative aspect-video">
                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/0 transition-all">
                        <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-6 h-6 text-white fill-current" />
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-slate-800 line-clamp-2">{video.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">{video.channelTitle}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
            
            <button 
              onClick={() => setStep(AppStep.DASHBOARD)}
              className="w-full py-3 mt-4 text-slate-500 font-medium hover:text-blue-600 transition-colors"
            >
              Solve another doubt
            </button>
          </div>
        )}
      </main>

      {/* Footer Nav */}
      <nav className="bg-white border-t border-slate-100 p-4 sticky bottom-0 flex justify-around items-center">
        <button className="flex flex-col items-center text-blue-600">
          <div className="w-1 bg-blue-600 h-1 rounded-full absolute -top-4"></div>
          <Sparkles className="w-6 h-6" />
          <span className="text-[10px] font-bold mt-1">Solve</span>
        </button>
        <button className="flex flex-col items-center text-slate-400">
          <FileText className="w-6 h-6" />
          <span className="text-[10px] font-bold mt-1">History</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
