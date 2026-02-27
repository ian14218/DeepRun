import { Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';
import DeepRunLogo from '../components/DeepRunLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Trophy, BarChart3, DollarSign, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    icon: Users,
    title: 'Create a League',
    description: 'Invite 4-20 friends and set your roster size. Share the invite code and fill remaining slots with CPU bots.',
  },
  {
    icon: Trophy,
    title: 'Snake Draft Players',
    description: 'Take turns drafting real NCAA tournament players. The deeper their team goes, the more games they play — and the more points they score.',
  },
  {
    icon: BarChart3,
    title: 'Dominate the Bracket',
    description: 'Track live scores, watch your roster rack up points, and climb the standings as the tournament unfolds.',
  },
];

export default function Home() {
  useDocumentTitle(null);
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center text-center px-4 pt-24 pb-16">
        <DeepRunLogo className="h-16 w-16 text-accent mb-4" />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-2">
          <span className="text-accent">Deep</span>
          <span className="text-foreground">Run</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-md mb-8">
          Draft your squad. Dominate March Madness.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link to="/register">Get Started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/login">Log In</Link>
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <Card key={i} className="text-center">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-accent" />
                  </div>
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Best Ball CTA */}
      <div className="max-w-4xl mx-auto px-4 pb-24">
        <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-accent/5">
          <CardContent className="p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-6">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-8 w-8 text-emerald-400" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold mb-2">Best Ball</h2>
              <p className="text-muted-foreground mb-1">
                No league needed. Build an 8-player lineup with a $8,000 salary cap and compete against the entire platform.
              </p>
              <p className="text-sm text-muted-foreground">
                Every player has a price based on PPG, minutes, and seed. Find the value picks and outscore the field.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link to="/register">
                Play Now
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
