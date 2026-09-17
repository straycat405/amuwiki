"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type LoginState, loginWithPassword } from "./actions";

const initialState: LoginState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button login-submit" disabled={pending} type="submit">
      {pending ? "확인 중" : "로그인"}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginWithPassword, initialState);

  return (
    <form className="login-form" action={action}>
      <label htmlFor="email">이메일</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        placeholder="name@example.com"
        required
        type="email"
      />
      <label htmlFor="password">비밀번호</label>
      <input
        autoComplete="current-password"
        id="password"
        name="password"
        required
        type="password"
      />
      <SubmitButton />
      {state.message ? (
        <p className={`form-message form-message--${state.status}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
