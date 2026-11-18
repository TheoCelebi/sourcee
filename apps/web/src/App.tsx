import { Footer, TopBar } from "./components/Layout";
import { PullToRefresh } from "./components/PullToRefresh";
import { EditionPage } from "./pages/EditionPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { SourcesPage } from "./pages/SourcesPage";
import { usePath } from "./state";

export function App() {
  const path = usePath();
  const page = path.startsWith("/methodologie") ? (
    <MethodologyPage />
  ) : path.startsWith("/sources") ? (
    <SourcesPage />
  ) : (
    <EditionPage />
  );

  return (
    <>
      <PullToRefresh />
      <a
        href="#contenu"
        className="sr-only rounded bg-ink px-3 py-2 text-paper focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20"
      >
        Aller au contenu
      </a>
      <div className="mx-auto max-w-[1180px] px-4 md:px-8">
        <TopBar path={path} />
        {page}
      </div>
      <Footer />
    </>
  );
}
