"use client";

import type { ReactNode } from "react";

import { usePreferences } from "@/components/preferences/preferences-provider";
import {
  colorModes,
  contentWidths,
  fontPresets,
  fontScales,
  lineBreakModes,
  themeKeys,
  type Preferences,
} from "@/features/preferences/preferences";

const themeLabels: Record<Preferences["theme"], string> = {
  "paper-green": "페이퍼 그린",
  "toss-blue": "토스 블루",
  "ink-indigo": "잉크 인디고",
};

const modeLabels: Record<Preferences["mode"], string> = {
  system: "시스템",
  light: "라이트",
  dark: "다크",
};

const fontLabels: Record<Preferences["font"], string> = {
  pretendard: "Pretendard",
  suit: "SUIT",
  "noto-sans-kr": "Noto Sans KR",
};

const fontScaleLabels: Record<Preferences["fontScale"], string> = {
  small: "작게",
  normal: "보통",
  large: "크게",
};

const contentWidthLabels: Record<Preferences["contentWidth"], string> = {
  narrow: "좁게",
  normal: "보통",
  wide: "넓게",
};

const lineBreakLabels: Record<Preferences["lineBreakMode"], string> = {
  hard: "Enter = 줄바꿈",
  soft: "Enter = 문단 (CommonMark 기본값)",
};

function OptionGroup<T extends string>({
  legend,
  name,
  value,
  options,
  labels,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="settings-fieldset">
      <legend>{legend}</legend>
      <div className="settings-options" role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <label
            key={option}
            className={
              "settings-option" +
              (value === option ? " settings-option--active" : "")
            }
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-labelledby={`${title}-heading`}>
      <header className="settings-section__header">
        <h2 id={`${title}-heading`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function SettingsForm() {
  const { preferences, updatePreference, pending, error } = usePreferences();

  return (
    <div className="settings-form">
      <SettingsSection title="테마">
        <OptionGroup
          legend="색상 테마"
          name="theme"
          value={preferences.theme}
          options={themeKeys}
          labels={themeLabels}
          onChange={(value) => updatePreference("theme", value)}
        />
      </SettingsSection>

      <SettingsSection title="명암 모드">
        <OptionGroup
          legend="명암 모드"
          name="mode"
          value={preferences.mode}
          options={colorModes}
          labels={modeLabels}
          onChange={(value) => updatePreference("mode", value)}
        />
      </SettingsSection>

      <SettingsSection title="글꼴">
        <OptionGroup
          legend="글꼴"
          name="font"
          value={preferences.font}
          options={fontPresets}
          labels={fontLabels}
          onChange={(value) => updatePreference("font", value)}
        />
      </SettingsSection>

      <SettingsSection title="글자 크기">
        <OptionGroup
          legend="글자 크기"
          name="fontScale"
          value={preferences.fontScale}
          options={fontScales}
          labels={fontScaleLabels}
          onChange={(value) => updatePreference("fontScale", value)}
        />
      </SettingsSection>

      <SettingsSection title="본문 폭">
        <OptionGroup
          legend="본문 폭"
          name="contentWidth"
          value={preferences.contentWidth}
          options={contentWidths}
          labels={contentWidthLabels}
          onChange={(value) => updatePreference("contentWidth", value)}
        />
      </SettingsSection>

      <SettingsSection
        title="줄바꿈"
        description="편집기에서 Enter 한 번을 읽기 화면에 어떻게 반영할지 정합니다."
      >
        <OptionGroup
          legend="줄바꿈 모드"
          name="lineBreakMode"
          value={preferences.lineBreakMode}
          options={lineBreakModes}
          labels={lineBreakLabels}
          onChange={(value) => updatePreference("lineBreakMode", value)}
        />
      </SettingsSection>

      <SettingsSection
        title="미리보기 툴팁"
        description="문서 안의 위키링크에 마우스를 올렸을 때 나타나는 미리보기입니다."
      >
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={preferences.tooltipEnabled}
            onChange={(event) =>
              updatePreference("tooltipEnabled", event.target.checked)
            }
          />
          호버 미리보기 사용
        </label>
        <label className="settings-range">
          <span>
            첫 호버 지연 시간
            <strong>{preferences.tooltipDelayMs}ms</strong>
          </span>
          <input
            type="range"
            min={250}
            max={800}
            step={50}
            value={preferences.tooltipDelayMs}
            disabled={!preferences.tooltipEnabled}
            onChange={(event) =>
              updatePreference("tooltipDelayMs", Number(event.target.value))
            }
          />
        </label>
      </SettingsSection>

      <p
        className={"settings-status" + (error ? " settings-status--error" : "")}
        role="status"
        aria-live="polite"
      >
        {error ? error : pending ? "저장 중..." : "변경 사항은 즉시 저장됩니다."}
      </p>
    </div>
  );
}
