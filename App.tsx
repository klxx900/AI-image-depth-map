
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { UploadIcon, DownloadIcon, SparklesIcon, CloseIcon, ResetIcon, PencilIcon, CubeIcon } from './components/Icons.tsx';
import ImageComparer from './components/ImageComparer.tsx';

const fileToBase64 = (file: File): Promise<{mimeType: string, data: string}> => 
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const data = result.split(',')[1];
      resolve({ mimeType: file.type, data });
    };
    reader.onerror = error => reject(error);
  });

const ImagePlaceholder: React.FC<{ onFileSelect: (file: File) => void }> = ({ onFileSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLLabelElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.add('border-sky-400', 'bg-slate-700/50');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.remove('border-sky-400', 'bg-slate-700/50');
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.remove('border-sky-400', 'bg-slate-700/50');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full p-4">
      <label
        ref={dropzoneRef}
        htmlFor="dropzone-file"
        className="flex flex-col items-center justify-center w-full h-full border-2 border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon className="w-10 h-10 mb-4 text-slate-400" />
          <p className="mb-2 text-base text-slate-300"><span className="font-semibold text-sky-400">点击上传</span> 或拖拽文件</p>
          <p className="text-xs text-slate-500">支持 PNG, JPG, GIF, WEBP 等格式</p>
        </div>
        <input ref={fileInputRef} id="dropzone-file" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
      </label>
    </div>
  );
};

