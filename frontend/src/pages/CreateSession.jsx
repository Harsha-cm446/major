import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { interviewAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Loader2, Briefcase, ArrowRight } from 'lucide-react';

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
        // Send the datetime-local value directly (without UTC conversion)
        // so the stored time matches what the HR intended for the email
        scheduled_time: form.scheduled_time,
      });
      toast.success('Session created!');
      navigate(`/hr/session/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="slide-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center shadow-sm">
            <Briefcase className="text-white" size={20} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create Interview Session</h1>
        </div>
        <p className="text-gray-500 mb-8 ml-[52px]">Set up a new interview and invite candidates.</p>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Job Role *</label>
            <input
              name="job_role"
              value={form.job_role}
              onChange={handleChange}
              required
              placeholder="e.g. Software Engineer"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Company Name</label>
            <input
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              placeholder="e.g. Acme Corp"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Scheduled Date & Time *</label>
              <input
                name="scheduled_time"
                type="datetime-local"
                value={form.scheduled_time}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Duration (minutes)</label>
              <select
                name="duration_minutes"
                value={form.duration_minutes}
                onChange={handleChange}
                className={inputClass}
              >
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Job Description *</label>
            <textarea
              name="job_description"
              value={form.job_description}
              onChange={handleChange}
              required
              rows={5}
              placeholder="Paste the full job description here. Include required skills, responsibilities, qualifications, and tools/technologies..."
              className={inputClass + " resize-none"}
            />
            <p className="mt-1.5 text-xs text-gray-400">AI will generate interview questions based on this JD.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Experience Level *</label>
            <select
              name="experience_level"
              value={form.experience_level}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="fresher">Fresher (0-1 years)</option>
              <option value="junior">Junior (1-3 years)</option>
              <option value="mid">Mid-Level (3-5 years)</option>
              <option value="senior">Senior (5-8 years)</option>
              <option value="lead">Lead / Staff (8+ years)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Optional session description or instructions for candidates..."
              className={inputClass + " resize-none"}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-bg text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Create Session <ArrowRight size={18} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
