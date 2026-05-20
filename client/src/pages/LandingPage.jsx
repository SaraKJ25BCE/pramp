import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Shield, Lock, Search, CheckCircle2, ArrowRight, Fingerprint,
  Image, FileText, Zap, Globe, Code, Eye
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
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
              <Link to="/login">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 text-sm text-indigo-700 font-medium mb-6">
            <Lock className="h-3.5 w-3.5" />
            Cryptographic proof of creative ownership
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight max-w-4xl mx-auto">
            If you didn't stamp it,<br />
            <span className="text-indigo-600">you can't prove you made it.</span>
          </h1>
          <p className="text-xl text-gray-600 mt-6 max-w-2xl mx-auto leading-relaxed">
            ProofStamp gives creators instant, cryptographic proof of ownership.
            Invisible watermarks that survive screenshots, format changes, and compression.
            Your work. Your proof. Forever.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link to="/login">
                Start Protecting Free
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
          <p className="text-sm text-gray-500 mt-4">No credit card required · 10 free stamps/month</p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Three steps to bulletproof ownership</h2>
            <p className="text-gray-600 mt-3 text-lg">From upload to legally-defensible proof in seconds</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Lock,
                title: 'Upload & Stamp',
                desc: 'Upload any creative file. We embed an invisible DWT-DCT watermark, generate perceptual hashes, and sign it with your unique RSA key.',
              },
              {
                step: '02',
                icon: Fingerprint,
                title: 'Share With Proof',
                desc: 'Get a shareable ProofStamp link with ownership overlay. Share confidently — the watermark survives screenshots and re-uploads.',
              },
              {
                step: '03',
                icon: Shield,
                title: 'Verify Anytime',
                desc: 'Anyone can verify ownership by uploading the file or entering the Stamp ID. Works even after format conversion or compression.',
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

      {/* Protection layers */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Multi-layer protection</h2>
            <p className="text-gray-600 mt-3 text-lg">Not one, not two — four independent verification methods</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Fingerprint, title: 'SHA-256 Hash', desc: 'Byte-level fingerprint detects any modification' },
              { icon: Eye, title: 'Perceptual Hash', desc: 'Content-aware matching survives format changes' },
              { icon: Image, title: 'DWT-DCT Watermark', desc: 'Invisible watermark embedded in frequency domain' },
              { icon: FileText, title: 'RSA Signature', desc: 'Cryptographic proof tied to your identity' },
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

      {/* Comparison */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Why ProofStamp</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { vs: 'vs NFTs/Blockchain', win: 'Instant, free, no wallet needed' },
              { vs: 'vs Visible Watermarks', win: 'Invisible — doesn\'t ruin your work' },
              { vs: 'vs Copyright Office', win: 'Instant (not weeks) and $0 (not $55/file)' },
              { vs: 'vs Emailing Yourself', win: 'Cryptographic proof + perceptual matching' },
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

      {/* Power Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Not just proof. Full protection.</h2>
            <p className="text-gray-600 mt-3 text-lg">Detect theft, file takedowns, and block AI training — all from one dashboard</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Globe, title: 'Theft Monitoring', desc: 'We scan for copies of your work and alert you when unauthorized use is detected' },
              { icon: FileText, title: 'One-Click Takedown', desc: 'Generate a DMCA notice pre-filled with your proof. File directly to Instagram, YouTube, Twitter' },
              { icon: Shield, title: 'AI Opt-Out Registry', desc: 'Public, machine-readable registry that AI companies can check before training on your work' },
              { icon: Code, title: 'Creation Timeline', desc: 'Upload sketches, drafts, and revisions. Prove your creative process — impossible to fake' },
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

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 to-indigo-800">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Zap className="h-10 w-10 text-indigo-200 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-4">
            Start protecting your work today
          </h2>
          <p className="text-indigo-200 text-lg mb-8">
            10 free stamps every month. No credit card. Set up in 30 seconds with Google.
          </p>
          <Button size="lg" variant="secondary" className="text-base px-8 h-12" asChild>
            <Link to="/login">
              Get Started Free
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-400" />
              <span className="font-semibold text-white">ProofStamp</span>
            </div>
            <div className="flex gap-6 text-sm">
              <Link to="/verify" className="hover:text-white transition-colors">Verify</Link>
              <Link to="/registry" className="hover:text-white transition-colors">AI Registry</Link>
              <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            </div>
            <p className="text-sm">&copy; {new Date().getFullYear()} ProofStamp. Cryptographic proof of ownership.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
