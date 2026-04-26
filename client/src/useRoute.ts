import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "room"; code: string }
  | { name: "unknown" };

function parse(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { name: "home" };
  const m = pathname.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  if (m) return { name: "room", code: m[1].toUpperCase() };
  return { name: "unknown" };
}

export function useRoute(): {
  route: Route;
  navigate: (path: string) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
    parse(window.location.pathname),
  );
  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setRoute(parse(path));
  };
  return { route, navigate };
}
