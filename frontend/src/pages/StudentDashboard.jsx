import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { mockAPI } from '../services/api';
import { Play, History, Trophy, TrendingUp } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mockAPI.history().then((r) => setHistory(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const completed = history.filter((h) => h.status === 'completed');
  const avgScore = completed.length
    ? Math.round(completed.reduce((a, b) => a + (b.overall_score || 0), 0) / completed.length)
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user?.name}!</h1>
        <p className="text-gray-500 mt-1">Ready for your next practice session?</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <History className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{history.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Trophy className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold text-gray-900">{completed.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="text-purple-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Score</p>
              <p className="text-2xl font-bold text-gray-900">{avgScore}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Start Practice */}
      <div className="bg-gradient-to-r from-primary-500 to-purple-600 rounded-2xl p-8 text-white mb-10">
        <div className="flex flex-col sm:flex-row items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Start a Mock Interview</h2>
            <p className="text-purple-100">Practice with AI-generated questions tailored to your role.</p>
          </div>
          <Link
            to="/mock-interview"
            className="mt-4 sm:mt-0 bg-white text-primary-600 px-6 py-3 rounded-xl font-semibold flex items-center space-x-2 hover:bg-gray-100 transition"
          >
            <Play size={18} />
            <span>Start Practice</span>
          </Link>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Interview History</h2>
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
            <p className="text-gray-500">No interviews yet. Start your first practice session!</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difficulty</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{h.job_role}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{h.difficulty}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{h.answered}/{h.total_questions}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        h.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(h.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {h.status === 'completed' && (
                        <Link to={`/report/${h.id}`} className="text-primary-600 text-sm font-medium hover:underline">
                          View Report
                        </Link>
                      )}
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
