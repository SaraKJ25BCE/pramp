import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert, Search, CheckCircle2, XCircle, Loader2,
  Database, Globe, FileText, Lock
} from 'lucide-react';

export default function RegistryPage() {
  const [stats, setStats] = useState(null);
  const [searchHash, setSearchHash] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const res = await api.get('/registry/stats');
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchHash.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await api.get(`/registry/check?hash=${encodeURIComponent(searchHash.trim())}`);
      setSearchResult(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            <span className="font-bold text-lg">AI Opt-Out Registry</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">by ProofStamp</Badge>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            AI Training Opt-Out Registry
          </h1>
          <p className="text-lg text-gray-600 mt-3 max-w-2xl mx-auto">
            A public, machine-readable registry of creative works whose owners have explicitly
            prohibited use for AI/ML model training.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <Database className="h-6 w-6 text-indigo-600 mx-auto mb-2" />
                <div className="text-3xl font-bold">{stats.totalProtectedWorks}</div>
                <p className="text-sm text-muted-foreground">Works Protected</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Globe className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <div className="text-3xl font-bold">{stats.totalCreators}</div>
                <p className="text-sm text-muted-foreground">Creators Opted Out</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Lock className="h-6 w-6 text-red-600 mx-auto mb-2" />
                <div className="text-3xl font-bold">100%</div>
                <p className="text-sm text-muted-foreground">Cryptographically Verified</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-3">Check if a work is in the registry</h2>
            <form onSubmit={handleSearch} className="flex gap-3">
              <Input
                placeholder="Enter SHA-256 hash of the file..."
                value={searchHash}
                onChange={(e) => setSearchHash(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button type="submit" disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
                Check
              </Button>
            </form>

            {searchResult && (
              <div className={`mt-4 p-4 rounded-lg border ${searchResult.optedOut ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                {searchResult.optedOut ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <p className="font-semibold text-red-800">AI TRAINING PROHIBITED</p>
                    </div>
                    <p className="text-sm text-red-700">{searchResult.notice}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                      <div><span className="text-red-600">Title:</span> {searchResult.title}</div>
                      <div><span className="text-red-600">Creator:</span> {searchResult.creatorHandle}</div>
                      <div><span className="text-red-600">License:</span> {searchResult.license}</div>
                      <div><span className="text-red-600">Stamp ID:</span> {searchResult.stampId}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="font-medium text-green-800">Not found in opt-out registry</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Docs */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              API for AI Companies
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Query our registry before training on scraped content. Free to check.
            </p>
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Check a single file:</p>
                <code className="text-sm text-green-400">
                  GET /registry/check?hash=&#123;sha256&#125;&phash=&#123;perceptual_hash&#125;
                </code>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Bulk export (paginated):</p>
                <code className="text-sm text-green-400">
                  GET /registry/bulk?page=1&limit=100
                </code>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Machine-readable declaration:</p>
                <code className="text-sm text-green-400">
                  GET /registry/declaration.txt
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-8 border-t">
          <p>
            The ProofStamp AI Opt-Out Registry is a public good.
            All creators' works are opted out by default when stamped.
          </p>
          <p className="mt-2">
            <Link to="/" className="text-indigo-600 hover:underline">ProofStamp</Link> — Cryptographic proof of creative ownership
          </p>
        </div>
      </div>
    </div>
  );
}
