import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, Camera, Send, Loader2, ArrowRight, Clock, Code,
  Volume2, VolumeX, Timer, AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react';

const ROLES = [
  'Software Engineer', 'Data Analyst', 'Product Manager', 'HR Manager',
  'DevOps Engineer', 'Frontend Developer', 'Backend Developer',
  'Machine Learning Engineer', 'Business Analyst', 'QA Engineer',
];

export default function MockInterview() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('setup'); // setup | interview | round_transition | done | failed
  const [role, setRole] = useState('Software Engineer');
  const [difficulty, setDifficulty] = useState('medium');
  const [jobDescription, setJobDescription] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentRound, setCurrentRound] = useState('Technical');
  const [answer, setAnswer] = useState('');
  const [codeText, setCodeText] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('python');
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [timeStatus, setTimeStatus] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [endReason, setEndReason] = useState('');
  const [techScore, setTechScore] = useState(null);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  // ── TTS: Speak question aloud ──────────────────────
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

  // ── Speech-to-text (Web Speech API) ────────────────
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = answer;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += ' ' + transcript;
        } else {
          interim += transcript;
        }
      }
      setAnswer(finalTranscript.trim() + (interim ? ' ' + interim : ''));
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech') {
        console.error('Speech recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

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
    if (isRecording) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
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
    if (phase === 'interview' && sessionId) {
      const pollTime = async () => {
        try {
          const res = await mockAPI.checkTime(sessionId);
          setTimeStatus(res.data);
          if (res.data.is_expired) {
            // Force end
            await mockAPI.endInterview(sessionId);
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
  }, [phase, sessionId]);

  // ── Speak new questions via TTS ────────────────────
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
    setLoading(true);
    try {
      const res = await mockAPI.start({
        job_role: role,
        difficulty,
        job_description: jobDescription || undefined,
        experience_level: experienceLevel || undefined,
        duration_minutes: durationMinutes,
      });
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
      toast.error('Failed to start interview');
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

      const res = await mockAPI.submitAnswer(sessionId, payload);
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
        // Check for round transition
        const newRound = res.data.round || currentRound;
        if (newRound !== currentRound) {
          setCurrentRound(newRound);
          setTechScore(res.data.technical_score || null);
          // Brief transition display
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
      toast.error('Failed to submit answer');
    } finally {
      setLoading(false);
    }
  };

  // ── Format time ────────────────────────────────────
  const formatTime = (timeStatus) => {
    // Use remaining_seconds if available for better precision
    const totalSec = timeStatus?.remaining_seconds ?? Math.round((timeStatus?.remaining_minutes ?? 0) * 60);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Setup Phase ───────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Mock Interview</h1>
        <p className="text-gray-500 mb-8">Configure your practice session. AI will interview you using voice.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">Select experience</option>
                <option value="Fresher (0-1 years)">Fresher (0-1 years)</option>
                <option value="Junior (1-3 years)">Junior (1-3 years)</option>
                <option value="Mid-level (3-5 years)">Mid-level (3-5 years)</option>
                <option value="Senior (5-8 years)">Senior (5-8 years)</option>
                <option value="Lead (8+ years)">Lead (8+ years)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Job Description (Optional)</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={4}
                placeholder="Paste the full Job Description here for JD-driven questions..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {['easy', 'medium', 'hard'].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`py-2 rounded-lg border-2 text-sm font-medium capitalize transition ${
                        difficulty === d
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {[10, 15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>{m} minutes</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">🎤 Voice-Based Interview</p>
              <p>The AI will ask questions using text-to-speech. Answer using your microphone — no typing needed except for coding questions. Camera captures your video for confidence analysis.</p>
            </div>

            <button
              onClick={startInterview}
              disabled={loading}
              className="w-full gradient-bg text-white py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
              <span>{loading ? 'Preparing...' : 'Start Interview'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Round Transition ──────────────────────────────
  if (phase === 'round_transition') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12">
          <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Technical Round Passed!</h1>
          <p className="text-gray-500 mb-4">
            Score: <span className="font-bold text-green-600">{techScore}%</span> (Cutoff: 70%)
          </p>
          <p className="text-lg text-primary-600 font-semibold">Proceeding to HR Round...</p>
          <Loader2 className="animate-spin mx-auto mt-4 text-primary-500" size={32} />
        </div>
      </div>
    );
  }

  // ─── Failed (Technical cutoff not met) ─────────────
  if (phase === 'failed') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12">
          <XCircle size={64} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Interview Ended</h1>
          <p className="text-gray-500 mb-4">
            Technical Round Score: <span className="font-bold text-red-600">{techScore}%</span>
          </p>
          <p className="text-gray-600 mb-6">
            Your technical score did not meet the 70% cutoff required to proceed to the HR round.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(`/report/${sessionId}`)}
              className="gradient-bg text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition"
            >
              View Report
            </button>
            <button
              onClick={() => { setPhase('setup'); setSessionId(null); setCurrentQuestion(null); }}
              className="border-2 border-gray-300 text-gray-700 px-8 py-3 rounded-xl font-semibold hover:bg-gray-50 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Done Phase ────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Interview Complete!</h1>
          <p className="text-gray-500 mb-2">
            {endReason === 'time_expired'
              ? 'Time expired. Your answers have been recorded.'
              : 'Great job! View your detailed performance report.'}
          </p>
          <p className="text-sm text-gray-400 mb-8">
            Rounds completed: Technical {currentRound === 'HR' ? '+ HR' : 'only'}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(`/report/${sessionId}`)}
              className="gradient-bg text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition"
            >
              View Report
            </button>
            <button
              onClick={() => { setPhase('setup'); setSessionId(null); setCurrentQuestion(null); }}
              className="border-2 border-gray-300 text-gray-700 px-8 py-3 rounded-xl font-semibold hover:bg-gray-50 transition"
            >
              Practice Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Interview Phase ───────────────────────────────
  const isCoding = currentQuestion?.is_coding;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Top bar: Round + Timer */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
            currentRound === 'Technical'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-purple-100 text-purple-700'
          }`}>
            {currentRound === 'Technical' ? '🔧 Technical Round' : '🤝 HR Round'}
          </span>
          <span className="text-sm text-gray-500">Question #{questionNumber}</span>
          <span className={`capitalize px-3 py-1 rounded-full text-xs font-medium ${
            currentQuestion?.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
            currentQuestion?.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {currentQuestion?.difficulty}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          {/* TTS toggle */}
          <button
            onClick={() => { setTtsEnabled(!ttsEnabled); synthRef.current.cancel(); }}
            className={`p-2 rounded-lg ${ttsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
            title={ttsEnabled ? 'TTS On' : 'TTS Off'}
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Timer */}
          {timeStatus && (
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-mono font-semibold ${
              timeStatus.remaining_minutes < 2 ? 'bg-red-100 text-red-700 animate-pulse' :
              timeStatus.remaining_minutes < 5 ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              <Timer size={16} />
              <span>{formatTime(timeStatus)} left</span>
            </div>
          )}
        </div>
      </div>

      {/* Time progress bar */}
      {timeStatus && (
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
          <div
            className={`h-1.5 rounded-full transition-all ${
              timeStatus.progress_pct > 80 ? 'bg-red-500' :
              timeStatus.progress_pct > 60 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${timeStatus.progress_pct}%` }}
          />
        </div>
      )}

      {/* Wrap-up warning */}
      {currentQuestion?.is_wrap_up && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-center space-x-2 text-sm text-yellow-800">
          <AlertTriangle size={16} />
          <span>Less than 2 minutes remaining. This is your final question.</span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Camera feed + Controls */}
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
              <span>{cameraOn ? 'Camera On' : 'Camera Off'}</span>
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

          {/* AI Interviewer card */}
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
                      <span>Coding Question</span>
                    </span>
                  )}
                </div>
                <p className="text-gray-700 text-lg leading-relaxed">{currentQuestion?.question}</p>
              </div>
            </div>
          </div>

          {/* Answer Area — Voice transcript (non-coding) or Code Editor (coding) */}
          {isCoding ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Your Code Solution</label>
                <select
                  value={codeLanguage}
                  onChange={(e) => setCodeLanguage(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
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
                Your Answer <span className="text-gray-400">(speak using microphone — live transcript below)</span>
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

          {/* Evaluation feedback */}
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
              {evaluation.keywords_missed?.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium">Keywords missed:</span> {evaluation.keywords_missed.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
