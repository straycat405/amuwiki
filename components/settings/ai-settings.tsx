"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteApiKeyAction,
  saveApiKeyAction,
  updateMonthlyTokenCapAction,
  type AiActionResult,
} from "@/app/(wiki)/settings/ai/actions";
import type { AiSettings, AiUsage } from "@/features/ai/types";
import { estimateCostUsd } from "@/lib/ai/pricing";
import type { AiProviderId } from "@/lib/ai/provider";

type Props = {
  configured: boolean;
  models: Record<AiProviderId, string>;
  settings: AiSettings;
  usage: AiUsage;
};

const providerOptions: { id: AiProviderId; label: string; placeholder: string }[] = [
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
];

const numberFormat = new Intl.NumberFormat("ko-KR");

export function AiSettingsSection({ configured, models, settings, usage }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<AiProviderId>(settings.provider);
  const [keyInput, setKeyInput] = useState("");
  const [capInput, setCapInput] = useState(String(settings.monthlyTokenCap));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function run(action: () => Promise<AiActionResult>, successText: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { tone: "success", text: successText } : { tone: "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  const activeProvider = settings.enabled ? settings.provider : provider;
  const model = models[activeProvider];
  const providerLabel = providerOptions.find((option) => option.id === activeProvider)?.label ?? activeProvider;
  const cost = estimateCostUsd(usage, models[settings.provider]);

  return (
    <div className="settings-section" aria-labelledby="ai-settings-title">
      <header className="settings-section__header">
        <h2 id="ai-settings-title">AI</h2>
        <p>
          내 API 키로 카드 안에서 질문하고 빈 요약을 채웁니다. 키는 암호화해 저장하며 토큰
          비용은 키 소유자에게 청구됩니다. 모델: <code>{model}</code>
        </p>
      </header>

      {!configured ? (
        <p className="settings-status settings-status--error">
          이 배포에는 AI 키 암호화 비밀이 설정되지 않아 AI 기능을 사용할 수 없습니다.
        </p>
      ) : null}

      <div className="ai-key-row">
        {settings.enabled ? (
          <>
            <span className="ai-key-status">
              {providerLabel} 연결됨 · <code>…{settings.keyHint}</code>
            </span>
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("저장된 API 키를 삭제할까요? AI 기능이 꺼집니다.")) return;
                run(deleteApiKeyAction, "API 키를 삭제했습니다.");
              }}
            >
              키 삭제
            </button>
          </>
        ) : (
          <form
            className="ai-key-form"
            onSubmit={(event) => {
              event.preventDefault();
              const value = keyInput;
              const selected = provider;
              run(
                async () => {
                  const result = await saveApiKeyAction(selected, value);
                  if (result.ok) setKeyInput("");
                  return result;
                },
                "API 키를 확인하고 저장했습니다.",
              );
            }}
          >
            <fieldset className="ai-provider">
              <legend className="visually-hidden">공급자</legend>
              {providerOptions.map((option) => (
                <label key={option.id} className={`ai-provider__option${provider === option.id ? " ai-provider__option--active" : ""}`}>
                  <input
                    checked={provider === option.id}
                    disabled={!configured || pending}
                    name="provider"
                    onChange={() => setProvider(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label className="ai-field">
              <span>{providerLabel} API 키</span>
              <input
                autoComplete="off"
                disabled={!configured || pending}
                name="apiKey"
                onChange={(event) => setKeyInput(event.target.value)}
                placeholder={providerOptions.find((option) => option.id === provider)?.placeholder}
                spellCheck={false}
                type="password"
                value={keyInput}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={!configured || pending || keyInput.trim().length === 0}
            >
              {pending ? "확인 중…" : "확인 후 저장"}
            </button>
          </form>
        )}
      </div>

      <form
        className="ai-cap-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => updateMonthlyTokenCapAction(capInput), "월 토큰 한도를 저장했습니다.");
        }}
      >
        <label className="ai-field">
          <span>월 토큰 한도 (0 = 제한 없음)</span>
          <input
            disabled={pending}
            inputMode="numeric"
            min={0}
            name="monthlyTokenCap"
            onChange={(event) => setCapInput(event.target.value)}
            step={1000}
            type="number"
            value={capInput}
          />
        </label>
        <button type="submit" className="secondary-button" disabled={pending}>
          한도 저장
        </button>
      </form>

      <dl className="ai-usage">
        <div>
          <dt>이번 달 호출</dt>
          <dd>{numberFormat.format(usage.runCount)}회</dd>
        </div>
        <div>
          <dt>입력 토큰</dt>
          <dd>{numberFormat.format(usage.inputTokens)}</dd>
        </div>
        <div>
          <dt>캐시 읽기</dt>
          <dd>{numberFormat.format(usage.cacheReadTokens)}</dd>
        </div>
        <div>
          <dt>출력 토큰</dt>
          <dd>{numberFormat.format(usage.outputTokens)}</dd>
        </div>
        <div>
          <dt>추정 비용</dt>
          <dd>{cost === null ? "—" : `$${cost.toFixed(4)}`}</dd>
        </div>
      </dl>

      {message ? (
        <p
          className={`settings-status${message.tone === "error" ? " settings-status--error" : ""}`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
