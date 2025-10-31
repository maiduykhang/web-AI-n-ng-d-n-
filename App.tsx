import React, { useState, useEffect, useMemo, useRef } from 'react';
import DataCard from './components/DataCard';
import DataChart from './components/DataChart';
import { SoilData } from './types';
import { Leaf, FlaskConical, Droplets, Scale, Mic, Send } from 'lucide-react';
import { GoogleGenAI, Chat, Modality } from "@google/genai";

// Generate simulated data for the dashboard
const generateSimulatedData = (): SoilData[] => {
  const data: SoilData[] = [];
  const baseTime = new Date();
  baseTime.setMinutes(baseTime.getMinutes() - 30);

  for (let i = 0; i < 30; i++) {
    const time = new Date(baseTime);
    time.setMinutes(time.getMinutes() + i);
    data.push({
      N: Math.round(80 + Math.sin(i * 0.3) * 40 + Math.random() * 15),
      P: Math.round(30 + Math.cos(i * 0.4) * 20 + Math.random() * 10),
      K: Math.round(120 + Math.sin(i * 0.25) * 50 + Math.random() * 20),
      pH: Number((6.0 + Math.sin(i * 0.2) * 1.2 + Math.random() * 0.4).toFixed(1)),
      moisture: Math.round(40 + Math.sin(i * 0.35) * 30 + Math.random() * 15),
      timeLabel: time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    });
  }
  return data;
};

// Analyze the latest soil data to provide a quick diagnosis
const getAnalysis = (reading: SoilData) => {
    let issues: string[] = [];
    if (reading.N < 100) issues.push("Thiếu Nitơ");
    if (reading.P < 40) issues.push("Thiếu Lân");
    if (reading.K < 140) issues.push("Thiếu Kali");
    if (reading.pH < 5.5) issues.push("Đất chua");
    if (reading.pH > 7.5) issues.push("Đất kiềm");
    if (reading.moisture < 40) issues.push("Đất khô");

    const diagnosis = issues.length === 0 ? "Đất rất tốt! Cây sẽ phát triển mạnh!" : "Cảnh báo: " + issues.join(", ");
    return { diagnosis, isGood: issues.length === 0 };
}

// Determine the status color for each data card
const getCardStatus = (key: keyof Omit<SoilData, 'timeLabel'>, value: number) => {
    switch(key) {
        case 'N': return value < 100 ? 'bad' : value < 130 ? 'warn' : 'good';
        case 'P': return value < 40 ? 'bad' : value < 55 ? 'warn' : 'good';
        case 'K': return value < 140 ? 'bad' : value < 180 ? 'warn' : 'good';
        case 'pH': return value < 5.5 || value > 7.5 ? 'bad' : value < 6 || value > 7 ? 'warn' : 'good';
        case 'moisture': return value < 40 ? 'bad' : value < 55 ? 'warn' : 'good';
        default: return 'good';
    }
}

interface Message {
    text: string;
    sender: 'user' | 'ai';
}

