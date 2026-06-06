import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Shield, Lock, Search, CheckCircle2, ArrowRight, Fingerprint,
  FileText, Zap, Eye, Scale, Layers
} from 'lucide-react';
import { MARKETING, BSA_FRAME } from '@/content/legalCopy';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20 selection:text-white">
      {/* Ambient background glow */}
      <div className="ambient-glow"></div>

      {/* Ultra-minimal Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.02] bg-black/40 backdrop-blur-3xl transition-all">
        <div className="max-w-7xl mx-auto px-6 flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-white/90" />
            <span className="font-semibold text-lg tracking-tight text-white">ProofStamp</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link to="/verify" className="text-white/50 hover:text-white transition-colors hidden sm:block">Verify</Link>
            <Button size="sm" className="bg-white hover:bg-white/90 text-black rounded-full px-5 h-9" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-24 lg:pt-56 lg:pb-40 overflow-hidden flex flex-col items-center justify-center min-h-[90vh]">
        <div className="relative max-w-5xl mx-auto px-6 text-center z-10 animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold mb-8 border border-white/10 bg-white/5 text-white/70 backdrop-blur-md">
            <Scale className="h-3.5 w-3.5" />
            {MARKETING.heroBadge}
          </div>
          <h1 className="text-6xl sm:text-8xl lg:text-9xl font-semibold tracking-tighter text-white mb-8 leading-[0.95]">
            Unbreakable <br className="hidden sm:block" />
            <span className="text-gradient">Evidence.</span>
          </h1>
          <p className="text-xl sm:text-2xl text-white/40 max-w-2xl mx-auto leading-normal mb-12 font-medium tracking-tight">
            If you didn't stamp it, you can't prove you made it. Secure your intellectual property with cryptographically binding, zero-knowledge proofs.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="h-14 px-8 text-lg bg-white text-black hover:bg-white/90 w-full sm:w-auto font-semibold rounded-full transition-all" asChild>
              <Link to="/login">
                Start Protecting
                <ArrowRight className="h-5 w-5 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-lg w-full sm:w-auto border-white/10 text-white hover:bg-white/5 bg-transparent rounded-full backdrop-blur-md" asChild>
              <Link to="/verify">
                <Search className="h-5 w-5 mr-2 text-white/50" />
                Verify Identity
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Core Workflow Section - Bento Grid */}
      <section className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center text-center mb-24">
            <h2 className="text-5xl md:text-6xl font-semibold tracking-tighter text-white mb-6">Defensible proof.</h2>
            <p className="text-xl text-white/40 max-w-2xl font-medium tracking-tight">From raw upload to a court-admissible evidence package in seconds. No crypto wallets required.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                icon: Layers,
                title: 'Upload & Hash',
                desc: 'Client-side SHA-256 fingerprinting guarantees zero-knowledge. Your file never leaves your device unencrypted.',
              },
              {
                step: '02',
                icon: Shield,
                title: 'Cryptographic Stamp',
                desc: 'Your RSA signature is bound to an independent RFC 3161 timestamp and an invisible DWT-DCT watermark.',
              },
              {
                step: '03',
                icon: FileText,
                title: 'Legal Admissibility',
                desc: `Instantly download a ${BSA_FRAME.shortLabel} and ${MARKETING.counselPacketName} ready for DMCA takedowns.`,
              },
            ].map((item) => (
              <div key={item.step} className="p-10 rounded-3xl bento-card relative group flex flex-col items-start text-left">
                <div className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-16 group-hover:bg-white group-hover:text-black transition-all duration-500">
                  <item.icon className="h-5 w-5 text-white/70 group-hover:text-black transition-colors" />
                </div>
                <div className="mt-auto">
                  <h3 className="text-2xl font-semibold tracking-tight text-white mb-3">{item.title}</h3>
                  <p className="text-white/40 leading-relaxed text-lg font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Layers - Sleek List */}
      <section className="py-40 relative z-10 border-t border-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-24 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative w-full aspect-square rounded-[3rem] bg-white/[0.02] border border-white/[0.05] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0,transparent_60%)] animate-pulse" />
                <div className="absolute w-[300px] h-[300px] border border-white/10 rounded-full animate-[spin_60s_linear_infinite]" />
                <div className="absolute w-[200px] h-[200px] border border-white/20 rounded-full animate-[spin_40s_linear_infinite_reverse]" />
                <Lock className="h-16 w-16 text-white/80" />
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-5xl font-semibold tracking-tighter text-white mb-6">Multi-layered forensic architecture.</h2>
              <p className="text-xl text-white/40 mb-16 font-medium tracking-tight">We combine traditional cryptography, legal frameworks, and advanced steganography.</p>
              
              <div className="space-y-10">
                {[
                  { icon: Fingerprint, title: 'SHA-256 Hashing', desc: 'Immutable byte-level fingerprinting of your original file.' },
                  { icon: Lock, title: 'RSA-2048 Signatures', desc: 'Cryptographically binds the file hash to your verified identity.' },
                  { icon: Scale, title: 'RFC 3161 Timestamping', desc: 'Independent, mathematically verifiable time witness.' },
                  { icon: Eye, title: 'DWT-DCT Watermarking', desc: 'Invisible, resilient watermarks embedded directly into image pixels.' },
                ].map((item) => (
                  <div key={item.title} className="flex gap-6 group cursor-default">
                    <div className="mt-1 h-10 w-10 rounded-full border border-white/10 flex items-center justify-center shrink-0 group-hover:border-white/40 transition-colors">
                      <item.icon className="h-4 w-4 text-white/60 group-hover:text-white transition-colors" />
                    </div>
                    <div>
                      <h4 className="text-xl font-semibold text-white mb-2 tracking-tight">{item.title}</h4>
                      <p className="text-white/40 leading-relaxed font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section - Minimalist Cards */}
      <section className="py-40 border-t border-white/[0.02]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-24">
            <h2 className="text-5xl font-semibold tracking-tighter text-white">Why ProofStamp.</h2>
            <p className="text-xl text-white/40 mt-6 font-medium tracking-tight">Real legal infrastructure, zero crypto hype.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-8">
            {[
              { vs: 'Blockchain & NFTs', win: 'No gas fees, no wallets. Private by default. Real legal evidence, not just a ledger entry.' },
              { vs: '"Emailing Yourself"', win: 'Cryptographically secure RFC timestamps and RSA signatures. Emails are legally flimsy.' },
              { vs: 'Visible Watermarks', win: 'Invisible DWT-DCT watermarks survive cropping, compression, and filters cleanly.' },
              { vs: 'Copyright Office', win: 'Get instant evidence today. Register later when you need maximum statutory damages.' },
            ].map((item) => (
               <div key={item.vs} className="p-10 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
                 <div className="flex items-center gap-3 mb-6">
                   <CheckCircle2 className="h-5 w-5 text-white/80" />
                   <h4 className="text-xl font-semibold tracking-tight text-white">vs {item.vs}</h4>
                 </div>
                 <p className="text-white/50 leading-relaxed font-medium">{item.win}</p>
               </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-40 relative border-t border-white/[0.02] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.08)_0,transparent_50%)]" />
        <div className="relative max-w-3xl mx-auto px-6 text-center z-10">
          <Zap className="h-12 w-12 text-white/80 mx-auto mb-10 animate-bounce" />
          <h2 className="text-6xl font-semibold tracking-tighter text-white mb-8">Secure your legacy.</h2>
          <p className="text-2xl text-white/40 mb-12 font-medium tracking-tight">
            Full legal proof on every stamp. Set up your identity in 30 seconds.
          </p>
          <Button size="lg" className="h-16 px-12 text-lg bg-white text-black hover:bg-white/90 font-semibold rounded-full transition-all" asChild>
            <Link to="/login">
              Start Stamping Now
            </Link>
          </Button>
        </div>
      </section>

      {/* Ultra-minimal Footer */}
      <footer className="border-t border-white/[0.05] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-white/40" />
            <span className="font-semibold tracking-tight text-white/40">ProofStamp</span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-white/30">
            <Link to="/verify" className="hover:text-white transition-colors">Verify</Link>
            <Link to="/legal-guide" className="hover:text-white transition-colors">Legal</Link>
            <Link to="/register-copyright" className="hover:text-white transition-colors">Copyright</Link>
            <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
