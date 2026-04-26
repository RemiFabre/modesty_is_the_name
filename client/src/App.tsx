import { useRoute } from "./useRoute";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";

export function App() {
  const { route, navigate } = useRoute();

  if (route.name === "home") {
    return <Home onCreated={(code) => navigate(`/r/${code}`)} />;
  }
  if (route.name === "room") {
    return <Room code={route.code} navigate={navigate} />;
  }
  return (
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
