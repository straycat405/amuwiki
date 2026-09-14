import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="brand auth-brand" href="/" aria-label="아무위키 홈">
          <span className="brand__mark" aria-hidden="true" />
          <span>아무위키</span>
        </Link>
        <h1 id="login-title">로그인</h1>
        <LoginForm />
      </section>
    </main>
  );
}
