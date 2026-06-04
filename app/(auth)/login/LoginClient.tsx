"use client";

/**
 * 登录页主组件:着陆页(Hero + Preview)+ 模态登录注册。
 * 浮层:Three.js 点阵波(动态加载)、accent 网格线、上升粒子、玻璃顶栏。
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./login.module.css";
import Particles from "./Particles";
import AuthForm from "./AuthForm";
import { Activity, ArrowRight, Logo, X } from "./icons";

const DottedSurface = dynamic(() => import("./DottedSurface"), { ssr: false });

type Tab = "login" | "signup";

const menuItems = [
  { name: "Platform", href: "#" },
  { name: "Live Ops", href: "#" },
  { name: "Telemetry", href: "#" },
  { name: "Docs", href: "#" },
];

function Header({
  onOpenAuth,
  scrolled,
}: {
  onOpenAuth: (tab: Tab) => void;
  scrolled: boolean;
}) {
  return (
    <header
      className={styles.navEnter}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        padding: "16px 16px 0",
      }}
    >
      <nav className={styles.navWrap} data-scrolled={scrolled}>
        <div
          className={styles.navShell}
          data-scrolled={scrolled}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "10px 20px",
            borderRadius: 16,
            whiteSpace: "nowrap",
          }}
        >
          <a href="#" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={22} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
              GameOps
            </span>
            <span
              className={styles.navBadge}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginLeft: 8,
                padding: "2px 6px",
                borderRadius: 6,
                border: "1px solid #27272a",
                background: "rgba(24,24,27,0.6)",
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#a1a1aa",
              }}
            >
              <span className={styles.liveDot}></span> v1.0
            </span>
          </a>

          <ul
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontSize: 13,
              color: "#a1a1aa",
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
            className="hidden md:flex"
          >
            {menuItems.map((it) => (
              <li key={it.name}>
                <a className={styles.navItem} href={it.href}>
                  {it.name}
                </a>
              </li>
            ))}
          </ul>

          <div
            className={styles.pillIntro}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <button
              type="button"
              onClick={() => onOpenAuth("login")}
              className={styles.navSignin}
              style={{
                fontSize: 13,
                color: "#a1a1aa",
                padding: "6px 12px",
                borderRadius: 8,
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth("signup")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 8px 6px 12px",
                borderRadius: 8,
                background: "#fafafa",
                color: "#09090b",
                border: 0,
                cursor: "pointer",
                transition: "background .2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fafafa")}
            >
              Get started
              <span
                style={{
                  display: "inline-flex",
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "#09090b",
                  color: "#fafafa",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ArrowRight size={11} stroke={2.5} />
              </span>
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}

function Hero({ onOpenAuth }: { onOpenAuth: (tab: Tab) => void }) {
  return (
    <div style={{ margin: "0 auto", maxWidth: 1024, padding: "0 24px", textAlign: "center" }}>
      <h1 className={`${styles.heroTitle} ${styles.heroH1}`} style={{ marginTop: 32 }}>
        实时游戏运营的
        <br className="hidden sm:block" />
        <span className={styles.grad}>中央控制台</span>
      </h1>

      <p
        className={styles.heroSub}
        style={{
          margin: "28px auto 0",
          maxWidth: 640,
          fontSize: 16,
          lineHeight: 1.6,
          color: "#a1a1aa",
          textWrap: "balance",
        }}
      >
        统一监控匹配、经济与玩家健康度。无需重启即可下发热修复,在生产环境运行实验,让玩家始终处于心流之中。
      </p>

      <div
        className={styles.heroCtas}
        style={{
          marginTop: 36,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className={styles.ctaFrame}>
          <button
            type="button"
            onClick={() => onOpenAuth("signup")}
            className={`${styles.cta} ${styles.ctaHero}`}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              Get started <ArrowRight size={14} stroke={2.5} />
            </span>
          </button>
        </div>
        {/* <button type="button" className={styles.btnGhost}>
          <Activity size={14} />
          游戏官网
        </button> */}
      </div>

      <div className={styles.heroLogos} style={{ marginTop: 80 }}>
        <div className={styles.logosWrap} style={{ paddingTop: 4 }}>
          <div className={styles.logosGrid} style={{ margin: "0 auto", maxWidth: 720 }}>
            <span className={styles.logoMark}>
              <span className={styles.logoDot} />
              OBSIDIAN
            </span>
            <span
              className={styles.logoMark}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: ".18em",
                fontSize: 12,
              }}
            >
              HELIX//
            </span>
            <span className={styles.logoMark} style={{ fontStyle: "italic", fontWeight: 600 }}>
              Northstar
            </span>
            <span className={styles.logoMark}>
              <span className={styles.logoDot} style={{ borderRadius: 9999 }} />
              paradox
            </span>
            <span
              className={styles.logoMark}
              style={{ letterSpacing: ".22em", fontWeight: 600 }}
            >
              R · I · O · T
            </span>
            <span
              className={styles.logoMark}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            >
              {"<vector/>"}
            </span>
            <span
              className={styles.logoMark}
              style={{ fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              Lumen.
            </span>
            <span className={styles.logoMark}>
              <span className={styles.logoDot} />
              KRAKEN
            </span>
            <span
              className={styles.logoMark}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            >
              FORGE_07
            </span>
            <span
              className={styles.logoMark}
              style={{ fontStyle: "italic", letterSpacing: ".04em" }}
            >
              Sundial
            </span>
          </div>
        </div>
      </div>

      <DashboardPreview />
    </div>
  );
}

