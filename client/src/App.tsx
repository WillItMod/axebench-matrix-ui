import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BenchmarkProvider } from "./contexts/BenchmarkContext";
import Layout from "./components/Layout";
import BenchmarkStatusBanner from "./components/BenchmarkStatusBanner";
import Dashboard from "./pages/Dashboard";
import Benchmark from "./pages/Benchmark";
import Profiles from "./pages/Profiles";
import Sessions from "./pages/Sessions";
import Pool from "./pages/Pool";
import Operations from "./pages/Operations";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <>
      <BenchmarkStatusBanner />
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/benchmark" component={Benchmark} />
          <Route path="/profiles" component={Profiles} />
          <Route path="/sessions" component={Sessions} />
          <Route path="/pool" component={Pool} />
          <Route path="/operations" component={Operations} />
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
      <ThemeProvider defaultTheme="dark">
        <BenchmarkProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </BenchmarkProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
