"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/features/mindmap/api";
import { useMapStore } from "@/features/mindmap/store";
import type { Person } from "@/features/mindmap/types";
import { buildCommentDoc, mentionQuery, type Mentionable } from "./mentions";
import type { CommentDoc, CommentDto } from "./types";

const display = (p: Pick<Person, "name" | "email">) => p.name ?? p.email;

function Body({ doc }: { doc: CommentDoc }) {
  return (
    <div className="space-y-1 text-sm">
      {doc.content?.map((para, i) => (
        <p key={i} className="whitespace-pre-wrap break-words">
          {para.content?.map((c, j) =>
            c.type === "mention" ? (
              <span key={j} className="rounded bg-primary/15 px-1 font-medium">
                @{c.attrs.label}
              </span>
            ) : (
              <span key={j}>{c.text}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function Composer({ nodeId, parentId, onDone, autoFocus, shared }: { nodeId: string; parentId: string | null; onDone: () => void; autoFocus?: boolean; shared?: boolean }) {
  const t = useTranslations("drawer");
  const qc = useQueryClient();
  const people = useMapStore((s) => s.people);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [forClient, setForClient] = useState(false);

  const q = mentionQuery(text, caret);
  const options = useMemo(() => {
    if (!q) return [];
    const needle = q.query.toLowerCase();
    return Object.values(people)
      .filter((p) => display(p).toLowerCase().includes(needle))
      .slice(0, 6);
  }, [q, people]);

  const post = useMutation({
    mutationFn: () => {
      const { doc, mentions } = buildCommentDoc(text.trim(), picked);
      return api.post(`/api/v1/nodes/${nodeId}/comments`, { body: doc, mentions, parentCommentId: parentId, ...(shared && forClient ? { visibleToClient: true } : {}) });
    },
    onSuccess: () => {
      setText("");
      setPicked([]);
      void qc.invalidateQueries({ queryKey: ["comments", nodeId] });
      void qc.invalidateQueries({ queryKey: ["activity", nodeId] });
      onDone();
    },
  });

  function pick(p: Person) {
    if (!q) return;
    const label = display(p);
    const next = `${text.slice(0, q.start)}@${label} ${text.slice(caret)}`;
    setText(next);
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, { id: p.id, label }]));
    const pos = q.start + label.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        aria-label={t("commentPlaceholder")}
        placeholder={t("commentPlaceholder")}
        className="min-h-16 w-full resize-y rounded-md border border-border bg-card p-2 text-sm"
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart);
          setActive(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (options.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const p = options[active];
              if (p) pick(p);
            } else if (e.key === "Escape") {
              setCaret(0);
            }
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) {
            post.mutate();
          }
        }}
      />
      {options.length > 0 && (
        <ul role="listbox" className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-md border border-border bg-card p-1 shadow-lg">
          {options.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full flex-col rounded px-2 py-1 text-left text-sm ${i === active ? "bg-muted" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
              >
                <span>{display(p)}</span>
                {p.name && <span className="text-xs text-muted-foreground">{p.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex items-center justify-end gap-3">
        {shared && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={forClient} onChange={(e) => setForClient(e.target.checked)} />
            {t("visibleToClient")}
          </label>
        )}
        <Button size="sm" disabled={!text.trim() || post.isPending} onClick={() => post.mutate()}>
          {t("send")}
        </Button>
      </div>
    </div>
  );
}

export function Comments({ nodeId, meId, canComment, shared }: { nodeId: string; meId: string; canComment: boolean; shared?: boolean }) {
  const t = useTranslations("drawer");
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const { data = [] } = useQuery({ queryKey: ["comments", nodeId], queryFn: () => api.get<CommentDto[]>(`/api/v1/nodes/${nodeId}/comments`) });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/comments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["comments", nodeId] }),
  });

  const roots = data.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => data.filter((c) => c.parentCommentId === id);

  const Item = ({ c, nested }: { c: CommentDto; nested?: boolean }) => (
    <div className={nested ? "ml-4 border-l border-border pl-3" : ""} data-testid="comment">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{display(c.author)}</span>
        <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString()}</time>
        {c.isAiGenerated && <span className="rounded bg-muted px-1">AI</span>}
        {c.visibleToClient && <span className="rounded bg-primary/15 px-1">{t("client")}</span>}
      </div>
      <Body doc={c.body} />
      <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
        {canComment && !nested && (
          <button className="hover:text-foreground" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
            {t("reply")}
          </button>
        )}
        {c.author.id === meId && (
          <button className="hover:text-foreground" onClick={() => remove.mutate(c.id)}>
            {t("delete")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {roots.length === 0 && <p className="text-sm text-muted-foreground">{t("noComments")}</p>}
      {roots.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          <Item c={c} />
          {repliesOf(c.id).map((r) => (
            <Item key={r.id} c={r} nested />
          ))}
          {replyTo === c.id && canComment && (
            <div className="ml-4">
              <Composer nodeId={nodeId} parentId={c.id} autoFocus shared={shared} onDone={() => setReplyTo(null)} />
            </div>
          )}
        </div>
      ))}
      {canComment && <Composer nodeId={nodeId} parentId={null} shared={shared} onDone={() => undefined} />}
    </div>
  );
}
