import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { interviewAPI } from '../services/api';
import { Plus, Users, Calendar, Trash2, Clock, ArrowRight, Briefcase, LogOut, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function HRDashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [endingSessionId, setEndingSessionId] = useState(null);

  const load = () => {
    interviewAPI.listSessions()
      .then((r) => setSessions(r.data))
      .catch(() => toast.error('Failed to load sessions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this session and all its candidates?')) return;
    try {
      await interviewAPI.deleteSession(id);
      toast.success('Session deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleEndSession = async (id) => {
    if (!confirm('End this session? This will force-complete all in-progress candidate interviews.')) return;
    setEndingSessionId(id);
    try {
      await interviewAPI.endSession(id);
      toast.success('Session ended');
      load();
    } catch {
      toast.error('Failed to end session');
    } finally {
      setEndingSessionId(null);
    }
  };

  const statusStyle = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      default: return 'bg-amber-100 text-amber-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 slide-up">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage interview sessions and candidates</p>
        </div>
        <Link
          to="/hr/create-session"
          className="mt-4 sm:mt-0 gradient-bg text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:opacity-90 shadow-md hover:shadow-lg transition-all"
        >
          <Plus size={18} />
          <span>New Session</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        {[
          { icon: Calendar, color: 'blue', label: 'Total Sessions', value: sessions.length },
          { icon: Users, color: 'green', label: 'Total Candidates', value: sessions.reduce((a, s) => a + (s.candidate_count || 0), 0) },
          { icon: Briefcase, color: 'purple', label: 'Active Sessions', value: sessions.filter((s) => s.status !== 'completed').length },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 card-hover">
            <div className="flex items-center space-x-4">
              <div className={`w-12 h-12 rounded-xl bg-${stat.color}-100 flex items-center justify-center`}>
                <stat.icon className={`text-${stat.color}-600`} size={22} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <span className="inline-block w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white/80 backdrop-blur rounded-2xl p-14 text-center border border-gray-100">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Calendar className="text-gray-300" size={36} />
          </div>
          <p className="text-gray-600 font-medium mb-1">No interview sessions yet</p>
          <p className="text-gray-400 text-sm mb-6">Create your first session to start interviewing candidates.</p>
          <Link to="/hr/create-session" className="gradient-bg text-white px-7 py-3 rounded-xl font-semibold shadow-md inline-flex items-center gap-2">
            <Plus size={18} /> Create First Session
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((s, i) => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 card-hover" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{s.job_role}</h3>
                  {s.company_name && (
                    <p className="text-sm text-gray-500 mt-0.5">{s.company_name}</p>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusStyle(s.status)}`}>
                  {s.status?.replace('_', ' ')}
                </span>
              </div>
              <div className="space-y-2.5 mb-5">
                <div className="flex items-center gap-2.5 text-sm text-gray-500">
                  <Calendar size={15} className="text-gray-400" />
                  <span>{new Date(s.scheduled_time).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-500">
                  <Clock size={15} className="text-gray-400" />
                  <span>{s.duration_minutes} minutes</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-500">
                  <Users size={15} className="text-gray-400" />
                  <span>{s.candidate_count} candidates</span>
                </div>
              </div>
              <div className="flex gap-2 pt-4 border-t border-gray-100">
                <Link
                  to={`/hr/session/${s.id}`}
                  className="flex-1 text-center bg-gray-50 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-all"
                >
                  Manage
                </Link>
                <Link
                  to={`/hr/live/${s.id}`}
                  className="flex-1 text-center gradient-bg text-white py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-1"
                >
                  Go Live <ArrowRight size={14} />
                </Link>
                {s.status !== 'completed' && (
                  <button
                    onClick={() => handleEndSession(s.id)}
                    disabled={endingSessionId === s.id}
                    className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                    title="End Session"
                  >
                    {endingSessionId === s.id ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
