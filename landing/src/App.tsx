import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Pedagogy } from "./components/Pedagogy";
import { Pipeline } from "./components/Pipeline";
import { Signal } from "./components/Signal";
import { Closer } from "./components/Closer";

export default function App() {
  return (
    <div className="relative">
      <Nav />
      <main>
        <Hero />
        <Pedagogy />
        <Pipeline />
        <Signal />
        <Closer />
      </main>
    </div>
  );
}
