"use client";

import { Check, MessageSquarePlus, Trash2, Unlink } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createAnnotationAction,
  deleteAnnotationAction,
  updateAnnotationAction,
} from "@/app/(wiki)/documents/actions";
import type { Annotation, AnnotationColor } from "@/features/annotations/types";
import { createTextAnchor, markdownToAnchorText, type TextAnchor } from "@/lib/markdown/anchor-text";

const colors: AnnotationColor[] = ["yellow", "blue", "green", "red"];

type Props = PropsWithChildren<{
  annotations: Annotation[];
  documentId: string;
  documentRevision: number;
  markdown: string;
}>;

export function AnnotationWorkspace({ annotations: initial, children, documentId, documentRevision, markdown }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [annotations, setAnnotations] = useState(initial);
  const [selectedText, setSelectedText] = useState("");
  const [anchor, setAnchor] = useState<TextAnchor | null>(null);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState<AnnotationColor>("yellow");
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const text = useMemo(() => markdownToAnchorText(markdown), [markdown]);

  useEffect(() => {
    const markdownBody = root.current?.querySelector(".markdown-body");
    if (!markdownBody || !("highlights" in CSS)) return;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("::highlight(annotation-yellow){background:rgb(240 200 107 / 42%)}::highlight(annotation-blue){background:rgb(109 175 247 / 35%)}::highlight(annotation-green){background:rgb(117 189 147 / 35%)}::highlight(annotation-red){background:rgb(235 126 134 / 35%)}");
    const originalSheets = document.adoptedStyleSheets;
    document.adoptedStyleSheets = [...originalSheets, sheet];
    const groups = new Map<AnnotationColor, Range[]>();
    const visible = markdownBody.textContent ?? "";
    const nodes: Array<{ node: Text; start: number; end: number }> = [];
    const walker = document.createTreeWalker(markdownBody, NodeFilter.SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as Text;
      nodes.push({ node: textNode, start: offset, end: offset + textNode.data.length });
      offset += textNode.data.length;
    }
    function rangeFor(start: number, end: number) {
      const first = nodes.find((entry) => start >= entry.start && start < entry.end);
      const last = [...nodes].reverse().find((entry) => end > entry.start && end <= entry.end);
      if (!first || !last) return null;
      const range = document.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      return range;
    }
    for (const annotation of annotations.filter((item) => item.status !== "orphaned")) {
      const positions: number[] = [];
      let position = visible.indexOf(annotation.quote_exact);
      while (position >= 0) { positions.push(position); position = visible.indexOf(annotation.quote_exact, position + 1); }
      const start = positions.reduce((best, candidate) => Math.abs(candidate - annotation.anchor_start) < Math.abs(best - annotation.anchor_start) ? candidate : best, positions[0] ?? -1);
      const range = start >= 0 ? rangeFor(start, start + annotation.quote_exact.length) : null;
      if (range) groups.set(annotation.color_key, [...(groups.get(annotation.color_key) ?? []), range]);
    }
    for (const color of colors) CSS.highlights.set(`annotation-${color}`, new Highlight(...(groups.get(color) ?? [])));
    return () => { for (const color of colors) CSS.highlights.delete(`annotation-${color}`); document.adoptedStyleSheets = originalSheets; };
  }, [annotations]);

  function selectionAnchor() {
    const selection = window.getSelection();
    const exact = selection?.toString().normalize("NFC").trim() ?? "";
    const markdownBody = root.current?.querySelector(".markdown-body");
    if (!exact || !markdownBody || !selection?.rangeCount || !markdownBody.contains(selection.getRangeAt(0).commonAncestorContainer)) return null;
    const visibleStart = markdownBody.textContent?.indexOf(exact) ?? 0;
    return createTextAnchor(text, exact, Math.max(0, visibleStart));
  }

  function handleSelection() {
    const anchor = selectionAnchor();
    if (!anchor) return;
    setSelectedText(anchor.exact);
    setAnchor(anchor);
    if (editing?.status !== "orphaned") setEditing(null);
    setDraft("");
    setNotice("");
  }

  function save() {
    if (!anchor || !draft.trim()) return;
    setNotice("");
    startTransition(async () => {
      let ok = false;
      if (editing) {
        const result = await updateAnnotationAction({
          id: editing.id, bodyMarkdown: draft, colorKey: color,
          status: "active", anchorStart: anchor.start, anchorEnd: anchor.end,
          quoteExact: anchor.exact, quotePrefix: anchor.prefix, quoteSuffix: anchor.suffix,
        });
        if (result.ok) { ok = true; setAnnotations((items) => items.map((item) => item.id === editing.id ? { ...item, body_markdown: draft, color_key: color, status: "active", anchor_start: anchor.start, anchor_end: anchor.end, quote_exact: anchor.exact, quote_prefix: anchor.prefix, quote_suffix: anchor.suffix } : item)); }
        else setNotice(result.message);
      } else {
        const result = await createAnnotationAction({ documentId, documentRevision, bodyMarkdown: draft, colorKey: color, anchorStart: anchor.start, anchorEnd: anchor.end, quoteExact: anchor.exact, quotePrefix: anchor.prefix, quoteSuffix: anchor.suffix });
        if (result.ok) { ok = true; if (result.annotation) setAnnotations((items) => [...items, result.annotation!]); }
        else setNotice(result.message);
      }
      if (ok) { setSelectedText(""); setAnchor(null); setDraft(""); setEditing(null); window.getSelection()?.removeAllRanges(); router.refresh(); }
    });
  }

  function change(annotation: Annotation, changes: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateAnnotationAction({ id: annotation.id, ...changes });
      if (!result.ok) return setNotice(result.message);
      setAnnotations((items) => items.map((item) => item.id === annotation.id ? (result.annotation ?? { ...item, ...changes }) : item));
    });
  }

  function remove(annotation: Annotation) {
    if (!window.confirm("이 주석을 휴지통으로 이동할까요?")) return;
    startTransition(async () => {
      const result = await deleteAnnotationAction(annotation.id);
      if (!result.ok) return setNotice(result.message);
      setAnnotations((items) => items.filter((item) => item.id !== annotation.id));
    });
  }

  const orphaned = annotations.filter((annotation) => annotation.status === "orphaned");
  return (
    <div className="annotation-workspace" ref={root} onMouseUp={handleSelection}>
      {children}
      {selectedText ? (
        <section className="annotation-composer" aria-label="주석 작성">
          <p className="annotation-composer__quote">“{selectedText}”</p>
          <textarea autoFocus disabled={pending} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder="개인 메모" value={draft} />
          <div className="annotation-composer__actions">
            <div className="annotation-colors" aria-label="주석 색상">
              {colors.map((key) => <button aria-label={`${key} 색상`} aria-pressed={color === key} className={`annotation-color annotation-color--${key}`} key={key} onClick={() => setColor(key)} type="button" />)}
            </div>
            <button className="secondary-button" onClick={() => { setSelectedText(""); setAnchor(null); setEditing(null); }} type="button">취소</button>
            <button className="primary-button" disabled={pending || !draft.trim()} onClick={save} type="button"><MessageSquarePlus size={16} aria-hidden="true" />저장</button>
          </div>
        </section>
      ) : null}
      {orphaned.length ? <section className="annotation-orphans" aria-labelledby="orphaned-annotations"><h2 id="orphaned-annotations"><Unlink size={16} aria-hidden="true" />연결 끊긴 주석</h2><p>본문에서 새 범위를 선택한 뒤 이 주석을 다시 지정하세요.</p>{orphaned.map((annotation) => <AnnotationItem annotation={annotation} key={annotation.id} onDelete={remove} onEdit={() => { setEditing(annotation); setDraft(annotation.body_markdown); setColor(annotation.color_key); setAnchor(null); setNotice("새 범위를 선택한 뒤 저장하세요."); }} onResolve={() => change(annotation, { status: "resolved" })} />)}</section> : null}
      {annotations.filter((annotation) => annotation.status !== "orphaned").length ? <section className="annotation-list" aria-label="주석 목록">{annotations.filter((annotation) => annotation.status !== "orphaned").map((annotation) => <AnnotationItem annotation={annotation} key={annotation.id} onDelete={remove} onEdit={() => { setEditing(annotation); setDraft(annotation.body_markdown); setColor(annotation.color_key); setSelectedText(annotation.quote_exact); setAnchor({ start: annotation.anchor_start, end: annotation.anchor_end, exact: annotation.quote_exact, prefix: annotation.quote_prefix, suffix: annotation.quote_suffix }); }} onResolve={() => change(annotation, { status: annotation.status === "resolved" ? "active" : "resolved" })} />)}</section> : null}
      {notice ? <p className="form-message form-message--error" role="alert">{notice}</p> : null}
    </div>
  );
}

function AnnotationItem({ annotation, onDelete, onEdit, onResolve }: { annotation: Annotation; onDelete: (annotation: Annotation) => void; onEdit: () => void; onResolve: () => void }) {
  return <article className={`annotation-item annotation-item--${annotation.color_key}`}><blockquote>“{annotation.quote_exact}”</blockquote><p>{annotation.body_markdown}</p><div><button className="secondary-button" onClick={onEdit} type="button">수정</button><button className="secondary-button" onClick={onResolve} type="button"><Check size={15} aria-hidden="true" />{annotation.status === "resolved" ? "다시 열기" : "해결"}</button><button aria-label="주석 삭제" className="secondary-button secondary-button--danger" onClick={() => onDelete(annotation)} type="button"><Trash2 size={15} aria-hidden="true" /></button></div></article>;
}