const App: React.FC = () => {
  const [mode, setMode] = useState<'edit' | 'depth'>('edit');
  const [prompt, setPrompt] = useState('');
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [rawGeneratedImageUrl, setRawGeneratedImageUrl] = useState<string | null>(null);
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Depth-mode specific states
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [smoothness, setSmoothness] = useState(0);

  useEffect(() => {
    if (isConverting) {
      const interval = setInterval(() => {
        setProgress(p => {
          if (p < 90) return p + 1;
          clearInterval(interval);
          return 90;
        });
      }, 80);
      return () => clearInterval(interval);
    }
  }, [isConverting]);

  useEffect(() => {
    if (!rawGeneratedImageUrl) {
      setFinalImageUrl(null);
      return;
    }

    if (mode === 'edit') {
        setFinalImageUrl(rawGeneratedImageUrl);
        return;
    }

    if (mode === 'depth') {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = rawGeneratedImageUrl;

      image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          ctx.filter = `blur(${smoothness / 10}px) brightness(${brightness}%) contrast(${contrast}%)`;
          ctx.drawImage(image, 0, 0);
          
          setFinalImageUrl(canvas.toDataURL('image/png'));
      };
      image.onerror = () => {
          setError("无法加载生成图片以进行调整。");
      }
    }
  }, [rawGeneratedImageUrl, brightness, contrast, smoothness, mode]);
  
  const handleFileSelect = (file: File) => {
    setOriginalImageFile(file);
    setRawGeneratedImageUrl(null);
    setError(null);
    setPrompt('');
    handleResetAdjustments();
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setOriginalDataUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setOriginalImageFile(null);
    setOriginalDataUrl(null);
    setRawGeneratedImageUrl(null);
    setError(null);
    setPrompt('');
    handleResetAdjustments();
  };
  
  const handleGenerate = async () => {
    if (!originalImageFile) return;
    if (mode === 'edit' && !prompt.trim()) {
        setError("请输入编辑指令。");
        return;
    }

    setIsConverting(true);
    setError(null);
    setRawGeneratedImageUrl(null);
    setProgress(0);
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const { data: base64Data, mimeType } = await fileToBase64(originalImageFile);
        
        const textPart = mode === 'edit' 
            ? { text: prompt }
            : { text: '为这张图片生成一张高质量的深度图，专为ZBrush等3D雕刻软件用作置换贴图。核心要求是：1. **保留几何细节**：精确捕捉所有由物体真实三维形态产生的轮廓、边缘和表面起伏。2. **智能平滑**：在AI层面主动消除由原图材质、噪点或压缩产生的颗粒感伪影。最终的深度渐变必须是连续且平滑的，不能有断层。3. **标准化深度**：纯白色代表最前，纯黑色代表最后。目标是生成一张既干净平滑又细节分明的图像，为后续调整打下完美基础。不要添加任何文字。' };
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    textPart,
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        let generatedImageBase64: string | null = null;
        let generatedMimeType: string = 'image/png';
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
            if (part.inlineData) {
                generatedImageBase64 = part.inlineData.data;
                generatedMimeType = part.inlineData.mimeType;
                break;
            }
        }
        
        if (generatedImageBase64) {
            setRawGeneratedImageUrl(`data:${generatedMimeType};base64,${generatedImageBase64}`);
        } else {
            throw new Error("模型未能生成图片。可能是由于安全设置或未能识别请求。");
        }

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '发生未知错误';
        setError(`生成失败: ${errorMessage}`);
        console.error(err);
    } finally {
        setProgress(100);
        setTimeout(() => setIsConverting(false), 500);
    }
  };
  
  const handleDownload = () => {
    if (!finalImageUrl) return;
    const link = document.createElement('a');
    link.href = finalImageUrl;
    const originalName = originalImageFile?.name.split('.').slice(0, -1).join('.') || 'image';
    const suffix = mode === 'depth' ? '-depthmap' : '-edited';
    link.download = `${originalName}${suffix}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleResetAdjustments = () => {
    setBrightness(100);
    setContrast(100);
    setSmoothness(0);
  };

  const handleModeChange = (newMode: 'edit' | 'depth') => {
    if (newMode !== mode) {
        setMode(newMode);
        setRawGeneratedImageUrl(null);
        setFinalImageUrl(null);
        setError(null);
        setPrompt('');
        handleResetAdjustments();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center p-4 sm:p-6 md:p-8 font-sans antialiased">
      <header className="w-full max-w-6xl text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300 pb-2">
          智能 AI 图像编辑器
        </h1>
        <p className="mt-2 text-lg text-slate-400">使用文本指令编辑您的图片，或一键生成高质量的深度图。</p>
      </header>

      {error && (
        <div className="w-full max-w-4xl p-4 mb-6 text-center text-red-300 bg-red-900/50 border border-red-700 rounded-lg">
          {error}
        </div>
      )}

      <main className="w-full max-w-6xl flex-grow grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-xl shadow-2xl flex flex-col aspect-w-16 aspect-h-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-300 text-center">原始图片</h2>
          <div className="flex-grow flex items-center justify-center min-h-[250px] relative">
            {originalDataUrl ? (
              <>
                <img src={originalDataUrl} className="max-w-full max-h-full object-contain rounded-md" alt="用户上传的原始图片" />
                <button 
                  onClick={clearImage} 
                  className="absolute top-2 right-2 z-10 p-2 bg-slate-900/50 rounded-full text-white/70 hover:bg-red-600/70 hover:text-white hover:scale-110 transition-all duration-200"
                  aria-label="移除图片"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </>
            ) : (
              <ImagePlaceholder onFileSelect={handleFileSelect} />
            )}
          </div>
        </div>
        
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-xl shadow-2xl flex flex-col aspect-w-16 aspect-h-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-300 text-center">生成结果对比</h2>
          <div className="flex-grow flex items-center justify-center min-h-[250px] bg-slate-800/50 rounded-md overflow-hidden">
            {finalImageUrl && originalDataUrl ? (
                <ImageComparer originalSrc={originalDataUrl} processedSrc={finalImageUrl} processedAltText="AI 生成的图片" />
            ) : (
                <div className="text-slate-500 px-4 text-center">AI 生成的结果将在此处与原图进行对比</div>
            )}
          </div>
        </div>
      </main>

      {originalImageFile && (
        <div className="w-full max-w-6xl mt-8 space-y-6">
            <div className="flex justify-center border-b border-slate-700">
                <button onClick={() => handleModeChange('edit')} className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${mode === 'edit' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-400 hover:text-white'}`}>
                    <PencilIcon className="w-5 h-5" />
                    图像编辑
                </button>
                <button onClick={() => handleModeChange('depth')} className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${mode === 'depth' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-400 hover:text-white'}`}>
                    <CubeIcon className="w-5 h-5" />
                    深度图生成
                </button>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-xl shadow-lg min-h-[160px] flex flex-col justify-center">
                {mode === 'edit' && (
                    <div>
                        <label htmlFor="prompt" className="block mb-2 text-lg font-semibold text-slate-300">编辑指令</label>
                        <textarea
                            id="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="例如：添加复古滤镜，移除背景中的人物..."
                            className="w-full p-3 bg-slate-800 border border-slate-600 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors text-slate-200 placeholder-slate-500 resize-none"
                            rows={3}
                        />
                    </div>
                )}
                {mode === 'depth' && rawGeneratedImageUrl && (
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold text-slate-300">调整深度图</h3>
                            <button onClick={handleResetAdjustments} className="flex items-center gap-2 px-3 py-1 text-sm text-slate-400 hover:text-sky-400 hover:bg-sky-900/50 rounded-md transition-colors">
                                <ResetIcon className="w-4 h-4" />
                                重置
                            </button>
                        </div>
                        <div className="space-y-4">
                              <div>
                                <label htmlFor="brightness" className="block mb-1 text-sm font-medium text-slate-400">亮度 ({brightness}%)</label>
                                <input id="brightness" type="range" min="0" max="200" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                              </div>
                              <div>
                                <label htmlFor="contrast" className="block mb-1 text-sm font-medium text-slate-400">对比度 ({contrast}%)</label>
                                <input id="contrast" type="range" min="0" max="200" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                              </div>
                              <div>
                                <label htmlFor="smoothness" className="block mb-1 text-sm font-medium text-slate-400">细节柔化 ({smoothness})</label>
                                <input id="smoothness" type="range" min="0" max="20" value={smoothness} onChange={(e) => setSmoothness(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                              </div>
                        </div>
                    </div>
                )}
                {mode === 'depth' && !rawGeneratedImageUrl && (
                    <div className="text-center text-slate-400">
                        <p>点击下方的“生成深度图”按钮开始。</p>
                    </div>
                )}
            </div>
        </div>
      )}

      <footer className="w-full max-w-6xl flex flex-col sm:flex-row justify-center items-center gap-4 mt-8">
        <button 
            onClick={handleGenerate}
            disabled={!originalImageFile || isConverting}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-3 font-semibold text-white bg-gradient-to-r from-sky-600 to-cyan-500 rounded-lg shadow-lg hover:shadow-cyan-500/50 disabled:from-slate-600 disabled:to-slate-500 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-sky-400/50"
        >
          {isConverting ? (
            <div className="w-full flex flex-col items-center justify-center">
              <span className="mb-1.5">正在生成... ({progress}%)</span>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div className="bg-sky-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          ) : (
            <>
              <SparklesIcon className="w-5 h-5" />
              {mode === 'edit' ? '应用编辑' : '生成深度图'}
            </>
          )}
        </button>
        <button
            onClick={handleDownload}
            disabled={!finalImageUrl}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-3 font-semibold text-slate-900 bg-cyan-300 rounded-lg shadow-lg hover:bg-cyan-200 hover:shadow-cyan-300/50 disabled:bg-slate-500 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-cyan-300/50"
        >
          <DownloadIcon className="w-5 h-5" />
          {mode === 'edit' ? '下载编辑后图片' : '下载深度图'}
        </button>
      </footer>
    </div>
  );
};

export default App;