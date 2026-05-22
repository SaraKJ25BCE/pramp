import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Shield, Lock, Search, CheckCircle2, ArrowRight, Fingerprint,
  Image, FileText, Zap, Globe, Code, Eye, Scale
} from 'lucide-react';
import { MARKETING, BSA_FRAME } from '@/content/legalCopy';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-indigo-600" />
            <span className="font-bold text-xl">ProofStamp</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/verify">Verify a File</Link>
            </Button>
            <Button asChild>
              <Link to="/login">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 text-sm text-indigo-700 font-medium mb-6">
            <Scale className="h-3.5 w-3.5" />
            {MARKETING.heroBadge}
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight max-w-4xl mx-auto">
            If you didn&apos;t stamp it,<br />
            <span className="text-indigo-600">you can&apos;t prove when you claimed you made it.</span>
          </h1>
          <p className="text-xl text-gray-600 mt-6 max-w-2xl mx-auto leading-relaxed">
            {MARKETING.heroSub}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link to="/login">
                Start Protecting
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" asChild>
              <Link to="/verify">
                <Search className="h-4 w-4 mr-2" />
                Verify a File
              </Link>
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            {MARKETING.limitsLine} ·{' '}
            <Link to="/legal-guide" className="text-indigo-600 hover:underline">What this proves</Link>
          </p>
        </div>
      </section>

      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Three steps to defensible proof</h2>
            <p className="text-gray-600 mt-3 text-lg">
              From upload to downloadable evidence package in seconds
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Lock,
                title: 'Upload & Stamp',
                desc: 'SHA-256 fingerprint, your RSA signature, and an independent RFC 3161 timestamp. Images also get perceptual hashes and an invisible watermark.',
              },
              {
                step: '02',
                icon: FileText,
                title: 'Download Legal Proof',
                desc: `${BSA_FRAME.shortLabel}, creator declaration, proof bundle JSON, and ${MARKETING.counselPacketName} for DMCA notices or your advocate.`,
              },
              {
                step: '03',
                icon: Shield,
                title: 'Verify & Act',
                desc: `Anyone can verify a file or Stamp ID. ${MARKETING.monitoringLanding}. File takedowns with your evidence attached.`,
              },
            ].map((item) => (
              <div key={item.step} className="relative p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors">
                <span className="text-5xl font-bold text-indigo-100 absolute top-4 right-6">{item.step}</span>
                <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Legal proof layers</h2>
            <p className="text-gray-600 mt-3 text-lg">Every claim maps to a downloadable artifact</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { icon: Fingerprint, title: 'SHA-256', desc: 'Byte-level fingerprint' },
              { icon: FileText, title: 'RSA Signature', desc: 'Creator identity binding' },
              { icon: Scale, title: 'RFC 3161 TSA', desc: 'Independent time witness' },
              { icon: FileText, title: 'BSA s.63', desc: 'System certificate for electronic records (India)' },
              { icon: Eye, title: 'Watermark', desc: 'Invisible mark on images' },
            ].map((item) => (
              <div key={item.title} className="text-center p-6 rounded-xl border border-gray-100">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Why ProofStamp</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { vs: 'vs Emailing Yourself', win: 'Independent timestamp + signed evidence pack, not just a sent email' },
              { vs: 'vs Visible Watermarks', win: 'Invisible protection that does not ruin your work' },
              { vs: 'vs Copyright Office Only', win: 'Instant evidence today — register with the Copyright Office when you need maximum strength' },
              { vs: 'vs NFT Hype', win: 'Real evidence artifacts, not wallet theater' },
            ].map((item) => (
              <div key={item.vs} className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{item.vs}</p>
                  <p className="text-sm text-gray-600">{item.win}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Proof, monitoring, and takedowns</h2>
            <p className="text-gray-600 mt-3 text-lg">One workflow when your work is stolen online</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Globe, title: 'Theft Monitoring', desc: MARKETING.monitoringLanding },
              { icon: FileText, title: 'DMCA + Guided Filing', desc: 'Generate a notice pre-filled with your proof — you file on each platform' },
              { icon: Shield, title: 'AI Opt-Out Registry', desc: 'Public registry signaling no AI training without permission' },
              { icon: Code, title: 'Creation Timeline', desc: 'Version drafts to document your creative process' },
            ].map((item) => (
              <div key={item.title} className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm">
                <item.icon className="h-7 w-7 text-indigo-600 mb-3" />
                <h4 className="font-semibold text-gray-900 mb-1.5 text-sm">{item.title}</h4>
                <p className="text-gray-600 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-indigo-600 to-indigo-800">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Zap className="h-10 w-10 text-indigo-200 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-4">Start protecting your work today</h2>
          <p className="text-indigo-200 text-lg mb-8">
            Full legal proof on every stamp. Set up in 30 seconds with Google.
          </p>
          <Button size="lg" variant="secondary" className="text-base px-8 h-12" asChild>
            <Link to="/login">
              Get Started
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-400" />
              <span className="font-semibold text-white">ProofStamp</span>
            </div>
            <div className="flex flex-wrap gap-6 text-sm justify-center">
              <Link to="/verify" className="hover:text-white transition-colors">Verify</Link>
              <Link to="/legal-guide" className="hover:text-white transition-colors">Legal Guide</Link>
              <Link to="/register-copyright" className="hover:text-white transition-colors">Copyright Registration</Link>
              <Link to="/registry" className="hover:text-white transition-colors">AI Registry</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            </div>
            <p className="text-sm">&copy; {new Date().getFullYear()} ProofStamp</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
