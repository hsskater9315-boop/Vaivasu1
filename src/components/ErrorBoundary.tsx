import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'Something went wrong while loading ForVasu.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed?.error) {
        readable = parsed.error.includes('Quota exceeded')
          ? 'Daily database quota exceeded. Please try again tomorrow.'
          : parsed.error;
      }
    } catch {
      if (error.message) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 font-display text-lg font-semibold text-slate-900">
              Unable to continue
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Reload App</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
