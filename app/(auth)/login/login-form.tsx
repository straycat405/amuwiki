"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type LoginState, requestLoginLink } from "./actions";

const initialState: LoginState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button login-submit" disabled={pending} type="submit">
      {pending ? "보내는 중" : "로그인 링크 받기"}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(requestLoginLink, initialState);

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
      <SubmitButton />
      {state.message ? (
        <p className={`form-message form-message--${state.status}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
