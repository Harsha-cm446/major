import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Menu, X } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="font-bold text-xl text-gray-800 hidden sm:block">
                InterviewAI
              </span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-4">
            {!user ? (
              <>
                <Link to="/login" className="text-gray-600 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                  Login
                </Link>
                <Link to="/register" className="gradient-bg text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
                  Get Started
                </Link>
              </>
            ) : (
              <>
                {user.role === 'student' && (
                  <>
                    <Link to="/dashboard" className="text-gray-600 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                      Dashboard
                    </Link>
                    <Link to="/mock-interview" className="text-gray-600 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                      Practice
                    </Link>
                  </>
                )}
                {(user.role === 'hr' || user.role === 'admin') && (
                  <>
                    <Link to="/hr" className="text-gray-600 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                      Dashboard
                    </Link>
                    <Link to="/hr/create-session" className="text-gray-600 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                      New Session
                    </Link>
                  </>
                )}
                <div className="flex items-center space-x-3 ml-4 pl-4 border-l border-gray-200">
                  <div className="flex items-center space-x-2">
                    <User size={16} className="text-gray-500" />
                    <span className="text-sm text-gray-700">{user.name}</span>
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full capitalize">{user.role}</span>
                  </div>
                  <button onClick={handleLogout} className="text-gray-400 hover:text-red-500" title="Logout">
                    <LogOut size={18} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setOpen(!open)} className="text-gray-500">
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {open && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {!user ? (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Login</Link>
                <Link to="/register" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Register</Link>
              </>
            ) : (
              <>
                {user.role === 'student' && (
                  <>
                    <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Dashboard</Link>
                    <Link to="/mock-interview" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Practice</Link>
                  </>
                )}
                {(user.role === 'hr' || user.role === 'admin') && (
                  <>
                    <Link to="/hr" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Dashboard</Link>
                    <Link to="/hr/create-session" onClick={() => setOpen(false)} className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md">New Session</Link>
                  </>
                )}
                <button onClick={() => { handleLogout(); setOpen(false); }} className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded-md">
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
