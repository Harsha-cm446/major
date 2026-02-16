import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Download, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
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
        <Loader2 className="animate-spin text-primary-500" size={40} />
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Performance Report</h1>
          <p className="text-gray-500 mt-1">
            {report.job_role} • {report.total_questions} questions •{' '}
            {report.technical_questions} technical, {report.hr_questions} HR
          </p>
        </div>
        <button
          onClick={downloadPDF}
          className="mt-4 sm:mt-0 gradient-bg text-white px-5 py-2.5 rounded-xl font-medium flex items-center space-x-2 hover:opacity-90"
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
          <div key={s.label} className="bg-white rounded-xl p-5 text-center border border-gray-100 shadow-sm">
            <div className={`text-3xl font-bold ${getScoreColor(s.value)}`}>{Math.round(s.value)}%</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Skill Radar</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} />
              <Radar name="Score" dataKey="score" stroke="#667eea" fill="#667eea" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Question-wise Scores</h3>
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
