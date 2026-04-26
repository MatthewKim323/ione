import LogoLoop, { type LogoLoopItem } from "./LogoLoop";
import "./IntroTechLogoLoop.css";

/**
 * Matches `ione-landing/package.json` + typical runtime (Node).
 * Lenis has no Simple Icons CDN slug — local “L” tile.
 */
const INTRO_TECH_LOGOS: LogoLoopItem[] = [
  { src: "https://cdn.simpleicons.org/react/61DAFB", alt: "React", title: "React" },
  { src: "https://cdn.simpleicons.org/vite/646CFF", alt: "Vite", title: "Vite" },
  { src: "https://cdn.simpleicons.org/typescript/3178C6", alt: "TypeScript", title: "TypeScript" },
  { src: "https://cdn.simpleicons.org/tailwindcss/06B6D4", alt: "Tailwind CSS", title: "Tailwind CSS" },
  { src: "https://cdn.simpleicons.org/framer/0055FF", alt: "Motion", title: "Motion" },
  { src: "https://cdn.simpleicons.org/supabase/3ECF8E", alt: "Supabase", title: "Supabase" },
  { src: "https://cdn.simpleicons.org/reactrouter/CA4245", alt: "React Router", title: "React Router" },
  {
    node: (
      <span className="intro-tech-lenis-mark" aria-hidden>
        L
      </span>
    ),
    title: "Lenis",
    ariaLabel: "Lenis smooth scroll",
  },
  { src: "https://cdn.simpleicons.org/npm/CB3837", alt: "npm", title: "npm" },
  { src: "https://cdn.simpleicons.org/nodedotjs/339933", alt: "Node.js", title: "Node.js" },
  { src: "https://cdn.simpleicons.org/threedotjs/000000", alt: "Three.js", title: "Three.js" },
  { src: "https://cdn.simpleicons.org/latex/008080", alt: "KaTeX", title: "KaTeX" },
  { src: "https://cdn.simpleicons.org/d3/F9A03C", alt: "D3", title: "D3" },
  { src: "https://cdn.simpleicons.org/webgl/990000", alt: "WebGL", title: "WebGL / OGL" },
  { src: "https://cdn.simpleicons.org/rollupdotjs/EC4A3F", alt: "Rollup", title: "Rollup (Vite)" },
];

export function IntroTechLogoLoop() {
  return (
    <LogoLoop
      logos={INTRO_TECH_LOGOS}
      speed={34}
      direction="up"
      width="104px"
      logoHeight={48}
      gap={46}
      hoverSpeed={12}
      ariaLabel="Tech stack used in this project"
      style={{ height: "100%" }}
      renderItem={(item, key) => {
        if ("node" in item && item.node != null) {
          return (
            <span key={key} className="intro-tech-logo-node" title={item.title}>
              {item.node}
            </span>
          );
        }
        if (!("src" in item)) return null;
        return (
          <img
            key={key}
            className="intro-tech-logo-img"
            src={item.src}
            alt={item.alt ?? "Technology logo"}
            title={item.title}
            style={{
              height: "48px",
              width: "48px",
              objectFit: "contain",
              opacity: 0.94,
              background: "transparent",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        );
      }}
    />
  );
}
