import type { Metadata } from 'next'
import { DM_Sans, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import GlobalBackButton from '@/components/global-back-button'
import AppSessionBar from '@/components/app-session-bar'
import CollegeSiteHeader from '@/components/college-site-header'
import { StudentSessionHeartbeat } from '@/components/student-session-heartbeat'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Ramachandra College — Training & Placement Department',
  description: 'Training & Placement Department — internal online assessment for Ramachandra College of Engineering.',
  icons: { icon: '/favicon.svg' },
  keywords: 'Ramachandra College, assessment, placement, aptitude, internal examination',
  openGraph: {
    title: 'Ramachandra College — Training & Placement Department',
    description: 'Training & Placement Department — internal online assessment for student skill evaluation',
    siteName: 'Ramachandra College',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${geistMono.variable}`}
    >
      <body
        className={`${dmSans.className} app-branded font-sans font-medium antialiased bg-background text-foreground min-h-dvh w-full min-w-0 overflow-x-clip`}
      >
        <CollegeSiteHeader />
        <GlobalBackButton />
        <StudentSessionHeartbeat />
        <AppSessionBar />
        {children}
        {process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  )
}
