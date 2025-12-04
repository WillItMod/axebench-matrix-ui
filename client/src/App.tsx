import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { BenchmarkProvider } from "./contexts/BenchmarkContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Benchmark from "./pages/Benchmark";
import Monitoring from "./pages/Monitoring";
import Profiles from "./pages/Profiles";
import Sessions from "./pages/Sessions";
import Pool from "./pages/Pool";
import Operations from "./pages/Operations";
import Settings from "./pages/Settings";
import DebugTools from "./pages/DebugTools";
import NotFound from "./pages/NotFound";

function Router() {
  const debugEnabled = import.meta.env.VITE_ENABLE_DEBUG === 'true';

  return (
    <>
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/benchmark" component={Benchmark} />
          <Route path="/monitoring" component={Monitoring} />
          <Route path="/profiles" component={Profiles} />
          <Route path="/sessions" component={Sessions} />
          <Route path="/pool" component={Pool} />
          <Route path="/operations" component={Operations} />
          <Route path="/settings" component={Settings} />
          {debugEnabled && <Route path="/__debug" component={DebugTools} />}
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeProvider>
          <BenchmarkProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </BenchmarkProvider>
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
