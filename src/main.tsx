/* eslint-disable react-refresh/only-export-components */
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";

type StartupBoundaryState = {
  message?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function StartupFailure({ message }: { message: string }) {
  return (
    <main className="startup-failure" role="alert">
      <h1>Anchored could not load</h1>
      <p>The interface stopped during startup.</p>
      <code>{message}</code>
      <button type="button" onClick={() => window.location.reload()}>
        Reload Anchored
      </button>
    </main>
  );
}

class StartupBoundary extends React.Component<
  React.PropsWithChildren,
  StartupBoundaryState
> {
  state: StartupBoundaryState = {};

  static getDerivedStateFromError(error: unknown): StartupBoundaryState {
    return { message: errorMessage(error) };
  }

  componentDidCatch(error: unknown) {
    console.error("Anchored failed to render", error);
  }

  render() {
    return this.state.message ? (
      <StartupFailure message={this.state.message} />
    ) : (
      this.props.children
    );
  }
}

const rootElement = document.getElementById("root") as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

root.render(<main className="startup-status">Starting Anchored…</main>);

void import("./app/App")
  .then(({ App }) => {
    root.render(
      <React.StrictMode>
        <StartupBoundary>
          <App />
        </StartupBoundary>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(<StartupFailure message={errorMessage(error)} />);
  });