function DashboardPreview() {
  const bars = [28, 42, 38, 52, 48, 61, 55, 72, 68, 76, 82, 74, 88, 92, 84, 78, 90, 98, 86, 72, 64, 58, 50, 44];
  return (
    <div
      className={styles.previewWrap}
      style={{ marginTop: 96, marginLeft: "auto", marginRight: "auto", maxWidth: 1024, textAlign: "left" }}
    >
      <div className={styles.previewFrame}>
        <div className={styles.previewChrome}>
          <span className={styles.dotR} />
          <span className={styles.dotR} />
          <span className={styles.dotR} />
          <span className={styles.urlPill}>
            <span className={styles.urlDot} />
            app.gameops.gg / live-ops
          </span>
          <span className={styles.cornerMono} style={{ marginLeft: "auto" }}>
            ⌘K · SEARCH
          </span>
        </div>
        <div className={styles.previewGrid}>
          <aside className={styles.pvSide}>
            <div className={styles.pvSideHead}>Workspace</div>
            <div className={`${styles.pvNavRow} ${styles.pvNavActive}`}>
              <span className={styles.pvIc} />
              Overview
            </div>
            <div className={styles.pvNavRow}>
              <span className={styles.pvIc} />
              Matchmaking
            </div>
            <div className={styles.pvNavRow}>
              <span className={styles.pvIc} />
              Economy
            </div>
            <div className={styles.pvNavRow}>
              <span className={styles.pvIc} />
              Player health
            </div>
            <div className={styles.pvNavRow}>
              <span className={styles.pvIc} />
              Experiments
            </div>
            <div className={styles.pvSideHead} style={{ paddingTop: 16 }}>
              Live
            </div>
            <div className={styles.pvNavRow}>
              <span className={styles.pvIc} />
              Incidents
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "#34d399",
                }}
              >
                0
              </span>
            </div>
            <div className={styles.pvNavRow}>
              <span className={styles.pvIc} />
              Releases
            </div>
          </aside>
          <div className={styles.pvMain}>
            <div className={styles.pvKpis}>
              <KpiCard label="CCU" value="184,302" delta="↑ 12.4% vs 24h" />
              <KpiCard label="Match P99" value="42ms" delta="↓ 8.1% vs 24h" />
              <KpiCard label="Crash rate" value="0.04%" delta="↑ 0.01%" down />
              <KpiCard label="ARPDAU" value="$0.87" delta="↑ 4.2%" />
            </div>
            <div className={styles.pvRowWide}>
              <div className={styles.pvHead}>
                <span className={styles.pvTitle}>Concurrent players · last 24h</span>
                <span className={styles.pvChip}>Region · GLOBAL</span>
              </div>
              <div className={styles.pvBars}>
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className={styles.pvBar}
                    style={{ height: `${h}%`, animationDelay: `${1.4 + i * 0.022}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.previewFade} />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  down,
}: {
  label: string;
  value: string;
  delta: string;
  down?: boolean;
}) {
  return (
    <div className={styles.pvCard}>
      <div className={styles.pvLabel}>{label}</div>
      <div className={styles.pvValue}>{value}</div>
      <div className={`${styles.pvDelta} ${down ? styles.pvDeltaDown : ""}`}>{delta}</div>
      <svg className={styles.pvSparkline} width="56" height="22" viewBox="0 0 56 22" fill="none">
        <path
          d="M2 18 L10 14 L18 16 L26 10 L34 12 L42 6 L54 4"
          stroke={down ? "#f87171" : "#34d399"}
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    </div>
  );
}

function AuthModal({
  open,
  initialTab,
  onClose,
}: {
  open: boolean;
  initialTab: Tab;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 260);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={styles.modalBackdrop}
      data-closing={closing}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modalCardWrap}>
        <button
          type="button"
          className={styles.modalClose}
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={15} stroke={2.2} />
        </button>
        <AuthForm initialTab={initialTab} />
      </div>
    </div>
  );
}

export default function LoginClient() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<Tab>("login");
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const openAuth = (tab: Tab) => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  useEffect(() => {
    const m = mainRef.current;
    if (!m) return;
    const onScroll = () => setScrolled(m.scrollTop > 40);
    onScroll();
    m.addEventListener("scroll", onScroll, { passive: true });
    return () => m.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  return (
    <div className={styles.page}>
      <DottedSurface />
      <div className={styles.stageGlow}>
        <div className={styles.blobA} />
        <div className={styles.blobB} />
      </div>
      <div className={styles.accentLines}>
        <div className={`${styles.hline} ${styles.hline1}`} />
        <div className={`${styles.hline} ${styles.hline2}`} />
        <div className={`${styles.hline} ${styles.hline3}`} />
        <div className={`${styles.vline} ${styles.vline1}`} />
        <div className={`${styles.vline} ${styles.vline2}`} />
        <div className={`${styles.vline} ${styles.vline3}`} />
      </div>
      <Particles />
      <div className={styles.stageVignette} />

      <Header onOpenAuth={openAuth} scrolled={scrolled} />

      <main ref={mainRef} className={styles.main}>
        <Hero onOpenAuth={openAuth} />
      </main>

      <div className={styles.bottomMono}>
        <span>© 2026 GameOps Inc.</span>
        <span>build · 26.05.27</span>
      </div>

      <AuthModal open={authOpen} initialTab={authTab} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
