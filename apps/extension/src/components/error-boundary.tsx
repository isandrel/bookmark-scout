import { CircleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background p-6 text-center"
        >
          <CircleAlert aria-hidden="true" className="size-6 text-destructive-text" />
          <h2 className="text-lg font-semibold text-foreground">{t('error_boundaryTitle')}</h2>
          <p className="max-w-md text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {this.state.error?.message || t('error_boundaryFallback')}
          </p>
          <Button className="mt-2" onClick={() => this.setState({ hasError: false })}>
            {t('action_retry')}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
