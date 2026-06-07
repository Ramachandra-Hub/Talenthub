'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { InterviewErrorBoundary } from '@/components/interview-error-boundary';
import { StatusAlert } from '@/components/ui/status-alert';
import { getClientUser } from '@/lib/client-auth';
import {
  fetchProfileViaApi,
  RESUME_MAX_CHARS,
  saveProfileViaApi,
} from '@/lib/user-profile';
import { analyzeResumeText, buildInterviewPlanFromResume } from '@/lib/ai-interview/resume-analyzer';
import { DEFAULT_INTERVIEW_QUESTIONS } from '@/lib/ai-interview/default-questions';
import { formatScorePercentLabel, roundScorePercent } from '@/lib/format-score';
import { useVoiceInterview } from '@/lib/ai-interview/use-voice-interview';
import {
  spokenAfterAnswer,
  spokenClosing,
  spokenIntro,
} from '@/lib/ai-interview/verbal-responses';
import type {
  InterviewMessage,
  InterviewQuestion,
  InterviewStep,
  ResumeReviewResult,
} from '@/lib/ai-interview/types';

export default function AiInterviewPage() {
  const router = useRouter();
  const [step, setStep] = useState<InterviewStep>('setup');
  const [resumeText, setResumeText] = useState('');
  const [resumeReview, setResumeReview] = useState<ResumeReviewResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const [questionBank, setQuestionBank] = useState<InterviewQuestion[]>(DEFAULT_INTERVIEW_QUESTIONS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [answerDraft, setAnswerDraft] = useState('');
  const [processing, setProcessing] = useState(false);
  const [score, setScore] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const bankRef = useRef(questionBank);
  const indexRef = useRef(0);

  const voice = useVoiceInterview();

  useEffect(() => {
    bankRef.current = questionBank;
  }, [questionBank]);

  useEffect(() => {
    indexRef.current = questionIndex;
  }, [questionIndex]);

  useEffect(() => {
    voice.bindTranscript(setAnswerDraft);
  }, [voice.bindTranscript]);

  const loadProfile = useCallback(async () => {
    try {
      const user = await getClientUser();
      if (!user) {
        router.replace('/auth/login?redirect=/ai/interview');
        return;
      }
      const { profile } = await fetchProfileViaApi();
      if (profile?.resume_text) setResumeText(profile.resume_text);
    } catch {
      /* show setup UI even if profile load fails */
    } finally {
      setAuthChecked(true);
    }
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveResumeToProfile = async (text: string) => {
    setSavingResume(true);
    try {
      const trimmed = text.trim().slice(0, RESUME_MAX_CHARS) || null;
      const { ok, error } = await saveProfileViaApi({
        resume_text: trimmed,
        resume_updated_at: trimmed ? new Date().toISOString() : null,
      });
      if (!ok && error) {
        setStatusNote(error);
      }
    } catch {
      /* non-blocking */
    } finally {
      setSavingResume(false);
    }
  };

  const runResumeAnalysis = async () => {
    const text = resumeText.trim();
    if (text.length < 40) {
      setStatusNote('Paste at least a short resume summary (40+ characters) for meaningful feedback.');
      return;
    }
    setAnalyzing(true);
    setStatusNote(null);
    await saveResumeToProfile(text);
    const review = analyzeResumeText(text);
    setResumeReview(review);
    setQuestionBank(buildInterviewPlanFromResume(text, DEFAULT_INTERVIEW_QUESTIONS));
    setStep('resume');
    setAnalyzing(false);
  };

  const beginLiveInterview = () => {
    const bank = questionBank.length > 0 ? questionBank : DEFAULT_INTERVIEW_QUESTIONS;
    const intro =
      'Welcome to your AI interview. I will ask you five questions based on your resume. Please answer clearly after each question.';
    const first = bank[0]?.question ?? DEFAULT_INTERVIEW_QUESTIONS[0].question;

    setQuestionIndex(0);
    setAnswerDraft('');
    setScore(0);
    indexRef.current = 0;
    setMessages([
      { id: 'intro', role: 'ai', content: intro },
      { id: 'q0', role: 'ai', content: first },
    ]);
    setStep('live');

    if (voice.voiceEnabled && voice.speechAvailable) {
      window.setTimeout(() => {
        try {
          void voice.ensureMicPermission().then(() => {
            voice.speakThenListen(spokenIntro(first));
          });
        } catch {
          voice.setSpeechError('Voice could not start. You can still type your answers.');
        }
      }, 0);
    }
  };

  const submitAnswer = () => {
    const text = answerDraft.trim();
    if (!text || processing) return;
    voice.stopListening();

    setProcessing(true);
    const bank = bankRef.current;
    const idx = indexRef.current;
    const current = bank[idx];
    if (!current) {
      setProcessing(false);
      return;
    }

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }]);
    setAnswerDraft('');

    let answerScore = 55;
    const lower = text.toLowerCase();
    current.expectedKeywords.forEach((kw) => {
      if (lower.includes(kw.toLowerCase())) answerScore += 9;
    });
    answerScore = Math.min(100, answerScore);
    setScore((prev) =>
      prev === 0 ? roundScorePercent(answerScore) : roundScorePercent((prev + answerScore) / 2),
    );

    const feedbackLine = `${current.feedback} Score for this answer: ${answerScore} out of 100.`;
    const isLast = idx >= bank.length - 1;
    const nextIdx = idx + 1;
    const nextQ = !isLast ? bank[nextIdx] : null;

    setMessages((prev) => {
      const updated: InterviewMessage[] = [
        ...prev,
        { id: `f-${Date.now()}`, role: 'ai', content: `Feedback: ${feedbackLine}` },
      ];
      if (nextQ) {
        updated.push({ id: `q-${nextIdx}`, role: 'ai', content: nextQ.question });
      }
      if (isLast) {
        updated.push({
          id: 'done',
          role: 'ai',
          content: 'Interview complete. Well done. Review your feedback and practice again anytime.',
        });
      }
      return updated;
    });

    const finish = () => {
      if (isLast) {
        setStep('done');
      } else if (nextQ) {
        setQuestionIndex(nextIdx);
        indexRef.current = nextIdx;
      }
      setProcessing(false);
    };

    if (voice.voiceEnabled && voice.speechAvailable) {
      const spoken = isLast
        ? spokenClosing(answerScore)
        : spokenAfterAnswer(answerScore, nextQ!.question);
      voice.speakThenListen(spoken, finish);
    } else {
      finish();
    }
  };

  if (!authChecked) {
    return (
      <div className="app-page">
        <div className="app-page-header">
          <div className="max-w-4xl mx-auto px-4 space-y-2">
            <div className="app-skeleton h-5 w-32" />
            <div className="app-skeleton h-9 w-72" />
            <div className="app-skeleton h-5 w-96" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
          <div className="app-skeleton h-64" />
          <div className="app-skeleton h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="max-w-4xl mx-auto px-4 space-y-2">
          <span className="app-eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AI · Voice
          </span>
          <h1 className="app-title-lg">AI Interview Studio</h1>
          <p className="app-subtitle">
            Resume review and voice interview in one place for placement readiness.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {step === 'setup' && (
          <Card className="p-6 md:p-8 lux-surface space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Step 1 — Your resume</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We analyze your resume, give feedback, then run a voice interview tailored to your background.
              </p>
            </div>

            {statusNote ? (
              <StatusAlert variant="info">{statusNote}</StatusAlert>
            ) : null}

            <Textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value.slice(0, RESUME_MAX_CHARS))}
              rows={10}
              placeholder="Paste resume text: education, skills, projects, internships…"
              className="border-border bg-background/70 text-foreground min-h-[12rem]"
            />
            <p className="text-xs text-muted-foreground">{resumeText.length} / {RESUME_MAX_CHARS}</p>

            <div className="flex flex-wrap gap-3 items-center">
              <Button onClick={() => void runResumeAnalysis()} disabled={analyzing || savingResume}>
                {analyzing ? 'Analyzing…' : 'Analyze resume & continue'}
              </Button>
              <Button variant="outline" className="border-border/80" asChild>
                <Link href="/profile">Edit on Profile</Link>
              </Button>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 flex flex-wrap gap-4 items-center">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={voice.voiceEnabled ? 'default' : 'outline'}
                  onClick={() => voice.setVoiceEnabled((v) => !v)}
                  disabled={!voice.speechAvailable}
                >
                  {voice.voiceEnabled ? <Volume2 className="h-4 w-4 mr-1" /> : <VolumeX className="h-4 w-4 mr-1" />}
                  AI voice {voice.voiceEnabled ? 'on' : 'off'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={voice.autoListen ? 'default' : 'outline'}
                  onClick={() => voice.setAutoListen((v) => !v)}
                  disabled={!voice.speechAvailable || !voice.voiceEnabled}
                >
                  Auto mic after AI speaks
                </Button>
              </div>
              {!voice.speechAvailable ? (
                <p className="text-xs text-muted-foreground">
                  Voice needs Chrome or Edge on HTTPS (or localhost). Firefox and Safari have limited support.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void voice.ensureMicPermission()}>
                    Allow microphone
                  </Button>
                  {voice.usingOnDeviceSpeech ? (
                    <span className="text-xs text-emerald-600">On-device speech (no cloud)</span>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        )}

        {step === 'resume' && resumeReview && (
          <Card className="p-6 md:p-8 lux-surface space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-foreground">Step 2 — Resume insights</h2>
              <div className="text-3xl font-bold text-primary">{resumeReview.overallScore}/100</div>
            </div>

            <ReviewSection title="Strengths" items={resumeReview.strengths} tone="emerald" />
            <ReviewSection title="Improve" items={resumeReview.improvements} tone="amber" />
            <ReviewSection title="Suggestions" items={resumeReview.suggestions} tone="blue" />
            <ReviewSection title="Before the interview" items={resumeReview.recommendations} tone="sky" />

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={beginLiveInterview} className="font-semibold">
                Start voice interview →
              </Button>
              <Button variant="outline" onClick={() => setStep('setup')}>
                Edit resume
              </Button>
            </div>
          </Card>
        )}

        {step === 'live' && (
          <InterviewErrorBoundary
            onReset={() => {
              setStep('resume');
              voice.stopListening();
              voice.stopSpeaking();
            }}
          >
            <Card className="p-4 lux-surface">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Question {questionIndex + 1} of {questionBank.length}
                  </p>
                  <p className="font-medium text-foreground mt-1">{questionBank[questionIndex]?.question}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {voice.isSpeaking ? (
                    <span className="text-[#1e4a7a] animate-pulse">● AI speaking</span>
                  ) : voice.isListening ? (
                    <span className="text-emerald-600 animate-pulse">● Listening — speak now</span>
                  ) : voice.awaitingMicTap ? (
                    <span className="text-amber-300">● Tap Speak answer when ready</span>
                  ) : (
                    <span className="text-muted-foreground">Ready</span>
                  )}
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${questionBank.length > 0 ? ((questionIndex + 1) / questionBank.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </Card>

            {voice.speechError ? (
              <p className="text-sm text-red-600 border border-red-400/40 rounded-lg px-4 py-2">{voice.speechError}</p>
            ) : null}

            <Card className="p-4 lux-surface min-h-[320px] max-h-[420px] overflow-y-auto space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                      m.role === 'ai'
                        ? 'bg-muted/60 text-foreground border border-border/60'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={voice.awaitingMicTap || voice.isListening ? 'default' : 'outline'}
                onClick={() => void voice.startListening()}
                disabled={processing || voice.isListening || voice.isSpeaking}
              >
                <Mic className="h-4 w-4 mr-1" /> Speak answer
              </Button>
              <Button type="button" variant="outline" onClick={voice.stopListening} disabled={!voice.isListening}>
                <MicOff className="h-4 w-4 mr-1" /> Stop mic
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const q = questionBank[questionIndex];
                  if (q) voice.speak(q.question);
                }}
                disabled={voice.isSpeaking}
              >
                <Volume2 className="h-4 w-4 mr-1" /> Repeat question
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submitAnswer()}
                placeholder="Type or speak your answer…"
                disabled={processing}
                className="flex-1 border-border bg-background/70"
              />
              <Button onClick={submitAnswer} disabled={!answerDraft.trim() || processing}>
                {processing ? '…' : 'Submit'}
              </Button>
            </div>
          </InterviewErrorBoundary>
        )}

        {step === 'done' && (
          <Card className="p-8 lux-surface text-center space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Interview complete</h2>
            <p className="text-5xl font-bold text-primary">{formatScorePercentLabel(score)}</p>
            <p className="text-muted-foreground">Overall performance score</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => {
                  setStep('setup');
                  setResumeReview(null);
                  setMessages([]);
                }}
              >
                Practice again
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Grammar and communication drills are available under{' '}
          <Link href="/ai/grammar-tests" className="text-primary hover:underline">
            English grammar tests
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'emerald' | 'amber' | 'blue' | 'sky';
}) {
  const border =
    tone === 'emerald'
      ? 'border-emerald-400/30'
      : tone === 'amber'
        ? 'border-amber-400/30'
        : tone === 'blue'
          ? 'border-[#1e4a7a]/30'
          : 'border-sky-400/30';
  return (
    <div className={`rounded-lg border ${border} p-4`}>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
