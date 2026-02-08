import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Loader2, Mail, Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
});

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const parsed = loginSchema.parse({ email, password });
        const { error } = await signIn(parsed.email, parsed.password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Invalid email or password');
          } else if (error.message.includes('Email not confirmed')) {
            toast.error('Please verify your email before signing in');
          } else {
            toast.error(error.message);
          }
        }
      } else {
        const parsed = signupSchema.parse({ email, password, fullName });
        const { error } = await signUp(parsed.email, parsed.password, parsed.fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('An account with this email already exists');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Check your email to verify your account');
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-10">
        {/* Logo */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 glow-primary">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              NUDGE
            </h1>
            <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase mt-1">
              Superhuman for Operations
            </p>
          </div>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10 h-13 bg-card border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/50 focus:border-primary/30"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="ceo@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-13 bg-card border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/50 focus:border-primary/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-13 bg-card border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/50 focus:border-primary/30"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-13 rounded-xl font-semibold glow-primary transition-all active:scale-[0.97] text-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </Button>
        </form>

        {/* Toggle */}
        <div className="text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLogin ? (
              <>Don't have an account? <span className="text-primary font-medium">Sign up</span></>
            ) : (
              <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
};

export default Auth;
