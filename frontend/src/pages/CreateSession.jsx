import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { interviewAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export default function CreateSession() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    job_role: '',
    scheduled_time: '',
    duration_minutes: 30,
    company_name: '',
    description: '',
    job_description: '',
    experience_level: 'mid',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await interviewAPI.createSession({
        ...form,
        duration_minutes: parseInt(form.duration_minutes),
        scheduled_time: new Date(form.scheduled_time).toISOString(),
      });
      toast.success('Session created!');
      navigate(`/hr/session/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Interview Session</h1>
      <p className="text-gray-500 mb-8">Set up a new interview and invite candidates.</p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Role *</label>
            <input
              name="job_role"
              value={form.job_role}
              onChange={handleChange}
              required
              placeholder="e.g. Software Engineer"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              placeholder="e.g. Acme Corp"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date & Time *</label>
              <input
                name="scheduled_time"
                type="datetime-local"
                value={form.scheduled_time}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
              <select
                name="duration_minutes"
                value={form.duration_minutes}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description *</label>
            <textarea
              name="job_description"
              value={form.job_description}
              onChange={handleChange}
              required
              rows={5}
              placeholder="Paste the full job description here. Include required skills, responsibilities, qualifications, and tools/technologies..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
            <p className="mt-1 text-xs text-gray-400">AI will generate interview questions based on this JD.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Experience Level *</label>
            <select
              name="experience_level"
              value={form.experience_level}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="fresher">Fresher (0-1 years)</option>
              <option value="junior">Junior (1-3 years)</option>
              <option value="mid">Mid-Level (3-5 years)</option>
              <option value="senior">Senior (5-8 years)</option>
              <option value="lead">Lead / Staff (8+ years)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Optional session description or instructions for candidates..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-bg text-white py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : null}
            <span>{loading ? 'Creating...' : 'Create Session'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
