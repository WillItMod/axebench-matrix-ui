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
import PoolPage from "./pages/PoolPage";
import ShedPage from "./pages/ShedPage";
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
          <Route path="/pool" component={PoolPage} />
          <Route path="/operations" component={ShedPage} />
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
