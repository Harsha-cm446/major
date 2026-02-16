import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { interviewAPI, candidateAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Mail, Users, Copy, Loader2, Eye } from 'lucide-react';

export default function SessionDetail() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [publicUrl, setPublicUrl] = useState(window.location.origin);

  const load = async () => {
    try {
      const [sRes, cRes, urlRes] = await Promise.all([
        interviewAPI.getSession(sessionId),
        interviewAPI.listCandidates(sessionId),
        candidateAPI.getPublicUrl(),
      ]);
      setSession(sRes.data);
      setCandidates(cRes.data);
      if (urlRes.data.public_url) setPublicUrl(urlRes.data.public_url);
    } catch {
      toast.error('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sessionId]);

  const handleInvite = async () => {
    const emails = emailInput
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes('@'));

    if (emails.length === 0) {
      toast.error('Enter valid email addresses');
      return;
    }

    setInviting(true);
    try {
      await interviewAPI.inviteCandidates(sessionId, emails);
      toast.success(`${emails.length} candidate(s) invited!`);
      setEmailInput('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send invites');
    } finally {
      setInviting(false);
    }
  };

  const copyLink = (token) => {
    const link = `${publicUrl}/interview/${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    );
  }

  if (!session) {
    return <div className="text-center py-20 text-gray-500">Session not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Session info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session.job_role}</h1>
            {session.company_name && <p className="text-gray-500">{session.company_name}</p>}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
              <span>📅 {new Date(session.scheduled_time).toLocaleString()}</span>
              <span>⏱️ {session.duration_minutes} min</span>
              <span>👥 {session.candidate_count} candidates</span>
            </div>
          </div>
          <Link
            to={`/hr/live/${sessionId}`}
            className="mt-4 sm:mt-0 gradient-bg text-white px-5 py-2.5 rounded-xl font-medium flex items-center space-x-2 hover:opacity-90"
          >
            <Eye size={18} />
            <span>Monitor Interviews</span>
          </Link>
        </div>
      </div>

      {/* Invite section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Mail size={20} className="text-primary-500" />
          <span>Invite Candidates</span>
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Enter candidate email addresses (one per line, or comma-separated). Each candidate will receive a unique link to an AI-conducted interview.
        </p>
        <textarea
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          rows={4}
          placeholder="candidate1@example.com&#10;candidate2@example.com&#10;candidate3@example.com"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none font-mono text-sm"
        />
        <button
          onClick={handleInvite}
          disabled={inviting || !emailInput.trim()}
          className="mt-3 gradient-bg text-white px-6 py-2.5 rounded-lg font-medium flex items-center space-x-2 hover:opacity-90 disabled:opacity-50"
        >
          {inviting ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
          <span>{inviting ? 'Sending...' : 'Send Invitations'}</span>
        </button>
      </div>

      {/* Candidate list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Users size={20} className="text-primary-500" />
          <span>Candidates ({candidates.length})</span>
        </h2>
        {candidates.length === 0 ? (
          <p className="text-gray-400 text-sm">No candidates invited yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {candidates.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{c.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        c.status === 'joined' ? 'bg-green-100 text-green-700'
                          : c.status === 'completed' ? 'bg-blue-100 text-blue-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyLink(c.unique_token)}
                        className="text-primary-600 hover:text-primary-800 flex items-center space-x-1 text-sm"
                      >
                        <Copy size={14} />
                        <span>Copy Link</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
