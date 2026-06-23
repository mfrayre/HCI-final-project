'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function ConditionalNavbar() {
  const pathname = usePathname();
  
  // Show navbar on all pages (including login page so users can navigate)
  return <Navbar />;
}

