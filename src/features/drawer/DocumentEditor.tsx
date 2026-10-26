"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Heading2, Italic, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateNode } from "@/features/mindmap/actions";
import { cn } from "@/lib/utils";

type Json = Record<string, unknown>;

export function DocumentEditor({ nodeId, data, editable, onSaved }: { nodeId: string; data: Json; editable: boolean; onSaved: () => void }) {
  const t = useTranslations("drawer");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(data);
  latest.current = data;

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [StarterKit, Placeholder.configure({ placeholder: t("docPlaceholder") })],
    content: (data.content as Json | undefined) ?? "",
    editorProps: { attributes: { class: "prose-sm min-h-40 rounded-md border border-border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5" } },
    onUpdate: ({ editor: ed }) => {
      if (timer.current) clearTimeout(timer.current);
      setState("saving");
      timer.current = setTimeout(async () => {
        await updateNode(nodeId, { data: { ...latest.current, content: ed.getJSON() } }, { record: false });
        setState("saved");
        onSaved();
      }, 800);
    },
  });

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!editor) return null;
  const btn = (active: boolean) => cn("rounded p-1.5 hover:bg-muted", active && "bg-muted");
  return (
    <div className="flex flex-col gap-2">
      {editable && (
        <div className="flex items-center gap-1" role="toolbar" aria-label="Formatting">
          <button type="button" className={btn(editor.isActive("bold"))} aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="size-4" />
          </button>
          <button type="button" className={btn(editor.isActive("italic"))} aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" />
          </button>
          <button type="button" className={btn(editor.isActive("heading"))} aria-label="Heading" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" />
          </button>
          <button type="button" className={btn(editor.isActive("bulletList"))} aria-label="List" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="size-4" />
          </button>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {state === "saving" ? t("saving") : state === "saved" ? t("saved") : ""}
          </span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
