import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { candidateAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, Camera, Send, Loader2, User, Briefcase, Clock,
  CheckCircle, Volume2, VolumeX, Timer, AlertTriangle, XCircle, Code,
} from 'lucide-react';

export default function CandidateJoin() {
  const { token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | welcome | interview | round_transition | done | failed | error
  const [info, setInfo] = useState(null);
  const [candidateName, setCandidateName] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentRound, setCurrentRound] = useState('Technical');
  const [answer, setAnswer] = useState('');
  const [codeText, setCodeText] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('python');
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [timeStatus, setTimeStatus] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [endReason, setEndReason] = useState('');
  const [techScore, setTechScore] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  // ── Load interview info ────────────────────────────
  useEffect(() => {
    const loadInfo = async () => {
      try {
        const res = await candidateAPI.getInfo(token);
        setInfo(res.data);
        if (res.data.ai_session_status === 'completed') {
          setPhase('done');
          setSessionId(res.data.ai_session_id);
        } else {
          setPhase('welcome');
        }
      } catch (err) {
        toast.error('Invalid or expired interview link');
        setPhase('error');
      }
    };
    loadInfo();
  }, [token]);

  // ── TTS: Speak question ────────────────────────────
  const speakQuestion = useCallback((text) => {
    if (!ttsEnabled || !text) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  }, [ttsEnabled]);

  // ── Speech-to-text ─────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = answer;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += ' ' + t;
        } else {
          interim += t;
        }
      }
      setAnswer(finalTranscript.trim() + (interim ? ' ' + interim : ''));
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech') console.error('Speech error:', event.error);
    };
    recognition.onend = () => setIsRecording(false);

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }, [answer]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopSpeechRecognition();
    else startSpeechRecognition();
  }, [isRecording, startSpeechRecognition, stopSpeechRecognition]);

  // ── Camera ─────────────────────────────────────────
  const toggleCamera = async () => {
    if (cameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraOn(true);
      } catch {
        toast.error('Camera access denied');
      }
    }
  };

  // ── Timer polling ──────────────────────────────────
  useEffect(() => {
    if (phase === 'interview' && token) {
      const pollTime = async () => {
        try {
          const res = await candidateAPI.checkTime(token);
          setTimeStatus(res.data);
          if (res.data.is_expired) {
            await candidateAPI.endInterview(token);
            setPhase('done');
            setEndReason('time_expired');
            toast('Time is up! Interview ended.');
          }
        } catch {}
      };
      timeIntervalRef.current = setInterval(pollTime, 10000);
      pollTime();
      return () => clearInterval(timeIntervalRef.current);
    }
  }, [phase, token]);

  // ── Speak question on change ───────────────────────
  useEffect(() => {
    if (currentQuestion?.question && phase === 'interview') {
      speakQuestion(currentQuestion.question);
    }
  }, [currentQuestion?.question_id, phase, speakQuestion]);

  // ── Cleanup ────────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      synthRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.stop();
      clearInterval(timeIntervalRef.current);
    };
  }, []);

  // ── Start interview ────────────────────────────────
  const startInterview = async () => {
    if (!candidateName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    setLoading(true);
    try {
      const res = await candidateAPI.start(token, { candidate_name: candidateName });
      setSessionId(res.data.session_id);
      setCurrentQuestion(res.data.question);
      setCurrentRound(res.data.round || 'Technical');
      setTimeStatus(res.data.time_status);
      setQuestionNumber(1);
      setPhase('interview');
      setEvaluation(null);
      setAnswer('');
      setCodeText('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit answer ──────────────────────────────────
  const submitAnswer = async () => {
    const isCoding = currentQuestion?.is_coding;
    if (!isCoding && !answer.trim()) {
      toast.error('Please speak your answer using the microphone');
      return;
    }
    if (isCoding && !codeText.trim()) {
      toast.error('Please write your code solution');
      return;
    }

    stopSpeechRecognition();
    synthRef.current.cancel();
    setLoading(true);
    setEvaluation(null);

    try {
      const payload = {
        question_id: currentQuestion.question_id,
        answer_text: isCoding ? (answer || 'Code submitted') : answer,
      };
      if (isCoding) {
        payload.code_text = codeText;
        payload.code_language = codeLanguage;
      }

      const res = await candidateAPI.submitAnswer(token, payload);
      setEvaluation(res.data.evaluation);
      setTimeStatus(res.data.time_status);

      if (res.data.is_complete) {
        setEndReason(res.data.reason || 'completed');
        if (res.data.reason === 'technical_cutoff_not_met') {
          setTechScore(res.data.technical_score);
          setPhase('failed');
        } else {
          setPhase('done');
        }
      } else {
        const newRound = res.data.round || currentRound;
        if (newRound !== currentRound) {
          setCurrentRound(newRound);
          setTechScore(res.data.technical_score || null);
          setPhase('round_transition');
          setTimeout(() => {
            setPhase('interview');
            setCurrentQuestion(res.data.next_question);
            setQuestionNumber((prev) => prev + 1);
            setAnswer('');
            setCodeText('');
            setEvaluation(null);
          }, 3000);
        } else {
          setTimeout(() => {
            setCurrentQuestion(res.data.next_question);
            setQuestionNumber((prev) => prev + 1);
            setAnswer('');
            setCodeText('');
            setEvaluation(null);
          }, 3000);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit answer');
    } finally {
      setLoading(false);
    }
  };

  // ── Format time ────────────────────────────────────
  const formatTime = (timeStatus) => {
    const totalSec = timeStatus?.remaining_seconds ?? Math.round((timeStatus?.remaining_minutes ?? 0) * 60);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Loading / Error ───────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="animate-spin text-primary-500" size={48} />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-500">This interview link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  // ─── Welcome Phase ─────────────────────────────────
  if (phase === 'welcome') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="gradient-bg p-8 text-center">
              <Briefcase className="mx-auto text-white mb-3" size={40} />
              <h1 className="text-2xl font-bold text-white">{info?.job_role} Interview</h1>
              <p className="text-white/80 mt-1">{info?.company_name}</p>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <Clock size={18} className="mx-auto text-primary-500 mb-1" />
                  <span className="text-gray-600">{info?.duration_minutes} min</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <CheckCircle size={18} className="mx-auto text-primary-500 mb-1" />
                  <span className="text-gray-600">2 Rounds</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">🎤 Voice-Based AI Interview</p>
                <p>The AI will ask questions aloud using text-to-speech. Answer using your microphone — no typing needed except for coding questions. Enable your camera for the best experience.</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <p><strong>Two Rounds:</strong> Technical (70% cutoff to proceed) → HR</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Full Name</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && startInterview()}
                  />
                </div>
              </div>

              <button
                onClick={startInterview}
                disabled={loading || !candidateName.trim()}
                className="w-full gradient-bg text-white py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />}
                <span>{loading ? 'Preparing...' : 'Start Interview'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Round Transition ──────────────────────────────
  if (phase === 'round_transition') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
            <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Technical Round Passed!</h1>
            <p className="text-gray-500 mb-4">
              Score: <span className="font-bold text-green-600">{techScore}%</span> (Cutoff: 70%)
            </p>
            <p className="text-lg text-primary-600 font-semibold">Proceeding to HR Round...</p>
            <Loader2 className="animate-spin mx-auto mt-4 text-primary-500" size={32} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Failed ────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
            <XCircle size={64} className="mx-auto text-red-500 mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Interview Ended</h1>
            <p className="text-gray-500 mb-4">
              Technical Score: <span className="font-bold text-red-600">{techScore}%</span>
            </p>
            <p className="text-gray-600 mb-6">
              Your technical score did not meet the 70% cutoff for the HR round.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              Your responses have been recorded and will be reviewed by the hiring team.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Done Phase ────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Interview Complete!</h1>
            <p className="text-gray-500 mb-6">
              Thank you for completing the interview for <strong>{info?.job_role}</strong> at <strong>{info?.company_name}</strong>.
              {endReason === 'time_expired' && ' Time expired — your answers have been recorded.'}
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              <CheckCircle size={20} className="inline mr-2" />
              Your interview has been submitted successfully. You may close this page now.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Interview Phase ───────────────────────────────
  const isCoding = currentQuestion?.is_coding;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{info?.job_role} Interview</h1>
              <p className="text-sm text-gray-500">{info?.company_name} &bull; AI Interviewer</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              currentRound === 'Technical' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {currentRound === 'Technical' ? '🔧 Technical' : '🤝 HR'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => { setTtsEnabled(!ttsEnabled); synthRef.current.cancel(); }}
              className={`p-2 rounded-lg ${ttsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
            >
              {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {timeStatus && (
              <div className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-mono font-semibold ${
                timeStatus.remaining_minutes < 2 ? 'bg-red-100 text-red-700 animate-pulse' :
                timeStatus.remaining_minutes < 5 ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                <Timer size={14} />
                <span>{formatTime(timeStatus)}</span>
              </div>
            )}

            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <User size={16} />
              <span>{candidateName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Time progress bar */}
      {timeStatus && (
        <div className="w-full bg-gray-200 h-1">
          <div
            className={`h-1 transition-all ${
              timeStatus.progress_pct > 80 ? 'bg-red-500' :
              timeStatus.progress_pct > 60 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${timeStatus.progress_pct}%` }}
          />
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Wrap-up warning */}
        {currentQuestion?.is_wrap_up && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-center space-x-2 text-sm text-yellow-800">
            <AlertTriangle size={16} />
            <span>Less than 2 minutes remaining. This is your final question.</span>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Camera + Controls */}
          <div className="lg:col-span-1">
            <div className="bg-black rounded-2xl overflow-hidden aspect-[4/3] relative">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <Camera className="text-gray-500" size={48} />
                </div>
              )}
              {isSpeaking && (
                <div className="absolute top-3 left-3 bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
                  <Volume2 size={12} className="animate-pulse" />
                  <span>AI Speaking...</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-3">
              <button
                onClick={toggleCamera}
                className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center space-x-1 ${
                  cameraOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Camera size={16} />
                <span>{cameraOn ? 'On' : 'Off'}</span>
              </button>
              <button
                onClick={toggleRecording}
                disabled={isCoding}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center space-x-1 transition ${
                  isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : isCoding
                    ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{isRecording ? 'Stop' : 'Speak'}</span>
              </button>
            </div>

            <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                  isSpeaking ? 'bg-green-500 animate-pulse' : 'gradient-bg'
                }`}>
                  AI
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">AI Interviewer</p>
                  <p className="text-xs text-green-600 flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                    {isSpeaking ? 'Speaking...' : 'Listening'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Question & Answer */}
          <div className="lg:col-span-2 space-y-5">
            {/* Question info */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Question #{questionNumber}</span>
              <span className={`capitalize px-3 py-1 rounded-full font-medium ${
                currentQuestion?.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                currentQuestion?.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {currentQuestion?.difficulty}
              </span>
            </div>

            {/* Question */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">
                  AI
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-semibold text-gray-900">Question:</h2>
                    {isCoding && (
                      <span className="flex items-center space-x-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                        <Code size={12} />
                        <span>Coding</span>
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 text-lg leading-relaxed">{currentQuestion?.question}</p>
                </div>
              </div>
            </div>

            {/* Answer: Code editor or Voice transcript */}
            {isCoding ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">Your Code Solution</label>
                  <select
                    value={codeLanguage}
                    onChange={(e) => setCodeLanguage(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                  >
                    {['python', 'javascript', 'java', 'cpp', 'c', 'go', 'rust', 'typescript'].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={codeText}
                  onChange={(e) => setCodeText(e.target.value)}
                  rows={12}
                  placeholder="Write your code here..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none font-mono text-sm bg-gray-900 text-green-400"
                  spellCheck={false}
                />
                <button
                  onClick={submitAnswer}
                  disabled={loading || !codeText.trim()}
                  className="mt-4 w-full gradient-bg text-white py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />}
                  <span>{loading ? 'Evaluating Code...' : 'Submit Code'}</span>
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Answer <span className="text-gray-400">(speak using microphone)</span>
                </label>
                <div className={`w-full min-h-[120px] px-4 py-3 border rounded-lg text-gray-700 text-base leading-relaxed ${
                  isRecording ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'
                }`}>
                  {answer || (
                    <span className="text-gray-400 italic">
                      {isRecording ? 'Listening... speak now' : 'Click "Speak" to start answering with your voice'}
                    </span>
                  )}
                </div>
                {isRecording && (
                  <div className="flex items-center space-x-2 mt-2 text-red-600 text-sm">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span>Recording... speak your answer</span>
                  </div>
                )}
                <button
                  onClick={submitAnswer}
                  disabled={loading || !answer.trim()}
                  className="mt-4 w-full gradient-bg text-white py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />}
                  <span>{loading ? 'Evaluating...' : 'Submit Answer'}</span>
                </button>
              </div>
            )}

            {/* Evaluation */}
            {evaluation && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">📊 Evaluation</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: 'Content', value: evaluation.content_score, color: 'blue' },
                    { label: 'Keywords', value: evaluation.keyword_score || evaluation.keyword_coverage, color: 'orange' },
                    { label: 'Depth', value: evaluation.depth_score, color: 'indigo' },
                    { label: 'Communication', value: evaluation.communication_score, color: 'green' },
                    { label: 'Overall', value: evaluation.overall_score, color: 'purple' },
                  ].map((s) => (
                    <div key={s.label} className="text-center bg-gray-50 rounded-lg p-2">
                      <div className={`text-xl font-bold text-${s.color}-600`}>{Math.round(s.value || 0)}%</div>
                      <div className="text-[10px] text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className={`text-sm font-medium mb-2 ${
                  evaluation.answer_strength === 'strong' ? 'text-green-600' :
                  evaluation.answer_strength === 'moderate' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  Strength: {evaluation.answer_strength?.toUpperCase()}
                </div>
                {evaluation.feedback && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{evaluation.feedback}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
