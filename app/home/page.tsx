import { Libre_Baskerville } from 'next/font/google';
import { StudentHubLanding } from '@/components/student/student-hub-landing';

const hubDisplay = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-hub-display',
  display: 'swap',
});

export const metadata = {
  title: 'Student Portal — RCE',
};

export default function StudentHomePage() {
  return (
    <div className={hubDisplay.variable}>
      <StudentHubLanding />
    </div>
  );
}