// --- AUDIO HELPER FUNCTIONS ---
function decode(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodePcmAudio(
  data: Uint8Array,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  const sampleRate = 24000; // Gemini TTS output sample rate
  const numChannels = 1;
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


const App: React.FC = () => {
  const simulatedData = useMemo(() => generateSimulatedData(), []);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [messages, setMessages] = useState<Message[]>([
    { text: 'Xin chào bác! Con là <strong>AI Nông Dân</strong>. Hỏi con gì về đất, cây, phân bón cũng được!', sender: 'ai' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  const recognitionRef = useRef<any>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize Gemini Chat, Speech Recognition, and AudioContext
  useEffect(() => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        aiRef.current = ai;
        chatSessionRef.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: `Bạn là AI Nông Dân, một trợ lý nông nghiệp chuyên gia. Bạn sẽ nhận được dữ liệu đất hiện tại và câu hỏi từ người dùng. Hãy trả lời một cách ngắn gọn, hữu ích, thân thiện, và xưng hô "con" với người dùng "bác nông dân", bằng tiếng Việt.`
            }
        });
    } catch (error) {
        console.error("Failed to initialize GoogleGenAI:", error);
        setMessages(prev => [...prev, { text: "Không thể kết nối tới AI. Vui lòng kiểm tra API key.", sender: 'ai' }]);
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'vi-VN';
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onstart = () => setIsRecording(true);
      recognitionRef.current.onend = () => setIsRecording(false);
      recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsRecording(false);
      };
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        handleSendMessage(transcript);
      };
    }

    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  const speakTextWithGemini = async (text: string) => {
    if (!aiRef.current || !audioContextRef.current || !text) return;

    // Stop any currently playing audio
    if (audioSourceRef.current) {
        audioSourceRef.current.stop();
    }
    
    // Ensure AudioContext is running
    if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }

    try {
        const response = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Hãy đọc đoạn văn sau bằng giọng nữ miền Nam tự nhiên, chuẩn tiếng Việt, có ngữ điệu: "${text}"` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (base64Audio) {
            const audioBytes = decode(base64Audio);
            const audioBuffer = await decodePcmAudio(audioBytes, audioContextRef.current);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
            audioSourceRef.current = source;
        }
    } catch (error) {
        console.error("Error generating speech with Gemini:", error);
    }
  };

  // Auto-scroll chat box and speak AI messages
  useEffect(() => {
    if (chatBoxRef.current) {
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'ai') {
        const cleanText = lastMessage.text.replace(/<[^>]*>?/gm, ''); // Remove all HTML tags for speech
        speakTextWithGemini(cleanText);
    }
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    const text = (messageText || inputValue).trim();
    if (!text || isSending || !latestData) return;

    setMessages(prev => [...prev, { text: `<strong>Bác:</strong> ${text}`, sender: 'user' }]);
    setInputValue('');
    setIsSending(true);

    try {
        if (!chatSessionRef.current) throw new Error("Chat session not initialized.");
        const context = `Dữ liệu đất hiện tại: N=${latestData.N} mg/kg, P=${latestData.P} mg/kg, K=${latestData.K} mg/kg, pH=${latestData.pH}, Độ ẩm=${latestData.moisture}%.`;
        const prompt = `${context} Dựa vào đó, trả lời câu hỏi sau của bác nông dân: "${text}"`;

        const response = await chatSessionRef.current.sendMessage({ message: prompt });
        
        setMessages(prev => [...prev, { text: `<strong>AI:</strong> ${response.text}`, sender: 'ai' }]);
    } catch (error) {
        console.error('Error sending message to AI:', error);
        setMessages(prev => [...prev, { text: '<strong>AI:</strong> Xin lỗi, con gặp sự cố khi trả lời.', sender: 'ai' }]);
    } finally {
        setIsSending(false);
    }
  };
  
  const handleVoiceToggle = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };
  
  // Simulation interval
  useEffect(() => {
      const intervalId = setInterval(() => {
          setCurrentIndex(prevIndex => (prevIndex + 1) % simulatedData.length);
      }, 4000);
      return () => clearInterval(intervalId);
  }, [simulatedData.length]);
  
  const latestData = simulatedData[currentIndex];
  const chartData = useMemo(() => {
    const end = currentIndex + 1;
    const start = Math.max(0, end - 20);
    return simulatedData.slice(start, end);
  }, [currentIndex, simulatedData]);
  const analysis = useMemo(() => getAnalysis(latestData), [latestData]);

  if (!latestData) {
    return <div className="text-center p-10">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
        <header className="bg-green-600 text-white p-4 rounded-lg shadow-lg text-center">
            <h1 className="text-2xl font-bold">Đất Nói - AI Nông Dân</h1>
        </header>

        <main className="mt-4">
            <p className="text-center font-semibold text-slate-700 my-4">
                {`Cập nhật: ${latestData.timeLabel}`}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
                 <DataCard icon={<FlaskConical />} label="Nitơ (N)" value={latestData.N} unit="mg/kg" status={getCardStatus('N', latestData.N)} />
                 <DataCard icon={<FlaskConical />} label="Lân (P)" value={latestData.P} unit="mg/kg" status={getCardStatus('P', latestData.P)} />
                 <DataCard icon={<FlaskConical />} label="Kali (K)" value={latestData.K} unit="mg/kg" status={getCardStatus('K', latestData.K)} />
                 <DataCard icon={<Scale />} label="pH Đất" value={latestData.pH.toFixed(1)} unit="" status={getCardStatus('pH', latestData.pH)} />
                 <DataCard icon={<Droplets />} label="Độ Ẩm" value={latestData.moisture} unit="%" status={getCardStatus('moisture', latestData.moisture)} />
            </div>

            <div className={`p-4 rounded-lg my-4 text-center text-md font-semibold shadow-md ${analysis.isGood ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {analysis.diagnosis}
            </div>

            <DataChart data={chartData} />

            <div className="bg-white rounded-xl shadow-lg p-4 mt-4 flex flex-col min-h-[400px]">
                <div ref={chatBoxRef} className="flex-1 overflow-y-auto p-3 bg-slate-100 rounded-lg mb-3 text-sm space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div 
                                className={`p-3 rounded-2xl max-w-[85%] shadow-sm ${msg.sender === 'user' ? 'bg-green-600 text-white rounded-br-md' : 'bg-slate-200 text-slate-800 rounded-bl-md'}`}
                                dangerouslySetInnerHTML={{ __html: msg.text }}
                            />
                        </div>
                    ))}
                    {isSending && <div className="text-slate-500 italic text-center">AI đang suy nghĩ...</div>}
                </div>
                <div className="flex gap-3 items-center">
                    <input 
                        type="text" 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Hỏi AI Nông Dân..."
                        className="flex-1 px-5 py-3 border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                        disabled={isSending}
                    />
                     {recognitionRef.current && (
                        <button onClick={handleVoiceToggle} className={`w-12 h-12 flex-shrink-0 flex items-center justify-center text-white rounded-full transition-colors shadow-md ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`} disabled={isSending}>
                            <Mic size={24} />
                        </button>
                    )}
                    <button onClick={() => handleSendMessage()} className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-green-600 text-white rounded-full shadow-md" disabled={isSending}>
                        <Send size={24} />
                    </button>
                </div>
            </div>
        </main>
    </div>
  );
};

export default App;
