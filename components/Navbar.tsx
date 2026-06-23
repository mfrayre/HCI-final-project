'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { clearUserId, isLoggedIn } from '@/lib/auth';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const loggedIn = isLoggedIn();

  const handleLogout = () => {
    // Close the menu first
    setShowMenu(false);
    
    // Clear user ID before clearing everything else
    clearUserId();
    
    // Clear React Query cache
    queryClient.clear();
    
    // Clear all localStorage data (this will also clear the user ID, but we already cleared it explicitly)
    localStorage.clear();
    
    // Clear all sessionStorage data
    sessionStorage.clear();
    
    // Use replace instead of href to prevent back button from going to logged-in state
    // Add a timestamp to force a fresh page load
    window.location.replace(`/?logout=${Date.now()}`);
  };

  return (
    <nav className="bg-gradient-to-r from-[#1b7a4d] to-[#0d4a2c] shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex">
            <Link href="/" className="flex items-center space-x-3">
              {/* Logo */}
              <div className="flex-shrink-0">
                <Image
                  src="/dartmouth-logo.webp"
                  alt="Dartmouth Logo"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
              </div>
              <span className="text-2xl font-bold text-white">DartActuallyWorks</span>
            </Link>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                href="/"
                className={`inline-flex items-center px-4 py-2 border-b-3 text-sm font-semibold transition-all ${
                  pathname === '/'
                    ? 'border-[#00a651] text-white'
                    : 'border-transparent text-green-100 hover:text-white'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/search"
                className={`inline-flex items-center px-4 py-2 border-b-3 text-sm font-semibold transition-all ${
                  pathname === '/search'
                    ? 'border-[#00a651] text-white'
                    : 'border-transparent text-green-100 hover:text-white'
                }`}
              >
                Search
              </Link>
              <Link
                href="/majors"
                className={`inline-flex items-center px-4 py-2 border-b-3 text-sm font-semibold transition-all ${
                  pathname === '/majors'
                    ? 'border-[#00a651] text-white'
                    : 'border-transparent text-green-100 hover:text-white'
                }`}
              >
                Pathways
              </Link>
              {loggedIn && (
                <Link
                  href="/profile"
                  className={`inline-flex items-center px-4 py-2 border-b-3 text-sm font-semibold transition-all ${
                    pathname === '/profile'
                      ? 'border-[#00a651] text-white'
                      : 'border-transparent text-green-100 hover:text-white'
                  }`}
                >
                  Profile
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center">
            {loggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00a651] transition-all"
                >
                  <div className="h-10 w-10 rounded-full bg-[#00a651] flex items-center justify-center text-white font-semibold text-lg shadow-md hover:shadow-lg">
                    MU
                  </div>
                  <svg
                    className="ml-2 h-5 w-5 text-white"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-xl bg-white ring-1 ring-black ring-opacity-10 z-50 overflow-hidden">
                    <div className="py-2">
                      <Link
                        href="/profile"
                        className="block px-6 py-3 text-sm font-medium text-gray-700 hover:bg-green-50 hover:text-[#1b7a4d] transition-colors"
                        onClick={() => setShowMenu(false)}
                      >
                        Profile & Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-6 py-3 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors border-t border-gray-100"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="px-6 py-2 bg-[#00a651] text-white text-sm font-semibold rounded-lg hover:bg-[#00873f] shadow-md hover:shadow-lg transition-all transform hover:scale-105 active:scale-95"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

