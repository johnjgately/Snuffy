import { Card, SectionHeader, Badge } from '@/components/ui';
import { Mail, Award, Shield, Code, Cpu, GraduationCap, Trophy, Zap, Target, Lock, ScrollText, Workflow } from 'lucide-react';

const credentials = [
  { icon: Shield, label: 'Master Sergeant', detail: 'Texas State Guard' },
  { icon: Target, label: 'T6 NCOIC', detail: 'Current position' },
  { icon: GraduationCap, label: 'Post Graduate Program', detail: 'AI & ML: Business Applications — McCombs School of Business, UT Austin' },
  { icon: Trophy, label: '3x Best in Texas', detail: 'Led technology operations team' },
];

const expertise = [
  { icon: Code, label: 'Software Development' },
  { icon: Shield, label: 'Cybersecurity' },
  { icon: Cpu, label: 'AI Initiatives' },
  { icon: Workflow, label: 'Networking & Communications' },
];

const snuffyPillars = [
  { icon: Cpu, title: 'Unified AI', desc: 'Cloud and local model integration with cost monitoring.' },
  { icon: ScrollText, title: 'Full Audit Trail', desc: 'Every action logged, approved, and accountable.' },
  { icon: Workflow, title: 'Workflow Automation', desc: 'Scheduled reports, data monitoring, and AI tasks.' },
  { icon: Lock, title: 'Security First', desc: 'Emergency stop, role-based access, and privacy modes.' },
];

export function About() {
  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <SectionHeader
        title="About"
        description="The person behind Snuffy and the mission driving it forward."
      />

      {/* Profile card */}
      <Card className="p-6 lg:p-8 mb-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-[80px] pointer-events-none" aria-hidden="true" />
        <div className="relative flex flex-col sm:flex-row items-start gap-6">
          <div className="h-20 w-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-accent">JG</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-ink-primary">John Gately</h2>
            <p className="text-sm text-ink-muted mt-1">Programmer &middot; Master Sergeant, Texas State Guard &middot; T6 NCOIC</p>
            <div className="flex items-center gap-2 mt-3">
              <Badge tone="accent"><Zap className="h-2.5 w-2.5" aria-hidden="true" /> Creator of Snuffy</Badge>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed mt-4">
              John Gately is a programmer, Master Sergeant in the Texas State Guard, and currently the T6 NCOIC. He has led technology operations across cybersecurity, software development, networking, communications, and AI initiatives, including a team that earned three consecutive Best in Texas awards. He also completed the Post Graduate Program in Artificial Intelligence and Machine Learning: Business Applications through the McCombs School of Business at The University of Texas at Austin.
            </p>
          </div>
        </div>
      </Card>

      {/* Credentials */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {credentials.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-primary">{c.label}</p>
                <p className="text-xs text-ink-muted mt-0.5">{c.detail}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Expertise areas */}
      <Card className="p-5 mb-6">
        <p className="label-mono mb-3">Areas of Expertise</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {expertise.map((e) => {
            const Icon = e.icon;
            return (
              <div key={e.label} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-bg-base border border-bg-border text-center">
                <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                <span className="text-xs text-ink-secondary font-medium">{e.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Snuffy */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Zap className="h-4 w-4 text-accent" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold">About Snuffy</h3>
        </div>
        <p className="text-sm text-ink-secondary leading-relaxed mb-5">
          John created Snuffy, a secure, AI-powered operations assistant that brings document management, database access, workflow automation, and governance into one unified workspace. It gives teams the ability to work through chat, voice, or a traditional interface while keeping every action logged, approved, and accountable.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {snuffyPillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="p-4 rounded-lg bg-bg-base border border-bg-border">
                <Icon className="h-5 w-5 text-accent mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-ink-primary">{p.title}</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Contact */}
      <Card className="p-5">
        <p className="label-mono mb-3">Contact</p>
        <a
          href="mailto:johnjgately@gmail.com"
          className="flex items-center gap-3 p-3 rounded-lg bg-bg-base border border-bg-border hover:border-accent/30 transition-colors group"
        >
          <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-accent" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-primary group-hover:text-accent transition-colors">johnjgately@gmail.com</p>
            <p className="text-xs text-ink-muted mt-0.5">Click to send an email</p>
          </div>
        </a>
      </Card>
    </div>
  );
}
