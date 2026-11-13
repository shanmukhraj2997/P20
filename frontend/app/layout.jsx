import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
  title: 'P20 Campus Resource Booking Platform - Lovely Professional University',
  description: 'Unified Campus Resource, Laboratory & Facility Booking Platform at Lovely Professional University',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#F5F5F5] text-[#111111] min-h-screen font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
