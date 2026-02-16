import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brain, Video, BarChart3, Mail, Shield, Zap } from 'lucide-react';

const features = [
  { icon: Brain, title: 'AI-Powered Questions', desc: 'Dynamic question generation using LLaMA 3 with adaptive difficulty.' },
  { icon: Video, title: 'Live Video Interviews', desc: 'WebRTC-powered real-time video sessions with HR monitoring.' },
  { icon: BarChart3, title: 'Smart Evaluation', desc: 'NLP semantic analysis, keyword matching, and emotion detection.' },
  { icon: Mail, title: 'Bulk Invitations', desc: 'Generate unique interview links and send automated email invites.' },
  { icon: Shield, title: 'Secure & Private', desc: 'JWT authentication, token-based access, and encrypted sessions.' },
  { icon: Zap, title: '100% Free & Open', desc: 'Built entirely with free, open-source tools. No paid APIs.' },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div>
      {/* Hero */}
      <section className="gradient-bg text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
            AI-Powered Interview<br />Simulator & Recruitment
          </h1>
          <p className="text-lg sm:text-xl text-purple-100 max-w-3xl mx-auto mb-10">
            Practice interviews with AI, conduct real HR sessions, evaluate candidates
            automatically — all with free & open-source tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {!user ? (
              <>
                <Link to="/register" className="bg-white text-primary-600 px-8 py-3 rounded-xl font-semibold text-lg hover:bg-gray-100 transition">
                  Get Started Free
                </Link>
                <Link to="/login" className="border-2 border-white text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-white/10 transition">
                  Sign In
                </Link>
              </>
            ) : (
              <Link
                to={user.role === 'hr' ? '/hr' : '/dashboard'}
                className="bg-white text-primary-600 px-8 py-3 rounded-xl font-semibold text-lg hover:bg-gray-100 transition"
              >
                Go to Dashboard
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">Platform Features</h2>
          <p className="text-center text-gray-500 mb-12 max-w-2xl mx-auto">
            Everything you need for AI-driven interview preparation and corporate recruitment.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <div key={i} className="p-6 rounded-2xl border border-gray-100 hover:shadow-lg transition bg-white">
                <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center mb-4">
                  <f.icon className="text-white" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How It Works</h2>
          <div className="grid md:grid-cols-2 gap-16">
            {/* Students */}
            <div>
              <h3 className="text-xl font-bold text-primary-600 mb-6">🎓 For Students</h3>
              <div className="space-y-4">
                {['Sign up and select your target role', 'AI generates dynamic interview questions', 'Answer via voice & camera', 'Receive AI-powered performance report'].map((step, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full gradient-bg text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                    <p className="text-gray-700 pt-1">{step}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* HR */}
            <div>
              <h3 className="text-xl font-bold text-primary-600 mb-6">🏢 For Companies</h3>
              <div className="space-y-4">
                {['Create interview session with role & schedule', 'Upload candidate emails for bulk invites', 'Candidates join via unique links at scheduled time', 'Monitor live feeds & get AI evaluation reports'].map((step, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full gradient-bg text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                    <p className="text-gray-700 pt-1">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm">AI Interview Platform — Built with React, FastAPI, LLaMA 3, Whisper & WebRTC</p>
          <p className="text-xs mt-2">100% Free & Open Source</p>
        </div>
      </footer>
    </div>
  );
}
