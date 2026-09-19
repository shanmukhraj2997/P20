import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
  title: 'P20 Campus Resource Booking Platform',
  description: 'Unified Campus Resource, Laboratory & Facility Booking Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
