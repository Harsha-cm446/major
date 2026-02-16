import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { interviewAPI } from '../services/api';
import { Plus, Users, Calendar, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function HRDashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage interview sessions and candidates</p>
        </div>
        <Link
          to="/hr/create-session"
          className="mt-4 sm:mt-0 gradient-bg text-white px-5 py-2.5 rounded-xl font-medium flex items-center space-x-2 hover:opacity-90"
        >
          <Plus size={18} />
          <span>New Session</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Candidates</p>
              <p className="text-2xl font-bold text-gray-900">
                {sessions.reduce((a, s) => a + (s.candidate_count || 0), 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="text-purple-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900">
                {sessions.filter((s) => s.status !== 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      {loading ? (
        <p className="text-gray-400">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <Calendar className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 mb-4">No interview sessions yet.</p>
          <Link to="/hr/create-session" className="gradient-bg text-white px-6 py-2.5 rounded-lg font-medium">
            Create Your First Session
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-gray-900 text-lg">{s.job_role}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  s.status === 'completed' ? 'bg-green-100 text-green-700'
                    : s.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {s.status}
                </span>
              </div>
              {s.company_name && (
                <p className="text-sm text-gray-500 mb-2">{s.company_name}</p>
              )}
              <div className="text-sm text-gray-500 space-y-1 mb-4">
                <p>📅 {new Date(s.scheduled_time).toLocaleString()}</p>
                <p>⏱️ {s.duration_minutes} minutes</p>
                <p>👥 {s.candidate_count} candidates</p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/hr/session/${s.id}`}
                  className="flex-1 text-center bg-primary-50 text-primary-700 py-2 rounded-lg text-sm font-medium hover:bg-primary-100"
                >
                  Manage
                </Link>
                <Link
                  to={`/hr/live/${s.id}`}
                  className="flex-1 text-center gradient-bg text-white py-2 rounded-lg text-sm font-medium hover:opacity-90"
                >
                  Go Live
                </Link>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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
