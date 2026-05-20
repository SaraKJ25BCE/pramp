import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import Layout from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Calendar, Loader2 } from 'lucide-react';

export default function PublicPassport() {
  const { username } = useParams();
  const [passport, setPassport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPassport() {
      try {
        const res = await api.get(`/passport/${username}`);
        setPassport(res.data.passport);
      } catch (err) {
        setError(err.response?.status === 404 ? 'User not found' : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    fetchPassport();
  }, [username]);

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center py-20">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold">{error}</h2>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Profile Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-0">
          <CardContent className="p-8">
            <div className="flex items-center gap-6">
              {passport.user?.avatarUrl && (
                <img src={passport.user.avatarUrl} alt="" className="h-20 w-20 rounded-full ring-4 ring-white/20" />
              )}
              <div>
                <h1 className="text-2xl font-bold">{passport.displayName}</h1>
                <p className="text-blue-100">@{passport.username}</p>
                <p className="text-blue-200 text-sm mt-1">
                  Member since {new Date(passport.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-4xl font-bold">{passport.stamps?.length || 0}</div>
                <div className="text-blue-200 text-sm">Files Stamped</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stamps Grid */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Stamped Files</h2>
          {passport.stamps?.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No stamps yet
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {passport.stamps?.map((stamp) => (
                <Link key={stamp.id} to={`/verify?id=${stamp.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 mb-3">
                        <img
                          src={stamp.thumbnailUrl}
                          alt={stamp.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-medium truncate">{stamp.title}</h3>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary">{stamp.fileType.toUpperCase()}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(stamp.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
