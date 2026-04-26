import { useRoute } from "./useRoute";
import { useSocketStatus } from "./useSocketStatus";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";

export function App() {
  const { route, navigate } = useRoute();
  const status = useSocketStatus();

  let content;
  if (route.name === "home") {
    content = <Home onCreated={(code) => navigate(`/r/${code}`)} />;
  } else if (route.name === "room") {
    content = <Room code={route.code} navigate={navigate} />;
  } else {
    content = (
      <div className="app">
        <header className="header">
          <h1>Modesty is the Name</h1>
        </header>
        <main className="main">
          <p>Page not found.</p>
          <button onClick={() => navigate("/")}>Home</button>
        </main>
      </div>
    );
  }

  return (
    <>
      {status !== "connected" && (
        <div className={"conn-banner conn-" + status}>
          {status === "connecting" ? "Connecting…" : "Lost connection — retrying…"}
        </div>
      )}
      {content}
    </>
  );
}
