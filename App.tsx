
import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { MicrophoneIcon, StopIcon, RecordingIcon } from './components/Icons';
import { encode } from './utils/audio';

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcription, setTranscription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const currentTranscriptionRef = useRef<string>('');

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
      sessionPromiseRef.current = null;
    }
    currentTranscriptionRef.current = '';
  }, []);


  const startRecording = useCallback(async () => {
    setIsRecording(true);
    setError(null);
    setTranscription('');
    currentTranscriptionRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // FIX: Cast window to `any` to support `webkitAudioContext` for older browsers without TypeScript errors.
      const context = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = context;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Session opened.');
            const source = context.createMediaStreamSource(stream);
            const processor = context.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                }).catch(e => {
                  console.error("Error sending audio data:", e);
                  setError("Failed to send audio data. Please try again.");
                  stopRecording();
                });
              }
            };

            source.connect(processor);
            processor.connect(context.destination);
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentTranscriptionRef.current += text;
              setTranscription(currentTranscriptionRef.current);
            }

            if (message.serverContent?.turnComplete) {
                // To create a paragraph break after a turn is complete
                currentTranscriptionRef.current += '\n\n';
                setTranscription(currentTranscriptionRef.current);
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            setError(`An error occurred: ${e.message}. Please try again.`);
            stopRecording();
          },
          onclose: (e: CloseEvent) => {
            console.log('Session closed.');
            if (isRecording) {
              // If the session closes unexpectedly while recording, stop everything.
              stopRecording();
            }
          },
        },
        config: {
          inputAudioTranscription: {},
          // Even though we only need transcription, the API is designed for audio in/out
          // and requires this modality. We won't process the audio output.
          responseModalities: [Modality.AUDIO], 
        },
      });

      // Handle potential errors during connection setup
      sessionPromiseRef.current.catch(e => {
        console.error("Failed to connect to Gemini Live:", e);
        setError("Could not start the transcription session. Check your connection and API key.");
        stopRecording();
      });

    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Could not access microphone. Please grant permission and try again.');
      setIsRecording(false);
    }
  }, [stopRecording, isRecording]);


  const handleButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col">
        <header className="text-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-cyan-400">
            Real-time Audio Transcriber
          </h1>
          <p className="text-gray-400 mt-2">
            Powered by Gemini
          </p>
        </header>

        <div className="flex-grow bg-gray-900/50 rounded-lg p-4 mb-6 min-h-[200px] border border-gray-700 overflow-y-auto">
          {transcription ? (
             <p className="text-gray-200 whitespace-pre-wrap">{transcription}</p>
          ) : (
            <p className="text-gray-500 text-center self-center my-auto">
              {isRecording ? 'Listening...' : 'Press "Start Recording" to begin.'}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <div className="flex flex-col items-center">
          <button
            onClick={handleButtonClick}
            className={`
              w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out
              focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-800
              ${isRecording 
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
                : 'bg-cyan-500 hover:bg-cyan-600 focus:ring-cyan-400'}
            `}
            aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <StopIcon /> : <MicrophoneIcon />}
          </button>
          <div className="mt-4 flex items-center h-6">
            {isRecording && (
                <div className="flex items-center space-x-2 text-red-400">
                    <RecordingIcon />
                    <span>Recording...</span>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;