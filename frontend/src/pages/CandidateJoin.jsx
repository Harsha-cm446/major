import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { candidateAPI, WS_BASE } from '../services/api';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, Camera, Send, Loader2, User, Briefcase, Clock,
  CheckCircle, Volume2, VolumeX, Timer, AlertTriangle, XCircle, Code,
  Monitor, Shield, UserX, MonitorX, Eye,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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
  const [interviewSessionId, setInterviewSessionId] = useState(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionError, setPermissionError] = useState('');

  // Proctoring state
  const [proctoringStats, setProctoringStats] = useState({
    gazeViolations: 0, multiPersonAlerts: 0, tabSwitches: 0, totalAwayTime: 0,
  });
  const [tabSwitchAlert, setTabSwitchAlert] = useState(false);
  const gazeWarningStartRef = useRef(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const wsRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const screenStreamRef = useRef(null);

  // Live conversation mode refs
  const silenceTimerRef = useRef(null);
  const autoListenRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const answerRef = useRef('');
  const SILENCE_TIMEOUT = 3500;

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

  // Keep answerRef in sync with answer state
  useEffect(() => { answerRef.current = answer; }, [answer]);

  // ── TTS: Speak question, then auto-start listening ──
  const speakQuestion = useCallback((text) => {
    if (!ttsEnabled || !text) return;
    // Stop listening while AI speaks
    if (recognitionRef.current) {
      autoListenRef.current = false;
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
    }
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      autoListenRef.current = true;
      setTimeout(() => {
        if (autoListenRef.current && !isSubmittingRef.current) {
          startSpeechRecognition();
        }
      }, 400);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      autoListenRef.current = true;
      startSpeechRecognition();
    };
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
      timeIntervalRef.current = setInterval(pollTime, 1000);
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
      autoListenRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      synthRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      clearInterval(timeIntervalRef.current);
      wsRef.current?.close();
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    };
  }, []);

  // ── Tab Switch / Visibility Detection (Proctoring) ──
  useEffect(() => {
    if (phase !== 'interview' || !token) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchAlert(true);
        setProctoringStats(prev => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }));
        candidateAPI.logViolation(token, {
          violation_type: 'tab_switch',
          duration_sec: 0,
          details: 'Candidate switched tab or minimized window',
        }).catch(() => {});
        toast.error('Tab switch detected! Stay on the interview tab.', { duration: 4000 });
      } else {
        setTimeout(() => setTabSwitchAlert(false), 3000);
      }
    };

    const handleWindowBlur = () => {
      if (phase === 'interview' && token) {
        setTabSwitchAlert(true);
        setProctoringStats(prev => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }));
        candidateAPI.logViolation(token, {
          violation_type: 'tab_switch',
          duration_sec: 0,
          details: 'Window lost focus',
        }).catch(() => {});
      }
    };

    const handleWindowFocus = () => {
      setTimeout(() => setTabSwitchAlert(false), 3000);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [phase, token]);

  // ── WebSocket for live streaming to HR ─────────────
  useEffect(() => {
    if (phase !== 'interview' || !interviewSessionId || !token) return;

    // In production (Render), WS_BASE points to the backend; in dev, use same host
    let wsUrl;
    if (WS_BASE) {
      wsUrl = `${WS_BASE}/ws/interview/${interviewSessionId}?token=${token}&role=candidate&name=${encodeURIComponent(candidateName)}`;
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${window.location.host}/ws/interview/${interviewSessionId}?token=${token}&role=candidate&name=${encodeURIComponent(candidateName)}`;
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to interview room');
      ws.send(JSON.stringify({
        type: 'stream_ready',
        has_camera: cameraOn,
        has_screen: !!screenStreamRef.current,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      } catch {}
    };

    ws.onclose = () => console.log('[WS] Disconnected');

    return () => {
      ws.close();
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
    };
  }, [phase, interviewSessionId]);

  const handleWSMessage = useCallback(async (data) => {
    switch (data.type) {
      case 'request_stream':
        await createStreamOffer(data.from);
        break;
      case 'webrtc_answer':
        {
          const pc = peerConnectionsRef.current[data.from];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        }
        break;
      case 'ice_candidate':
        {
          const pc = peerConnectionsRef.current[data.from];
          if (pc && data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }
        break;
      default:
        break;
    }
  }, []);

  const createStreamOffer = useCallback(async (targetId) => {
    // Close existing connection to this target
    peerConnectionsRef.current[targetId]?.close();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current[targetId] = pc;

    // Add camera tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current);
      });
    }

    // Add screen share tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, screenStreamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          target: targetId,
          candidate: event.candidate.toJSON(),
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        pc.close();
        delete peerConnectionsRef.current[targetId];
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    wsRef.current?.send(JSON.stringify({
      type: 'webrtc_offer',
      target: targetId,
      offer: pc.localDescription.toJSON(),
    }));
  }, []);

  // ── Start interview ────────────────────────────────
  const startInterview = async () => {
    if (!candidateName.trim()) {
      toast.error('Please enter your name');
      return;
    }

    setPermissionDenied(false);
    setPermissionError('');

    // Request camera + mic permissions first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (err) {
      setPermissionDenied(true);
      if (err.name === 'NotAllowedError') {
        setPermissionError('Camera and microphone access is required to start the interview. Please allow access in your browser settings and try again.');
      } else if (err.name === 'NotFoundError') {
        setPermissionError('No camera or microphone found. Please connect a camera and microphone to start the interview.');
      } else {
        setPermissionError(`Unable to access camera/microphone: ${err.message}. Please check your device settings.`);
      }
      return;
    }

    // Request screen share before API call (needs user gesture)
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      setScreenSharing(true);
      screenStream.getVideoTracks()[0].onended = () => {
        screenStreamRef.current = null;
        setScreenSharing(false);
      };
    } catch {
      // Screen share is optional — candidate can decline
      console.log('Screen share not captured');
    }

    setLoading(true);
    try {
      const res = await candidateAPI.start(token, { candidate_name: candidateName });
      setSessionId(res.data.session_id);
      setInterviewSessionId(res.data.interview_session_id);
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

  // ── Submit answer (called manually or by silence detection) ──
  const doSubmit = async (answerText) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const isCoding = currentQuestion?.is_coding;
    const finalAnswer = answerText || answerRef.current;

    if (!isCoding && !finalAnswer.trim()) {
      isSubmittingRef.current = false;
      return;
    }
    if (isCoding && !codeText.trim()) {
      toast.error('Please write your code solution');
      isSubmittingRef.current = false;
      return;
    }

    stopSpeechRecognition();
    synthRef.current.cancel();
    setLoading(true);
    setEvaluation(null);

    try {
      const payload = {
        question_id: currentQuestion.question_id,
        answer_text: isCoding ? (finalAnswer || 'Code submitted') : finalAnswer,
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
            answerRef.current = '';
            setCodeText('');
            setEvaluation(null);
          }, 3000);
        } else {
          setTimeout(() => {
            setCurrentQuestion(res.data.next_question);
            setQuestionNumber((prev) => prev + 1);
            setAnswer('');
            answerRef.current = '';
            setCodeText('');
            setEvaluation(null);
          }, 3000);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit answer');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Auto-submit triggered by silence detection
  const submitAnswerAuto = useCallback(() => {
    doSubmit(answerRef.current);
  }, [currentQuestion, token, codeText, codeLanguage, currentRound]);

  // Manual submit (button click)
  const submitAnswer = () => doSubmit(answer);

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

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                <p><strong>📺 Screen Sharing:</strong> You'll be asked to share your screen when starting. This allows the HR team to monitor the interview in real-time.</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <p><strong>Two Rounds:</strong> Technical (70% cutoff to proceed) → HR</p>
              </div>

              {permissionDenied && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">Permission Required</p>
                    <p>{permissionError}</p>
                  </div>
                </div>
              )}

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
              {tabSwitchAlert && (
                <div className="absolute inset-0 flex items-center justify-center bg-purple-900/50 backdrop-blur-[2px]">
                  <div className="bg-purple-600/95 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg animate-pulse">
                    <MonitorX size={18} />
                    <span>Tab switch detected!</span>
                  </div>
                </div>
              )}
            </div>

            {/* Screen share status */}
            {screenSharing && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                <Monitor size={14} />
                <span>Screen sharing active</span>
              </div>
            )}

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

            {/* Proctoring Panel */}
            <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm text-gray-700">
                <Shield className="text-cyan-600" size={14} />
                Proctoring
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 flex items-center gap-1"><Eye size={10} /> Gaze Violations</span>
                  <span className={`text-xs font-bold ${proctoringStats.gazeViolations === 0 ? 'text-green-600' : proctoringStats.gazeViolations < 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {proctoringStats.gazeViolations}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 flex items-center gap-1"><UserX size={10} /> Multi-Person</span>
                  <span className={`text-xs font-bold ${proctoringStats.multiPersonAlerts === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {proctoringStats.multiPersonAlerts}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 flex items-center gap-1"><MonitorX size={10} /> Tab Switches</span>
                  <span className={`text-xs font-bold ${proctoringStats.tabSwitches === 0 ? 'text-green-600' : proctoringStats.tabSwitches < 3 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {proctoringStats.tabSwitches}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> Away Time</span>
                  <span className="text-xs font-bold text-gray-700">
                    {Math.round(proctoringStats.totalAwayTime)}s
                  </span>
                </div>
                {/* Integrity indicator */}
                {(() => {
                  const score = Math.max(0, 100 - (proctoringStats.gazeViolations * 3) - (proctoringStats.multiPersonAlerts * 15) - (proctoringStats.tabSwitches * 10) - (proctoringStats.totalAwayTime * 0.5));
                  return (
                    <div className="mt-2 bg-gray-50 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Integrity Score</span>
                        <span className={`text-xs font-bold ${score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {Math.round(score)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  );
                })()}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Your Answer <span className="text-gray-400">(live conversation mode)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {isRecording && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Listening
                      </span>
                    )}
                    {isSpeaking && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        <Volume2 size={12} className="animate-pulse" />
                        AI Speaking
                      </span>
                    )}
                    <button
                      onClick={toggleRecording}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                        isRecording ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      }`}
                      title={isRecording ? 'Pause mic' : 'Resume mic'}
                    >
                      {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                      {isRecording ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </div>
                <div className={`w-full min-h-[120px] px-4 py-3 border rounded-lg text-gray-700 text-base leading-relaxed ${
                  isRecording ? 'border-green-400 bg-green-50/50' : isSpeaking ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-gray-50'
                }`}>
                  {answer || (
                    <span className="text-gray-400 italic">
                      {isSpeaking ? 'AI is speaking... listen to the question' : isRecording ? '🎤 Listening... speak your answer naturally' : 'Microphone paused'}
                    </span>
                  )}
                </div>
                {isRecording && !isSpeaking && (
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2 text-green-600 text-sm">
                      <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Speak naturally — answer auto-submits after you pause</span>
                    </div>
                  </div>
                )}
                {loading && (
                  <div className="flex items-center space-x-2 mt-2 text-primary-600 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Evaluating your answer...</span>
                  </div>
                )}
                <button
                  onClick={submitAnswer}
                  disabled={loading || !answer.trim()}
                  className="mt-4 w-full gradient-bg text-white py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />}
                  <span>{loading ? 'Evaluating...' : 'Submit Early'}</span>
                </button>
              </div>
            )}

            {/* Evaluation */}
            {evaluation && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">📊 Evaluation</h3>

                {/* Code-specific evaluation scores */}
                {evaluation.code_evaluation ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                      {[
                        { label: 'Correctness', value: evaluation.code_evaluation.correctness_score, color: 'blue' },
                        { label: 'Quality', value: evaluation.code_evaluation.quality_score, color: 'indigo' },
                        { label: 'Efficiency', value: evaluation.code_evaluation.efficiency_score, color: 'orange' },
                        { label: 'Edge Cases', value: evaluation.code_evaluation.edge_case_score, color: 'green' },
                        { label: 'Overall', value: evaluation.code_evaluation.overall_score, color: 'purple' },
                      ].map((s) => (
                        <div key={s.label} className="text-center bg-gray-50 rounded-lg p-2">
                          <div className={`text-xl font-bold text-${s.color}-600`}>{Math.round(s.value || 0)}%</div>
                          <div className="text-[10px] text-gray-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {evaluation.code_evaluation.feedback && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-2">{evaluation.code_evaluation.feedback}</p>
                    )}
                  </>
                ) : (
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
                )}

                <div className={`text-sm font-medium mb-2 ${
                  evaluation.answer_strength === 'strong' ? 'text-green-600' :
                  evaluation.answer_strength === 'moderate' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  Strength: {evaluation.answer_strength?.toUpperCase()}
                </div>
                {!evaluation.code_evaluation && evaluation.feedback && (
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
