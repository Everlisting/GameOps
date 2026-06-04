"use client";

/**
 * 登录/注册表单(模态卡片主体)。接 /api/auth/login | /api/auth/register。
 * 成功后按 role 跳转:CREATOR → /dashboard,OPERATOR/ADMIN → /operator/dashboard。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  UserIcon,
} from "./icons";

type Tab = "login" | "signup";

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  icon: React.ReactNode;
  rightSlot?: React.ReactNode;
};

function Field({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  autoComplete,
  icon,
  rightSlot,
}: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block"
        style={{ fontSize: 12, fontWeight: 500, color: "#d4d4d8", marginBottom: 6 }}
      >
        {label}
      </label>
      <div className={styles.field}>
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <span className={styles.iconLeft}>{icon}</span>
        {rightSlot}
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field
      id={id}
      label={label}
      type={show ? "text" : "password"}
      placeholder="••••••••"
      icon={<Lock size={16} />}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      rightSlot={
        <button
          type="button"
          className={styles.iconRight}
          aria-label={show ? "隐藏密码" : "显示密码"}
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span
        className={styles.check}
        data-checked={checked}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        <Check size={11} stroke={3} />
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
      <span style={{ fontSize: 13, color: "#a1a1aa" }}>{children}</span>
    </label>
  );
}

function StrengthBar({ score }: { score: number }) {
  const colors = ["#ef4444", "#f59e0b", "#34d399", "#10b981"];
  const labels = ["", "较弱", "一般", "良好", "强"];
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 9999,
            background:
              i < score ? colors[Math.min(score - 1, 3)] : "#27272a",
            transition: "background .3s ease",
          }}
        />
      ))}
      <span
        style={{
          fontSize: 10.5,
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "#71717a",
          marginLeft: 4,
          width: 36,
          textAlign: "right",
        }}
      >
        {labels[score]}
      </span>
    </div>
  );
}

export default function AuthForm({ initialTab = "login" }: { initialTab?: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);

  const [loginUser, setLoginUser] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [remember, setRemember] = useState(true);

  const [nickname, setNickname] = useState("");
  const [signupUser, setSignupUser] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPw, setSignupPw] = useState("");
  const [signupPw2, setSignupPw2] = useState("");
  const [terms, setTerms] = useState(false);

  const pwMismatch = signupPw2.length > 0 && signupPw !== signupPw2;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);

  const [pwStrength, setPwStrength] = useState(0);
  useEffect(() => {
    const v = signupPw;
    let s = 0;
    if (v.length >= 6) s++;
    if (v.length >= 10) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
    setPwStrength(s);
  }, [signupPw]);

  useEffect(() => {
    setError(null);
    setSignupSuccess(null);
  }, [tab]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const isLogin = tab === "login";
      const url = isLogin ? "/api/auth/login" : "/api/auth/register";
      const body = isLogin
        ? { username: loginUser, password: loginPw }
        : {
            username: signupUser,
            password: signupPw,
            confirmPassword: signupPw2,
            nickname,
            email: signupEmail,
          };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const detailMsg = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detailMsg || data?.error?.message || "操作失败");
        return;
      }
      // 注册:不签发 session,展示"待审核"提示,清空表单
      if (!isLogin) {
        setSignupSuccess(
          data?.message ?? "注册成功,账号已提交运营审核,审核通过后即可登录。",
        );
        setNickname("");
        setSignupUser("");
        setSignupEmail("");
        setSignupPw("");
        setSignupPw2("");
        setTerms(false);
        return;
      }
      const dest = data.role === "CREATOR" ? "/dashboard" : "/operator/dashboard";
      router.push(dest);
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !submitting) submit();
  }

  return (
    <div style={{ width: 500, maxWidth: "calc(100vw - 32px)" }}>
      <div className={styles.cardShell}>
        <span className={`${styles.corner} ${styles.cornerTl}`} />
        <span className={`${styles.corner} ${styles.cornerTr}`} />
        <span className={`${styles.corner} ${styles.cornerBl}`} />
        <span className={`${styles.corner} ${styles.cornerBr}`} />

        <div style={{ padding: "28px 28px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div className={styles.cornerMono}>
              <Shield size={12} className="text-emerald-400" />
              SECURE • TLS 1.3
            </div>
            <div className={styles.cornerMono}>/ AUTH</div>
          </div>

          <h2
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {tab === "login" ? "欢迎回来,运营" : "加入控制中枢"}
          </h2>
          <p style={{ fontSize: 13.5, color: "#a1a1aa", marginTop: 6 }}>
            {tab === "login"
              ? "登录你的 GameOps 工作台。"
              : "注册一个创作者账号,接入实时数据。"}
          </p>

          <div style={{ marginTop: 24 }}>
            <div className={styles.tabsList} role="tablist">
              <span
                className={styles.tabIndicator}
                style={{
                  transform: `translateX(${tab === "login" ? "0%" : "calc(100% + 4px)"})`,
                }}
              />
              <button
                type="button"
                role="tab"
                aria-selected={tab === "login"}
                data-active={tab === "login"}
                className={styles.tabTrigger}
                onClick={() => setTab("login")}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signup"}
                data-active={tab === "signup"}
                className={styles.tabTrigger}
                onClick={() => setTab("signup")}
              >
                注册
              </button>
            </div>
          </div>

          <div className={styles.tabShell} style={{ marginTop: 24 }} onKeyDown={onEnter}>
            {/* LOGIN */}
            <div
              className={styles.tabPanel}
              data-state={tab === "login" ? "active" : "inactive"}
            >
              <Field
                id="login-user"
                label="用户名"
                placeholder="your-handle"
                icon={<UserIcon size={16} />}
                value={loginUser}
                onChange={setLoginUser}
                autoComplete="username"
              />
              <div style={{ marginTop: 16 }}>
                <PasswordField
                  id="login-pw"
                  label="密码"
                  value={loginPw}
                  onChange={setLoginPw}
                  autoComplete="current-password"
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <CheckRow id="remember" checked={remember} onChange={setRemember}>
                  记住此设备
                </CheckRow>
                <span
                  className={styles.linkU}
                  style={{ fontSize: 12.5, color: "#71717a", cursor: "not-allowed" }}
                  title="暂未开放"
                >
                  忘记密码?
                </span>
              </div>

              {error && <div className={styles.formError}>{error}</div>}

              <button
                type="button"
                className={styles.cta}
                style={{ marginTop: 20 }}
                disabled={submitting}
                onClick={submit}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {submitting ? "处理中…" : "登录"} <ArrowRight size={14} stroke={2.5} />
                </span>
              </button>
            </div>

            {/* SIGNUP */}
            <div
              className={styles.tabPanel}
              data-state={tab === "signup" ? "active" : "inactive"}
            >
              <Field
                id="signup-nickname"
                label="昵称"
                placeholder="对外展示的昵称"
                icon={<UserIcon size={16} />}
                value={nickname}
                onChange={setNickname}
                autoComplete="nickname"
              />
              <div style={{ marginTop: 16 }}>
                <Field
                  id="signup-user"
                  label="用户名"
                  placeholder="3-32 字符,登录用"
                  icon={<UserIcon size={16} />}
                  value={signupUser}
                  onChange={setSignupUser}
                  autoComplete="username"
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <Field
                  id="signup-email"
                  label="邮箱"
                  type="email"
                  placeholder="you@studio.gg"
                  icon={<Mail size={16} />}
                  value={signupEmail}
                  onChange={setSignupEmail}
                  autoComplete="email"
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <PasswordField
                  id="signup-pw"
                  label="密码"
                  value={signupPw}
                  onChange={setSignupPw}
                  autoComplete="new-password"
                />
                <StrengthBar score={pwStrength} />
              </div>
              <div style={{ marginTop: 16 }}>
                <PasswordField
                  id="signup-pw2"
                  label="确认密码"
                  value={signupPw2}
                  onChange={setSignupPw2}
                  autoComplete="new-password"
                />
                {pwMismatch && (
                  <p style={{ marginTop: 6, fontSize: 12, color: "#fca5a5" }}>
                    两次输入的密码不一致
                  </p>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <CheckRow id="terms" checked={terms} onChange={setTerms}>
                  我已阅读并同意
                  <a className={styles.linkU} style={{ color: "#e4e4e7", margin: "0 4px" }} href="#">
                    服务条款
                  </a>
                  与
                  <a className={styles.linkU} style={{ color: "#e4e4e7", marginLeft: 4 }} href="#">
                    隐私政策
                  </a>
                </CheckRow>
              </div>

              {error && <div className={styles.formError}>{error}</div>}
              {signupSuccess && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(16,185,129,0.4)",
                    background: "rgba(16,185,129,0.08)",
                    color: "#bbf7d0",
                    fontSize: 12.5,
                    lineHeight: 1.6,
                  }}
                >
                  {signupSuccess}
                  <button
                    type="button"
                    onClick={() => setTab("login")}
                    style={{
                      marginTop: 6,
                      color: "#34d399",
                      fontWeight: 500,
                      textDecoration: "underline",
                      cursor: "pointer",
                      background: "transparent",
                      border: 0,
                      padding: 0,
                    }}
                  >
                    去登录页等待 →
                  </button>
                </div>
              )}

              <button
                type="button"
                className={styles.cta}
                style={{ marginTop: 20 }}
                disabled={!terms || submitting || pwMismatch || !signupPw2}
                onClick={submit}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {submitting ? "处理中…" : "创建账号"} <ArrowRight size={14} stroke={2.5} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(63,63,70,0.55)",
            padding: "16px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12.5,
            color: "#71717a",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              fontSize: 10.5,
            }}
          >
            SOC 2 · GDPR · ISO 27001
          </span>
          <span className={styles.linkU} style={{ color: "#d4d4d8", cursor: "not-allowed" }}>
            需要帮助?
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "#71717a",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className={styles.liveDot}></span> All systems operational
        </span>
        <span>Region · IAD-1</span>
      </div>
    </div>
  );
}
