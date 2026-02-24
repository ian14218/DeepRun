import { Component } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
              <p className="text-muted-foreground text-sm mb-6">
                An unexpected error occurred. Please try reloading the page.
              </p>
              <Button onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
