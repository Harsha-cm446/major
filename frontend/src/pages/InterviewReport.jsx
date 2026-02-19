import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Download, Loader2, CheckCircle, XCircle, AlertTriangle, FileBarChart } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export default function InterviewReport() {
  const { sessionId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRoundTab, setActiveRoundTab] = useState('all');

  useEffect(() => {
    mockAPI.getReport(sessionId)
      .then((r) => setReport(r.data))
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const downloadPDF = async () => {
    try {
      const res = await mockAPI.getReportPDF(sessionId);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview_report_${sessionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score) => {
    if (score >= 70) return 'bg-green-50 border-green-200';
    if (score >= 40) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getStrengthBadge = (strength) => {
    if (strength === 'strong') return 'bg-green-100 text-green-700';
    if (strength === 'moderate') return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <span className="inline-block w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return <div className="text-center py-20 text-gray-500">Report not found.</div>;
  }

  const scores = report.overall_scores;
  const roundSummary = report.round_summary;

  const radarData = [
    { subject: 'Content', score: scores.content_score },
    { subject: 'Keywords', score: scores.keyword_score },
    { subject: 'Depth', score: scores.depth_score },
    { subject: 'Communication', score: scores.communication_score },
    { subject: 'Confidence', score: scores.confidence_score },
  ];

  // Filter evaluations by round tab
  const filteredEvaluations = activeRoundTab === 'all'
    ? report.question_evaluations
    : report.question_evaluations.filter(
        (qe) => qe.round?.toLowerCase() === activeRoundTab
      );

  const barData = filteredEvaluations.map((qe, i) => ({
    name: `Q${i + 1}`,
    Content: qe.scores.content_score,
    Keywords: qe.scores.keyword_score,
    Depth: qe.scores.depth_score,
    Overall: qe.scores.overall_score,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 slide-up">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center shadow-sm flex-shrink-0">
            <FileBarChart className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Performance Report</h1>
            <p className="text-gray-500 mt-1">
              {report.job_role} • {report.total_questions} questions •{' '}
              {report.technical_questions} technical, {report.hr_questions} HR
            </p>
          </div>
        </div>
        <button
          onClick={downloadPDF}
          className="mt-4 sm:mt-0 gradient-bg text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:opacity-90 shadow-md transition-all"
        >
          <Download size={18} />
          <span>Download PDF</span>
        </button>
      </div>

      {/* Recommendation Banner */}
      {report.recommendation && (
        <div className={`rounded-xl p-5 mb-6 border flex items-start space-x-3 ${
          report.recommendation === 'Selected'
            ? 'bg-green-50 border-green-200'
            : report.recommendation.startsWith('Maybe')
            ? 'bg-yellow-50 border-yellow-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {report.recommendation === 'Selected' ? (
            <CheckCircle size={22} className="text-green-600 flex-shrink-0 mt-0.5" />
          ) : report.recommendation.startsWith('Maybe') ? (
            <AlertTriangle size={22} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle size={22} className="text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`font-semibold ${
              report.recommendation === 'Selected' ? 'text-green-800'
                : report.recommendation.startsWith('Maybe') ? 'text-yellow-800' : 'text-red-800'
            }`}>
              Recommendation: {report.recommendation}
            </p>
            {report.confidence_analysis && (
              <p className="text-sm text-gray-600 mt-1">{report.confidence_analysis}</p>
            )}
          </div>
        </div>
      )}

      {/* Two-Round Summary Cards */}
      {roundSummary && (
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {/* Technical Round */}
          <div className={`rounded-xl p-5 border ${getScoreBg(roundSummary.technical?.score || 0)}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">Technical Round</h3>
              {roundSummary.technical?.passed ? (
                <CheckCircle size={18} className="text-green-600" />
              ) : (
                <XCircle size={18} className="text-red-500" />
              )}
            </div>
            <div className={`text-3xl font-bold ${getScoreColor(roundSummary.technical?.score || 0)}`}>
              {Math.round(roundSummary.technical?.score || 0)}%
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {roundSummary.technical?.questions_asked || 0} questions • Cutoff: 70%
            </p>
          </div>

          {/* HR Round */}
          <div className={`rounded-xl p-5 border ${getScoreBg(roundSummary.hr?.score || 0)}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">HR Round</h3>
              {roundSummary.hr?.questions_asked > 0 ? (
                roundSummary.hr?.passed ? (
                  <CheckCircle size={18} className="text-green-600" />
                ) : (
                  <XCircle size={18} className="text-red-500" />
                )
              ) : (
                <span className="text-xs text-gray-400">N/A</span>
              )}
            </div>
            <div className={`text-3xl font-bold ${
              roundSummary.hr?.questions_asked > 0
                ? getScoreColor(roundSummary.hr?.score || 0)
                : 'text-gray-300'
            }`}>
              {roundSummary.hr?.questions_asked > 0
                ? `${Math.round(roundSummary.hr?.score || 0)}%`
                : '—'}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {roundSummary.hr?.questions_asked > 0
                ? `${roundSummary.hr.questions_asked} questions • Cutoff: 60%`
                : 'Not reached (technical cutoff not met)'}
            </p>
          </div>

          {/* Overall */}
          <div className={`rounded-xl p-5 border ${getScoreBg(report.overall_score || 0)}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">Overall Score</h3>
            </div>
            <div className={`text-3xl font-bold ${getScoreColor(report.overall_score || 0)}`}>
              {Math.round(report.overall_score || 0)}%
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Combined across {report.total_questions} questions
            </p>
          </div>
        </div>
      )}

      {/* Detailed Scores */}
      <div className="grid sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Content (40%)', value: scores.content_score, color: 'blue' },
          { label: 'Keywords (20%)', value: scores.keyword_score, color: 'indigo' },
          { label: 'Depth (15%)', value: scores.depth_score, color: 'purple' },
          { label: 'Communication (15%)', value: scores.communication_score, color: 'green' },
          { label: 'Confidence (10%)', value: scores.confidence_score, color: 'yellow' },
        ].map((s) => (
          <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 text-center border border-gray-100 shadow-sm card-hover">
            <div className={`text-3xl font-bold ${getScoreColor(s.value)}`}>{Math.round(s.value)}%</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Communication & Confidence Feedback */}
      {(report.communication_feedback || report.confidence_analysis) && (
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {report.communication_feedback && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-blue-700 mb-3">🗣️ Communication Feedback</h3>
              <p className="text-sm text-gray-700">{report.communication_feedback}</p>
            </div>
          )}
          {report.confidence_analysis && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-purple-700 mb-3">🎯 Confidence Analysis</h3>
              <p className="text-sm text-gray-700">{report.confidence_analysis}</p>
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-gray-900 mb-4">Skill Radar</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} />
              <Radar name="Score" dataKey="score" stroke="#667eea" fill="#667eea" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-gray-900 mb-4">Question-wise Scores</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Content" fill="#3b82f6" />
              <Bar dataKey="Keywords" fill="#6366f1" />
              <Bar dataKey="Depth" fill="#8b5cf6" />
              <Bar dataKey="Overall" fill="#667eea" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-green-700 mb-3">✅ Strengths</h3>
          <ul className="space-y-2">
            {report.strengths?.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start space-x-2">
                <span className="text-green-500 mt-0.5">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-red-700 mb-3">⚠️ Areas for Improvement</h3>
          <ul className="space-y-2">
            {report.weaknesses?.map((w, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start space-x-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Suggestions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
        <h3 className="font-semibold text-yellow-700 mb-3">💡 Improvement Suggestions</h3>
        <ul className="space-y-2">
          {report.improvement_suggestions?.map((s, i) => (
            <li key={i} className="text-sm text-gray-700 flex items-start space-x-2">
              <span className="font-medium text-yellow-600">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ═══ AI-Powered Performance Analysis (Explainability) ═══ */}
      {report.explainability && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <h3 className="font-semibold text-indigo-700 mb-4">🔍 AI-Powered Performance Analysis</h3>

          {/* Explanation text */}
          {report.explainability.explanation && (
            <p className="text-sm text-gray-700 mb-4 bg-indigo-50 p-3 rounded-lg">{report.explainability.explanation}</p>
          )}

          {/* Dimension scores */}
          {report.explainability.dimension_scores && (
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Dimension Breakdown</h4>
              <div className="space-y-3">
                {Object.entries(report.explainability.dimension_scores).map(([dim, data]) => {
                  const score = data?.score || 0;
                  const grade = data?.grade || 'N/A';
                  const barColor = score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
                  const gradeColor = score >= 70 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
                  return (
                    <div key={dim} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700 w-40">{dim}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${Math.min(score, 100)}%` }} />
                      </div>
                      <span className={`text-sm font-bold w-12 text-right ${gradeColor}`}>{Math.round(score)}%</span>
                      <span className={`text-xs font-medium ${gradeColor} w-28`}>{grade}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top factors */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {report.explainability.top_positive_factors?.length > 0 && (
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-green-700 mb-2">Key Strengths</h4>
                {report.explainability.top_positive_factors.slice(0, 4).map((f, i) => (
                  <div key={i} className="text-xs text-gray-700 flex justify-between py-0.5">
                    <span>{f.feature?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase())}</span>
                    <span className="text-green-600 font-medium">+{f.impact?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {report.explainability.top_negative_factors?.length > 0 && (
              <div className="bg-red-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-700 mb-2">Key Weaknesses</h4>
                {report.explainability.top_negative_factors.slice(0, 4).map((f, i) => (
                  <div key={i} className="text-xs text-gray-700 flex justify-between py-0.5">
                    <span>{f.feature?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase())}</span>
                    <span className="text-red-600 font-medium">{f.impact?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Targeted suggestions from explainability */}
          {report.explainability.improvement_suggestions?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Targeted Actions</h4>
              <div className="space-y-2">
                {report.explainability.improvement_suggestions.slice(0, 6).map((s, i) => {
                  const pColor = s.priority === 'high' ? 'bg-red-100 text-red-700' : s.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600';
                  return (
                    <div key={i} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${pColor}`}>{s.priority}</span>
                        <span className="text-xs font-semibold text-gray-800">{s.category}</span>
                        <span className="text-xs text-gray-400 ml-auto">Current: {Math.round(s.current_score || 0)}%</span>
                      </div>
                      <p className="text-xs text-gray-600">{s.suggestion}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Development Roadmap ═══ */}
      {report.development_roadmap && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <h3 className="font-semibold text-indigo-700 mb-4">🗺️ Personalized Development Roadmap</h3>

          {/* Profile summary */}
          {report.development_roadmap.candidate_profile && (
            <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-600">
              <span className="bg-gray-100 px-3 py-1 rounded-full">
                Target: {report.development_roadmap.candidate_profile.target_role || 'General'}
              </span>
              <span className="bg-gray-100 px-3 py-1 rounded-full">
                Duration: {report.development_roadmap.candidate_profile.total_weeks || 8} weeks
              </span>
              <span className="bg-gray-100 px-3 py-1 rounded-full">
                Current Score: {Math.round(report.development_roadmap.candidate_profile.overall_score || 0)}%
              </span>
            </div>
          )}

          {/* Dimension analysis */}
          {report.development_roadmap.dimension_analysis && (() => {
            const da = report.development_roadmap.dimension_analysis;
            return (
              <div className="flex flex-wrap gap-2 mb-5">
                {da.weak_areas?.map(a => (
                  <span key={a.name} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                    ⚠️ {a.name} ({Math.round(a.score)}%)
                  </span>
                ))}
                {da.moderate_areas?.map(a => (
                  <span key={a.name} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                    📊 {a.name} ({Math.round(a.score)}%)
                  </span>
                ))}
                {da.strong_areas?.map(a => (
                  <span key={a.name} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    ✅ {a.name} ({Math.round(a.score)}%)
                  </span>
                ))}
              </div>
            );
          })()}

          {/* 4 Phases */}
          <div className="space-y-4">
            {report.development_roadmap.phases?.map((phase, i) => {
              const phaseColors = [
                { bg: 'bg-red-50', border: 'border-red-200', header: 'bg-red-600', text: 'text-red-700' },
                { bg: 'bg-yellow-50', border: 'border-yellow-200', header: 'bg-yellow-500', text: 'text-yellow-700' },
                { bg: 'bg-blue-50', border: 'border-blue-200', header: 'bg-blue-600', text: 'text-blue-700' },
                { bg: 'bg-green-50', border: 'border-green-200', header: 'bg-green-600', text: 'text-green-700' },
              ];
              const c = phaseColors[i] || phaseColors[0];
              return (
                <details key={i} className={`${c.bg} rounded-xl border ${c.border} overflow-hidden`}>
                  <summary className="px-5 py-3 cursor-pointer hover:opacity-90 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`${c.header} text-white text-xs px-3 py-1 rounded-full font-bold`}>
                        Phase {phase.phase || i + 1}
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">{phase.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{phase.duration_weeks} weeks • {phase.daily_commitment}</span>
                  </summary>
                  <div className="px-5 pb-4 space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-600 italic">{phase.objective}</p>
                    {phase.focus_areas?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {phase.focus_areas.map((f, fi) => (
                          <span key={fi} className={`text-[10px] ${c.text} bg-white/60 px-2 py-0.5 rounded-full`}>{f}</span>
                        ))}
                      </div>
                    )}
                    {phase.tasks?.length > 0 && (
                      <ul className="space-y-1">
                        {phase.tasks.slice(0, 5).map((t, ti) => (
                          <li key={ti} className="text-xs text-gray-700 flex items-start gap-1">
                            <span className={t.priority === 'high' ? 'text-red-500' : 'text-gray-400'}>
                              {t.priority === 'high' ? '★' : '–'}
                            </span>
                            <span><strong>{t.title}:</strong> {t.description?.substring(0, 120)}{t.description?.length > 120 ? '...' : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[10px] text-gray-500 mt-1">Success criteria: {phase.success_criteria}</p>
                  </div>
                </details>
              );
            })}
          </div>

          {/* Progress targets */}
          {report.development_roadmap.progress_metrics?.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">📈 Progress Targets</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {report.development_roadmap.progress_metrics.map((m, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-gray-500 font-medium mb-1">{m.dimension}</div>
                    <div className="text-sm font-bold text-gray-800">
                      {Math.round(m.baseline)}% → {Math.round(m.target)}%
                    </div>
                    <div className="text-[10px] text-indigo-600 mt-0.5">+{Math.round(m.improvement_needed)}% needed</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Question Breakdown with Round Filter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Question Breakdown</h2>
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'technical', label: `Technical (${report.technical_questions})` },
              { key: 'hr', label: `HR (${report.hr_questions})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveRoundTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  activeRoundTab === tab.key
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEvaluations.map((qe, i) => (
          <details key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <summary className="px-6 py-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  qe.round === 'HR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {qe.round || 'Technical'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  qe.difficulty === 'hard' ? 'bg-red-100 text-red-700'
                    : qe.difficulty === 'easy' ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {qe.difficulty || 'medium'}
                </span>
                <span className="font-medium text-gray-900 truncate max-w-md">
                  Q{i + 1}: {qe.question?.substring(0, 70)}{qe.question?.length > 70 ? '...' : ''}
                </span>
              </div>
              <div className="flex items-center space-x-3 flex-shrink-0">
                {qe.answer_strength && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStrengthBadge(qe.answer_strength)}`}>
                    {qe.answer_strength}
                  </span>
                )}
                <span className={`text-sm font-bold ${getScoreColor(qe.scores.overall_score)}`}>
                  {Math.round(qe.scores.overall_score)}%
                </span>
              </div>
            </summary>
            <div className="px-6 pb-6 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Your Answer</p>
                <p className="text-sm text-gray-700 mt-1">{qe.answer}</p>
              </div>
              {qe.ideal_answer && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Ideal Answer</p>
                  <p className="text-sm text-gray-700 mt-1">{qe.ideal_answer}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Feedback</p>
                <p className="text-sm text-gray-700 mt-1">{qe.feedback}</p>
              </div>

              {/* Detailed Scores for this question */}
              <div className="grid grid-cols-5 gap-2 mt-2">
                {[
                  { label: 'Content', value: qe.scores.content_score },
                  { label: 'Keywords', value: qe.scores.keyword_score },
                  { label: 'Depth', value: qe.scores.depth_score },
                  { label: 'Comm.', value: qe.scores.communication_score },
                  { label: 'Confidence', value: qe.scores.confidence_score },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
                    <div className={`text-sm font-bold ${getScoreColor(s.value)}`}>{Math.round(s.value)}%</div>
                    <div className="text-[10px] text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-2 mt-2">
                {qe.keywords_matched?.map((k) => (
                  <span key={k} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ {k}</span>
                ))}
                {qe.keywords_missed?.map((k) => (
                  <span key={k} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">✗ {k}</span>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
